import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LectureLensSettingTab, LectureLensSettings } from "./settings";
import { LLMService, LLMServiceError } from "./services/llm";
import { ImageExtractor } from "./services/imageExtractor";
import { RagService } from "./services/ragService";
import { AskImageModal } from "./ui/askImageModal";
import { activateChatView, registerChatView } from "./ui/chatView";
import { registerContextMenu } from "./features/contextMenu";
import { registerClipboardPaste } from "./features/clipboardPaste";
import {
	analyzeCurrentNote,
	batchAnalyzeImages,
	ImageAnalysisContext,
} from "./features/imageAnalysis";

export default class LectureLensPlugin extends Plugin {
	settings: LectureLensSettings;
	llmService: LLMService;
	imageExtractor: ImageExtractor;
	ragService: RagService;

	async onload() {
		await this.loadSettings();

		this.llmService = new LLMService({
			apiKey: this.settings.apiKey,
			baseUrl: this.settings.baseUrl,
			modelName: this.settings.modelName,
		});
		this.imageExtractor = new ImageExtractor(this.app);
		this.ragService = new RagService(this.app, this.manifest.id, this.llmService);

		registerChatView(this);
		this.addSettingTab(new LectureLensSettingTab(this.app, this));
		registerContextMenu(this);
		registerClipboardPaste(this);

		this.addRibbonIcon("glasses", "Open Lecture Lens chat", () => {
			void activateChatView(this);
		});

		this.addRibbonIcon("scan-eye", "Analyze note images", () => {
			new AskImageModal(this.app, this.settings.promptTemplates, (prompt) => {
				void analyzeCurrentNote(this.getAnalysisContext(), prompt);
			}).open();
		});

		this.addCommand({
			id: "open-chat",
			name: "Open chat sidebar",
			callback: () => void activateChatView(this),
		});

		this.addCommand({
			id: "analyze-note-images",
			name: "Analyze images in current note",
			callback: () => {
				new AskImageModal(this.app, this.settings.promptTemplates, (prompt) => {
					void analyzeCurrentNote(this.getAnalysisContext(), prompt);
				}).open();
			},
		});

		this.addCommand({
			id: "batch-analyze-images",
			name: "Analyze all images in note (one by one)",
			callback: () => {
				new AskImageModal(this.app, this.settings.promptTemplates, (prompt) => {
					void batchAnalyzeImages(this.getAnalysisContext(), prompt);
				}).open();
			},
		});

		this.addCommand({
			id: "rebuild-rag-index",
			name: "Rebuild course RAG index",
			callback: () => void this.rebuildRagIndex(),
		});

		this.addCommand({
			id: "test-llm-connection",
			name: "Test language model connection",
			callback: () => void this.testLLMConnection(),
		});

		this.addCommand({
			id: "test-image-extraction",
			name: "Test image extraction from current note",
			callback: () => void this.testImageExtraction(),
		});
	}

	onunload() {}

	getAnalysisContext(): ImageAnalysisContext {
		return {
			app: this.app,
			llmService: this.llmService,
			imageExtractor: this.imageExtractor,
			settings: this.settings,
		};
	}

	private async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<LectureLensSettings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		if (this.llmService) {
			this.llmService.updateConfig({
				apiKey: this.settings.apiKey,
				baseUrl: this.settings.baseUrl,
				modelName: this.settings.modelName,
			});
		}
	}

	private async rebuildRagIndex(): Promise<void> {
		const folder = this.settings.courseFolderPath.trim();
		if (!folder) {
			new Notice("Set a course folder in settings first.", 5000);
			return;
		}
		const notice = new Notice("Building course index…", 0);
		try {
			const count = await this.ragService.buildIndex(
				folder,
				this.settings.embeddingModelName
			);
			notice.hide();
			new Notice(`✅ Index rebuilt with ${count} chunks.`, 5000);
		} catch (error) {
			notice.hide();
			const msg = error instanceof Error ? error.message : "Unknown error";
			new Notice(`❌ Index rebuild failed: ${msg}`, 8000);
		}
	}

	private async testLLMConnection(): Promise<void> {
		const testNotice = new Notice("Testing language model connection...", 0);
		try {
			const response = await this.llmService.chatCompletion([
				{ role: "user", content: "Hello! Please respond with 'OK' to confirm connection." },
			], { max_tokens: 10, temperature: 0 });

			testNotice.hide();
			const messageContent = response.choices[0]?.message?.content;
			const message = typeof messageContent === "string" ? messageContent : "No response";
			new Notice(`✅ LLM connection successful!\nModel: ${response.model}\nResponse: ${message}`, 5000);
		} catch (error) {
			testNotice.hide();
			new Notice(`❌ LLM connection failed:\n${this.formatError(error)}`, 8000);
		}
	}

	private async testImageExtraction(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice("No active file. Please open a note first.", 5000);
			return;
		}

		const testNotice = new Notice("Extracting images from current note...", 0);
		try {
			const content = await this.app.vault.read(activeFile);
			const references = this.imageExtractor.extractImageReferences(content);
			if (references.length === 0) {
				testNotice.hide();
				new Notice("No images found in the current note.", 5000);
				return;
			}

			const imageData = await this.imageExtractor.extractAndReadImages(content, activeFile);
			testNotice.hide();

			const summary = imageData
				.map((img) => `  • ${img.reference.path} (${(img.size / 1024).toFixed(2)} KB)`)
				.join("\n");
			new Notice(
				`✅ Image extraction successful!\n\nFound ${references.length} reference(s), loaded ${imageData.length} image(s):\n${summary}`,
				10000
			);
		} catch (error) {
			testNotice.hide();
			new Notice(`❌ Image extraction failed:\n${this.formatError(error)}`, 8000);
		}
	}

	private formatError(error: unknown): string {
		if (error instanceof LLMServiceError) {
			return error.statusCode ? `HTTP ${error.statusCode}: ${error.message}` : error.message;
		}
		if (error instanceof Error) return error.message;
		return "Unknown error";
	}
}
