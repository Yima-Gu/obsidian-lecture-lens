/* eslint-disable obsidianmd/ui/sentence-case */
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import LectureLensPlugin from "./main";
import { LLMServiceError } from "./services/llm";

export type ApiProvider = "OpenAI" | "Gemini" | "Custom";

export interface PromptTemplate {
	name: string;
	prompt: string;
}

export interface LectureLensSettings {
	apiProvider: ApiProvider;
	apiKey: string;
	baseUrl: string;
	modelName: string;
	promptTemplates: PromptTemplate[];
}

export const DEFAULT_SETTINGS: LectureLensSettings = {
	apiProvider: "OpenAI",
	apiKey: "",
	baseUrl: "https://api.openai.com/v1",
	modelName: "gpt-4o",
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
};

export class LectureLensSettingTab extends PluginSettingTab {
	plugin: LectureLensPlugin;

	constructor(app: App, plugin: LectureLensPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("API provider")
			.setDesc("Choose which API provider to use.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						OpenAI: "OpenAI",
						Gemini: "Gemini",
						Custom: "Custom",
					})
					.setValue(this.plugin.settings.apiProvider)
					.onChange(async (value) => {
						const allowedProviders: ApiProvider[] = ["OpenAI", "Gemini", "Custom"];
						const provider = allowedProviders.find((item) => item === value);
						if (!provider) {
							dropdown.setValue(this.plugin.settings.apiProvider);
							return;
						}
						this.plugin.settings.apiProvider = provider;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("API key")
			.setDesc("Warning: Your API key will be stored unencrypted on disk in this vault. Anyone with access can read it.")
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
			.setName("Base URL")
			.setDesc("Set the base URL for the API.")
			.addText((text) =>
				text
					.setPlaceholder("https://api.openai.com/v1")
					.setValue(this.plugin.settings.baseUrl)
					.onChange(async (value) => {
						const trimmed = value.trim();
						const isValid = /^https?:\/\//i.test(trimmed);
						if (!isValid) {
							text.inputEl.classList.add("lecture-lens-input-error");
							text.inputEl.setAttribute("aria-invalid", "true");
							text.inputEl.title = "Base URL must start with http:// or https://";
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
			.setName("Model name")
			.setDesc("Set the model identifier to call, for example gpt-4o.")
			.addText((text) =>
				text
					.setPlaceholder("gpt-4o")
					.setValue(this.plugin.settings.modelName)
					.onChange(async (value) => {
						this.plugin.settings.modelName = value.trim();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Verify that your API key and settings are working correctly.")
			.addButton((button) =>
				button
					.setButtonText("Check connection")
					.setCta()
					.onClick(async () => {
						button.setButtonText("Testing...").setDisabled(true);

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
							const message = typeof rawContent === "string" ? rawContent : "No response";
							new Notice(
								`✅ Connection successful!\nModel: ${response.model}\nResponse: ${message}`,
								5000
							);
						} catch (error) {
							// Log full error for developer debugging
							console.error("LLM Connection Error:", error);

							// Sanitize error message for user display
							let userMessage = "❌ 连接错误: 未知错误 (查看控制台详情)";

							if (error instanceof LLMServiceError) {
								const statusCode = error.statusCode;
								const errorMsg = error.message.toLowerCase();

								if (statusCode === 401 || errorMsg.includes("unauthorized") || errorMsg.includes("authentication")) {
									userMessage = "❌ 认证失败 (401)：请检查 API Key 是否正确。";
								} else if (statusCode === 404 || errorMsg.includes("not found")) {
									userMessage = "❌ 找不到资源 (404)：请检查 Base URL 或模型名称。";
								} else if (statusCode === 429 || errorMsg.includes("rate limit") || errorMsg.includes("quota")) {
									userMessage = "❌ 额度超限 (429)：余额不足或请求过频。";
								} else if (errorMsg.includes("timeout")) {
									userMessage = "❌ 请求超时：网络不稳定，请稍后重试。";
								} else {
									// Default: show short error snippet
									const shortError = error.message.substring(0, 50);
									userMessage = `❌ 连接错误: ${shortError}... (查看控制台详情)`;
								}
							} else if (error instanceof Error) {
								const errorMsg = error.message.toLowerCase();
								
								if (errorMsg.includes("timeout")) {
									userMessage = "❌ 请求超时：网络不稳定，请稍后重试。";
								} else if (errorMsg.includes("network")) {
									userMessage = "❌ 网络错误：请检查网络连接。";
								} else {
									const shortError = error.message.substring(0, 50);
									userMessage = `❌ 连接错误: ${shortError}... (查看控制台详情)`;
								}
							}

							new Notice(userMessage, 8000);
						} finally {
							button.setButtonText("Check connection").setDisabled(false);
						}
					})
			);

		// Prompt templates section
		new Setting(containerEl).setName("Prompt templates").setHeading();
		containerEl.createEl("p", {
			text: "Customize the preset prompts available in the analysis modal.",
			cls: "setting-item-description",
		});

		const templatesContainer = containerEl.createEl("div");

		const renderTemplates = () => {
			templatesContainer.empty();

			this.plugin.settings.promptTemplates.forEach((template, index) => {
				const templateSetting = new Setting(templatesContainer)
					.addText((text) =>
						text
							.setPlaceholder("Template name")
							.setValue(template.name)
							.onChange(async (value) => {
								this.plugin.settings.promptTemplates[index]!.name = value;
								await this.plugin.saveSettings();
							})
					)
					.addTextArea((textArea) => {
						textArea
							.setPlaceholder("Prompt text")
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
							.setTooltip("Remove template")
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
					.setButtonText("Add template")
					.onClick(async () => {
						this.plugin.settings.promptTemplates.push({
							name: "New template",
							prompt: "",
						});
						await this.plugin.saveSettings();
						renderTemplates();
					})
			);
		};

		renderTemplates();
	}
}
