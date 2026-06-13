import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { UiLanguage } from "./i18n";
import { EmbeddingMode } from "./services/embeddingConfig";
import { renderEmbeddingModelDownloadSection } from "./settings/embeddingModelSection";
import { renderLlmProfilesSection } from "./settings/llmProfilesSection";
import { renderVisionRelaySection } from "./settings/visionRelaySection";
import { LlmProfile } from "./types/llmProfile";
import { createDefaultProfiles } from "./types/llmProfile";
import { providerSupportsEmbeddings } from "./constants/providers";
import {
	DEFAULT_HF_MIRROR_URL,
	DEFAULT_LOCAL_EMBEDDING_MODEL,
	LOCAL_EMBEDDING_MODELS,
} from "./constants/localEmbeddingModels";
import { canEncryptSecrets } from "./services/secretStorage";
import { canonicalizeCourseFolderInput, hasCourseFolderInput } from "./utils/vaultPath";
import { VaultFolderSuggestModal } from "./ui/folderSuggestModal";
import {
	CHAT_MESSAGE_FONT_SIZE_MAX,
	CHAT_MESSAGE_FONT_SIZE_MIN,
	DEFAULT_CHAT_MESSAGE_FONT_SIZE,
} from "./constants/chatAppearance";
import LectureLensPlugin from "./main";

export type ApiProvider = "OpenAI" | "DeepSeek" | "Kimi" | "Gemini" | "Custom";

export interface LectureLensSettings {
	uiLanguage: UiLanguage;
	apiProvider: ApiProvider;
	apiKey: string;
	baseUrl: string;
	modelName: string;
	supportsVision: boolean;
	llmProfiles: LlmProfile[];
	defaultLlmProfileId: string;
	courseFolderPath: string;
	pdfNotesOutputFolder: string;
	pdfNotesMaxPages: number;
	pdfNotesSkipMerge: boolean;
	pdfNotesSectionMaxTokens: number;
	pdfNotesSectionConcurrency: number;
	pdfNotesMergeMaxTokens: number;
	pdfNotesStylePrompt: string;
	embeddingMode: EmbeddingMode;
	localEmbeddingModel: string;
	hfMirrorUrl: string;
	embeddingBaseUrl: string;
	embeddingApiKey: string;
	embeddingModelName: string;
	ragEnabled: boolean;
	ragTopK: number;
	autoAttachCurrentNote: boolean;
	maxNoteContextChars: number;
	chatMessageFontSize: number;
	chatHistoryTurnLimit: number;
	chatRagMinScore: number;
	chatContextBudgetChars: number;
	/** When chat model is text-only (e.g. DeepSeek), use this profile to read images first. */
	visionRelayEnabled: boolean;
	visionRelayProfileId: string;
}

export const DEFAULT_SETTINGS: LectureLensSettings = {
	uiLanguage: "auto",
	apiProvider: "OpenAI",
	apiKey: "",
	baseUrl: "https://api.openai.com/v1",
	modelName: "gpt-4o",
	supportsVision: true,
	llmProfiles: (() => {
		const profiles = createDefaultProfiles();
		return profiles;
	})(),
	defaultLlmProfileId: "",
	courseFolderPath: "",
	pdfNotesOutputFolder: "",
	pdfNotesMaxPages: 120,
	pdfNotesSkipMerge: true,
	pdfNotesSectionMaxTokens: 8192,
	pdfNotesSectionConcurrency: 2,
	pdfNotesMergeMaxTokens: 16384,
	pdfNotesStylePrompt: "",
	embeddingMode: "local",
	localEmbeddingModel: DEFAULT_LOCAL_EMBEDDING_MODEL,
	hfMirrorUrl: DEFAULT_HF_MIRROR_URL,
	embeddingBaseUrl: "",
	embeddingApiKey: "",
	embeddingModelName: "text-embedding-3-small",
	ragEnabled: true,
	ragTopK: 5,
	autoAttachCurrentNote: true,
	maxNoteContextChars: 6000,
	chatMessageFontSize: DEFAULT_CHAT_MESSAGE_FONT_SIZE,
	chatHistoryTurnLimit: 10,
	chatRagMinScore: 0.25,
	chatContextBudgetChars: 32000,
	visionRelayEnabled: true,
	visionRelayProfileId: "",
};

export class LectureLensSettingTab extends PluginSettingTab {
	plugin: LectureLensPlugin;

	constructor(app: App, plugin: LectureLensPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const tr = (key: Parameters<LectureLensPlugin["tr"]>[0], params?: Parameters<LectureLensPlugin["tr"]>[1]) =>
			this.plugin.tr(key, params);

		containerEl.empty();

		new Setting(containerEl)
			.setName(tr("settings.uiLanguage.name"))
			.setDesc(tr("settings.uiLanguage.desc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						auto: tr("settings.uiLanguage.auto"),
						en: tr("settings.uiLanguage.en"),
						zh: tr("settings.uiLanguage.zh"),
					})
					.setValue(this.plugin.settings.uiLanguage)
					.onChange(async (value) => {
						const allowed: UiLanguage[] = ["auto", "en", "zh"];
						const language = allowed.find((item) => item === value);
						if (!language) {
							dropdown.setValue(this.plugin.settings.uiLanguage);
							return;
						}
						if (language === this.plugin.settings.uiLanguage) return;
						this.plugin.settings.uiLanguage = language;
						await this.plugin.saveSettings();
						this.display();
						new Notice(tr("notice.reloadForLanguage"), 6000);
					})
			);

		renderLlmProfilesSection(containerEl, this.plugin, tr, () => this.display());
		renderVisionRelaySection(containerEl, this.plugin, tr);

		new Setting(containerEl).setName(tr("settings.pdfNotes.heading")).setHeading();

		new Setting(containerEl)
			.setName(tr("settings.pdfNotesOutputFolder.name"))
			.setDesc(tr("settings.pdfNotesOutputFolder.desc"))
			.addText((text) =>
				text
					.setPlaceholder(tr("settings.pdfNotesOutputFolder.placeholder"))
					.setValue(this.plugin.settings.pdfNotesOutputFolder)
					.onChange(async (value) => {
						this.plugin.settings.pdfNotesOutputFolder = value.trim();
						await this.plugin.saveSettings();
					})
			)
			.addButton((button) =>
				button.setButtonText(tr("settings.courseFolder.browse")).onClick(() => {
					new VaultFolderSuggestModal(
						this.app,
						(folder) => {
							this.plugin.settings.pdfNotesOutputFolder = folder.path || "";
							void this.plugin.saveSettings();
							this.display();
						},
						tr("settings.pdfNotesOutputFolder.browseHint")
					).open();
				})
			);

		new Setting(containerEl)
			.setName(tr("settings.pdfNotesMaxPages.name"))
			.setDesc(tr("settings.pdfNotesMaxPages.desc"))
			.addSlider((slider) =>
				slider
					.setLimits(10, 300, 10)
					.setValue(this.plugin.settings.pdfNotesMaxPages)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.pdfNotesMaxPages = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.pdfNotesSkipMerge.name"))
			.setDesc(tr("settings.pdfNotesSkipMerge.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.pdfNotesSkipMerge)
					.onChange(async (value) => {
						this.plugin.settings.pdfNotesSkipMerge = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.pdfNotesSectionMaxTokens.name"))
			.setDesc(tr("settings.pdfNotesSectionMaxTokens.desc"))
			.addSlider((slider) =>
				slider
					.setLimits(2048, 16384, 512)
					.setValue(this.plugin.settings.pdfNotesSectionMaxTokens)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.pdfNotesSectionMaxTokens = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.pdfNotesSectionConcurrency.name"))
			.setDesc(tr("settings.pdfNotesSectionConcurrency.desc"))
			.addSlider((slider) =>
				slider
					.setLimits(1, 4, 1)
					.setValue(this.plugin.settings.pdfNotesSectionConcurrency)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.pdfNotesSectionConcurrency = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.pdfNotesMergeMaxTokens.name"))
			.setDesc(tr("settings.pdfNotesMergeMaxTokens.desc"))
			.addSlider((slider) =>
				slider
					.setLimits(1024, 65536, 1024)
					.setValue(this.plugin.settings.pdfNotesMergeMaxTokens)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.pdfNotesMergeMaxTokens = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.pdfNotesStylePrompt.name"))
			.setDesc(tr("settings.pdfNotesStylePrompt.desc"))
			.addTextArea((text) =>
				text
					.setPlaceholder(tr("settings.pdfNotesStylePrompt.placeholder"))
					.setValue(this.plugin.settings.pdfNotesStylePrompt)
					.onChange(async (value) => {
						this.plugin.settings.pdfNotesStylePrompt = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName(tr("settings.rag.heading")).setHeading();

		new Setting(containerEl)
			.setName(tr("settings.autoAttachCurrentNote.name"))
			.setDesc(tr("settings.autoAttachCurrentNote.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoAttachCurrentNote)
					.onChange(async (value) => {
						this.plugin.settings.autoAttachCurrentNote = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.maxNoteContextChars.name"))
			.setDesc(tr("settings.maxNoteContextChars.desc"))
			.addSlider((slider) =>
				slider
					.setLimits(1000, 20000, 500)
					.setValue(this.plugin.settings.maxNoteContextChars)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxNoteContextChars = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.chatMessageFontSize.name"))
			.setDesc(tr("settings.chatMessageFontSize.desc"))
			.addSlider((slider) =>
				slider
					.setLimits(CHAT_MESSAGE_FONT_SIZE_MIN, CHAT_MESSAGE_FONT_SIZE_MAX, 1)
					.setValue(this.plugin.settings.chatMessageFontSize)
					.setDynamicTooltip()
					.onChange(async (value) => {
						await this.plugin.setChatMessageFontSize(value);
					})
			);

		new Setting(containerEl).setName(tr("settings.chatContext.heading")).setHeading();

		new Setting(containerEl)
			.setName(tr("settings.chatHistoryTurnLimit.name"))
			.setDesc(tr("settings.chatHistoryTurnLimit.desc"))
			.addSlider((slider) =>
				slider
					.setLimits(2, 30, 1)
					.setValue(this.plugin.settings.chatHistoryTurnLimit)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.chatHistoryTurnLimit = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.chatContextBudgetChars.name"))
			.setDesc(tr("settings.chatContextBudgetChars.desc"))
			.addSlider((slider) =>
				slider
					.setLimits(8000, 128000, 1000)
					.setValue(this.plugin.settings.chatContextBudgetChars)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.chatContextBudgetChars = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.chatRagMinScore.name"))
			.setDesc(tr("settings.chatRagMinScore.desc"))
			.addSlider((slider) =>
				slider
					.setLimits(0, 0.8, 0.05)
					.setValue(this.plugin.settings.chatRagMinScore)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.chatRagMinScore = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.courseFolder.name"))
			.setDesc(tr("settings.courseFolder.desc"))
			.addText((text) => {
				text
					.setPlaceholder(tr("settings.courseFolder.placeholder"))
					.setValue(this.plugin.settings.courseFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.courseFolderPath = canonicalizeCourseFolderInput(
							this.app,
							value
						);
						await this.plugin.saveSettings();
					});
			})
			.addButton((button) =>
				button.setButtonText(tr("settings.courseFolder.browse")).onClick(() => {
					new VaultFolderSuggestModal(
						this.app,
						(folder) => {
							this.plugin.settings.courseFolderPath = folder.path || "/";
							void this.plugin.saveSettings();
							this.display();
						},
						tr("settings.courseFolder.browseHint")
					).open();
				})
			);

		if (
			this.plugin.settings.embeddingMode === "api" &&
			!providerSupportsEmbeddings(this.plugin.settings.apiProvider)
		) {
			containerEl.createEl("p", {
				cls: "setting-item-description",
				text: tr("settings.embeddingProviderWarning"),
			});
		}

		new Setting(containerEl)
			.setName(tr("settings.embeddingMode.name"))
			.setDesc(tr("settings.embeddingMode.desc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOption("local", tr("settings.embeddingMode.local"))
					.addOption("api", tr("settings.embeddingMode.api"))
					.setValue(this.plugin.settings.embeddingMode)
					.onChange(async (value) => {
						this.plugin.settings.embeddingMode = value as EmbeddingMode;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.embeddingMode === "local") {
			new Setting(containerEl)
				.setName(tr("settings.localEmbeddingModel.name"))
				.setDesc(tr("settings.localEmbeddingModel.desc"))
				.addDropdown((dropdown) => {
					for (const model of LOCAL_EMBEDDING_MODELS) {
						dropdown.addOption(model.id, tr(model.labelKey));
					}
					dropdown
						.setValue(this.plugin.settings.localEmbeddingModel)
						.onChange(async (value) => {
							this.plugin.settings.localEmbeddingModel = value;
							this.plugin.embeddingModelStatusService.clearCache();
							await this.plugin.saveSettings();
							this.display();
						});
				});

			new Setting(containerEl)
				.setName(tr("settings.hfMirrorUrl.name"))
				.setDesc(tr("settings.hfMirrorUrl.desc"))
				.addText((text) =>
					text
						.setPlaceholder(DEFAULT_HF_MIRROR_URL)
						.setValue(this.plugin.settings.hfMirrorUrl)
						.onChange(async (value) => {
							this.plugin.settings.hfMirrorUrl = value.trim() || DEFAULT_HF_MIRROR_URL;
							this.plugin.embeddingModelStatusService.clearCache();
							await this.plugin.saveSettings();
							this.display();
						})
				);

			renderEmbeddingModelDownloadSection(containerEl, this.plugin, tr, () => this.display());
		} else {
			new Setting(containerEl)
				.setName(tr("settings.embeddingBaseUrl.name"))
				.setDesc(tr("settings.embeddingBaseUrl.desc"))
				.addText((text) =>
					text
						.setPlaceholder(tr("settings.common.placeholderBaseUrl"))
						.setValue(this.plugin.settings.embeddingBaseUrl)
						.onChange(async (value) => {
							this.plugin.settings.embeddingBaseUrl = value.trim();
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName(tr("settings.embeddingApiKey.name"))
				.setDesc(
					canEncryptSecrets()
						? tr("settings.embeddingApiKey.descSecure")
						: tr("settings.embeddingApiKey.descPlain")
				)
				.addText((text) => {
					text.inputEl.type = "password";
					text
						.setPlaceholder(tr("settings.common.placeholderApiKey"))
						.setValue(this.plugin.settings.embeddingApiKey)
						.onChange(async (value) => {
							this.plugin.settings.embeddingApiKey = value.trim();
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName(tr("settings.embeddingModel.name"))
				.setDesc(tr("settings.embeddingModel.desc"))
				.addText((text) =>
					text
						.setPlaceholder(tr("settings.common.placeholderEmbeddingModel"))
						.setValue(this.plugin.settings.embeddingModelName)
						.onChange(async (value) => {
							this.plugin.settings.embeddingModelName = value.trim();
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName(tr("settings.ragEnabled.name"))
			.setDesc(tr("settings.ragEnabled.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.ragEnabled)
					.onChange(async (value) => {
						this.plugin.settings.ragEnabled = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.ragTopK.name"))
			.setDesc(tr("settings.ragTopK.desc"))
			.addSlider((slider) =>
				slider
					.setLimits(1, 10, 1)
					.setValue(this.plugin.settings.ragTopK)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.ragTopK = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.rebuildIndex.name"))
			.setDesc(tr("settings.rebuildIndex.desc"))
			.addButton((button) =>
				button
					.setButtonText(tr("settings.rebuildIndex.button"))
					.setCta()
					.onClick(async () => {
						if (!hasCourseFolderInput(this.plugin.settings.courseFolderPath)) {
							new Notice(tr("settings.rebuildIndex.noFolder"), 5000);
							return;
						}
						button.setDisabled(true).setButtonText(tr("settings.rebuildIndex.indexing"));
						try {
							const validation = await this.plugin.getEmbeddingReadyMessage();
							if (validation) {
								new Notice(validation, 10000);
								return;
							}
							const progressNotice = new Notice(tr("settings.rebuildIndex.indexing"), 0);
							const count = await this.plugin.ragService.buildIndex(
								this.plugin.settings.courseFolderPath,
								this.plugin.getEmbeddingRuntimeConfig(),
								(message: string) => {
									progressNotice.setMessage(`${tr("settings.rebuildIndex.indexing")}\n${message}`);
								}
							);
							progressNotice.hide();
							new Notice(tr("settings.rebuildIndex.success", { count }), 5000);
						} catch (error) {
							const msg =
								error instanceof Error
									? this.plugin.formatEmbeddingError(error)
									: tr("notice.unknownError");
							new Notice(tr("settings.rebuildIndex.failed", { message: msg }), 10000);
						} finally {
							button.setDisabled(false).setButtonText(tr("settings.rebuildIndex.button"));
						}
					})
			);
	}
}
