import { Notice, Setting } from "obsidian";
import {
	applyProviderPresetToProfile,
	createProfileFromProvider,
	LlmProfile,
} from "../types/llmProfile";
import {
	getProviderDropdownOptions,
	PROVIDER_PRESETS,
	CHAT_MODEL_OPTIONS,
	providerSupportsRemoteModelList,
	getChatModelsForProvider,
} from "../constants/providers";
import { formatRemoteModelLabel, findRemoteModel } from "../services/modelCatalogService";
import { canEncryptSecrets } from "../services/secretStorage";
import LectureLensPlugin from "../main";
import { ApiProvider } from "../settings";

export function renderLlmProfilesSection(
	containerEl: HTMLElement,
	plugin: LectureLensPlugin,
	tr: (key: Parameters<LectureLensPlugin["tr"]>[0], params?: Parameters<LectureLensPlugin["tr"]>[1]) => string,
	onChanged: () => void
): void {
	new Setting(containerEl).setName(tr("settings.llmProfiles.heading")).setHeading();

	containerEl.createEl("p", {
		cls: "setting-item-description",
		text: tr("settings.llmProfiles.desc"),
	});

	const listEl = containerEl.createDiv({ cls: "lecture-lens-profile-list" });
	let expandedProfileId =
		plugin.settings.defaultLlmProfileId || plugin.settings.llmProfiles[0]?.id || null;

	const renderProfiles = () => {
		listEl.empty();
		for (const profile of plugin.settings.llmProfiles) {
			renderProfileRow(
				listEl,
				plugin,
				tr,
				profile,
				expandedProfileId === profile.id,
				onChanged,
				(isOpen) => {
					expandedProfileId = isOpen ? profile.id : null;
					renderProfiles();
				},
				renderProfiles
			);
		}
	};

	renderProfiles();

	new Setting(containerEl).addButton((button) =>
		button
			.setButtonText(tr("settings.llmProfiles.add"))
			.onClick(async () => {
				const profile = createProfileFromProvider("DeepSeek", tr("settings.llmProfiles.newName"));
				plugin.settings.llmProfiles.push(profile);
				if (!plugin.settings.defaultLlmProfileId) {
					plugin.settings.defaultLlmProfileId = profile.id;
				}
				expandedProfileId = profile.id;
				plugin.syncLegacyApiFieldsFromDefaultProfile();
				await plugin.saveSettings();
				renderProfiles();
				onChanged();
			})
	);
}

function renderProfileRow(
	containerEl: HTMLElement,
	plugin: LectureLensPlugin,
	trFn: (key: Parameters<LectureLensPlugin["tr"]>[0], params?: Parameters<LectureLensPlugin["tr"]>[1]) => string,
	profile: LlmProfile,
	isExpanded: boolean,
	onChanged: () => void,
	onToggle: (isOpen: boolean) => void,
	rerender: () => void
): void {
	const isDefault = plugin.settings.defaultLlmProfileId === profile.id;
	const displayName = profile.name || profile.apiProvider;
	const title = isDefault
		? `${displayName} (${trFn("settings.llmProfiles.defaultBadge")})`
		: displayName;
	const keyHint = profile.apiKey ? "••••" : trFn("settings.llmProfiles.noKey");

	const row = new Setting(containerEl)
		.setName(title)
		.setDesc(`${profile.apiProvider} · ${profile.modelName} · ${keyHint}`)
		.addExtraButton((button) => {
			button
				.setIcon(isExpanded ? "chevron-up" : "chevron-down")
				.setTooltip(trFn("settings.llmProfiles.configure"))
				.onClick(() => onToggle(!isExpanded));
		})
		.addButton((button) => {
			button.setButtonText(trFn("settings.llmProfiles.test")).onClick(() => {
				void plugin.testLlmProfileConnection(profile);
			});
		});

	row.settingEl.addClass("lecture-lens-profile-row");
	if (isExpanded) {
		row.settingEl.addClass("is-expanded");
	}

	if (isExpanded) {
		const detailsEl = containerEl.createDiv({ cls: "lecture-lens-profile-details" });
		renderProfileDetails(detailsEl, plugin, trFn, profile, onChanged, rerender);
	}
}

function renderProfileDetails(
	containerEl: HTMLElement,
	plugin: LectureLensPlugin,
	tr: (key: Parameters<LectureLensPlugin["tr"]>[0], params?: Parameters<LectureLensPlugin["tr"]>[1]) => string,
	profile: LlmProfile,
	onChanged: () => void,
	rerender: () => void
): void {
	const isDefault = plugin.settings.defaultLlmProfileId === profile.id;

	new Setting(containerEl)
		.setName(tr("settings.llmProfiles.name"))
		.addText((text) =>
			text.setValue(profile.name).onChange(async (value) => {
				profile.name = value.trim() || profile.apiProvider;
				await plugin.saveSettings();
				rerender();
			})
		);

	new Setting(containerEl)
		.setName(tr("settings.apiProvider.name"))
		.addDropdown((dropdown) =>
			dropdown
				.addOptions(getProviderDropdownOptions(tr, plugin.getLocale()))
				.setValue(profile.apiProvider)
				.onChange(async (value) => {
					const allowed: ApiProvider[] = ["OpenAI", "DeepSeek", "Kimi", "Gemini", "Custom"];
					const provider = allowed.find((item) => item === value);
					if (!provider) return;
					if (provider !== "Custom") {
						applyProviderPresetToProfile(profile, provider);
					} else {
						profile.apiProvider = provider;
					}
					plugin.syncLegacyApiFieldsFromDefaultProfile();
					await plugin.saveSettings();
					rerender();
					onChanged();
				})
		);

	if (profile.apiProvider !== "Custom") {
		const preset = PROVIDER_PRESETS[profile.apiProvider];
		containerEl.createEl("p", {
			cls: "setting-item-description lecture-lens-provider-hint",
			text: tr("settings.apiProvider.presetHint", {
				baseUrl: preset.baseUrl,
				model: preset.modelName,
			}),
		});
	}

	new Setting(containerEl)
		.setName(tr("settings.apiKey.name"))
		.setDesc(tr(canEncryptSecrets() ? "settings.apiKey.descSecure" : "settings.apiKey.descPlain"))
		.addText((text) => {
			text.inputEl.type = "password";
			text
				.setPlaceholder(tr("settings.common.placeholderApiKey"))
				.setValue(profile.apiKey)
				.onChange(async (value) => {
					profile.apiKey = value.trim();
					plugin.syncLegacyApiFieldsFromDefaultProfile();
					await plugin.saveSettings();
					rerender();
				});
		});

	new Setting(containerEl)
		.setName(tr("settings.baseUrl.name"))
		.addText((text) =>
			text
				.setPlaceholder(tr("settings.common.placeholderBaseUrl"))
				.setValue(profile.baseUrl)
				.onChange(async (value) => {
					const trimmed = value.trim();
					if (trimmed && !/^https?:\/\//i.test(trimmed)) return;
					profile.baseUrl = trimmed;
					plugin.syncLegacyApiFieldsFromDefaultProfile();
					await plugin.saveSettings();
				})
		);

	new Setting(containerEl)
		.setName(tr("settings.modelName.name"))
		.addText((text) =>
			text.setValue(profile.modelName).onChange(async (value) => {
				profile.modelName = value.trim();
				void plugin.applyModelProfileSettings(profile, profile.modelName).then(() => {
					plugin.syncLegacyApiFieldsFromDefaultProfile();
					rerender();
				});
			})
		);

	const staticModels = CHAT_MODEL_OPTIONS[profile.apiProvider];
	const remoteModels = profile.remoteModels;
	const modelOptions = getChatModelsForProvider(
		profile.apiProvider,
		profile.modelName,
		remoteModels
	);

	if (modelOptions.length > 0) {
		new Setting(containerEl)
			.setName(tr("settings.modelPreset.name"))
			.addDropdown((dropdown) => {
				for (const modelId of modelOptions) {
					const remote = findRemoteModel(remoteModels, modelId);
					const label = remote ? formatRemoteModelLabel(remote) : modelId;
					dropdown.addOption(modelId, label);
				}
				dropdown
					.setValue(modelOptions.includes(profile.modelName) ? profile.modelName : modelOptions[0]!)
					.onChange(async (value) => {
						profile.modelName = value;
						await plugin.applyModelProfileSettings(profile, value);
						rerender();
					});
			});
	} else if (staticModels?.length) {
		new Setting(containerEl)
			.setName(tr("settings.modelPreset.name"))
			.addDropdown((dropdown) => {
				for (const model of staticModels) dropdown.addOption(model, model);
				dropdown
					.setValue(staticModels.includes(profile.modelName) ? profile.modelName : staticModels[0]!)
					.onChange(async (value) => {
						profile.modelName = value;
						await plugin.applyModelProfileSettings(profile, value);
						rerender();
					});
			});
	}

	if (providerSupportsRemoteModelList(profile.apiProvider)) {
		new Setting(containerEl)
			.setName(tr("settings.refreshModels.name"))
			.setDesc(tr("settings.refreshModels.desc"))
			.addButton((button) =>
				button.setButtonText(tr("settings.refreshModels.button")).onClick(async () => {
					button.setDisabled(true);
					button.setButtonText(tr("settings.refreshModels.loading"));
					try {
						const count = await plugin.refreshProfileRemoteModels(profile, { force: true });
						new Notice(tr("settings.refreshModels.success", { count }), 4000);
						rerender();
						onChanged();
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						new Notice(tr("settings.refreshModels.failed", { message }), 8000);
					} finally {
						button.setDisabled(false);
						button.setButtonText(tr("settings.refreshModels.button"));
					}
				})
			);
	}

	new Setting(containerEl)
		.setName(tr("settings.supportsVision.name"))
		.addToggle((toggle) =>
			toggle.setValue(profile.supportsVision).onChange(async (value) => {
				profile.supportsVision = value;
				plugin.syncLegacyApiFieldsFromDefaultProfile();
				await plugin.saveSettings();
			})
		);

	const actions = containerEl.createDiv({ cls: "lecture-lens-profile-card-actions" });

	if (!isDefault) {
		actions.createEl("button", { text: tr("settings.llmProfiles.setDefault") }).addEventListener(
			"click",
			() => {
				plugin.settings.defaultLlmProfileId = profile.id;
				plugin.syncLegacyApiFieldsFromDefaultProfile();
				void plugin.saveSettings().then(() => {
					rerender();
					onChanged();
				});
			}
		);
	}

	if (plugin.settings.llmProfiles.length > 1) {
		actions
			.createEl("button", { cls: "mod-warning", text: tr("settings.llmProfiles.delete") })
			.addEventListener("click", () => {
				plugin.settings.llmProfiles = plugin.settings.llmProfiles.filter(
					(item) => item.id !== profile.id
				);
				if (plugin.settings.defaultLlmProfileId === profile.id) {
					plugin.settings.defaultLlmProfileId = plugin.settings.llmProfiles[0]?.id ?? "";
				}
				plugin.syncLegacyApiFieldsFromDefaultProfile();
				void plugin.saveSettings().then(() => {
					rerender();
					onChanged();
				});
			});
	}
}
