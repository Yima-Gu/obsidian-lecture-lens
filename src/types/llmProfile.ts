import { applyProviderPreset, PROVIDER_PRESETS } from "../constants/providers";
import { ApiProvider } from "../settings";

export interface LlmProfile {
	id: string;
	name: string;
	apiProvider: ApiProvider;
	apiKey: string;
	baseUrl: string;
	modelName: string;
	supportsVision: boolean;
}

export function generateProfileId(): string {
	return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createProfileFromProvider(
	provider: Exclude<ApiProvider, "Custom">,
	name?: string
): LlmProfile {
	const preset = applyProviderPreset(provider);
	return {
		id: generateProfileId(),
		name: name ?? provider,
		apiProvider: provider,
		apiKey: "",
		baseUrl: preset.baseUrl,
		modelName: preset.modelName,
		supportsVision: preset.supportsVision,
	};
}

export function createDefaultProfiles(): LlmProfile[] {
	return [
		createProfileFromProvider("DeepSeek"),
		createProfileFromProvider("Kimi"),
		createProfileFromProvider("OpenAI"),
	];
}

export function findProfileById(profiles: LlmProfile[], id: string): LlmProfile | undefined {
	return profiles.find((profile) => profile.id === id);
}

export function findProfileByProvider(
	profiles: LlmProfile[],
	provider: LlmProfile["apiProvider"]
): LlmProfile | undefined {
	return profiles.find((profile) => profile.apiProvider === provider);
}

export function resolveDefaultProfile(profiles: LlmProfile[], defaultId: string): LlmProfile {
	return findProfileById(profiles, defaultId) ?? profiles[0]!;
}

export interface LegacyApiSettings {
	apiProvider: ApiProvider;
	apiKey: string;
	baseUrl: string;
	modelName: string;
	supportsVision: boolean;
}

export function migrateLegacyApiToProfiles(legacy: LegacyApiSettings): {
	profiles: LlmProfile[];
	defaultProfileId: string;
} {
	const id = generateProfileId();
	const profiles: LlmProfile[] = [
		{
			id,
			name: legacy.apiProvider,
			apiProvider: legacy.apiProvider,
			apiKey: legacy.apiKey,
			baseUrl: legacy.baseUrl,
			modelName: legacy.modelName,
			supportsVision: legacy.supportsVision,
		},
	];
	return { profiles, defaultProfileId: id };
}

export function applyProviderPresetToProfile(
	profile: LlmProfile,
	provider: Exclude<ApiProvider, "Custom">
): void {
	const preset = PROVIDER_PRESETS[provider];
	profile.apiProvider = provider;
	profile.baseUrl = preset.baseUrl;
	profile.modelName = preset.modelName;
	profile.supportsVision = preset.supportsVision;
}
