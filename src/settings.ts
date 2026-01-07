/* eslint-disable obsidianmd/ui/sentence-case */
import { App, PluginSettingTab, Setting } from "obsidian";
import LectureLensPlugin from "./main";

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
			 
			.setName("Api provider")
			 
			.setDesc("Choose which api provider to use.")
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						OpenAI: "OpenAI",
						Gemini: "Gemini",
						Custom: "Custom",
					})
					.setValue(this.plugin.settings.apiProvider)
					.onChange(async (value) => {
						this.plugin.settings.apiProvider = value as ApiProvider;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			 
			.setName("API key")
			 
			.setDesc("Warning: your API secret is stored locally in plaintext and is not encrypted.")
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
			 
			.setDesc("Set the base URL for the api.")
			.addText((text) =>
				text
					.setPlaceholder("https://api.openai.com/v1")
					.setValue(this.plugin.settings.baseUrl)
					.onChange(async (value) => {
						this.plugin.settings.baseUrl = value.trim();
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
	}
}
