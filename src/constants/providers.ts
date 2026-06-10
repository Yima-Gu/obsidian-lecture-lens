import { ApiProvider } from "../settings";
import { ResolvedLocale } from "../i18n";
import { TranslationKey } from "../i18n/en";

export interface ProviderPreset {
	baseUrl: string;
	modelName: string;
	embeddingModelName: string;
	supportsVision: boolean;
}

export const PROVIDER_PRESETS: Record<Exclude<ApiProvider, "Custom">, ProviderPreset> = {
	OpenAI: {
		baseUrl: "https://api.openai.com/v1",
		modelName: "gpt-4o",
		embeddingModelName: "text-embedding-3-small",
		supportsVision: true,
	},
	DeepSeek: {
		baseUrl: "https://api.deepseek.com",
		modelName: "deepseek-v4-flash",
		embeddingModelName: "text-embedding-3-small",
		supportsVision: false,
	},
	Kimi: {
		baseUrl: "https://api.moonshot.cn/v1",
		modelName: "moonshot-v1-8k-vision-preview",
		embeddingModelName: "text-embedding-3-small",
		supportsVision: true,
	},
	Gemini: {
		baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
		modelName: "gemini-2.0-flash",
		embeddingModelName: "text-embedding-004",
		supportsVision: true,
	},
};

const TEXT_ONLY_MODELS = new Set([
	"deepseek-v4-flash",
	"deepseek-v4-pro",
	"deepseek-chat",
	"deepseek-reasoner",
]);

export const VISION_MODEL_SUGGESTIONS: Partial<Record<ApiProvider, string[]>> = {
	OpenAI: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
	DeepSeek: ["deepseek-vl2", "deepseek-v4-flash", "deepseek-v4-pro"],
	Kimi: [
		"moonshot-v1-8k-vision-preview",
		"moonshot-v1-32k-vision-preview",
		"moonshot-v1-128k-vision-preview",
		"moonshot-v1-8k",
		"moonshot-v1-32k",
	],
	Gemini: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
};

export function applyProviderPreset(provider: Exclude<ApiProvider, "Custom">): ProviderPreset {
	return { ...PROVIDER_PRESETS[provider] };
}

export function modelSupportsVisionApi(
	provider: ApiProvider,
	modelName: string,
	supportsVisionSetting: boolean
): boolean {
	const name = modelName.trim().toLowerCase();
	if (!name) return false;

	if (TEXT_ONLY_MODELS.has(name)) return false;

	if (name.startsWith("moonshot-v1-") && !name.includes("vision")) return false;

	// Custom endpoint: user opts in via the settings toggle.
	if (provider === "Custom" && supportsVisionSetting) return true;

	if (inferVisionFromModelName(name)) return true;

	if (provider === "Gemini") return true;
	if (provider === "OpenAI" && (name.includes("gpt-4o") || name.includes("gpt-4-turbo"))) {
		return true;
	}
	if (provider === "Kimi" && name.includes("vision")) return true;

	return false;
}

export function providerSupportsVision(
	provider: ApiProvider,
	modelName: string,
	supportsVisionSetting: boolean
): boolean {
	if (!supportsVisionSetting) {
		return modelSupportsVisionApi(provider, modelName, false);
	}
	return modelSupportsVisionApi(provider, modelName, supportsVisionSetting);
}

function inferVisionFromModelName(modelName: string): boolean {
	const name = modelName.toLowerCase();
	return (
		name.includes("gpt-4o") ||
		name.includes("vision") ||
		name.includes("-vl") ||
		name.includes("gemini") ||
		name.includes("qwen-vl") ||
		name.includes("gpt-4-turbo")
	);
}

export function isVisionApiError(message: string): boolean {
	const lower = message.toLowerCase();
	return lower.includes("image_url") && lower.includes("expected");
}

const PROVIDER_ORDER_EN: ApiProvider[] = ["OpenAI", "DeepSeek", "Kimi", "Gemini", "Custom"];
const PROVIDER_ORDER_ZH: ApiProvider[] = ["DeepSeek", "Kimi", "OpenAI", "Gemini", "Custom"];

export function getProviderDropdownOptions(
	tr: (key: TranslationKey) => string,
	locale: ResolvedLocale
): Record<string, string> {
	const labels: Record<ApiProvider, string> = {
		OpenAI: tr("settings.apiProvider.openai"),
		DeepSeek: tr("settings.apiProvider.deepseek"),
		Kimi: tr("settings.apiProvider.kimi"),
		Gemini: tr("settings.apiProvider.gemini"),
		Custom: tr("settings.apiProvider.custom"),
	};

	const order = locale === "zh" ? PROVIDER_ORDER_ZH : PROVIDER_ORDER_EN;
	const options: Record<string, string> = {};
	for (const provider of order) {
		options[provider] = labels[provider];
	}
	return options;
}
