import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LectureLensSettingTab, LectureLensSettings } from "./settings";
import { LLMService, LLMServiceError } from "./services/llm";

// Plugin entry point for Lecture Lens.
export default class LectureLensPlugin extends Plugin {
	settings: LectureLensSettings;
	llmService: LLMService;

	async onload() {
		await this.loadSettings();
		
		// Initialize LLM service
		this.llmService = new LLMService({
			apiKey: this.settings.apiKey,
			baseUrl: this.settings.baseUrl,
			modelName: this.settings.modelName,
		});
		
		this.addSettingTab(new LectureLensSettingTab(this.app, this));
		
		// Add test command for LLM connectivity
		this.addCommand({
			id: "test-llm-connection",
			name: "Test language model connection",
			callback: () => this.testLLMConnection(),
		});
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
		// Update LLM service configuration when settings change
		this.llmService.updateConfig({
			apiKey: this.settings.apiKey,
			baseUrl: this.settings.baseUrl,
			modelName: this.settings.modelName,
		});
	}

	/**
	 * Test command to verify LLM API connectivity
	 */
	private async testLLMConnection(): Promise<void> {
		const testNotice = new Notice("Testing language model connection...", 0);
		
		try {
			// Simple test message
			const response = await this.llmService.chatCompletion([
				{
					role: "user",
					content: "Hello! Please respond with 'OK' to confirm connection.",
				},
			], {
				max_tokens: 10,
				temperature: 0,
			});

			testNotice.hide();
			
			const message = response.choices[0]?.message.content || "No response";
			new Notice(
				`✅ LLM connection successful!\nModel: ${response.model}\nResponse: ${message}`,
				5000
			);
		} catch (error) {
			testNotice.hide();
			
			let errorMessage = "Unknown error";
			if (error instanceof LLMServiceError) {
				errorMessage = error.message;
				if (error.statusCode) {
					errorMessage = `HTTP ${error.statusCode}: ${errorMessage}`;
				}
			} else if (error instanceof Error) {
				errorMessage = error.message;
			}
			
			new Notice(`❌ LLM connection failed:\n${errorMessage}`, 8000);
			console.error("LLM connection test failed:", error);
		}
	}
}
