import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LectureLensSettingTab, LectureLensSettings } from "./settings";

// Plugin entry point for Lecture Lens.
export default class LectureLensPlugin extends Plugin {
	settings: LectureLensSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new LectureLensSettingTab(this.app, this));
	}

	onunload() {}

	private async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<LectureLensSettings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
