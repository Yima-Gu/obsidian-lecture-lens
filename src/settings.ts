import {App, PluginSettingTab, Setting} from "obsidian";
import LectureLensPlugin from "./main";

export interface LectureLensSettings {
	mySetting: string;
}

export const DEFAULT_SETTINGS: LectureLensSettings = {
	mySetting: 'default'
}

export class LectureLensSettingTab extends PluginSettingTab {
	plugin: LectureLensPlugin;

	constructor(app: App, plugin: LectureLensPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
