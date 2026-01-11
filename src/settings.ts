/* eslint-disable obsidianmd/ui/sentence-case */
import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import LectureLensPlugin from "./main";
import { LLMServiceError } from "./services/llm";

export type ApiProvider = "OpenAI" | "Gemini" | "Custom";

export interface LectureLensSettings {
	apiProvider: ApiProvider;
	apiKey: string;
	baseUrl: string;
	modelName: string;
}

export const DEFAULT_SETTINGS: LectureLensSettings = {
	apiProvider: "OpenAI",
	apiKey: "",
	baseUrl: "https://api.openai.com/v1",
	modelName: "gpt-4o",
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
							const message = firstChoice?.message?.content || "No response";
							new Notice(
								`✅ Connection successful!\nModel: ${response.model}\nResponse: ${message}`,
								5000
							);
						} catch (error) {
							let errorMessage = "Unknown error";
							if (error instanceof LLMServiceError) {
								errorMessage = error.message;
								if (error.statusCode) {
									errorMessage = `HTTP ${error.statusCode}: ${errorMessage}`;
								}
							} else if (error instanceof Error) {
								errorMessage = error.message;
							}

							new Notice(`❌ Connection failed:\n${errorMessage}`, 8000);
							console.error("LLM connection test failed:", error);
						} finally {
							button.setButtonText("Check connection").setDisabled(false);
						}
					})
			);
	}
}
