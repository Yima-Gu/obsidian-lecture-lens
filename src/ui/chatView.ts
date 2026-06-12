// Plugin name uses title case in the sidebar label.
/* eslint-disable obsidianmd/ui/sentence-case */
import {
	ItemView,
	MarkdownView,
	Notice,
	setIcon,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { CHAT_VIEW_TYPE } from "../constants";
import {
	getChatModelsForProvider,
	getProviderDropdownOptions,
	isVisionApiError,
} from "../constants/providers";
import { resolveLocale } from "../i18n";
import {
	ChatSession,
	deriveSessionTitle,
} from "../services/chatHistoryService";
import { buildChatContext, buildChatContextPreview } from "../services/chatContextService";
import { ChatContextSnapshot } from "../types/chatContext";
import {
	mountContextPanel,
	renderContextPanelBody,
	updateContextPanelSummary,
	ContextPanelElements,
} from "./chatContextPanel";
import { SessionRenameModal } from "./sessionRenameModal";
import { ApiProvider } from "../settings";
import { findProfileByProvider, LlmProfile } from "../types/llmProfile";
import LectureLensPlugin from "../main";
import { DEFAULT_CHAT_MAX_TOKENS } from "../constants/chatAppearance";
import { ChatMessage, LLMServiceError } from "../services/llm";
import { VaultFileSuggestModal } from "./fileSuggestModal";
import { renderChatMarkdown, updateStreamingPlainText, clearStreamingPlainText } from "../utils/markdownRender";
import { MermaidEnhanceLabels } from "../utils/mermaidEnhance";
import { getCourseFolderDisplayPath, hasCourseFolderInput } from "../utils/vaultPath";
import {
	ChatImageAttachment,
	fileToChatImage,
} from "../utils/chatImage";
import {
	applyAssistantContentToNote,
	insertIntoNote,
	resolveTargetMarkdownPath,
} from "../utils/noteEditorActions";
import {
	chatProfileSupportsVision,
	needsVisionRelay,
} from "../utils/visionRelayConfig";

interface ChatTurn {
	role: "user" | "assistant";
	content: string;
	images?: Array<{ base64: string; mimeType: string }>;
	imageDescription?: string;
}

interface MessageShell {
	root: HTMLElement;
	contentEl: HTMLElement;
}

export class ChatView extends ItemView {
	private headerEl!: HTMLElement;
	private toolbarEl!: HTMLElement;
	private providerSelectEl!: HTMLSelectElement;
	private modelSelectEl!: HTMLSelectElement;
	private sessionSelectEl!: HTMLSelectElement;
	private scopeEl!: HTMLElement;
	private bodyEl!: HTMLElement;
	private messagesEl!: HTMLElement;
	private chipsEl!: HTMLElement;
	private imageChipsEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private imageInputEl!: HTMLInputElement;
	private sendBtn!: HTMLButtonElement;
	private history: ChatTurn[] = [];
	private currentSessionId = "";
	private currentProfileId = "";
	private currentModelName = "";
	private attachedFiles: TFile[] = [];
	private pendingImages: ChatImageAttachment[] = [];
	private includeCurrentNote = true;
	private isStreaming = false;
	private scopeStatusEl: HTMLElement | null = null;
	private scopeStatusRequest = 0;
	private contextPanelEl!: HTMLElement;
	private contextPanel: ContextPanelElements | null = null;
	private lastContextSnapshot: ChatContextSnapshot | null = null;
	private sessionIncludeRag = true;
	private sessionIncludeNotes = true;
	private contextPreviewTimer: number | null = null;
	private fontSizeValueEl: HTMLElement | null = null;
	private inputComposing = false;
	private lastMarkdownPath: string | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: LectureLensPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return CHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Lecture Lens";
	}

	getIcon(): string {
		return "glasses";
	}

	async onOpen(): Promise<void> {
		this.includeCurrentNote = this.plugin.settings.autoAttachCurrentNote;
		this.attachedFiles = [];

		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("lecture-lens-chat-view");

		this.renderHeader(containerEl);
		this.renderToolbar(containerEl);
		this.contextPanelEl = containerEl.createEl("div", { cls: "lecture-lens-chat-context" });

		this.bodyEl = containerEl.createEl("div", { cls: "lecture-lens-chat-body" });
		this.messagesEl = this.bodyEl.createEl("div", { cls: "lecture-lens-chat-messages" });
		void this.renderScopeHint();

		const composer = this.bodyEl.createEl("div", { cls: "lecture-lens-chat-composer" });
		const composerCard = composer.createEl("div", { cls: "lecture-lens-chat-composer-card" });

		this.chipsEl = composerCard.createEl("div", { cls: "lecture-lens-chat-chips" });
		this.renderContextChips();

		this.imageChipsEl = composerCard.createEl("div", { cls: "lecture-lens-chat-image-chips" });
		this.renderImageChips();

		this.imageInputEl = composerCard.createEl("input", {
			type: "file",
			cls: "lecture-lens-chat-image-input",
		});
		this.imageInputEl.accept = "image/png,image/jpeg,image/gif,image/webp";
		this.imageInputEl.multiple = true;
		this.imageInputEl.addEventListener("change", () => {
			void this.handleImageInput(this.imageInputEl.files);
			this.imageInputEl.value = "";
		});

		const inputRow = composerCard.createEl("div", { cls: "lecture-lens-chat-input-row" });
		this.inputEl = inputRow.createEl("textarea", {
			cls: "lecture-lens-chat-input",
			attr: {
				placeholder: this.plugin.tr("chat.inputPlaceholder"),
				rows: "1",
			},
		});

		this.sendBtn = inputRow.createEl("button", {
			cls: "mod-cta lecture-lens-chat-send-btn",
			attr: { "aria-label": this.plugin.tr("chat.send"), title: this.plugin.tr("chat.send") },
		});
		setIcon(this.sendBtn, "send-horizontal");

		const footer = composerCard.createEl("div", { cls: "lecture-lens-chat-footer" });
		const modelBar = footer.createEl("div", { cls: "lecture-lens-chat-model-bar" });

		const providerGroup = modelBar.createEl("div", { cls: "lecture-lens-chat-model-group" });
		providerGroup.createSpan({
			cls: "lecture-lens-chat-model-label",
			text: this.plugin.tr("chat.providerSelect"),
		});
		this.providerSelectEl = providerGroup.createEl("select", {
			cls: "dropdown lecture-lens-chat-model-select",
		});
		this.providerSelectEl.addEventListener("change", () => {
			void this.handleProviderChange(this.providerSelectEl.value as ApiProvider);
		});

		const modelGroup = modelBar.createEl("div", { cls: "lecture-lens-chat-model-group" });
		modelGroup.createSpan({
			cls: "lecture-lens-chat-model-label",
			text: this.plugin.tr("chat.modelSelect"),
		});
		this.modelSelectEl = modelGroup.createEl("select", {
			cls: "dropdown lecture-lens-chat-model-select lecture-lens-chat-model-select-wide",
		});
		this.modelSelectEl.addEventListener("change", () => {
			void this.handleModelChange(this.modelSelectEl.value);
		});

		const footerTools = footer.createEl("div", { cls: "lecture-lens-chat-footer-tools" });
		const leftActions = footerTools.createEl("div", { cls: "lecture-lens-chat-footer-left" });

		const addContextBtn = leftActions.createEl("button", {
			cls: "lecture-lens-chat-icon-btn",
			attr: { "aria-label": this.plugin.tr("chat.addContext"), title: this.plugin.tr("chat.addContext") },
		});
		setIcon(addContextBtn, "paperclip");
		addContextBtn.addEventListener("click", () => this.openFileSuggest());

		const addImageBtn = leftActions.createEl("button", {
			cls: "lecture-lens-chat-icon-btn",
			attr: { "aria-label": this.plugin.tr("chat.addImage"), title: this.plugin.tr("chat.addImage") },
		});
		setIcon(addImageBtn, "image");
		addImageBtn.addEventListener("click", (event) => {
			event.preventDefault();
			this.openImagePicker();
		});

		leftActions.createEl("span", {
			cls: "lecture-lens-chat-input-hint",
			text: this.plugin.tr("chat.contextHint"),
		});

		this.sendBtn.addEventListener("click", () => void this.handleSend());
		this.inputEl.addEventListener("compositionstart", () => {
			this.inputComposing = true;
		});
		this.inputEl.addEventListener("compositionend", () => {
			this.inputComposing = false;
		});
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				if (e.isComposing || this.inputComposing) return;
				e.preventDefault();
				void this.handleSend();
				return;
			}
			if (e.key === "@") {
				window.setTimeout(() => this.openFileSuggest(), 0);
			}
		});
		this.inputEl.addEventListener("paste", (e) => {
			void this.handlePasteImages(e);
		});
		this.inputEl.addEventListener("input", () => {
			this.adjustChatInputHeight();
			this.scheduleContextPreview();
		});
		this.adjustChatInputHeight();
		this.contextPanel = mountContextPanel(
			this.contextPanelEl,
			(key, params) => this.plugin.tr(key, params),
			{
				includeRag: this.sessionIncludeRag,
				includeNotes: this.sessionIncludeNotes,
				onIncludeRagChange: (value) => {
					this.sessionIncludeRag = value;
					void this.refreshContextPreview();
				},
				onIncludeNotesChange: (value) => {
					this.sessionIncludeNotes = value;
					this.renderContextChips();
					void this.refreshContextPreview();
				},
			},
			(open) => {
				if (open) this.renderContextPanelBodyContent();
			}
		);
		void this.refreshContextPreview();

		await this.initializeChatSession();
		this.applyChatAppearance();

		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				void this.refreshScopeIndexStatus();
				this.renderContextChips();
				this.rememberMarkdownPathFromWorkspace();
			})
		);
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf?.view instanceof MarkdownView && leaf.view.file?.extension === "md") {
					this.lastMarkdownPath = leaf.view.file.path;
				}
			})
		);
		this.rememberMarkdownPathFromWorkspace();
	}

	async onClose(): Promise<void> {
		this.clearContextPreviewTimer();
		await this.persistCurrentSession();
		this.containerEl.empty();
	}

	applyChatAppearance(): void {
		const size = this.plugin.settings.chatMessageFontSize;
		this.containerEl.style.setProperty("--lecture-lens-chat-message-font-size", `${size}px`);
		this.fontSizeValueEl?.setText(String(size));
	}

	private renderHeader(containerEl: HTMLElement): void {
		this.headerEl = containerEl.createEl("div", { cls: "lecture-lens-chat-header" });

		const brand = this.headerEl.createEl("div", { cls: "lecture-lens-chat-brand" });
		const brandIcon = brand.createEl("span", { cls: "lecture-lens-chat-brand-icon" });
		setIcon(brandIcon, "glasses");

		const brandText = brand.createEl("div", { cls: "lecture-lens-chat-brand-text" });
		brandText.createEl("h4", {
			text: this.plugin.tr("chat.title"),
			cls: "lecture-lens-chat-title",
		});
		brandText.createEl("span", {
			text: this.plugin.tr("chat.subtitle"),
			cls: "lecture-lens-chat-subtitle",
		});

		const actions = this.headerEl.createEl("div", { cls: "lecture-lens-chat-header-actions" });

		this.renderFontSizeControls(actions);

		const indexBtn = actions.createEl("button", {
			cls: "lecture-lens-chat-icon-btn lecture-lens-chat-header-icon-btn",
			attr: { "aria-label": this.plugin.tr("chat.buildIndex"), title: this.plugin.tr("chat.buildIndex") },
		});
		setIcon(indexBtn, "database");
		indexBtn.addEventListener("click", () => void this.rebuildIndex());

		const newChatBtn = actions.createEl("button", {
			cls: "lecture-lens-chat-icon-btn lecture-lens-chat-header-icon-btn",
			attr: { "aria-label": this.plugin.tr("chat.newChat"), title: this.plugin.tr("chat.newChat") },
		});
		setIcon(newChatBtn, "plus");
		newChatBtn.addEventListener("click", () => void this.startNewChat());
	}

	private renderFontSizeControls(actions: HTMLElement): void {
		const group = actions.createEl("div", { cls: "lecture-lens-chat-font-size" });
		group.createSpan({
			cls: "lecture-lens-chat-font-size-label",
			text: this.plugin.tr("chat.fontSize"),
		});

		const decreaseBtn = group.createEl("button", {
			cls: "lecture-lens-chat-icon-btn lecture-lens-chat-font-size-btn",
			attr: {
				"aria-label": this.plugin.tr("chat.fontSizeDecrease"),
				title: this.plugin.tr("chat.fontSizeDecrease"),
			},
			text: "A−",
		});
		decreaseBtn.addEventListener("click", () => {
			void this.plugin.setChatMessageFontSize(this.plugin.settings.chatMessageFontSize - 1);
		});

		this.fontSizeValueEl = group.createEl("span", {
			cls: "lecture-lens-chat-font-size-value",
			text: String(this.plugin.settings.chatMessageFontSize),
		});

		const increaseBtn = group.createEl("button", {
			cls: "lecture-lens-chat-icon-btn lecture-lens-chat-font-size-btn",
			attr: {
				"aria-label": this.plugin.tr("chat.fontSizeIncrease"),
				title: this.plugin.tr("chat.fontSizeIncrease"),
			},
			text: "A+",
		});
		increaseBtn.addEventListener("click", () => {
			void this.plugin.setChatMessageFontSize(this.plugin.settings.chatMessageFontSize + 1);
		});
	}

	private renderToolbar(containerEl: HTMLElement): void {
		this.toolbarEl = containerEl.createEl("div", { cls: "lecture-lens-chat-toolbar" });

		const sessionRow = this.toolbarEl.createEl("div", {
			cls: "lecture-lens-chat-toolbar-row lecture-lens-chat-toolbar-row-session",
		});
		sessionRow.createSpan({
			cls: "lecture-lens-chat-toolbar-label",
			text: this.plugin.tr("chat.sessionSelect"),
		});
		this.sessionSelectEl = sessionRow.createEl("select", {
			cls: "lecture-lens-chat-select",
		});
		this.sessionSelectEl.addEventListener("change", () => {
			void this.switchToSession(this.sessionSelectEl.value);
		});

		const sessionActions = sessionRow.createEl("div", { cls: "lecture-lens-chat-toolbar-actions" });
		const renameBtn = sessionActions.createEl("button", {
			cls: "lecture-lens-chat-icon-btn",
			attr: {
				"aria-label": this.plugin.tr("chat.renameChat"),
				title: this.plugin.tr("chat.renameChat"),
			},
		});
		setIcon(renameBtn, "pencil");
		renameBtn.addEventListener("click", () => this.openRenameSessionModal());

		const deleteBtn = sessionActions.createEl("button", {
			cls: "lecture-lens-chat-icon-btn",
			attr: {
				"aria-label": this.plugin.tr("chat.deleteChat"),
				title: this.plugin.tr("chat.deleteChat"),
			},
		});
		setIcon(deleteBtn, "trash-2");
		deleteBtn.addEventListener("click", () => void this.deleteCurrentChat());
	}

	private async initializeChatSession(): Promise<void> {
		let activeId = await this.plugin.chatHistoryService.getActiveSessionId();
		let session = activeId ? await this.plugin.chatHistoryService.getSession(activeId) : null;
		if (!session) {
			session = await this.plugin.chatHistoryService.createSession(
				this.plugin.getDefaultLlmProfile().id,
				this.plugin.tr("chat.newSessionTitle")
			);
		}
		this.currentSessionId = session.id;
		this.currentProfileId = session.profileId;
		const profile = this.plugin.getLlmProfile(session.profileId);
		this.currentModelName = session.modelName?.trim() || profile.modelName;
		this.applySessionModel();
		await this.loadSessionIntoView(session);
		await this.refreshModelSelectors();
		await this.refreshSessionSelect();
		void this.refreshContextPreview();
	}

	private getEffectiveModelName(): string {
		return this.currentModelName.trim() || this.getCurrentProfile().modelName;
	}

	private applySessionModel(): void {
		const profile = this.getCurrentProfile();
		this.plugin.applyLlmProfile({
			...profile,
			modelName: this.getEffectiveModelName(),
		});
	}

	private async refreshModelSelectors(): Promise<void> {
		const locale = resolveLocale(this.plugin.settings.uiLanguage, this.app);
		const providerLabels = getProviderDropdownOptions(
			(key) => this.plugin.tr(key),
			locale
		);
		const currentProvider = this.getCurrentProfile().apiProvider;

		this.providerSelectEl.empty();
		const seenProviders = new Set<ApiProvider>();
		for (const profile of this.plugin.settings.llmProfiles) {
			if (seenProviders.has(profile.apiProvider)) continue;
			seenProviders.add(profile.apiProvider);
			const label = providerLabels[profile.apiProvider] ?? profile.name ?? profile.apiProvider;
			const option = this.providerSelectEl.createEl("option", {
				value: profile.apiProvider,
				text: label,
			});
			if (profile.apiProvider === currentProvider) {
				option.selected = true;
			}
		}

		this.modelSelectEl.empty();
		const models = getChatModelsForProvider(currentProvider, this.getEffectiveModelName());
		if (models.length === 0) {
			const model = this.getEffectiveModelName();
			this.modelSelectEl.createEl("option", { value: model, text: model });
		} else {
			for (const model of models) {
				const option = this.modelSelectEl.createEl("option", { value: model, text: model });
				if (model === this.getEffectiveModelName()) {
					option.selected = true;
				}
			}
		}
		this.modelSelectEl.disabled = models.length <= 1 && currentProvider === "Custom";
	}

	private async refreshSessionSelect(): Promise<void> {
		const sessions = await this.plugin.chatHistoryService.listSessions();
		this.sessionSelectEl.empty();
		for (const session of sessions) {
			const option = this.sessionSelectEl.createEl("option", {
				value: session.id,
				text: session.title || this.plugin.tr("chat.newSessionTitle"),
			});
			if (session.id === this.currentSessionId) {
				option.selected = true;
			}
		}
	}

	private async handleProviderChange(provider: ApiProvider): Promise<void> {
		const profile = findProfileByProvider(this.plugin.settings.llmProfiles, provider);
		if (!profile || profile.apiProvider === this.getCurrentProfile().apiProvider) return;
		this.currentProfileId = profile.id;
		this.currentModelName = profile.modelName;
		this.applySessionModel();
		await this.refreshModelSelectors();
		await this.persistCurrentSession();
	}

	private async handleModelChange(modelName: string): Promise<void> {
		if (!modelName || modelName === this.getEffectiveModelName()) return;
		this.currentModelName = modelName;
		this.applySessionModel();
		await this.persistCurrentSession();
	}

	private openRenameSessionModal(): void {
		if (!this.currentSessionId || this.isStreaming) return;
		void this.plugin.chatHistoryService.getSession(this.currentSessionId).then((session) => {
			if (!session) return;
			const currentTitle = session.title || this.plugin.tr("chat.newSessionTitle");
			new SessionRenameModal(
				this.app,
				currentTitle,
				(key, params) => this.plugin.tr(key, params),
				(title) => void this.renameCurrentSession(title)
			).open();
		});
	}

	private async renameCurrentSession(title: string): Promise<void> {
		if (!this.currentSessionId) return;
		const updated = await this.plugin.chatHistoryService.renameSession(this.currentSessionId, title);
		if (!updated) return;
		await this.refreshSessionSelect();
		new Notice(this.plugin.tr("chat.renameChatSuccess"), 2000);
	}

	private async switchToSession(sessionId: string): Promise<void> {
		if (!sessionId || sessionId === this.currentSessionId || this.isStreaming) return;
		await this.persistCurrentSession();
		const session = await this.plugin.chatHistoryService.getSession(sessionId);
		if (!session) return;
		this.currentSessionId = session.id;
		this.currentProfileId = session.profileId;
		const profile = this.plugin.getLlmProfile(session.profileId);
		this.currentModelName = session.modelName?.trim() || profile.modelName;
		this.applySessionModel();
		await this.plugin.chatHistoryService.setActiveSessionId(sessionId);
		await this.refreshModelSelectors();
		await this.loadSessionIntoView(session);
		await this.refreshSessionSelect();
	}

	private async startNewChat(): Promise<void> {
		if (this.isStreaming) return;
		await this.persistCurrentSession();
		const profileId = this.currentProfileId || this.plugin.getDefaultLlmProfile().id;
		const session = await this.plugin.chatHistoryService.createSession(
			profileId,
			this.plugin.tr("chat.newSessionTitle")
		);
		this.currentSessionId = session.id;
		this.currentProfileId = profileId;
		await this.loadSessionIntoView(session);
		await this.refreshSessionSelect();
	}

	private async deleteCurrentChat(): Promise<void> {
		if (this.isStreaming || !this.currentSessionId) return;
		await this.plugin.chatHistoryService.deleteSession(this.currentSessionId);
		let activeId = await this.plugin.chatHistoryService.getActiveSessionId();
		if (!activeId) {
			const session = await this.plugin.chatHistoryService.createSession(
				this.currentProfileId || this.plugin.getDefaultLlmProfile().id,
				this.plugin.tr("chat.newSessionTitle")
			);
			activeId = session.id;
		}
		await this.switchToSession(activeId);
		await this.refreshSessionSelect();
	}

	private async loadSessionIntoView(session: ChatSession): Promise<void> {
		this.history = [];
		this.messagesEl.empty();
		this.attachedFiles = [];
		this.pendingImages = [];
		this.renderContextChips();
		this.renderImageChips();

		if (session.turns.length === 0) {
			await this.appendMessage("assistant", this.plugin.tr("chat.welcome"), undefined, true);
			this.scrollMessagesToBottom();
			return;
		}

		for (const turn of session.turns) {
			this.history.push({
				role: turn.role,
				content: turn.content,
				imageDescription: turn.imageDescription,
			});
			let displayContent = turn.content;
			if (turn.hasImages && turn.role === "user") {
				if (turn.imageDescription) {
					displayContent = `${turn.content}\n\n*${this.plugin.tr("chat.imageRelayNote")}*`;
				} else {
					displayContent = `${turn.content}\n\n*${this.plugin.tr("chat.imageNotRestored")}*`;
				}
			}
			await this.appendMessage(turn.role, displayContent);
		}

		this.scrollMessagesToBottom();
		void this.refreshContextPreview();
	}

	private async persistCurrentSession(): Promise<void> {
		if (!this.currentSessionId) return;
		const session = await this.plugin.chatHistoryService.getSession(this.currentSessionId);
		if (!session) return;

		session.profileId = this.currentProfileId;
		session.modelName = this.getEffectiveModelName();
		session.turns = this.history.map((turn) => ({
			role: turn.role,
			content: turn.content,
			hasImages: Boolean(turn.images?.length),
			imageDescription: turn.imageDescription,
		}));

		if (!session.titleManuallySet) {
			const firstUser = session.turns.find((turn) => turn.role === "user");
			if (firstUser?.content.trim()) {
				session.title = deriveSessionTitle(firstUser.content, this.plugin.tr("chat.newSessionTitle"));
			} else if (session.turns.length === 0) {
				session.title = this.plugin.tr("chat.newSessionTitle");
			}
		}

		await this.plugin.chatHistoryService.saveSession(session);
		await this.refreshSessionSelect();
	}

	private getCurrentProfile(): LlmProfile {
		return this.plugin.getLlmProfile(this.currentProfileId);
	}

	private renderScopeHint(): void {
		if (!this.messagesEl) return;

		if (!this.scopeEl) {
			this.scopeEl = this.messagesEl.createDiv({
				cls: "lecture-lens-chat-scope lecture-lens-chat-scope-in-messages",
			});
			this.messagesEl.prepend(this.scopeEl);
		} else {
			this.scopeEl.empty();
		}
		this.scopeStatusEl = null;

		const hasRag =
			hasCourseFolderInput(this.plugin.settings.courseFolderPath) &&
			this.plugin.settings.ragEnabled;
		const folderPath = hasRag
			? getCourseFolderDisplayPath(this.app, this.plugin.settings.courseFolderPath) || "/"
			: "";

		const panel = this.scopeEl.createEl("details", {
			cls: `lecture-lens-chat-scope-panel ${hasRag ? "is-active" : "is-inactive"}`,
		});

		const summary = panel.createEl("summary", { cls: "lecture-lens-chat-scope-summary" });
		const leading = summary.createEl("div", { cls: "lecture-lens-chat-scope-leading" });
		const iconEl = leading.createEl("span", { cls: "lecture-lens-chat-scope-icon" });
		setIcon(iconEl, hasRag ? "folder-open" : "folder-x");
		leading.createEl("span", {
			cls: `lecture-lens-chat-scope-badge ${hasRag ? "is-on" : "is-off"}`,
			text: hasRag ? this.plugin.tr("chat.ragStatusOn") : this.plugin.tr("chat.ragStatusOff"),
		});

		const body = summary.createEl("div", { cls: "lecture-lens-chat-scope-body" });
		body.createEl("span", {
			cls: "lecture-lens-chat-scope-label",
			text: this.plugin.tr("chat.ragScopeLabel"),
		});
		body.createEl("span", {
			cls: "lecture-lens-chat-scope-value",
			text: hasRag ? folderPath : this.plugin.tr("chat.ragNotConfigured"),
		});
		this.scopeStatusEl = body.createEl("span", {
			cls: "lecture-lens-chat-scope-desc",
			text: hasRag ? this.plugin.tr("chat.ragScopeLoading") : this.plugin.tr("chat.ragDisabledShort"),
		});

		const panelBody = panel.createEl("div", { cls: "lecture-lens-chat-scope-panel-body" });
		panelBody.createEl("p", {
			cls: "lecture-lens-chat-scope-desc",
			text: this.plugin.tr("chat.ragScopeDesc"),
		});
		panelBody.createEl("p", {
			cls: "lecture-lens-chat-security-hint",
			text: this.plugin.tr("chat.contextSecurityHint"),
		});

		if (hasRag) {
			void this.refreshScopeIndexStatus();
		}
	}

	private async refreshScopeIndexStatus(): Promise<void> {
		const requestId = ++this.scopeStatusRequest;
		const status = await this.plugin.ragService.getIndexStatus(
			this.plugin.settings.courseFolderPath,
			this.plugin.getEmbeddingRuntimeConfig()
		);
		if (requestId !== this.scopeStatusRequest || !this.scopeStatusEl) return;

		let indexStatus = "";
		switch (status.state) {
			case "ready":
				indexStatus = this.plugin.tr("chat.ragIndexReady", { count: status.chunkCount });
				break;
			case "stale_signature":
				indexStatus = this.plugin.tr("chat.ragIndexStale");
				break;
			case "folder_mismatch":
				indexStatus = this.plugin.tr("chat.ragIndexFolderMismatch", {
					indexFolder: status.indexFolder,
					currentFolder: status.currentFolder,
				});
				break;
			default:
				indexStatus = this.plugin.tr("chat.ragIndexMissing");
		}
		this.scopeStatusEl.setText(indexStatus);
	}

	private renderContextChips(): void {
		if (!this.chipsEl) return;
		this.chipsEl.empty();
		const activeFile = this.app.workspace.getActiveFile();

		if (activeFile?.extension === "md") {
			const currentChip = this.chipsEl.createEl("button", {
				cls: `lecture-lens-chat-chip ${this.includeCurrentNote ? "is-active" : ""}`,
			});
			const chipIcon = currentChip.createEl("span", { cls: "lecture-lens-chat-chip-icon" });
			setIcon(chipIcon, "file-text");
			currentChip.createSpan({
				text: `${this.plugin.tr("chat.currentNote")}: ${activeFile.basename}`,
			});
			currentChip.addEventListener("click", () => {
				this.includeCurrentNote = !this.includeCurrentNote;
				this.renderContextChips();
				this.scheduleContextPreview();
			});
		}

		for (const file of this.attachedFiles) {
			const chip = this.chipsEl.createEl("span", {
				cls: "lecture-lens-chat-chip is-attached",
			});
			const chipIcon = chip.createEl("span", { cls: "lecture-lens-chat-chip-icon" });
			setIcon(chipIcon, "at-sign");
			chip.createSpan({ text: file.basename });
			const removeBtn = chip.createEl("button", {
				cls: "lecture-lens-chat-chip-remove",
				text: "×",
				attr: { "aria-label": this.plugin.tr("chat.removeContext") },
			});
			removeBtn.addEventListener("click", (event) => {
				event.stopPropagation();
				this.attachedFiles = this.attachedFiles.filter((item) => item.path !== file.path);
				this.renderContextChips();
				this.scheduleContextPreview();
			});
		}

		if (!activeFile && this.attachedFiles.length === 0) {
			this.chipsEl.createEl("span", {
				cls: "lecture-lens-chat-chip is-muted",
				text: this.plugin.tr("chat.noContextAttached"),
			});
		}
	}

	private openImagePicker(): void {
		if (!this.canAttachImages()) {
			this.visionBlockedNotice();
			return;
		}
		if (typeof this.imageInputEl.showPicker === "function") {
			this.imageInputEl.showPicker();
			return;
		}
		this.imageInputEl.click();
	}

	private openFileSuggest(): void {
		new VaultFileSuggestModal(this.app, (file) => {
			if (!this.attachedFiles.some((item) => item.path === file.path)) {
				this.attachedFiles.push(file);
				this.renderContextChips();
				this.scheduleContextPreview();
			}
		}).open();
	}

	private canUseVision(): boolean {
		const profile = this.getCurrentProfile();
		return chatProfileSupportsVision(profile, this.getEffectiveModelName());
	}

	private canAttachImages(): boolean {
		return this.canUseVision() || this.plugin.canUseVisionRelay(this.getCurrentProfile(), this.getEffectiveModelName());
	}

	private willUseVisionRelay(images: ChatImageAttachment[]): boolean {
		return needsVisionRelay(
			this.plugin.settings,
			this.getCurrentProfile(),
			this.getEffectiveModelName(),
			images.length > 0
		);
	}

	private visionBlockedNotice(): void {
		const profile = this.getCurrentProfile();
		const message =
			this.plugin.canUseVisionRelay(profile, this.getEffectiveModelName())
				? this.plugin.tr("chat.visionRelayUnavailable")
				: profile.apiProvider === "DeepSeek"
					? this.plugin.tr("chat.deepseekTextOnlyRelayHint")
					: !profile.supportsVision
						? this.plugin.tr("chat.visionRequired")
						: this.plugin.tr("chat.modelNoVision", { model: this.getEffectiveModelName() });
		new Notice(message, 8000);
	}

	private formatChatError(error: unknown): string {
		if (error instanceof LLMServiceError) {
			if (isVisionApiError(error.message)) {
				return this.plugin.tr("chat.visionApiRejected", {
					model: this.getEffectiveModelName(),
					detail: error.message,
				});
			}
			return error.message;
		}
		if (error instanceof Error) return error.message;
		return this.plugin.tr("notice.unknownError");
	}

	private async handleImageInput(fileList: FileList | null): Promise<void> {
		if (!fileList || fileList.length === 0) return;

		let added = 0;
		let rejected = 0;
		for (let i = 0; i < fileList.length; i++) {
			const file = fileList[i];
			if (!file) continue;
			const attachment = await fileToChatImage(file);
			if (!attachment) {
				rejected++;
				continue;
			}
			this.pendingImages.push(attachment);
			added++;
		}

		if (added > 0) {
			this.renderImageChips();
			new Notice(this.plugin.tr("chat.imageAdded"), 2000);
		} else if (rejected > 0) {
			new Notice(this.plugin.tr("chat.imageTooLarge"), 5000);
		}
	}

	private async handlePasteImages(event: ClipboardEvent): Promise<void> {
		const items = event.clipboardData?.items;
		if (!items) return;

		const imageFiles: File[] = [];
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (!item || !item.type.startsWith("image/")) continue;
			const file = item.getAsFile();
			if (file) imageFiles.push(file);
		}

		if (imageFiles.length === 0) return;
		event.preventDefault();

		if (!this.canAttachImages()) {
			this.visionBlockedNotice();
			return;
		}

		const dataTransfer = new DataTransfer();
		for (const file of imageFiles) {
			dataTransfer.items.add(file);
		}
		await this.handleImageInput(dataTransfer.files);
	}

	private renderImageChips(): void {
		if (!this.imageChipsEl) return;
		this.imageChipsEl.empty();
		if (this.pendingImages.length === 0) {
			this.imageChipsEl.hide();
			return;
		}
		this.imageChipsEl.show();

		for (const image of this.pendingImages) {
			const chip = this.imageChipsEl.createEl("div", { cls: "lecture-lens-chat-image-chip" });
			chip.createEl("img", {
				cls: "lecture-lens-chat-image-thumb",
				attr: { src: image.previewUrl, alt: image.name },
			});
			chip.createSpan({ cls: "lecture-lens-chat-image-name", text: image.name });
			const removeBtn = chip.createEl("button", {
				cls: "lecture-lens-chat-chip-remove",
				text: "×",
				attr: { "aria-label": this.plugin.tr("chat.removeImage") },
			});
			removeBtn.addEventListener("click", () => {
				this.pendingImages = this.pendingImages.filter((item) => item.id !== image.id);
				this.renderImageChips();
			});
		}
	}

	private createMessageShell(
		role: "user" | "assistant",
		options?: { streaming?: boolean; welcome?: boolean; messageContent?: string }
	): MessageShell {
		const root = this.messagesEl.createEl("div", {
			cls: `lecture-lens-chat-turn lecture-lens-chat-turn-${role}`,
		});
		if (options?.streaming) root.addClass("is-streaming");
		if (options?.welcome) root.addClass("is-welcome");

		const header = root.createEl("div", { cls: "lecture-lens-chat-turn-header" });
		if (role === "user") {
			header.createEl("span", {
				cls: "lecture-lens-chat-turn-label",
				text: this.plugin.tr("chat.roleUser"),
			});
		} else if (options?.welcome) {
			header.createEl("span", {
				cls: "lecture-lens-chat-turn-label",
				text: this.plugin.tr("chat.roleAi"),
			});
		}

		const actions = header.createEl("div", { cls: "lecture-lens-chat-turn-actions" });
		if (options?.messageContent) {
			this.attachMessageActions(actions, options.messageContent, role, Boolean(options.welcome));
		}

		const contentEl = root.createEl("div", {
			cls: "lecture-lens-chat-turn-body markdown-rendered",
		});
		return { root, contentEl };
	}

	private attachMessageActions(
		actions: HTMLElement,
		content: string,
		role: "user" | "assistant",
		isWelcome: boolean
	): void {
		const copyBtn = actions.createEl("button", {
			cls: "lecture-lens-chat-icon-btn lecture-lens-chat-action-btn lecture-lens-chat-copy-btn",
			attr: {
				"aria-label": this.plugin.tr("chat.copyMessage"),
				title: this.plugin.tr("chat.copyMessage"),
			},
		});
		setIcon(copyBtn, "copy");
		copyBtn.addEventListener("click", () => void this.copyToClipboard(content));

		if (role !== "assistant" || isWelcome) return;

		const insertBtn = actions.createEl("button", {
			cls: "lecture-lens-chat-icon-btn lecture-lens-chat-action-btn",
			attr: {
				"aria-label": this.plugin.tr("chat.insertAtCursor"),
				title: this.plugin.tr("chat.insertAtCursor"),
			},
		});
		setIcon(insertBtn, "text-cursor-input");
		insertBtn.addEventListener("click", () => this.insertMessageIntoNote(content, "cursor"));

		const appendBtn = actions.createEl("button", {
			cls: "lecture-lens-chat-icon-btn lecture-lens-chat-action-btn",
			attr: {
				"aria-label": this.plugin.tr("chat.appendToNote"),
				title: this.plugin.tr("chat.appendToNote"),
			},
		});
		setIcon(appendBtn, "arrow-down-to-line");
		appendBtn.addEventListener("click", () => this.insertMessageIntoNote(content, "end"));

		const replaceBtn = actions.createEl("button", {
			cls: "lecture-lens-chat-icon-btn lecture-lens-chat-action-btn",
			attr: {
				"aria-label": this.plugin.tr("chat.replaceSelection"),
				title: this.plugin.tr("chat.replaceSelection"),
			},
		});
		setIcon(replaceBtn, "replace");
		replaceBtn.addEventListener("click", () => this.insertMessageIntoNote(content, "selection"));

		const applyBtn = actions.createEl("button", {
			cls: "lecture-lens-chat-icon-btn lecture-lens-chat-action-btn lecture-lens-chat-apply-btn",
			attr: {
				"aria-label": this.plugin.tr("chat.applyToNote"),
				title: this.plugin.tr("chat.applyToNote"),
			},
		});
		setIcon(applyBtn, "file-pen-line");
		applyBtn.addEventListener("click", () => this.applyMessageToNote(content));
	}

	private rememberMarkdownPathFromWorkspace(): void {
		this.lastMarkdownPath = resolveTargetMarkdownPath(this.app, this.lastMarkdownPath);
	}

	private getTargetMarkdownPath(): string | null {
		return resolveTargetMarkdownPath(this.app, this.lastMarkdownPath);
	}

	private insertMessageIntoNote(
		content: string,
		mode: "cursor" | "end" | "selection"
	): void {
		if (!insertIntoNote(this.app, content, mode, this.getTargetMarkdownPath())) {
			if (mode === "selection") {
				new Notice(this.plugin.tr("chat.noSelection"), 4000);
				return;
			}
			new Notice(this.plugin.tr("chat.noActiveMarkdownNote"), 5000);
			return;
		}

		const noticeKey =
			mode === "cursor"
				? "chat.insertedAtCursor"
				: mode === "end"
					? "chat.appendedToNote"
					: "chat.replacedSelection";
		new Notice(this.plugin.tr(noticeKey), 2500);
	}

	private applyMessageToNote(content: string): void {
		const result = applyAssistantContentToNote(this.app, content, this.getTargetMarkdownPath());
		if (!result) {
			new Notice(this.plugin.tr("chat.noActiveMarkdownNote"), 5000);
			return;
		}

		const noticeKey =
			result === "patch"
				? "chat.appliedPatches"
				: result === "selection"
					? "chat.replacedSelection"
					: "chat.insertedAtCursor";
		new Notice(this.plugin.tr(noticeKey), 2500);
	}

	private showTypingIndicator(contentEl: HTMLElement): void {
		contentEl.empty();
		contentEl.addClass("is-typing");
		const dots = contentEl.createEl("span", { cls: "lecture-lens-chat-typing" });
		dots.createEl("span");
		dots.createEl("span");
		dots.createEl("span");
	}

	private async appendMessage(
		role: "user" | "assistant",
		content: string,
		images?: ChatImageAttachment[],
		isWelcome = false
	): Promise<HTMLElement> {
		const { contentEl } = this.createMessageShell(role, {
			welcome: isWelcome,
			messageContent: content || undefined,
		});

		if (images && images.length > 0) {
			const gallery = contentEl.createEl("div", { cls: "lecture-lens-chat-user-images" });
			for (const image of images) {
				gallery.createEl("img", {
					cls: "lecture-lens-chat-user-image",
					attr: { src: image.previewUrl, alt: image.name },
				});
			}
		}

		if (content) {
			const textEl = contentEl.createEl("div", { cls: "lecture-lens-chat-turn-text" });
			const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
			await renderChatMarkdown(
				this.app,
				this,
				textEl,
				content,
				sourcePath,
				this.getMermaidRenderOptions()
			);
		}

		this.scrollMessagesToBottom();
		return contentEl;
	}

	private scrollMessagesToBottom(): void {
		if (!this.messagesEl) return;
		const scrollNow = () => {
			this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
		};
		scrollNow();
		requestAnimationFrame(() => {
			scrollNow();
			requestAnimationFrame(scrollNow);
		});
	}

	private async copyToClipboard(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			new Notice(this.plugin.tr("chat.copied"), 2000);
		} catch {
			new Notice(this.plugin.tr("notice.unknownError"), 3000);
		}
	}

	private adjustChatInputHeight(): void {
		const el = this.inputEl;
		if (!el) return;

		el.style.removeProperty("--ll-input-height");
		const style = window.getComputedStyle(el);
		const maxHeight = Number.parseFloat(style.maxHeight) || 140;
		const minHeight = Number.parseFloat(style.minHeight) || 36;
		const nextHeight = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight);
		el.style.setProperty("--ll-input-height", `${nextHeight}px`);
		el.classList.toggle("lecture-lens-chat-input--scroll", el.scrollHeight > maxHeight);
	}

	private resetChatInputHeight(): void {
		if (!this.inputEl) return;
		this.inputEl.style.removeProperty("--ll-input-height");
		this.inputEl.classList.remove("lecture-lens-chat-input--scroll");
		this.adjustChatInputHeight();
	}

	private async handleSend(): Promise<void> {
		const text = this.inputEl.value.trim();
		const images = [...this.pendingImages];
		if ((!text && images.length === 0) || this.isStreaming) return;

		if (images.length > 0 && !this.canAttachImages()) {
			this.visionBlockedNotice();
			return;
		}

		const userText = text || this.plugin.tr("chat.defaultImagePrompt");
		this.inputEl.value = "";
		this.resetChatInputHeight();
		this.pendingImages = [];
		this.renderImageChips();

		await this.appendMessage("user", userText, images);
		this.history.push({
			role: "user",
			content: userText,
			images: images.map((image) => ({
				base64: image.base64,
				mimeType: image.mimeType,
			})),
		});
		await this.persistCurrentSession();
		this.isStreaming = true;
		this.sendBtn.disabled = true;
		this.sendBtn.addClass("is-loading");

		const { root: assistantMsg, contentEl } = this.createMessageShell("assistant", { streaming: true });
		this.showTypingIndicator(contentEl);

		const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
		const useVisionRelay = this.willUseVisionRelay(images);

		try {
			if (useVisionRelay && images.length > 0) {
				contentEl.removeClass("is-typing");
				contentEl.empty();
				const relayStatusEl = contentEl.createEl("div", {
					cls: "lecture-lens-chat-vision-relay-status",
				});
				relayStatusEl.setText(this.plugin.tr("chat.analyzingImages"));
				this.scrollMessagesToBottom();

				const imageDescription = await this.plugin.runVisionRelay(
					this.getCurrentProfile(),
					this.getEffectiveModelName(),
					userText,
					images.map((image) => ({
						base64: image.base64,
						mimeType: image.mimeType,
					})),
					(_chunk, fullText) => {
						relayStatusEl.setText(
							`${this.plugin.tr("chat.analyzingImages")}\n\n${fullText}`
						);
						this.scrollMessagesToBottom();
					}
				);

				const lastUserTurn = [...this.history].reverse().find((turn) => turn.role === "user");
				if (lastUserTurn) {
					lastUserTurn.imageDescription = imageDescription;
				}
				await this.persistCurrentSession();
			}

			this.applySessionModel();
			const messages = (await this.buildMessagesWithSnapshot()).messages;
			const fullResponse = await this.streamAssistantResponse(
				contentEl,
				messages,
				sourcePath
			);

			assistantMsg.removeClass("is-streaming");

			const actions = assistantMsg.querySelector(".lecture-lens-chat-turn-actions");
			if (actions && fullResponse) {
				this.attachMessageActions(actions as HTMLElement, fullResponse, "assistant", false);
			}

			this.history.push({ role: "assistant", content: fullResponse });
			await this.persistCurrentSession();
		} catch (error) {
			const msg = this.formatChatError(error);
			contentEl.removeClass("is-typing");
			contentEl.empty();
			contentEl.setText(`${this.plugin.tr("chat.errorPrefix")}${msg}`);
			assistantMsg.removeClass("is-streaming");
		} finally {
			this.isStreaming = false;
			this.sendBtn.disabled = false;
			this.sendBtn.removeClass("is-loading");
		}
	}

	private getContextFiles(): TFile[] {
		if (!this.sessionIncludeNotes) return [];
		const activeFile = this.app.workspace.getActiveFile();
		const current = this.includeCurrentNote && activeFile?.extension === "md" ? activeFile : null;
		return this.plugin.noteContextService.dedupeFiles([current, ...this.attachedFiles]);
	}

	private async streamAssistantResponse(
		contentEl: HTMLElement,
		messages: ChatMessage[],
		sourcePath: string
	): Promise<string> {
		let fullResponse = "";
		contentEl.removeClass("is-typing");
		contentEl.empty();

		const streamRenderIntervalMs = 48;
		let lastPlainUpdate = 0;

		const paintPlain = (force = false): void => {
			const now = Date.now();
			if (!force && now - lastPlainUpdate < streamRenderIntervalMs) return;
			lastPlainUpdate = now;
			updateStreamingPlainText(contentEl, fullResponse);
			this.scrollMessagesToBottom();
		};

		for await (const chunk of this.plugin.llmService.chatCompletionStream(messages, {
			temperature: 0.7,
			max_tokens: DEFAULT_CHAT_MAX_TOKENS,
		})) {
			fullResponse += chunk;
			paintPlain();
		}

		paintPlain(true);
		clearStreamingPlainText(contentEl);
		await renderChatMarkdown(
			this.app,
			this,
			contentEl,
			fullResponse,
			sourcePath,
			this.getMermaidRenderOptions()
		);
		this.scrollMessagesToBottom();
		return fullResponse;
	}

	private getMermaidRenderOptions(): { mermaidLabels: MermaidEnhanceLabels } {
		return {
			mermaidLabels: {
				clickToZoom: this.plugin.tr("chat.mermaidClickToZoom"),
				scrollHint: this.plugin.tr("chat.mermaidScrollHint"),
				zoomTitle: this.plugin.tr("chat.mermaidZoomTitle"),
				zoomIn: this.plugin.tr("chat.mermaidZoomIn"),
				zoomOut: this.plugin.tr("chat.mermaidZoomOut"),
				zoomReset: this.plugin.tr("chat.mermaidZoomReset"),
				zoomHint: this.plugin.tr("chat.mermaidZoomHint"),
			},
		};
	}

	private clearContextPreviewTimer(): void {
		if (this.contextPreviewTimer !== null) {
			window.clearTimeout(this.contextPreviewTimer);
			this.contextPreviewTimer = null;
		}
	}

	private scheduleContextPreview(): void {
		this.clearContextPreviewTimer();
		this.contextPreviewTimer = window.setTimeout(() => {
			this.contextPreviewTimer = null;
			void this.refreshContextPreview();
		}, 350);
	}

	private getContextBuildUserText(): string {
		return this.inputEl?.value.trim() ?? "";
	}

	private renderContextPanelState(snapshot: ChatContextSnapshot | null): void {
		if (!this.contextPanel) return;
		this.lastContextSnapshot = snapshot;
		updateContextPanelSummary(
			this.contextPanel.summaryText,
			snapshot,
			(key, params) => this.plugin.tr(key, params)
		);
		if (this.contextPanel.panel.open) {
			this.renderContextPanelBodyContent();
		}
	}

	private renderContextPanelBodyContent(): void {
		if (!this.contextPanel) return;
		renderContextPanelBody(
			this.contextPanel.bodyContent,
			this.lastContextSnapshot,
			(key, params) => this.plugin.tr(key, params)
		);
	}

	private async refreshContextPreview(): Promise<void> {
		if (!this.contextPanelEl) return;
		try {
			const snapshot = await buildChatContextPreview({
				settings: this.plugin.settings,
				history: this.history,
				contextFiles: this.getContextFiles(),
				userText: this.getContextBuildUserText(),
				visionEnabled: this.canUseVision(),
				includeRag: this.sessionIncludeRag,
				includeNotes: this.sessionIncludeNotes,
				ragService: this.plugin.ragService,
				noteContextService: this.plugin.noteContextService,
				embeddingConfig: this.plugin.getEmbeddingRuntimeConfig(),
				tr: (key, params) => this.plugin.tr(key, params),
				formatEmbeddingError: (error) => this.plugin.formatEmbeddingError(error),
				imageOmittedLabel: this.plugin.tr("chat.imageOmitted"),
			});
			this.renderContextPanelState(snapshot);
		} catch (error) {
			console.warn("Context preview failed:", error);
		}
	}

	private async buildMessagesWithSnapshot(): Promise<{
		messages: ChatMessage[];
		snapshot: ChatContextSnapshot;
	}> {
		const lastUserMessage = [...this.history].reverse().find((turn) => turn.role === "user");
		const userText = lastUserMessage?.content ?? "";

		const result = await buildChatContext({
			settings: this.plugin.settings,
			history: this.history,
			contextFiles: this.getContextFiles(),
			userText,
			visionEnabled: this.canUseVision(),
			includeRag: this.sessionIncludeRag,
			includeNotes: this.sessionIncludeNotes,
			ragService: this.plugin.ragService,
			noteContextService: this.plugin.noteContextService,
			embeddingConfig: this.plugin.getEmbeddingRuntimeConfig(),
			tr: (key, params) => this.plugin.tr(key, params),
			formatEmbeddingError: (error) => this.plugin.formatEmbeddingError(error),
			imageOmittedLabel: this.plugin.tr("chat.imageOmitted"),
		});

		this.renderContextPanelState(result.snapshot);
		return result;
	}

	private async rebuildIndex(): Promise<void> {
		if (!hasCourseFolderInput(this.plugin.settings.courseFolderPath)) {
			new Notice(this.plugin.tr("notice.setCourseFolderFirst"), 5000);
			return;
		}
		const validation = await this.plugin.getEmbeddingReadyMessage();
		if (validation) {
			new Notice(validation, 10000);
			return;
		}

		const notice = new Notice(this.plugin.tr("notice.buildingIndex"), 0);
		try {
			const count = await this.plugin.ragService.buildIndex(
				this.plugin.settings.courseFolderPath,
				this.plugin.getEmbeddingRuntimeConfig(),
				(message: string) => {
					notice.setMessage(`${this.plugin.tr("notice.buildingIndex")}\n${message}`);
				}
			);
			notice.hide();
			new Notice(this.plugin.tr("notice.indexRebuilt", { count }), 5000);
			void this.refreshScopeIndexStatus();
		} catch (error) {
			notice.hide();
			new Notice(
				this.plugin.tr("notice.indexRebuildFailed", {
					message: this.plugin.formatEmbeddingError(error),
				}),
				10000
			);
		}
	}
}

export async function activateChatView(plugin: LectureLensPlugin): Promise<void> {
	const { workspace } = plugin.app;
	let leaf = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];

	if (!leaf) {
		const rightLeaf = workspace.getRightLeaf(false);
		if (!rightLeaf) {
			new Notice(plugin.tr("chat.openFailed"), 5000);
			return;
		}
		await rightLeaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
		leaf = rightLeaf;
	}

	await workspace.revealLeaf(leaf);
}

export function registerChatView(plugin: LectureLensPlugin): void {
	plugin.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, plugin));
}
