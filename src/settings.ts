/* eslint-disable obsidianmd/ui/sentence-case */
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { UiLanguage } from "./i18n";
import { applyProviderPreset, getProviderDropdownOptions, PROVIDER_PRESETS, VISION_MODEL_SUGGESTIONS } from "./constants/providers";
import { canEncryptSecrets } from "./services/secretStorage";
import LectureLensPlugin from "./main";
import { LLMServiceError } from "./services/llm";

export type ApiProvider = "OpenAI" | "DeepSeek" | "Kimi" | "Gemini" | "Custom";

export interface PromptTemplate {
	name: string;
	prompt: string;
}

export interface LectureLensSettings {
	uiLanguage: UiLanguage;
	apiProvider: ApiProvider;
	apiKey: string;
	baseUrl: string;
	modelName: string;
	supportsVision: boolean;
	promptTemplates: PromptTemplate[];
	courseFolderPath: string;
	embeddingModelName: string;
	ragEnabled: boolean;
	ragTopK: number;
	enablePasteOcr: boolean;
	pasteImageFolder: string;
	autoAnalyzeOnPaste: boolean;
	autoAttachCurrentNote: boolean;
	maxNoteContextChars: number;
}

export const DEFAULT_SETTINGS: LectureLensSettings = {
	uiLanguage: "auto",
	apiProvider: "OpenAI",
	apiKey: "",
	baseUrl: "https://api.openai.com/v1",
	modelName: "gpt-4o",
	supportsVision: true,
	promptTemplates: [
		{
			name: "Lecture Notes",
			prompt: "Analyze this slide and extract structured notes.",
		},
		{
			name: "Extract Math",
			prompt: "Extract all mathematical formulas and output them strictly in LaTeX block format.",
		},
		{
			name: "Chart to Mermaid",
			prompt: "Analyze this flowchart/diagram and convert it into Mermaid.js code.",
		},
	],
	courseFolderPath: "",
	embeddingModelName: "text-embedding-3-small",
	ragEnabled: true,
	ragTopK: 5,
	enablePasteOcr: true,
	pasteImageFolder: "attachments",
	autoAnalyzeOnPaste: false,
	autoAttachCurrentNote: true,
	maxNoteContextChars: 6000,
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

		new Setting(containerEl)
			.setName(tr("settings.apiProvider.name"))
			.setDesc(tr("settings.apiProvider.desc"))
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(getProviderDropdownOptions(tr, this.plugin.getLocale()))
					.setValue(this.plugin.settings.apiProvider)
					.onChange(async (value) => {
						const allowedProviders: ApiProvider[] = [
							"OpenAI",
							"DeepSeek",
							"Kimi",
							"Gemini",
							"Custom",
						];
						const provider = allowedProviders.find((item) => item === value);
						if (!provider) {
							dropdown.setValue(this.plugin.settings.apiProvider);
							return;
						}
						this.plugin.settings.apiProvider = provider;
						if (provider !== "Custom") {
							const preset = applyProviderPreset(provider);
							this.plugin.settings.baseUrl = preset.baseUrl;
							this.plugin.settings.modelName = preset.modelName;
							this.plugin.settings.embeddingModelName = preset.embeddingModelName;
							this.plugin.settings.supportsVision = preset.supportsVision;
						}
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.apiProvider !== "Custom") {
			const preset = PROVIDER_PRESETS[this.plugin.settings.apiProvider];
			containerEl.createEl("p", {
				cls: "setting-item-description lecture-lens-provider-hint",
				text: tr("settings.apiProvider.presetHint", {
					baseUrl: preset.baseUrl,
					model: preset.modelName,
				}),
			});
		}

		new Setting(containerEl)
			.setName(tr("settings.supportsVision.name"))
			.setDesc(tr("settings.supportsVision.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.supportsVision)
					.onChange(async (value) => {
						this.plugin.settings.supportsVision = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.apiKey.name"))
			.setDesc(
				tr(canEncryptSecrets() ? "settings.apiKey.descSecure" : "settings.apiKey.descPlain")
			)
			.addText((text) => {
				text
					.setPlaceholder("sk-...")
					.setValue(this.plugin.settings.apiKey)
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					});
				text.inputEl.type = "password";
			});

		new Setting(containerEl)
			.setName(tr("settings.baseUrl.name"))
			.setDesc(tr("settings.baseUrl.desc"))
			.addText((text) =>
				text
					.setPlaceholder(
						this.plugin.settings.apiProvider === "DeepSeek"
							? "https://api.deepseek.com"
							: "https://api.openai.com/v1"
					)
					.setValue(this.plugin.settings.baseUrl)
					.onChange(async (value) => {
						const trimmed = value.trim();
						const isValid = /^https?:\/\//i.test(trimmed);
						if (!isValid) {
							text.inputEl.classList.add("lecture-lens-input-error");
							text.inputEl.setAttribute("aria-invalid", "true");
							text.inputEl.title = tr("settings.baseUrl.invalidTitle");
							return;
						}
						text.inputEl.classList.remove("lecture-lens-input-error");
						text.inputEl.removeAttribute("aria-invalid");
						text.inputEl.removeAttribute("title");
						this.plugin.settings.baseUrl = trimmed;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.modelName.name"))
			.setDesc(tr("settings.modelName.desc"))
			.addText((text) =>
				text
					.setPlaceholder(
						this.plugin.settings.apiProvider === "DeepSeek"
							? "deepseek-v4-flash"
							: "gpt-4o"
					)
					.setValue(this.plugin.settings.modelName)
					.onChange(async (value) => {
						this.plugin.settings.modelName = value.trim();
						await this.plugin.saveSettings();
					})
			);

		const visionModels = VISION_MODEL_SUGGESTIONS[this.plugin.settings.apiProvider];
		if (visionModels && visionModels.length > 0) {
			new Setting(containerEl)
				.setName(tr("settings.modelPreset.name"))
				.setDesc(tr("settings.modelPreset.desc"))
				.addDropdown((dropdown) => {
					dropdown.addOption("", tr("settings.modelPreset.custom"));
					for (const model of visionModels) {
						dropdown.addOption(model, model);
					}
					dropdown.setValue(
						visionModels.includes(this.plugin.settings.modelName)
							? this.plugin.settings.modelName
							: ""
					);
					dropdown.onChange(async (value) => {
						if (!value) return;
						this.plugin.settings.modelName = value;
						await this.plugin.saveSettings();
						this.display();
					});
				});
		}

		new Setting(containerEl)
			.setName(tr("settings.testConnection.name"))
			.setDesc(tr("settings.testConnection.desc"))
			.addButton((button) =>
				button
					.setButtonText(tr("settings.testConnection.button"))
					.setCta()
					.onClick(async () => {
						button.setButtonText(tr("settings.testConnection.testing")).setDisabled(true);

						try {
							const response = await this.plugin.llmService.chatCompletion([
								{
									role: "user",
									content: "Hello! Please respond with 'OK' to confirm connection.",
								},
							], {
								max_tokens: 10,
								temperature: 0,
							});

							const firstChoice = response.choices[0];
							const rawContent = firstChoice?.message?.content;
							const message = typeof rawContent === "string" ? rawContent : tr("settings.testConnection.noResponse");
							new Notice(
								tr("settings.testConnection.success", {
									model: response.model,
									message,
								}),
								5000
							);
						} catch (error) {
							console.error("LLM Connection Error:", error);

							let userMessage = tr("settings.testConnection.errorUnknown");

							if (error instanceof LLMServiceError) {
								const statusCode = error.statusCode;
								const errorMsg = error.message.toLowerCase();

								if (statusCode === 401 || errorMsg.includes("unauthorized") || errorMsg.includes("authentication")) {
									userMessage = tr("settings.testConnection.error401");
								} else if (statusCode === 404 || errorMsg.includes("not found")) {
									userMessage = tr("settings.testConnection.error404");
								} else if (statusCode === 429 || errorMsg.includes("rate limit") || errorMsg.includes("quota")) {
									userMessage = tr("settings.testConnection.error429");
								} else if (errorMsg.includes("timeout")) {
									userMessage = tr("settings.testConnection.errorTimeout");
								} else {
									userMessage = tr("settings.testConnection.errorGeneric", {
										message: error.message.substring(0, 50),
									});
								}
							} else if (error instanceof Error) {
								const errorMsg = error.message.toLowerCase();

								if (errorMsg.includes("timeout")) {
									userMessage = tr("settings.testConnection.errorTimeout");
								} else if (errorMsg.includes("network")) {
									userMessage = tr("settings.testConnection.errorNetwork");
								} else {
									userMessage = tr("settings.testConnection.errorGeneric", {
										message: error.message.substring(0, 50),
									});
								}
							}

							new Notice(userMessage, 8000);
						} finally {
							button.setButtonText(tr("settings.testConnection.button")).setDisabled(false);
						}
					})
			);

		// Prompt templates section
		new Setting(containerEl).setName(tr("settings.promptTemplates.heading")).setHeading();
		containerEl.createEl("p", {
			text: tr("settings.promptTemplates.desc"),
			cls: "setting-item-description",
		});

		const templatesContainer = containerEl.createEl("div");

		const renderTemplates = () => {
			templatesContainer.empty();

			this.plugin.settings.promptTemplates.forEach((template, index) => {
				const templateSetting = new Setting(templatesContainer)
					.addText((text) =>
						text
							.setPlaceholder(tr("settings.promptTemplates.namePlaceholder"))
							.setValue(template.name)
							.onChange(async (value) => {
								this.plugin.settings.promptTemplates[index]!.name = value;
								await this.plugin.saveSettings();
							})
					)
					.addTextArea((textArea) => {
						textArea
							.setPlaceholder(tr("settings.promptTemplates.promptPlaceholder"))
							.setValue(template.prompt)
							.onChange(async (value) => {
								this.plugin.settings.promptTemplates[index]!.prompt = value;
								await this.plugin.saveSettings();
							});
						textArea.inputEl.rows = 2;
						textArea.inputEl.addClass("lecture-lens-template-textarea");
						return textArea;
					})
					.addButton((btn) =>
						btn
							.setIcon("trash")
							.setTooltip(tr("settings.promptTemplates.removeTooltip"))
							.onClick(async () => {
								this.plugin.settings.promptTemplates.splice(index, 1);
								await this.plugin.saveSettings();
								renderTemplates();
							})
					);
				templateSetting.settingEl.addClass("lecture-lens-template-setting");
			});

			new Setting(templatesContainer).addButton((btn) =>
				btn
					.setButtonText(tr("settings.promptTemplates.addButton"))
					.onClick(async () => {
						this.plugin.settings.promptTemplates.push({
							name: tr("settings.promptTemplates.newName"),
							prompt: "",
						});
						await this.plugin.saveSettings();
						renderTemplates();
					})
			);
		};

		renderTemplates();

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
			.setName(tr("settings.courseFolder.name"))
			.setDesc(tr("settings.courseFolder.desc"))
			.addText((text) =>
				text
					.setPlaceholder("Courses/My Course")
					.setValue(this.plugin.settings.courseFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.courseFolderPath = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.embeddingModel.name"))
			.setDesc(tr("settings.embeddingModel.desc"))
			.addText((text) =>
				text
					.setPlaceholder("text-embedding-3-small")
					.setValue(this.plugin.settings.embeddingModelName)
					.onChange(async (value) => {
						this.plugin.settings.embeddingModelName = value.trim();
						await this.plugin.saveSettings();
					})
			);

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
						const folder = this.plugin.settings.courseFolderPath.trim();
						if (!folder) {
							new Notice(tr("settings.rebuildIndex.noFolder"), 5000);
							return;
						}
						button.setDisabled(true).setButtonText(tr("settings.rebuildIndex.indexing"));
						try {
							const count = await this.plugin.ragService.buildIndex(
								folder,
								this.plugin.settings.embeddingModelName
							);
							new Notice(tr("settings.rebuildIndex.success", { count }), 5000);
						} catch (error) {
							const msg = error instanceof Error ? error.message : tr("notice.unknownError");
							new Notice(tr("settings.rebuildIndex.failed", { message: msg }), 8000);
						} finally {
							button.setDisabled(false).setButtonText(tr("settings.rebuildIndex.button"));
						}
					})
			);

		new Setting(containerEl).setName(tr("settings.clipboard.heading")).setHeading();

		new Setting(containerEl)
			.setName(tr("settings.enablePasteOcr.name"))
			.setDesc(tr("settings.enablePasteOcr.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enablePasteOcr)
					.onChange(async (value) => {
						this.plugin.settings.enablePasteOcr = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.pasteImageFolder.name"))
			.setDesc(tr("settings.pasteImageFolder.desc"))
			.addText((text) =>
				text
					.setPlaceholder("attachments")
					.setValue(this.plugin.settings.pasteImageFolder)
					.onChange(async (value) => {
						this.plugin.settings.pasteImageFolder = value.trim() || "attachments";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(tr("settings.autoAnalyzeOnPaste.name"))
			.setDesc(tr("settings.autoAnalyzeOnPaste.desc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoAnalyzeOnPaste)
					.onChange(async (value) => {
						this.plugin.settings.autoAnalyzeOnPaste = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
