import { App, TFile, TFolder } from "obsidian";
import { LLMService } from "./llm";

const INDEX_VERSION = 1;
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
	chunks: RagChunk[];
}

export interface RetrievedChunk {
	filePath: string;
	heading: string;
	content: string;
	score: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
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

function chunkMarkdown(filePath: string, content: string): Array<{ heading: string; content: string }> {
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

export class RagService {
	constructor(
		private app: App,
		private pluginId: string,
		private llmService: LLMService
	) {}

	private getIndexPath(): string {
		return `.obsidian/plugins/${this.pluginId}/rag-index.json`;
	}

	async loadIndex(): Promise<RagIndex | null> {
		const path = this.getIndexPath();
		if (!(await this.app.vault.adapter.exists(path))) {
			return null;
		}
		try {
			const raw = await this.app.vault.adapter.read(path);
			const parsed = JSON.parse(raw) as RagIndex;
			if (parsed.version !== INDEX_VERSION) return null;
			return parsed;
		} catch {
			return null;
		}
	}

	private async saveIndex(index: RagIndex): Promise<void> {
		const path = this.getIndexPath();
		const dir = path.substring(0, path.lastIndexOf("/"));
		if (!(await this.app.vault.adapter.exists(dir))) {
			await this.app.vault.adapter.mkdir(dir);
		}
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

	async buildIndex(courseFolder: string, embeddingModel: string): Promise<number> {
		const folder = this.app.vault.getAbstractFileByPath(courseFolder);
		if (!(folder instanceof TFolder)) {
			throw new Error(`Course folder not found: ${courseFolder}`);
		}

		const mdFiles = this.collectMarkdownFiles(folder);
		const textChunks: Array<{ id: string; filePath: string; heading: string; content: string }> = [];

		for (const file of mdFiles) {
			const content = await this.app.vault.read(file);
			const sections = chunkMarkdown(file.path, content);
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

		const inputs = textChunks.map((c) => `${c.heading}\n\n${c.content}`);
		const embeddings: number[][] = [];
		const batchSize = 50;

		for (let i = 0; i < inputs.length; i += batchSize) {
			const batch = inputs.slice(i, i + batchSize);
			const batchEmbeddings = await this.llmService.createEmbeddings(batch, embeddingModel);
			embeddings.push(...batchEmbeddings);
		}

		const index: RagIndex = {
			version: INDEX_VERSION,
			courseFolder,
			builtAt: Date.now(),
			chunks: textChunks.map((chunk, i) => ({
				...chunk,
				embedding: embeddings[i] ?? [],
			})),
		};

		await this.saveIndex(index);
		return index.chunks.length;
	}

	async retrieve(query: string, embeddingModel: string, topK: number): Promise<RetrievedChunk[]> {
		const index = await this.loadIndex();
		if (!index || index.chunks.length === 0) {
			return [];
		}

		const [queryEmbedding] = await this.llmService.createEmbeddings([query], embeddingModel);
		if (!queryEmbedding) return [];

		const scored = index.chunks
			.map((chunk) => ({
				filePath: chunk.filePath,
				heading: chunk.heading,
				content: chunk.content,
				score: cosineSimilarity(queryEmbedding, chunk.embedding),
			}))
			.sort((a, b) => b.score - a.score)
			.slice(0, topK);

		return scored;
	}

	formatContext(chunks: RetrievedChunk[]): string {
		if (chunks.length === 0) return "";
		return chunks
			.map(
				(c, i) =>
					`[${i + 1}] ${c.filePath} — ${c.heading}\n${c.content}`
			)
			.join("\n\n---\n\n");
	}
}
