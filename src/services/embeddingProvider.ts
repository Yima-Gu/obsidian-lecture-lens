import { LLMService } from "./llm";
import { EmbeddingRuntimeConfig } from "./embeddingConfig";
import { normalizeMirrorUrl } from "../constants/localEmbeddingModels";
import {
	LocalEmbeddingService,
	EmbeddingProgressCallback,
} from "./localEmbeddingService";

export class EmbeddingProvider {
	constructor(
		private readonly llmService: LLMService,
		private readonly localEmbeddingService: LocalEmbeddingService
	) {}

	async embedPassages(
		texts: string[],
		config: EmbeddingRuntimeConfig,
		onProgress?: EmbeddingProgressCallback
	): Promise<number[][]> {
		if (config.mode === "local") {
			return this.localEmbeddingService.embedPassages(
				config.localModelId,
				config.hfMirrorUrl,
				texts,
				onProgress
			);
		}

		const batchSize = 50;
		const vectors: number[][] = [];
		for (let i = 0; i < texts.length; i += batchSize) {
			const batch = texts.slice(i, i + batchSize);
			onProgress?.(`Embedding batch ${Math.min(i + batch.length, texts.length)}/${texts.length}...`);
			const batchVectors = await this.llmService.createEmbeddings(batch, config.api.model, {
				baseUrl: config.api.baseUrl,
				apiKey: config.api.apiKey,
			});
			vectors.push(...batchVectors);
		}
		return vectors;
	}

	async embedQuery(text: string, config: EmbeddingRuntimeConfig): Promise<number[]> {
		if (config.mode === "local") {
			return this.localEmbeddingService.embedQuery(config.localModelId, config.hfMirrorUrl, text);
		}

		const [vector] = await this.llmService.createEmbeddings([text], config.api.model, {
			baseUrl: config.api.baseUrl,
			apiKey: config.api.apiKey,
		});
		if (!vector) {
			throw new Error("Embedding API returned no vector for query.");
		}
		return vector;
	}

	getIndexSignature(config: EmbeddingRuntimeConfig): string {
		if (config.mode === "local") {
			return `local:${config.localModelId}@${normalizeMirrorUrl(config.hfMirrorUrl)}`;
		}
		return `api:${config.api.baseUrl}:${config.api.model}`;
	}
}
