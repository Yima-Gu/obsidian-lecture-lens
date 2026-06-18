import { requestUrl } from "obsidian";
import { ApiProvider } from "../settings";
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
