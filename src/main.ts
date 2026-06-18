import { Notice, Plugin, TFile } from "obsidian";
import { ResolvedLocale, TranslationKey, resolveLocale, t } from "./i18n";
import { DEFAULT_SETTINGS, LectureLensSettingTab, LectureLensSettings } from "./settings";
import { LLMService, LLMServiceError } from "./services/llm";
import {
	EmbeddingRuntimeConfig,
	getEmbeddingValidationIssue,
	resolveEmbeddingRuntimeConfig,
} from "./services/embeddingConfig";
import { ImageExtractor } from "./services/imageExtractor";
import { RagService } from "./services/ragService";
import { NoteContextService } from "./services/noteContextService";
import {
	canEncryptSecrets,
	decryptSecret,
	encryptSecret,
	isSecretEncrypted,
} from "./services/secretStorage";
import { EmbeddingProvider } from "./services/embeddingProvider";
import { LocalEmbeddingService } from "./services/localEmbeddingService";
import { restoreObsidianProcessPatch } from "./utils/loadTransformers";
import { releaseOnnxWasmPaths } from "./utils/onnxWasmPaths";
import { EmbeddingModelStatusService } from "./services/embeddingModelStatus";
import { ChatHistoryService } from "./services/chatHistoryService";
import { VisionRelayService } from "./services/visionRelayService";
import { configurePdfWorker, releasePdfWorker } from "./services/pdfDocumentService";
import {
	fetchRemoteModels,
	findRemoteModel,
	isModelCatalogStale,
	resolveChatTemperature,
} from "./services/modelCatalogService";
import { RemoteModelInfo } from "./types/remoteModel";
import { providerSupportsRemoteModelList, modelSupportsVisionApi } from "./constants/providers";
import { runPdfNotesPipeline } from "./features/pdfNotes/pdfNotesPipeline";
import {
	findProfileById,
	findProfileByProvider,
	LlmProfile,
	migrateLegacyApiToProfiles,
	resolveDefaultProfile,
} from "./types/llmProfile";
import {
	canUseVisionRelay,
	resolveVisionRelayProfile,
} from "./utils/visionRelayConfig";
import { hasCourseFolderInput } from "./utils/vaultPath";
import { clampChatMessageFontSize } from "./constants/chatAppearance";
import { CHAT_VIEW_TYPE } from "./constants";
import { activateChatView, ChatView, registerChatView } from "./ui/chatView";
import { PdfMultiSelectModal } from "./ui/pdfMultiSelectModal";
import { PdfNotesOptionsModal } from "./ui/pdfNotesOptionsModal";
import { PdfNotesProgressTracker } from "./ui/pdfNotesProgressTracker";
import { PdfNotesBatchItem } from "./types/pdfNotes";

export default class LectureLensPlugin extends Plugin {
	settings: LectureLensSettings;
	llmService: LLMService;
	imageExtractor: ImageExtractor;
	ragService: RagService;
	noteContextService: NoteContextService;
	localEmbeddingService: LocalEmbeddingService;
	embeddingModelStatusService: EmbeddingModelStatusService;
	embeddingProvider: EmbeddingProvider;
	chatHistoryService: ChatHistoryService;
	visionRelayService: VisionRelayService;
	activePdfNotesJob: PdfNotesProgressTracker | null = null;

	async onload() {
		await this.loadSettings();

		this.llmService = new LLMService({
			apiKey: this.settings.apiKey,
			baseUrl: this.settings.baseUrl,
			modelName: this.settings.modelName,
		});
		this.imageExtractor = new ImageExtractor(this.app);
		this.embeddingModelStatusService = new EmbeddingModelStatusService(
			this.app,
			this.manifest.id
		);
		this.localEmbeddingService = new LocalEmbeddingService(
			this.app,
			this.manifest.id,
			this.embeddingModelStatusService
		);
		this.embeddingProvider = new EmbeddingProvider(this.llmService, this.localEmbeddingService);
		this.ragService = new RagService(this.app, this.manifest.id, this.embeddingProvider);
		this.noteContextService = new NoteContextService(this.app);
		this.chatHistoryService = new ChatHistoryService(this.app, this.manifest.id);
		this.visionRelayService = new VisionRelayService(this.llmService);
		this.applyLlmProfile(this.getDefaultLlmProfile());
		configurePdfWorker(this);

		registerChatView(this);
		this.addSettingTab(new LectureLensSettingTab(this.app, this));

		this.addRibbonIcon("glasses", this.tr("ribbon.openChat"), () => {
			void activateChatView(this);
		});

		this.addRibbonIcon("file-text", this.tr("ribbon.generatePdfNotes"), () => {
			this.openPdfNotesPicker();
		});

		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && file.extension.toLowerCase() === "pdf") {
					menu.addItem((item) => {
						item
							.setTitle(this.tr("fileMenu.generatePdfNotes"))
							.setIcon("file-text")
							.onClick(() => this.launchPdfNotes(file));
					});
				}
			})
		);

		this.addCommand({
			id: "open-chat",
			name: this.tr("command.openChat"),
			callback: () => void activateChatView(this),
		});

		this.addCommand({
			id: "generate-pdf-notes",
			name: this.tr("command.generatePdfNotes"),
			callback: () => this.openPdfNotesPicker(),
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
	}

	onunload() {
		this.activePdfNotesJob?.dispose();
		void this.localEmbeddingService.unload();
		releasePdfWorker();
		releaseOnnxWasmPaths();
		restoreObsidianProcessPatch();
	}

	openPdfNotesPicker(preferredFile?: TFile): void {
		if (preferredFile) {
			this.openPdfNotesOptions([preferredFile]);
			return;
		}

		const pdfs = this.app.vault.getFiles().filter((file) => file.extension.toLowerCase() === "pdf");
		if (pdfs.length === 0) {
			new Notice(this.tr("notice.noPdfInVault"), 5000);
			return;
		}

		new PdfMultiSelectModal(this.app, (key, params) => this.tr(key, params), (files) => {
			this.openPdfNotesOptions(files);
		}).open();
	}

	isPdfNotesRunning(): boolean {
		return this.activePdfNotesJob?.isRunning() ?? false;
	}

	private openPdfNotesOptions(pdfFiles: TFile[]): void {
		if (!this.ensurePdfNotesReady()) return;

		new PdfNotesOptionsModal(
			this.app,
			pdfFiles,
			this.settings.pdfNotesOutputFolder,
			(key, params) => this.tr(key, params),
			(items) => this.startPdfNotesJobs(items)
		).open();
	}

	private ensurePdfNotesReady(): boolean {
		if (this.activePdfNotesJob?.isRunning()) {
			new Notice(this.tr("notice.pdfNotesAlreadyRunning"), 5000);
			return false;
		}

		const profile = this.getDefaultLlmProfile();
		if (!profile.apiKey.trim()) {
			new Notice(this.tr("notice.pdfNotesNoApiKey"), 8000);
			return false;
		}

		return true;
	}

	private launchPdfNotes(pdfFile: TFile): void {
		this.openPdfNotesOptions([pdfFile]);
	}

	private startPdfNotesJobs(items: PdfNotesBatchItem[]): void {
		if (items.length === 0 || !this.ensurePdfNotesReady()) return;

		const tracker = new PdfNotesProgressTracker(this, (key, params) => this.tr(key, params));
		this.activePdfNotesJob = tracker;
		tracker.beginBatch(items.length);

		void this.runPdfNotesBatch(items, tracker).finally(() => {
			this.activePdfNotesJob = null;
		});
	}

	private async runPdfNotesBatch(
		items: PdfNotesBatchItem[],
		tracker: PdfNotesProgressTracker
	): Promise<void> {
		const results = [];

		for (let index = 0; index < items.length; index++) {
			const item = items[index]!;
			tracker.beginBatchItem(item.pdfFile, index + 1);

			try {
				const result = await runPdfNotesPipeline(this, item.pdfFile, tracker, item.runOptions);
				results.push(result);
				tracker.recordBatchResult(result);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : this.tr("notice.unknownError");
				tracker.failBatchItem(item.pdfFile, message);
				console.error("PDF notes generation failed:", item.pdfFile.path, error);
			}
		}

		if (results.length === 0) {
			tracker.fail(this.tr("notice.pdfNotesBatchAllFailed"));
			return;
		}

		tracker.completeBatch(results);
	}

	async onExternalSettingsChange() {
		await this.loadSettings();
		this.applyLlmProfile(this.getDefaultLlmProfile());
		this.refreshChatAppearance();
	}

	async setChatMessageFontSize(size: number): Promise<void> {
		this.settings.chatMessageFontSize = clampChatMessageFontSize(size);
		await this.saveSettings();
		this.refreshChatAppearance();
	}

	refreshChatAppearance(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)) {
			if (leaf.view instanceof ChatView) {
				leaf.view.applyChatAppearance();
			}
		}
	}

	getLocale(): ResolvedLocale {
		return resolveLocale(this.settings.uiLanguage, this.app);
	}

	tr = (key: TranslationKey, params?: Record<string, string | number>): string => {
		return t(this.getLocale(), key, params);
	};

	private async loadSettings() {
		const stored = (await this.loadData()) as Partial<LectureLensSettings> | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored ?? {});

		if (!this.settings.llmProfiles?.length) {
			const migrated = migrateLegacyApiToProfiles({
				apiProvider: this.settings.apiProvider,
				apiKey: this.settings.apiKey,
				baseUrl: this.settings.baseUrl,
				modelName: this.settings.modelName,
				supportsVision: this.settings.supportsVision,
			});
			this.settings.llmProfiles = migrated.profiles;
			this.settings.defaultLlmProfileId = migrated.defaultProfileId;
		}

		if (!this.settings.defaultLlmProfileId && this.settings.llmProfiles[0]) {
			this.settings.defaultLlmProfileId = this.settings.llmProfiles[0].id;
		}

		if (this.settings.visionRelayEnabled === undefined) {
			this.settings.visionRelayEnabled = true;
		}
		if (!this.settings.visionRelayProfileId) {
			const kimi = findProfileByProvider(this.settings.llmProfiles, "Kimi");
			if (kimi) {
				this.settings.visionRelayProfileId = kimi.id;
			}
		}

		this.settings.apiKey = decryptSecret(this.settings.apiKey);
		this.settings.embeddingApiKey = decryptSecret(this.settings.embeddingApiKey ?? "");
		this.settings.chatMessageFontSize = clampChatMessageFontSize(
			this.settings.chatMessageFontSize ?? DEFAULT_SETTINGS.chatMessageFontSize
		);
		if (typeof this.settings.chatHistoryTurnLimit !== "number") {
			this.settings.chatHistoryTurnLimit = DEFAULT_SETTINGS.chatHistoryTurnLimit;
		}
		if (typeof this.settings.chatRagMinScore !== "number") {
			this.settings.chatRagMinScore = DEFAULT_SETTINGS.chatRagMinScore;
		}
		if (typeof this.settings.chatContextBudgetChars !== "number") {
			this.settings.chatContextBudgetChars = DEFAULT_SETTINGS.chatContextBudgetChars;
		}
		if (typeof this.settings.pdfNotesMaxPages !== "number") {
			this.settings.pdfNotesMaxPages = DEFAULT_SETTINGS.pdfNotesMaxPages;
		}
		if (typeof this.settings.pdfNotesSkipMerge !== "boolean") {
			this.settings.pdfNotesSkipMerge = DEFAULT_SETTINGS.pdfNotesSkipMerge;
		}
		if (this.settings.pdfNotesOutputFolder === undefined) {
			this.settings.pdfNotesOutputFolder = DEFAULT_SETTINGS.pdfNotesOutputFolder;
		}
		if (typeof this.settings.pdfNotesMergeMaxTokens !== "number") {
			this.settings.pdfNotesMergeMaxTokens = DEFAULT_SETTINGS.pdfNotesMergeMaxTokens;
		}
		if (typeof this.settings.pdfNotesSectionMaxTokens !== "number") {
			this.settings.pdfNotesSectionMaxTokens = DEFAULT_SETTINGS.pdfNotesSectionMaxTokens;
		}
		if (typeof this.settings.pdfNotesSectionConcurrency !== "number") {
			this.settings.pdfNotesSectionConcurrency = DEFAULT_SETTINGS.pdfNotesSectionConcurrency;
		}
		if (this.settings.pdfNotesStylePrompt === undefined) {
			this.settings.pdfNotesStylePrompt = DEFAULT_SETTINGS.pdfNotesStylePrompt;
		}
		for (const profile of this.settings.llmProfiles) {
			profile.apiKey = decryptSecret(profile.apiKey);
		}

		let profilesMigrated = false;
		for (const profile of this.settings.llmProfiles) {
			if (
				profile.apiProvider === "DeepSeek" &&
				profile.baseUrl.replace(/\/+$/, "") === "https://api.deepseek.com/v1"
			) {
				profile.baseUrl = "https://api.deepseek.com";
				profilesMigrated = true;
			}
			if (profile.apiProvider === "DeepSeek" && profile.supportsVision) {
				profile.supportsVision = false;
				profilesMigrated = true;
			}
			if (
				profile.apiProvider !== "DeepSeek" &&
				!profile.supportsVision &&
				modelSupportsVisionApi(profile.apiProvider, profile.modelName, true)
			) {
				profile.supportsVision = true;
				profilesMigrated = true;
			}
		}

		this.syncLegacyApiFieldsFromDefaultProfile();

		const shouldMigrateSecrets =
			canEncryptSecrets() &&
			((stored?.apiKey && !isSecretEncrypted(stored.apiKey) && this.settings.apiKey) ||
				(stored?.embeddingApiKey &&
					!isSecretEncrypted(stored.embeddingApiKey) &&
					this.settings.embeddingApiKey) ||
				this.settings.llmProfiles.some(
					(profile, index) =>
						stored?.llmProfiles?.[index]?.apiKey &&
						!isSecretEncrypted(stored.llmProfiles[index].apiKey) &&
						profile.apiKey
				));

		if (shouldMigrateSecrets || profilesMigrated) {
			await this.persistSettings();
		}
	}

	getLlmProfile(profileId?: string): LlmProfile {
		if (profileId) {
			const found = findProfileById(this.settings.llmProfiles, profileId);
			if (found) return found;
		}
		return this.getDefaultLlmProfile();
	}

	getDefaultLlmProfile(): LlmProfile {
		return resolveDefaultProfile(this.settings.llmProfiles, this.settings.defaultLlmProfileId);
	}

	applyLlmProfile(profile: LlmProfile, modelNameOverride?: string): void {
		this.llmService.updateConfig({
			apiKey: profile.apiKey,
			baseUrl: profile.baseUrl,
			modelName: modelNameOverride?.trim() || profile.modelName,
		});
	}

	getVisionRelayProfile(): LlmProfile | null {
		return resolveVisionRelayProfile(
			this.settings.llmProfiles,
			this.settings.visionRelayProfileId
		);
	}

	canUseVisionRelay(chatProfile: LlmProfile, effectiveModelName: string): boolean {
		return canUseVisionRelay(this.settings, chatProfile, effectiveModelName);
	}

	async runVisionRelay(
		chatProfile: LlmProfile,
		effectiveModelName: string,
		userPrompt: string,
		images: Array<{ base64: string; mimeType: string }>,
		onChunk?: (chunk: string, fullText: string) => void
	): Promise<string> {
		if (images.length === 0) {
			throw new Error("Vision relay requires at least one image.");
		}

		const visionProfile = this.getVisionRelayProfile();
		if (!visionProfile?.apiKey.trim()) {
			throw new Error(this.tr("chat.visionRelayNoProfile"));
		}

		return this.visionRelayService.describeImages(
			visionProfile,
			{
				apiKey: chatProfile.apiKey,
				baseUrl: chatProfile.baseUrl,
				modelName: effectiveModelName,
			},
			userPrompt,
			images,
			onChunk
		);
	}

	syncLegacyApiFieldsFromDefaultProfile(): void {
		const profile = this.getDefaultLlmProfile();
		this.settings.apiProvider = profile.apiProvider;
		this.settings.apiKey = profile.apiKey;
		this.settings.baseUrl = profile.baseUrl;
		this.settings.modelName = profile.modelName;
		this.settings.supportsVision = profile.supportsVision;
	}

	async testLlmProfileConnection(profile: LlmProfile): Promise<void> {
		const testNotice = new Notice(this.tr("notice.testingLlm"), 0);
		const previous = this.getDefaultLlmProfile();
		this.applyLlmProfile(profile);
		try {
			const remote = findRemoteModel(profile.remoteModels, profile.modelName);
			const temperature = resolveChatTemperature(profile.apiProvider, profile.modelName, remote);
			const response = await this.llmService.chatCompletion(
				[{ role: "user", content: "Hello! Please respond with 'OK' to confirm connection." }],
				{ max_tokens: 10, temperature }
			);
			if (providerSupportsRemoteModelList(profile.apiProvider)) {
				try {
					const count = await this.refreshProfileRemoteModels(profile, { force: true });
					new Notice(this.tr("notice.modelsFetched", { count }), 4000);
				} catch (error) {
					console.warn("[Lecture Lens] Failed to fetch remote model list:", error);
				}
			}
			testNotice.hide();
			const messageContent = response.choices[0]?.message?.content;
			const message =
				typeof messageContent === "string" ? messageContent : this.tr("notice.noResponse");
			new Notice(this.tr("notice.llmSuccess", { model: response.model, message }), 5000);
		} catch (error) {
			testNotice.hide();
			new Notice(this.tr("notice.llmFailed", { message: this.formatError(error) }), 8000);
		} finally {
			this.applyLlmProfile(previous);
		}
	}

	/** Fetch available models via GET /models (Kimi, DeepSeek). Cached for 24h unless forced. */
	async refreshProfileRemoteModels(
		profile: LlmProfile,
		options?: { force?: boolean }
	): Promise<number> {
		if (!providerSupportsRemoteModelList(profile.apiProvider)) {
			return profile.remoteModels?.length ?? 0;
		}
		if (!profile.apiKey.trim()) {
			throw new LLMServiceError(this.tr("notice.llmProfileMissingKey"));
		}
		if (
			!options?.force &&
			profile.remoteModels?.length &&
			!isModelCatalogStale(profile.remoteModelsFetchedAt)
		) {
			return profile.remoteModels.length;
		}

		const models = await fetchRemoteModels(profile.apiKey, profile.baseUrl, profile.apiProvider);
		profile.remoteModels = models;
		profile.remoteModelsFetchedAt = Date.now();
		this.applyRemoteModelCapabilities(profile, profile.modelName);
		this.syncLegacyApiFieldsFromDefaultProfile();
		await this.saveSettings();
		return models.length;
	}

	async ensureProfileRemoteModels(profile: LlmProfile): Promise<RemoteModelInfo[]> {
		if (!providerSupportsRemoteModelList(profile.apiProvider) || !profile.apiKey.trim()) {
			return profile.remoteModels ?? [];
		}
		if (profile.remoteModels?.length && !isModelCatalogStale(profile.remoteModelsFetchedAt)) {
			return profile.remoteModels;
		}
		try {
			await this.refreshProfileRemoteModels(profile);
		} catch (error) {
			console.warn("[Lecture Lens] Failed to fetch remote model list:", error);
		}
		return profile.remoteModels ?? [];
	}

	applyRemoteModelCapabilities(profile: LlmProfile, modelName: string): void {
		if (profile.apiProvider === "DeepSeek") {
			profile.supportsVision = false;
			return;
		}
		const remote = findRemoteModel(profile.remoteModels, modelName);
		if (remote?.supportsImageIn !== undefined) {
			profile.supportsVision = remote.supportsImageIn;
			return;
		}
		if (modelSupportsVisionApi(profile.apiProvider, modelName, true)) {
			profile.supportsVision = true;
		}
	}

	getEmbeddingRuntimeConfig(): EmbeddingRuntimeConfig {
		return resolveEmbeddingRuntimeConfig(this.settings);
	}

	/** @deprecated Use getEmbeddingRuntimeConfig */
	getEmbeddingConfig() {
		return resolveEmbeddingRuntimeConfig(this.settings).api;
	}

	getEmbeddingValidationMessage(): string | null {
		const issue = getEmbeddingValidationIssue(this.settings);
		if (!issue) return null;
		return this.tr(`notice.embeddingValidation.${issue}`);
	}

	async getEmbeddingReadyMessage(): Promise<string | null> {
		const basic = this.getEmbeddingValidationMessage();
		if (basic) return basic;
		if (this.settings.embeddingMode !== "local") return null;

		const runtime = this.getEmbeddingRuntimeConfig();
		const ready = await this.embeddingModelStatusService.isReady(
			runtime.localModelId,
			runtime.hfMirrorUrl
		);
		if (!ready) {
			return this.tr("notice.embeddingValidation.model_not_ready");
		}
		return null;
	}

	async downloadEmbeddingModel(onProgress?: (message: string) => void): Promise<void> {
		const runtime = this.getEmbeddingRuntimeConfig();
		if (runtime.mode !== "local") {
			throw new Error(this.tr("notice.embeddingValidation.provider_unsupported"));
		}
		await this.localEmbeddingService.downloadModel(
			runtime.localModelId,
			runtime.hfMirrorUrl,
			onProgress
		);
	}

	formatEmbeddingError(error: unknown): string {
		const base = this.formatError(error);
		if (/path.*argument|received undefined/i.test(base)) {
			return `${base} ${this.tr("notice.embeddingPathHint")}`;
		}
		if (/not open|not found|404|418/i.test(base)) {
			return `${base} ${this.tr("notice.embeddingsHint")}`;
		}
		return base;
	}

	async saveSettings() {
		this.syncLegacyApiFieldsFromDefaultProfile();
		await this.persistSettings();
		this.applyLlmProfile(this.getDefaultLlmProfile());
	}

	private async persistSettings() {
		const payload: LectureLensSettings = {
			...this.settings,
			apiKey: encryptSecret(this.settings.apiKey),
			embeddingApiKey: encryptSecret(this.settings.embeddingApiKey),
			llmProfiles: this.settings.llmProfiles.map((profile) => ({
				...profile,
				apiKey: encryptSecret(profile.apiKey),
			})),
		};
		await this.saveData(payload);
	}

	private async rebuildRagIndex(): Promise<void> {
		if (!hasCourseFolderInput(this.settings.courseFolderPath)) {
			new Notice(this.tr("notice.setCourseFolderFirst"), 5000);
			return;
		}
		const validation = await this.getEmbeddingReadyMessage();
		if (validation) {
			new Notice(validation, 10000);
			return;
		}
		const notice = new Notice(this.tr("notice.buildingIndex"), 0);
		try {
			const count = await this.ragService.buildIndex(
				this.settings.courseFolderPath,
				this.getEmbeddingRuntimeConfig(),
				(message: string) => {
					notice.setMessage(`${this.tr("notice.buildingIndex")}\n${message}`);
				}
			);
			notice.hide();
			new Notice(this.tr("notice.indexRebuilt", { count }), 5000);
		} catch (error) {
			notice.hide();
			new Notice(
				this.tr("notice.indexRebuildFailed", { message: this.formatEmbeddingError(error) }),
				10000
			);
		}
	}

	private async testLLMConnection(): Promise<void> {
		await this.testLlmProfileConnection(this.getDefaultLlmProfile());
	}

	private formatError(error: unknown): string {
		if (error instanceof LLMServiceError) {
			return error.statusCode ? `HTTP ${error.statusCode}: ${error.message}` : error.message;
		}
		if (error instanceof Error) return error.message;
		return this.tr("notice.unknownError");
	}
}

