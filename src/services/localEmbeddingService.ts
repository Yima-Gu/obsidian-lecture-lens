import { App } from "obsidian";
import {
	DEFAULT_HF_MIRROR_URL,
	getLocalModelSpec,
	normalizeLocalModelId,
	normalizeMirrorUrl,
} from "../constants/localEmbeddingModels";
import { AdapterModelCache } from "./adapterModelCache";
import {
	EmbeddingModelStatus,
	EmbeddingModelStatusService,
	createDefaultEmbeddingModelStatus,
} from "./embeddingModelStatus";
import { prefetchEmbeddingModelFiles } from "./modelPrefetchService";
import { installObsidianFetch } from "../utils/obsidianFetch";
import { TransformersModule, applyObsidianProcessPatch, loadTransformersModule as importTransformers } from "../utils/loadTransformers";
import { OnnxWasmPaths, resolveOnnxWasmPaths } from "../utils/onnxWasmPaths";

export type EmbeddingProgressCallback = (message: string) => void;

type FeaturePipeline = (
	text: string,
	options: { pooling: "mean"; normalize: true }
) => Promise<{ data: Float32Array | number[] }>;

type TransformersEnv = TransformersModule["env"];

const TRANSFORMERS_VERSION = "2.17.2";

let activePipeline: FeaturePipeline | null = null;
let activeKey = "";

function vectorFromOutput(output: { data: Float32Array | number[] }): number[] {
	return Array.from(output.data);
}

function prefixForModel(text: string, modelId: string, role: "query" | "passage"): string {
	const spec = getLocalModelSpec(modelId);
	if (spec?.usesE5Prefix) {
		return `${role}: ${text}`;
	}
	return text;
}

/** Obsidian must use the browser build of transformers.js with a custom cache (no Node fs/path). */
export function configureTransformersEnv(
	embeddingEnv: TransformersEnv,
	mirrorUrl: string,
	modelCache: AdapterModelCache,
	wasmPaths?: OnnxWasmPaths
): void {
	embeddingEnv.remoteHost = normalizeMirrorUrl(mirrorUrl);
	embeddingEnv.allowLocalModels = false;
	embeddingEnv.allowRemoteModels = true;
	embeddingEnv.useFS = false;
	embeddingEnv.useFSCache = false;
	embeddingEnv.useBrowserCache = false;
	embeddingEnv.useCustomCache = true;
	embeddingEnv.customCache = modelCache;
	embeddingEnv.__dirname = "./";
	embeddingEnv.localModelPath = "./models/";
	embeddingEnv.cacheDir = "./.cache/";

	const onnxWasm = embeddingEnv.backends?.onnx?.wasm;
	if (onnxWasm) {
		onnxWasm.wasmPaths =
			wasmPaths ??
			`https://cdn.jsdelivr.net/npm/@xenova/transformers@${TRANSFORMERS_VERSION}/dist/`;
		onnxWasm.numThreads = 1;
		if ("proxy" in onnxWasm) {
			onnxWasm.proxy = false;
		}
		if ("simd" in onnxWasm) {
			onnxWasm.simd = true;
		}
	}
}

async function loadTransformersModule(
	app: App,
	pluginId: string,
	modelCache: AdapterModelCache
): Promise<TransformersModule> {
	const mod = await importTransformers(app, pluginId);
	if (mod.env) {
		configureTransformersEnv(mod.env, DEFAULT_HF_MIRROR_URL, modelCache);
	}
	return mod;
}

export class LocalEmbeddingService {
	private readonly modelCache: AdapterModelCache;

	constructor(
		private readonly app: App,
		private readonly pluginId: string,
		private readonly statusService: EmbeddingModelStatusService
	) {
		this.modelCache = new AdapterModelCache(app, pluginId);
	}

	getModelCacheDir(): Promise<string> {
		return this.modelCache.getCacheDir();
	}

	async unload(): Promise<void> {
		activePipeline = null;
		activeKey = "";
	}

	private async updateStatus(
		modelId: string,
		mirrorUrl: string,
		patch: Partial<EmbeddingModelStatus>
	): Promise<void> {
		const current =
			(await this.statusService.load()) ??
			createDefaultEmbeddingModelStatus(modelId, normalizeMirrorUrl(mirrorUrl));
		await this.statusService.save({
			...current,
			modelId,
			mirrorUrl: normalizeMirrorUrl(mirrorUrl),
			...patch,
		});
	}

	private async getPipeline(
		modelId: string,
		mirrorUrl: string,
		onProgress?: EmbeddingProgressCallback
	): Promise<FeaturePipeline> {
		const normalizedModel = normalizeLocalModelId(modelId);
		const normalizedMirror = normalizeMirrorUrl(mirrorUrl);
		const key = `${normalizedModel}::${normalizedMirror}`;

		if (activePipeline && activeKey === key) {
			return activePipeline;
		}

		if (activePipeline) {
			await this.unload();
		}

		const transformers = await loadTransformersModule(this.app, this.pluginId, this.modelCache);
		const embeddingEnv = transformers.env;
		const embeddingPipeline = transformers.pipeline;
		if (!embeddingEnv || !embeddingPipeline) {
			throw new Error(
				"Local embedding runtime failed to load. Reload the plugin and try again."
			);
		}

		const wasmPaths = await resolveOnnxWasmPaths(this.app, this.pluginId);
		configureTransformersEnv(
			embeddingEnv,
			normalizedMirror,
			this.modelCache,
			wasmPaths ?? undefined
		);

		onProgress?.(`Loading ${normalizedModel} from ${normalizedMirror}...`);

		applyObsidianProcessPatch();
		const restoreFetch = installObsidianFetch();
		try {
			activePipeline = (await embeddingPipeline("feature-extraction", normalizedModel, {
				progress_callback: (progress: {
					status: string;
					file?: string;
					progress?: number;
					name?: string;
				}) => {
					if (progress.status === "progress" && progress.file) {
						const pct = Math.round((progress.progress ?? 0) * 100);
						onProgress?.(`Downloading ${progress.file} (${pct}%)`);
						return;
					}
					if (progress.status === "download") {
						onProgress?.(`Downloading ${progress.file ?? progress.name ?? "model files"}...`);
					}
				},
			})) as FeaturePipeline;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (/path.*argument|received undefined|reading 'create'/i.test(message)) {
				throw new Error(
					`Local embedding failed to initialize (${message}). Rebuild the plugin (npm run build), ensure transformers.min.js is in the plugin folder, then reload Obsidian.`
				);
			}
			throw error;
		} finally {
			restoreFetch();
		}

		activeKey = key;
		return activePipeline;
	}

	async downloadModel(
		modelId: string,
		mirrorUrl: string,
		onProgress?: EmbeddingProgressCallback
	): Promise<void> {
		const normalizedModel = normalizeLocalModelId(modelId);
		const normalizedMirror = normalizeMirrorUrl(mirrorUrl);

		await this.updateStatus(normalizedModel, normalizedMirror, {
			state: "downloading",
			message: onProgress ? "" : "Downloading model files…",
			error: undefined,
		});

		try {
			onProgress?.(`Preparing ${normalizedModel}…`);
			await this.updateStatus(normalizedModel, normalizedMirror, {
				state: "downloading",
				message: `Preparing ${normalizedModel}…`,
			});

			await prefetchEmbeddingModelFiles(
				normalizedModel,
				normalizedMirror,
				this.modelCache,
				(message) => {
					onProgress?.(message);
					void this.updateStatus(normalizedModel, normalizedMirror, {
						state: "downloading",
						message,
					});
				}
			);

			const restoreFetch = installObsidianFetch();
			let pipeline: FeaturePipeline;
			try {
				pipeline = await this.getPipeline(normalizedModel, normalizedMirror, (message) => {
					onProgress?.(message);
					void this.updateStatus(normalizedModel, normalizedMirror, {
						state: "downloading",
						message,
					});
				});
			} finally {
				restoreFetch();
			}

			onProgress?.("Verifying model with a test embedding…");
			const verifyInput = prefixForModel("verification", normalizedModel, "query");
			const output = await pipeline(verifyInput, {
				pooling: "mean",
				normalize: true,
			});
			if (!vectorFromOutput(output).length) {
				throw new Error("Model verification failed (empty embedding vector).");
			}

			await this.updateStatus(normalizedModel, normalizedMirror, {
				state: "ready",
				message: "Model downloaded and verified.",
				error: undefined,
			});
			onProgress?.("Model ready.");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await this.updateStatus(normalizedModel, normalizedMirror, {
				state: "error",
				message: "Download failed.",
				error: message,
			});
			throw error;
		}
	}

	async verifyModel(
		modelId: string,
		mirrorUrl: string,
		onProgress?: EmbeddingProgressCallback
	): Promise<void> {
		const normalizedModel = normalizeLocalModelId(modelId);
		await this.getPipeline(normalizedModel, mirrorUrl, onProgress);
		const vector = await this.embedQuery(normalizedModel, mirrorUrl, "verification");
		if (!vector.length) {
			throw new Error("Verification failed (empty embedding vector).");
		}
		await this.updateStatus(normalizedModel, mirrorUrl, {
			state: "ready",
			message: "Model verified.",
			error: undefined,
		});
	}

	async embedPassages(
		modelId: string,
		mirrorUrl: string,
		texts: string[],
		onProgress?: EmbeddingProgressCallback
	): Promise<number[][]> {
		const extractor = await this.getPipeline(modelId, mirrorUrl, onProgress);
		const normalizedModel = normalizeLocalModelId(modelId);
		const vectors: number[][] = [];

		for (let i = 0; i < texts.length; i++) {
			const text = texts[i] ?? "";
			onProgress?.(`Embedding ${i + 1}/${texts.length}...`);
			const input = prefixForModel(text, normalizedModel, "passage");
			const output = await extractor(input, { pooling: "mean", normalize: true });
			const vector = vectorFromOutput(output);
			if (!vector.length) {
				throw new Error(`Embedding failed for chunk ${i + 1}/${texts.length} (empty vector).`);
			}
			vectors.push(vector);
			if (i % 4 === 3) {
				await new Promise((resolve) => window.setTimeout(resolve, 0));
			}
		}

		return vectors;
	}

	async embedQuery(modelId: string, mirrorUrl: string, query: string): Promise<number[]> {
		const extractor = await this.getPipeline(modelId, mirrorUrl);
		const normalizedModel = normalizeLocalModelId(modelId);
		const input = prefixForModel(query.trim(), normalizedModel, "query");
		if (!input) {
			throw new Error("Cannot embed an empty query.");
		}
		const output = await extractor(input, { pooling: "mean", normalize: true });
		const vector = vectorFromOutput(output);
		if (!vector.length) {
			throw new Error("Embedding API returned an empty vector for the query.");
		}
		return vector;
	}
}
