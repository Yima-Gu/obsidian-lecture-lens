export type LocalEmbeddingModelId =
	| "Xenova/multilingual-e5-small"
	| "Xenova/paraphrase-multilingual-MiniLM-L12-v2"
	| "Xenova/all-MiniLM-L6-v2";

export interface LocalEmbeddingModelSpec {
	id: LocalEmbeddingModelId;
	labelKey: "settings.localEmbeddingModel.e5" | "settings.localEmbeddingModel.minilm12" | "settings.localEmbeddingModel.minilm6";
	usesE5Prefix: boolean;
}

export const LOCAL_EMBEDDING_MODELS: LocalEmbeddingModelSpec[] = [
	{
		id: "Xenova/multilingual-e5-small",
		labelKey: "settings.localEmbeddingModel.e5",
		usesE5Prefix: true,
	},
	{
		id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
		labelKey: "settings.localEmbeddingModel.minilm12",
		usesE5Prefix: false,
	},
	{
		id: "Xenova/all-MiniLM-L6-v2",
		labelKey: "settings.localEmbeddingModel.minilm6",
		usesE5Prefix: false,
	},
];

export const DEFAULT_LOCAL_EMBEDDING_MODEL: LocalEmbeddingModelId = "Xenova/multilingual-e5-small";
export const DEFAULT_HF_MIRROR_URL = "https://hf-mirror.com";

export function getLocalModelSpec(modelId: string): LocalEmbeddingModelSpec | undefined {
	return LOCAL_EMBEDDING_MODELS.find((model) => model.id === modelId);
}

export function normalizeMirrorUrl(mirrorUrl: string): string {
	const trimmed = mirrorUrl.trim().replace(/\/+$/, "");
	const base = trimmed || DEFAULT_HF_MIRROR_URL.replace(/\/+$/, "");
	return `${base}/`;
}

export function normalizeLocalModelId(modelId: string): LocalEmbeddingModelId {
	return getLocalModelSpec(modelId)?.id ?? DEFAULT_LOCAL_EMBEDDING_MODEL;
}
