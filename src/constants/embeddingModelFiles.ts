import { LocalEmbeddingModelId } from "./localEmbeddingModels";

/** Files required by transformers.js feature-extraction for each Xenova model. */
export const EMBEDDING_MODEL_FILES: Record<LocalEmbeddingModelId, string[]> = {
	"Xenova/multilingual-e5-small": [
		"config.json",
		"tokenizer.json",
		"tokenizer_config.json",
		"special_tokens_map.json",
		"sentencepiece.bpe.model",
		"onnx/model_quantized.onnx",
	],
	"Xenova/paraphrase-multilingual-MiniLM-L12-v2": [
		"config.json",
		"tokenizer.json",
		"tokenizer_config.json",
		"onnx/model_quantized.onnx",
	],
	"Xenova/all-MiniLM-L6-v2": [
		"config.json",
		"tokenizer.json",
		"tokenizer_config.json",
		"vocab.txt",
		"onnx/model_quantized.onnx",
	],
};

export function getEmbeddingModelFiles(modelId: string): string[] {
	return (
		EMBEDDING_MODEL_FILES[modelId as LocalEmbeddingModelId] ??
		EMBEDDING_MODEL_FILES["Xenova/multilingual-e5-small"]
	);
}
