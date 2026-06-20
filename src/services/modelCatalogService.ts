import { requestUrl } from "obsidian";
import { ApiProvider } from "../settings";
import { ModelContextPolicy } from "../types/modelContextPolicy";
import { RemoteModelInfo, RemoteModelListResponse } from "../types/remoteModel";
import { LLMServiceError } from "./llm";

const MODELS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function isModelCatalogStale(fetchedAt?: number): boolean {
	if (!fetchedAt) return true;
	return Date.now() - fetchedAt > MODELS_CACHE_TTL_MS;
}

/** Kimi: GET {baseUrl}/models · DeepSeek: GET https://api.deepseek.com/models (not under /v1). */
export function resolveModelsUrl(baseUrl: string, provider: ApiProvider): string {
	const root = baseUrl.trim().replace(/\/+$/, "");
	if (provider === "DeepSeek") {
		const hostRoot = root.replace(/\/v1$/i, "");
		return `${hostRoot}/models`;
	}
	return `${root}/models`;
}

function enrichModelFromId(model: RemoteModelInfo, provider: ApiProvider): RemoteModelInfo {
	const name = model.id.toLowerCase();
	if (provider === "DeepSeek") {
		return {
			...model,
			supportsReasoning:
				model.supportsReasoning ?? (name.includes("reasoner") || name.includes("r1")),
		};
	}
	if (provider === "Kimi") {
		return {
			...model,
			supportsReasoning:
				model.supportsReasoning ?? (name.includes("kimi-k2") || /^k2[.-]/.test(name)),
		};
	}
	return model;
}

export function parseRemoteModelList(payload: unknown, provider: ApiProvider): RemoteModelInfo[] {
	if (!payload || typeof payload !== "object") return [];
	const data = (payload as RemoteModelListResponse).data;
	if (!Array.isArray(data)) return [];

	const models: RemoteModelInfo[] = [];
	for (const item of data) {
		const id = item?.id?.trim();
		if (!id) continue;
		models.push(
			enrichModelFromId(
				{
					id,
					contextLength:
						typeof item.context_length === "number" && item.context_length > 0
							? item.context_length
							: undefined,
					supportsImageIn: item.supports_image_in === true ? true : undefined,
					supportsVideoIn: item.supports_video_in === true ? true : undefined,
					supportsReasoning: item.supports_reasoning === true ? true : undefined,
				},
				provider
			)
		);
	}

	return models.sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchRemoteModels(
	apiKey: string,
	baseUrl: string,
	provider: ApiProvider
): Promise<RemoteModelInfo[]> {
	const key = apiKey.trim();
	if (!key) throw new LLMServiceError("API key is required");
	if (!baseUrl.trim()) throw new LLMServiceError("Base URL is required");

	const url = resolveModelsUrl(baseUrl, provider);
	const response = await requestUrl({
		url,
		method: "GET",
		headers: {
			Authorization: `Bearer ${key}`,
			Accept: "application/json",
		},
		throw: false,
	});

	if (response.status < 200 || response.status >= 300) {
		let errorMessage = `Models request failed with status ${response.status}`;
		try {
			const errorData = response.json as { error?: { message?: string } };
			if (errorData?.error?.message) errorMessage = errorData.error.message;
		} catch {
			if (response.text) errorMessage = `${errorMessage}: ${response.text}`;
		}
		throw new LLMServiceError(errorMessage, response.status);
	}

	return parseRemoteModelList(response.json, provider);
}

export function formatRemoteModelLabel(model: RemoteModelInfo): string {
	const tags: string[] = [];
	if (model.contextLength) {
		tags.push(formatContextLength(model.contextLength));
	}
	if (model.supportsImageIn) tags.push("vision");
	if (model.supportsReasoning) tags.push("reasoning");
	return tags.length > 0 ? `${model.id} (${tags.join(", ")})` : model.id;
}

function formatContextLength(length: number): string {
	if (length >= 1_000_000) return `${Math.round(length / 100_000) / 10}M`;
	if (length >= 1000) return `${Math.round(length / 100) / 10}k`;
	return String(length);
}

export function findRemoteModel(
	models: RemoteModelInfo[] | undefined,
	modelId: string
): RemoteModelInfo | undefined {
	return models?.find((model) => model.id === modelId);
}

const DEFAULT_CHAT_TEMPERATURE = 0.7;

/** Some Kimi/DeepSeek reasoning models reject any temperature other than 1. */
export function resolveChatTemperature(
	provider: ApiProvider,
	modelName: string,
	remoteModel?: RemoteModelInfo,
	defaultTemperature = DEFAULT_CHAT_TEMPERATURE
): number {
	const name = modelName.trim().toLowerCase();
	if (!name) return defaultTemperature;

	if (provider === "Kimi") {
		if (isReasoningModel(provider, modelName, remoteModel)) {
			return 1;
		}
	}

	if (provider === "DeepSeek") {
		if (isReasoningModel(provider, modelName, remoteModel)) {
			return 1;
		}
	}

	return defaultTemperature;
}

const OUTPUT_RESERVE_RATIO = 0.15;
const CHARS_PER_TOKEN_ESTIMATE = 2;

function isReasoningModel(
	provider: ApiProvider,
	modelName: string,
	remoteModel?: RemoteModelInfo
): boolean {
	if (remoteModel?.supportsReasoning) return true;
	const name = modelName.trim().toLowerCase();
	if (provider === "Kimi") return name.includes("kimi-k2") || /^k2[.-]/.test(name);
	if (provider === "DeepSeek") return name.includes("reasoner") || name.includes("r1");
	return false;
}

/** Infer context window (tokens) when the provider omits context_length. */
export function inferContextLengthTokens(
	provider: ApiProvider,
	modelName: string,
	remoteModel?: RemoteModelInfo
): number {
	if (remoteModel?.contextLength && remoteModel.contextLength > 0) {
		return remoteModel.contextLength;
	}

	const name = modelName.trim().toLowerCase();
	const sizedMatch = name.match(/(?:^|[-._/])(\d+(?:\.\d+)?)\s*k(?:[-_.]|$)/);
	if (sizedMatch) {
		return Math.round(parseFloat(sizedMatch[1]!) * 1000);
	}
	if (name.includes("128k")) return 128_000;
	if (name.includes("32k")) return 32_000;
	if (name.includes("8k")) return 8_192;

	if (provider === "DeepSeek") return 64_000;
	if (provider === "Kimi") return 32_768;
	if (provider === "OpenAI" && name.includes("gpt-4o")) return 128_000;
	return 32_000;
}

export function resolveModelContextPolicy(
	provider: ApiProvider,
	modelName: string,
	remoteModel?: RemoteModelInfo
): ModelContextPolicy {
	const contextTokens = inferContextLengthTokens(provider, modelName, remoteModel);
	const budgetChars = Math.max(
		8_000,
		Math.floor(contextTokens * CHARS_PER_TOKEN_ESTIMATE * (1 - OUTPUT_RESERVE_RATIO))
	);

	let historyTurnLimit: number;
	let ragTopK: number;
	let maxNoteContextChars: number;

	if (contextTokens >= 128_000) {
		historyTurnLimit = 20;
		ragTopK = 8;
		maxNoteContextChars = 12_000;
	} else if (contextTokens >= 16_000) {
		historyTurnLimit = 10;
		ragTopK = 5;
		maxNoteContextChars = 6_000;
	} else {
		historyTurnLimit = 4;
		ragTopK = 2;
		maxNoteContextChars = 3_000;
	}

	if (isReasoningModel(provider, modelName, remoteModel)) {
		historyTurnLimit = Math.max(4, historyTurnLimit - 2);
		ragTopK = Math.max(2, ragTopK - 1);
	}

	return {
		contextTokens,
		budgetChars,
		historyTurnLimit,
		ragTopK,
		maxNoteContextChars,
	};
}
