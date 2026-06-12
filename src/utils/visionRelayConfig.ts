import { providerSupportsVision } from "../constants/providers";
import { ApiProvider, LectureLensSettings } from "../settings";
import { findProfileById, findProfileByProvider, LlmProfile } from "../types/llmProfile";

export function isProfileVisionCapable(profile: LlmProfile): boolean {
	return providerSupportsVision(profile.apiProvider, profile.modelName, profile.supportsVision);
}

export function chatProfileSupportsVision(profile: LlmProfile, effectiveModelName: string): boolean {
	return providerSupportsVision(profile.apiProvider, effectiveModelName, profile.supportsVision);
}

export function resolveVisionRelayProfile(
	profiles: LlmProfile[],
	visionRelayProfileId: string
): LlmProfile | null {
	if (visionRelayProfileId) {
		const selected = findProfileById(profiles, visionRelayProfileId);
		if (selected && isProfileVisionCapable(selected)) {
			return selected;
		}
	}

	const kimi = findProfileByProvider(profiles, "Kimi");
	if (kimi && isProfileVisionCapable(kimi)) {
		return kimi;
	}

	return profiles.find((profile) => isProfileVisionCapable(profile)) ?? null;
}

export function canUseVisionRelay(
	settings: LectureLensSettings,
	chatProfile: LlmProfile,
	effectiveModelName: string
): boolean {
	if (!settings.visionRelayEnabled) return false;
	if (chatProfileSupportsVision(chatProfile, effectiveModelName)) return false;

	const visionProfile = resolveVisionRelayProfile(
		settings.llmProfiles,
		settings.visionRelayProfileId
	);
	if (!visionProfile) return false;
	if (!visionProfile.apiKey.trim()) return false;

	return true;
}

export function needsVisionRelay(
	settings: LectureLensSettings,
	chatProfile: LlmProfile,
	effectiveModelName: string,
	hasImages: boolean
): boolean {
	return hasImages && canUseVisionRelay(settings, chatProfile, effectiveModelName);
}

export function listVisionCapableProfiles(profiles: LlmProfile[]): LlmProfile[] {
	return profiles.filter(isProfileVisionCapable);
}

export function formatVisionProfileLabel(profile: LlmProfile): string {
	const providerLabels: Record<ApiProvider, string> = {
		OpenAI: "OpenAI",
		DeepSeek: "DeepSeek",
		Kimi: "Kimi",
		Gemini: "Gemini",
		Custom: "Custom",
	};
	return `${profile.name} (${providerLabels[profile.apiProvider]})`;
}
