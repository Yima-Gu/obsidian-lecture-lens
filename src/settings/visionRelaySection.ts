import { Setting } from "obsidian";
import LectureLensPlugin from "../main";
import { TranslationKey } from "../i18n/en";
import {
	formatVisionProfileLabel,
	listVisionCapableProfiles,
	resolveVisionRelayProfile,
} from "../utils/visionRelayConfig";

export function renderVisionRelaySection(
	containerEl: HTMLElement,
	plugin: LectureLensPlugin,
	tr: (key: TranslationKey, params?: Record<string, string | number>) => string
): void {
	new Setting(containerEl).setName(tr("settings.visionRelay.heading")).setHeading();
	containerEl.createEl("p", {
		text: tr("settings.visionRelay.desc"),
		cls: "setting-item-description",
	});

	const visionProfiles = listVisionCapableProfiles(plugin.settings.llmProfiles);
	const resolved = resolveVisionRelayProfile(
		plugin.settings.llmProfiles,
		plugin.settings.visionRelayProfileId
	);

	new Setting(containerEl)
		.setName(tr("settings.visionRelay.enabled.name"))
		.setDesc(tr("settings.visionRelay.enabled.desc"))
		.addToggle((toggle) =>
			toggle.setValue(plugin.settings.visionRelayEnabled).onChange(async (value) => {
				plugin.settings.visionRelayEnabled = value;
				await plugin.saveSettings();
			})
		);

	const profileSetting = new Setting(containerEl)
		.setName(tr("settings.visionRelay.profile.name"))
		.setDesc(tr("settings.visionRelay.profile.desc"));

	if (visionProfiles.length === 0) {
		profileSetting.descEl.createEl("p", {
			cls: "mod-warning",
			text: tr("settings.visionRelay.noVisionProfile"),
		});
		return;
	}

	profileSetting.addDropdown((dropdown) => {
		for (const profile of visionProfiles) {
			dropdown.addOption(profile.id, formatVisionProfileLabel(profile));
		}

		const currentId =
			plugin.settings.visionRelayProfileId &&
			visionProfiles.some((profile) => profile.id === plugin.settings.visionRelayProfileId)
				? plugin.settings.visionRelayProfileId
				: resolved?.id ?? visionProfiles[0]!.id;

		dropdown.setValue(currentId).onChange(async (value) => {
			plugin.settings.visionRelayProfileId = value;
			await plugin.saveSettings();
		});
	});

	if (resolved && !resolved.apiKey.trim()) {
		containerEl.createEl("p", {
			cls: "mod-warning",
			text: tr("settings.visionRelay.missingKey", {
				profile: formatVisionProfileLabel(resolved),
			}),
		});
	}
}
