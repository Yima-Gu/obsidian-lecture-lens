import { DEFAULT_HF_MIRROR_URL, normalizeLocalModelId, normalizeMirrorUrl } from "../constants/localEmbeddingModels";
import { providerSupportsEmbeddings } from "../constants/providers";
import { LectureLensSettings } from "../settings";

export type EmbeddingMode = "api" | "local";

export interface EmbeddingApiConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
}

export interface EmbeddingRuntimeConfig {
	mode: EmbeddingMode;
	api: EmbeddingApiConfig;
	localModelId: string;
	hfMirrorUrl: string;
}

export type EmbeddingValidationIssue =
	| "missing_key"
	| "missing_base"
	| "missing_model"
	| "provider_unsupported"
	| "missing_mirror";

export function resolveEmbeddingApiConfig(settings: LectureLensSettings): EmbeddingApiConfig {
	const baseUrl = (settings.embeddingBaseUrl.trim() || settings.baseUrl.trim()).replace(/\/+$/, "");
	return {
		baseUrl,
		apiKey: settings.embeddingApiKey.trim() || settings.apiKey.trim(),
		model: settings.embeddingModelName.trim(),
	};
}

export function resolveEmbeddingRuntimeConfig(settings: LectureLensSettings): EmbeddingRuntimeConfig {
	return {
		mode: settings.embeddingMode,
		api: resolveEmbeddingApiConfig(settings),
		localModelId: normalizeLocalModelId(settings.localEmbeddingModel),
		hfMirrorUrl: normalizeMirrorUrl(settings.hfMirrorUrl || DEFAULT_HF_MIRROR_URL),
	};
}

export function getEmbeddingValidationIssue(
	settings: LectureLensSettings
): EmbeddingValidationIssue | null {
	if (settings.embeddingMode === "local") {
		if (!settings.localEmbeddingModel.trim()) return "missing_model";
		if (!settings.hfMirrorUrl.trim() && !DEFAULT_HF_MIRROR_URL) return "missing_mirror";
		return null;
	}

	const config = resolveEmbeddingApiConfig(settings);
	if (!config.apiKey) return "missing_key";
	if (!config.baseUrl) return "missing_base";
	if (!config.model) return "missing_model";

	const usesChatEmbeddingEndpoint =
		!settings.embeddingBaseUrl.trim() && !providerSupportsEmbeddings(settings.apiProvider);
	if (usesChatEmbeddingEndpoint) return "provider_unsupported";

	return null;
}

/** @deprecated Use resolveEmbeddingRuntimeConfig */
export function resolveEmbeddingConfig(settings: LectureLensSettings): EmbeddingApiConfig {
	return resolveEmbeddingApiConfig(settings);
}
