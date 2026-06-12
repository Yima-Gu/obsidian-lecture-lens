import { App, TFile, TFolder } from "obsidian";
import { EmbeddingProvider } from "./embeddingProvider";
import { EmbeddingProgressCallback } from "./localEmbeddingService";
import { EmbeddingRuntimeConfig } from "./embeddingConfig";
import {
	formatCourseFolderNotFound,
	canonicalizeCourseFolderInput,
	resolveVaultFolder,
} from "../utils/vaultPath";
import { ensurePluginDataDir, resolvePluginDataFile } from "../utils/pluginDataPath";

const INDEX_VERSION = 2;
const MAX_CHUNK_CHARS = 1200;

export interface RagChunk {
	id: string;
	filePath: string;
	heading: string;
	content: string;
	embedding: number[];
}

export interface RagIndex {
	version: number;
	courseFolder: string;
	builtAt: number;
	embeddingSignature: string;
	chunks: RagChunk[];
}

export interface RetrievedChunk {
	filePath: string;
	heading: string;
	content: string;
	score: number;
}

export type RagRetrieveIssue =
	| "no_index"
	| "signature_mismatch"
	| "folder_mismatch"
	| "empty_query";

export interface RagRetrieveResult {
	chunks: RetrievedChunk[];
	issue?: RagRetrieveIssue;
}

export type RagIndexStatus =
	| { state: "missing" }
	| { state: "stale_signature" }
	| { state: "folder_mismatch"; indexFolder: string; currentFolder: string }
	| { state: "ready"; chunkCount: number; courseFolder: string; builtAt: number };

function cosineSimilarity(a: number[], b: number[]): number {
	if (!a.length || !b.length) return 0;
	let dot = 0;
	let normA = 0;
	let normB = 0;
	const len = Math.min(a.length, b.length);
	for (let i = 0; i < len; i++) {
		dot += a[i]! * b[i]!;
		normA += a[i]! * a[i]!;
		normB += b[i]! * b[i]!;
	}
	if (normA === 0 || normB === 0) return 0;
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function chunkMarkdown(content: string): Array<{ heading: string; content: string }> {
	const sections: Array<{ heading: string; content: string }> = [];
	const lines = content.split("\n");
	let currentHeading = "Overview";
	let buffer: string[] = [];

	const flush = () => {
		const text = buffer.join("\n").trim();
		if (text.length > 0) {
			sections.push({ heading: currentHeading, content: text });
		}
		buffer = [];
	};

	for (const line of lines) {
		const headingMatch = line.match(/^#{1,3}\s+(.+)/);
		if (headingMatch) {
			flush();
			currentHeading = headingMatch[1]?.trim() ?? "Section";
			continue;
		}
		buffer.push(line);
		if (buffer.join("\n").length >= MAX_CHUNK_CHARS) {
			flush();
		}
	}
	flush();

	if (sections.length === 0 && content.trim()) {
		sections.push({ heading: "Overview", content: content.trim() });
	}

	return sections;
}

function normalizeFolderKey(app: App, input: string): string {
	return canonicalizeCourseFolderInput(app, input) || input.trim();
}

export class RagService {
	constructor(
		private app: App,
		private pluginId: string,
		private embeddingProvider: EmbeddingProvider
	) {}

	private async getIndexPath(): Promise<string> {
		return resolvePluginDataFile(this.app, this.pluginId, "rag-index.json");
	}

	async loadIndex(): Promise<RagIndex | null> {
		const path = await this.getIndexPath();
		if (!(await this.app.vault.adapter.exists(path))) {
			return null;
		}
		try {
			const raw = await this.app.vault.adapter.read(path);
			const parsed = JSON.parse(raw) as RagIndex;
			if (parsed.version !== INDEX_VERSION || !Array.isArray(parsed.chunks)) {
				return null;
			}
			return parsed;
		} catch {
			return null;
		}
	}

	async getIndexStatus(
		courseFolder: string,
		embedding: EmbeddingRuntimeConfig
	): Promise<RagIndexStatus> {
		const index = await this.loadIndex();
		if (!index || index.chunks.length === 0) {
			return { state: "missing" };
		}

		const expectedSignature = this.embeddingProvider.getIndexSignature(embedding);
		if (index.embeddingSignature !== expectedSignature) {
			return { state: "stale_signature" };
		}

		const currentFolder = normalizeFolderKey(this.app, courseFolder);
		const indexFolder = normalizeFolderKey(this.app, index.courseFolder);
		if (currentFolder && indexFolder && currentFolder !== indexFolder) {
			return { state: "folder_mismatch", indexFolder, currentFolder };
		}

		return {
			state: "ready",
			chunkCount: index.chunks.length,
			courseFolder: index.courseFolder,
			builtAt: index.builtAt,
		};
	}

	private async saveIndex(index: RagIndex): Promise<void> {
		await ensurePluginDataDir(this.app);
		const path = await this.getIndexPath();
		await this.app.vault.adapter.write(path, JSON.stringify(index));
	}

	private collectMarkdownFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		const walk = (node: TFolder) => {
			for (const child of node.children) {
				if (child instanceof TFile && child.extension === "md") {
					files.push(child);
				} else if (child instanceof TFolder) {
					walk(child);
				}
			}
		};
		walk(folder);
		return files;
	}

	private validateEmbeddings(embeddings: number[][], expectedCount: number): void {
		if (embeddings.length !== expectedCount) {
			throw new Error(
				`Embedding count mismatch: expected ${expectedCount}, got ${embeddings.length}.`
			);
		}
		const expectedDim = embeddings[0]?.length ?? 0;
		if (!expectedDim) {
			throw new Error("Embedding model returned empty vectors. Check your embedding settings.");
		}
		for (let i = 0; i < embeddings.length; i++) {
			const vector = embeddings[i];
			if (!vector?.length) {
				throw new Error(`Embedding failed for chunk ${i + 1}/${expectedCount} (empty vector).`);
			}
			if (vector.length !== expectedDim) {
				throw new Error(
					`Embedding dimension mismatch at chunk ${i + 1}: expected ${expectedDim}, got ${vector.length}.`
				);
			}
		}
	}

	async buildIndex(
		courseFolder: string,
		embedding: EmbeddingRuntimeConfig,
		onProgress?: EmbeddingProgressCallback
	): Promise<number> {
		const folder = resolveVaultFolder(this.app, courseFolder);
		if (!folder) {
			throw new Error(formatCourseFolderNotFound(courseFolder));
		}

		const normalizedPath = normalizeFolderKey(this.app, courseFolder) || folder.path;

		const mdFiles = this.collectMarkdownFiles(folder);
		const textChunks: Array<{ id: string; filePath: string; heading: string; content: string }> =
			[];

		for (const file of mdFiles) {
			const content = await this.app.vault.read(file);
			const sections = chunkMarkdown(content);
			for (let i = 0; i < sections.length; i++) {
				const section = sections[i]!;
				textChunks.push({
					id: `${file.path}#${i}`,
					filePath: file.path,
					heading: section.heading,
					content: section.content,
				});
			}
		}

		if (textChunks.length === 0) {
			throw new Error("No markdown content found in the course folder.");
		}

		onProgress?.(`Found ${mdFiles.length} notes, ${textChunks.length} chunks.`);

		const inputs = textChunks.map((c) => `${c.heading}\n\n${c.content}`);
		const embeddings = await this.embeddingProvider.embedPassages(inputs, embedding, onProgress);
		this.validateEmbeddings(embeddings, textChunks.length);

		const embeddingSignature = this.embeddingProvider.getIndexSignature(embedding);

		const index: RagIndex = {
			version: INDEX_VERSION,
			courseFolder: normalizedPath,
			builtAt: Date.now(),
			embeddingSignature,
			chunks: textChunks.map((chunk, i) => ({
				...chunk,
				embedding: embeddings[i]!,
			})),
		};

		await this.saveIndex(index);
		return index.chunks.length;
	}

	async retrieve(
		query: string,
		courseFolder: string,
		embedding: EmbeddingRuntimeConfig,
		topK: number
	): Promise<RagRetrieveResult> {
		const trimmedQuery = query.trim();
		if (!trimmedQuery) {
			return { chunks: [], issue: "empty_query" };
		}

		const index = await this.loadIndex();
		if (!index || index.chunks.length === 0) {
			return { chunks: [], issue: "no_index" };
		}

		const expectedSignature = this.embeddingProvider.getIndexSignature(embedding);
		if (index.embeddingSignature !== expectedSignature) {
			console.warn(
				`RAG index signature mismatch. Index: ${index.embeddingSignature}, current: ${expectedSignature}`
			);
			return { chunks: [], issue: "signature_mismatch" };
		}

		const currentFolder = normalizeFolderKey(this.app, courseFolder);
		const indexFolder = normalizeFolderKey(this.app, index.courseFolder);
		if (currentFolder && indexFolder && currentFolder !== indexFolder) {
			console.warn(`RAG course folder mismatch. Index: ${indexFolder}, current: ${currentFolder}`);
			return { chunks: [], issue: "folder_mismatch" };
		}

		const queryEmbedding = await this.embeddingProvider.embedQuery(trimmedQuery, embedding);

		const scored = index.chunks
			.map((chunk) => ({
				filePath: chunk.filePath,
				heading: chunk.heading,
				content: chunk.content,
				score: cosineSimilarity(queryEmbedding, chunk.embedding),
			}))
			.sort((a, b) => b.score - a.score)
			.slice(0, topK);

		return { chunks: scored };
	}

	formatContext(chunks: RetrievedChunk[]): string {
		if (chunks.length === 0) return "";
		return chunks
			.map((c, i) => `[${i + 1}] ${c.filePath} — ${c.heading}\n${c.content}`)
			.join("\n\n---\n\n");
	}
}
