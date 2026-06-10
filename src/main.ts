import { Notice, Plugin } from "obsidian";
import { ResolvedLocale, TranslationKey, resolveLocale, t } from "./i18n";
import { DEFAULT_SETTINGS, LectureLensSettingTab, LectureLensSettings } from "./settings";
import { LLMService, LLMServiceError } from "./services/llm";
import { ImageExtractor } from "./services/imageExtractor";
import { RagService } from "./services/ragService";
import { NoteContextService } from "./services/noteContextService";
import {
	canEncryptSecrets,
	decryptSecret,
	encryptSecret,
	isSecretEncrypted,
} from "./services/secretStorage";
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
	noteContextService: NoteContextService;

	async onload() {
		await this.loadSettings();

		this.llmService = new LLMService({
			apiKey: this.settings.apiKey,
			baseUrl: this.settings.baseUrl,
			modelName: this.settings.modelName,
		});
		this.imageExtractor = new ImageExtractor(this.app);
		this.ragService = new RagService(this.app, this.manifest.id, this.llmService);
		this.noteContextService = new NoteContextService(this.app);

		registerChatView(this);
		this.addSettingTab(new LectureLensSettingTab(this.app, this));
		registerContextMenu(this);
		registerClipboardPaste(this);

		this.addRibbonIcon("glasses", this.tr("ribbon.openChat"), () => {
			void activateChatView(this);
		});

		this.addRibbonIcon("scan-eye", this.tr("ribbon.analyzeImages"), () => {
			new AskImageModal(this.app, this.settings.promptTemplates, this.tr.bind(this), (prompt) => {
				void analyzeCurrentNote(this.getAnalysisContext(), prompt);
			}).open();
		});

		this.addCommand({
			id: "open-chat",
			name: this.tr("command.openChat"),
			callback: () => void activateChatView(this),
		});

		this.addCommand({
			id: "analyze-note-images",
			name: this.tr("command.analyzeNoteImages"),
			callback: () => {
				new AskImageModal(this.app, this.settings.promptTemplates, this.tr.bind(this), (prompt) => {
					void analyzeCurrentNote(this.getAnalysisContext(), prompt);
				}).open();
			},
		});

		this.addCommand({
			id: "batch-analyze-images",
			name: this.tr("command.batchAnalyzeImages"),
			callback: () => {
				new AskImageModal(this.app, this.settings.promptTemplates, this.tr.bind(this), (prompt) => {
					void batchAnalyzeImages(this.getAnalysisContext(), prompt);
				}).open();
			},
		});

		this.addCommand({
			id: "rebuild-rag-index",
			name: this.tr("command.rebuildRagIndex"),
			callback: () => void this.rebuildRagIndex(),
		});

		this.addCommand({
			id: "test-llm-connection",
			name: this.tr("command.testLlmConnection"),
			callback: () => void this.testLLMConnection(),
		});

		this.addCommand({
			id: "test-image-extraction",
			name: this.tr("command.testImageExtraction"),
			callback: () => void this.testImageExtraction(),
		});
	}

	onunload() {}

	getLocale(): ResolvedLocale {
		return resolveLocale(this.settings.uiLanguage);
	}

	tr(key: TranslationKey, params?: Record<string, string | number>): string {
		return t(this.getLocale(), key, params);
	}

	getAnalysisContext(): ImageAnalysisContext {
		return {
			app: this.app,
			llmService: this.llmService,
			imageExtractor: this.imageExtractor,
			settings: this.settings,
			tr: this.tr.bind(this),
		};
	}

	private async loadSettings() {
		const stored = (await this.loadData()) as Partial<LectureLensSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});
		this.settings.apiKey = decryptSecret(this.settings.apiKey);

		if (
			stored?.apiKey &&
			!isSecretEncrypted(stored.apiKey) &&
			this.settings.apiKey &&
			canEncryptSecrets()
		) {
			await this.persistSettings();
		}
	}

	async saveSettings() {
		await this.persistSettings();
		if (this.llmService) {
			this.llmService.updateConfig({
				apiKey: this.settings.apiKey,
				baseUrl: this.settings.baseUrl,
				modelName: this.settings.modelName,
			});
		}
	}

	private async persistSettings() {
		const payload: LectureLensSettings = {
			...this.settings,
			apiKey: encryptSecret(this.settings.apiKey),
		};
		await this.saveData(payload);
	}

	private async rebuildRagIndex(): Promise<void> {
		const folder = this.settings.courseFolderPath.trim();
		if (!folder) {
			new Notice(this.tr("notice.setCourseFolderFirst"), 5000);
			return;
		}
		const notice = new Notice(this.tr("notice.buildingIndex"), 0);
		try {
			const count = await this.ragService.buildIndex(
				folder,
				this.settings.embeddingModelName
			);
			notice.hide();
			new Notice(this.tr("notice.indexRebuilt", { count }), 5000);
		} catch (error) {
			notice.hide();
			const msg = error instanceof Error ? error.message : this.tr("notice.unknownError");
			new Notice(this.tr("notice.indexRebuildFailed", { message: msg }), 8000);
		}
	}

	private async testLLMConnection(): Promise<void> {
		const testNotice = new Notice(this.tr("notice.testingLlm"), 0);
		try {
			const response = await this.llmService.chatCompletion([
				{ role: "user", content: "Hello! Please respond with 'OK' to confirm connection." },
			], { max_tokens: 10, temperature: 0 });

			testNotice.hide();
			const messageContent = response.choices[0]?.message?.content;
			const message =
				typeof messageContent === "string" ? messageContent : this.tr("notice.noResponse");
			new Notice(
				this.tr("notice.llmSuccess", { model: response.model, message }),
				5000
			);
		} catch (error) {
			testNotice.hide();
			new Notice(this.tr("notice.llmFailed", { message: this.formatError(error) }), 8000);
		}
	}

	private async testImageExtraction(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice(this.tr("notice.noActiveFile"), 5000);
			return;
		}

		const testNotice = new Notice(this.tr("notice.extractingImages"), 0);
		try {
			const content = await this.app.vault.read(activeFile);
			const references = this.imageExtractor.extractImageReferences(content);
			if (references.length === 0) {
				testNotice.hide();
				new Notice(this.tr("notice.noImagesInNote"), 5000);
				return;
			}

			const imageData = await this.imageExtractor.extractAndReadImages(content, activeFile);
			testNotice.hide();

			const summary = imageData
				.map((img) => `  • ${img.reference.path} (${(img.size / 1024).toFixed(2)} KB)`)
				.join("\n");
			new Notice(
				this.tr("notice.extractionSuccess", {
					references: references.length,
					loaded: imageData.length,
					summary,
				}),
				10000
			);
		} catch (error) {
			testNotice.hide();
			new Notice(
				this.tr("notice.extractionFailed", { message: this.formatError(error) }),
				8000
			);
		}
	}

	private formatError(error: unknown): string {
		if (error instanceof LLMServiceError) {
			return error.statusCode ? `HTTP ${error.statusCode}: ${error.message}` : error.message;
		}
		if (error instanceof Error) return error.message;
		return this.tr("notice.unknownError");
	}
}
