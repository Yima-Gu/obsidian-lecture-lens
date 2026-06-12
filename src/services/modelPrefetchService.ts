import { requestUrl } from "obsidian";
import { getEmbeddingModelFiles } from "../constants/embeddingModelFiles";
import { normalizeLocalModelId } from "../constants/localEmbeddingModels";
import { AdapterModelCache } from "./adapterModelCache";
import { EmbeddingProgressCallback } from "./localEmbeddingService";
import { buildModelFileUrl, installObsidianFetch } from "../utils/obsidianFetch";

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function prefetchEmbeddingModelFiles(
	modelId: string,
	mirrorUrl: string,
	cache: AdapterModelCache,
	onProgress?: EmbeddingProgressCallback
): Promise<void> {
	const normalizedModel = normalizeLocalModelId(modelId);
	const files = getEmbeddingModelFiles(normalizedModel);
	const restoreFetch = installObsidianFetch();

	try {
		for (let i = 0; i < files.length; i++) {
			const filePath = files[i]!;
			const url = buildModelFileUrl(mirrorUrl, normalizedModel, filePath);
			onProgress?.(`Downloading ${filePath} (${i + 1}/${files.length})…`);

			const cached = await cache.match(url);
			if (cached) {
				onProgress?.(`Cached ${filePath} (${i + 1}/${files.length})`);
				continue;
			}

			const response = await requestUrl({ url, method: "GET", throw: false });
			if (response.status < 200 || response.status >= 300) {
				throw new Error(`HTTP ${response.status} while downloading ${filePath} from ${url}`);
			}

			const size = response.arrayBuffer.byteLength;
			await cache.put(url, new Response(response.arrayBuffer));
			onProgress?.(`Saved ${filePath} (${formatBytes(size)}) — ${i + 1}/${files.length}`);
		}
	} finally {
		restoreFetch();
	}
}
