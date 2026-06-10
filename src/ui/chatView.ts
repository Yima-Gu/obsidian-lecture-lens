// Plugin name uses title case in the sidebar label.
/* eslint-disable obsidianmd/ui/sentence-case */
import {
	ItemView,
	Notice,
	setIcon,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { CHAT_VIEW_TYPE } from "../constants";
import { providerSupportsVision, isVisionApiError } from "../constants/providers";
import LectureLensPlugin from "../main";
import { ChatMessage, LLMService, LLMServiceError } from "../services/llm";
import { VaultFileSuggestModal } from "./fileSuggestModal";
import { debounceRender, renderChatMarkdown } from "../utils/markdownRender";
import {
	ChatImageAttachment,
	fileToChatImage,
} from "../utils/chatImage";

interface ChatTurn {
	role: "user" | "assistant";
	content: string;
	images?: Array<{ base64: string; mimeType: string }>;
}

interface RenderTimerRef {
	id: number | null;
}

interface MessageShell {
	root: HTMLElement;
	contentEl: HTMLElement;
}

export class ChatView extends ItemView {
	private headerEl!: HTMLElement;
	private scopeEl!: HTMLElement;
	private messagesEl!: HTMLElement;
	private chipsEl!: HTMLElement;
	private imageChipsEl!: HTMLElement;
	private inputEl!: HTMLTextAreaElement;
	private imageInputEl!: HTMLInputElement;
	private sendBtn!: HTMLButtonElement;
	private history: ChatTurn[] = [];
	private attachedFiles: TFile[] = [];
	private pendingImages: ChatImageAttachment[] = [];
	private includeCurrentNote = true;
	private isStreaming = false;
	private streamRenderTimer: RenderTimerRef = { id: null };

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
		this.scopeEl = containerEl.createEl("div", { cls: "lecture-lens-chat-scope" });
		this.renderScopeHint();

		this.messagesEl = containerEl.createEl("div", { cls: "lecture-lens-chat-messages" });
		void this.appendMessage("assistant", this.plugin.tr("chat.welcome"), undefined, true);

		const composer = containerEl.createEl("div", { cls: "lecture-lens-chat-composer" });
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

		this.inputEl = composerCard.createEl("textarea", {
			cls: "lecture-lens-chat-input",
			attr: {
				placeholder: this.plugin.tr("chat.inputPlaceholder"),
				rows: "3",
			},
		});

		const footer = composerCard.createEl("div", { cls: "lecture-lens-chat-footer" });
		const leftActions = footer.createEl("div", { cls: "lecture-lens-chat-footer-left" });

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

		this.sendBtn = footer.createEl("button", {
			cls: "mod-cta lecture-lens-chat-send-btn",
			attr: { "aria-label": this.plugin.tr("chat.send"), title: this.plugin.tr("chat.send") },
		});
		setIcon(this.sendBtn, "send-horizontal");

		this.sendBtn.addEventListener("click", () => void this.handleSend());
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
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

		this.registerEvent(
			this.app.workspace.on("file-open", () => {
				this.renderScopeHint();
				this.renderContextChips();
			})
		);
	}

	async onClose(): Promise<void> {
		if (this.streamRenderTimer.id !== null) {
			window.clearTimeout(this.streamRenderTimer.id);
		}
		this.containerEl.empty();
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

		const indexBtn = actions.createEl("button", {
			cls: "lecture-lens-chat-text-btn",
			attr: { title: this.plugin.tr("chat.buildIndex") },
		});
		setIcon(indexBtn, "database");
		indexBtn.createSpan({ text: this.plugin.tr("chat.buildIndex") });
		indexBtn.addEventListener("click", () => void this.rebuildIndex());

		const clearBtn = actions.createEl("button", {
			cls: "lecture-lens-chat-text-btn",
			attr: { title: this.plugin.tr("chat.clear") },
		});
		setIcon(clearBtn, "trash-2");
		clearBtn.createSpan({ text: this.plugin.tr("chat.clear") });
		clearBtn.addEventListener("click", () => {
			this.history = [];
			this.messagesEl.empty();
			void this.appendMessage("assistant", this.plugin.tr("chat.cleared"), undefined, true);
		});
	}

	private renderScopeHint(): void {
		this.scopeEl.empty();
		const folder = this.plugin.settings.courseFolderPath.trim();
		const hasRag = Boolean(folder && this.plugin.settings.ragEnabled);

		const banner = this.scopeEl.createEl("div", {
			cls: `lecture-lens-chat-scope-banner ${hasRag ? "is-active" : ""}`,
		});
		const iconEl = banner.createEl("span", { cls: "lecture-lens-chat-scope-icon" });
		setIcon(iconEl, hasRag ? "folder-open" : "info");

		const textWrap = banner.createEl("div", { cls: "lecture-lens-chat-scope-text" });
		textWrap.createEl("div", {
			cls: "lecture-lens-chat-scope-main",
			text: hasRag
				? this.plugin.tr("chat.courseScope", { folder })
				: this.plugin.tr("chat.ragDisabled"),
		});
		textWrap.createEl("div", {
			cls: "lecture-lens-chat-security-hint",
			text: this.plugin.tr("chat.contextSecurityHint"),
		});
	}

	private renderContextChips(): void {
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
		if (!this.canUseVision()) {
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
			}
		}).open();
	}

	private canUseVision(): boolean {
		return providerSupportsVision(
			this.plugin.settings.apiProvider,
			this.plugin.settings.modelName,
			this.plugin.settings.supportsVision
		);
	}

	private visionBlockedNotice(): void {
		new Notice(
			this.plugin.tr("chat.modelNoVision", { model: this.plugin.settings.modelName }),
			8000
		);
	}

	private formatChatError(error: unknown): string {
		if (error instanceof LLMServiceError) {
			if (isVisionApiError(error.message)) {
				return this.plugin.tr("chat.modelNoVision", {
					model: this.plugin.settings.modelName,
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

		if (!this.canUseVision()) {
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
		options?: { streaming?: boolean; welcome?: boolean; copyContent?: string }
	): MessageShell {
		const root = this.messagesEl.createEl("div", {
			cls: `lecture-lens-chat-message lecture-lens-chat-${role}`,
		});
		if (options?.streaming) root.addClass("is-streaming");
		if (options?.welcome) root.addClass("is-welcome");

		const row = root.createEl("div", { cls: "lecture-lens-chat-message-row" });

		const avatar = row.createEl("div", {
			cls: `lecture-lens-chat-avatar lecture-lens-chat-avatar-${role}`,
		});
		setIcon(avatar, role === "user" ? "user" : "glasses");

		const bubble = row.createEl("div", { cls: "lecture-lens-chat-bubble" });

		const meta = bubble.createEl("div", { cls: "lecture-lens-chat-message-meta" });
		meta.createEl("span", {
			cls: "lecture-lens-chat-role",
			text: role === "user" ? this.plugin.tr("chat.roleUser") : this.plugin.tr("chat.roleAi"),
		});

		if (role === "assistant" && options?.copyContent !== undefined) {
			const copyBtn = meta.createEl("button", {
				cls: "lecture-lens-chat-icon-btn lecture-lens-chat-copy-btn",
				attr: { "aria-label": this.plugin.tr("chat.copyMessage"), title: this.plugin.tr("chat.copyMessage") },
			});
			setIcon(copyBtn, "copy");
			copyBtn.addEventListener("click", () => void this.copyToClipboard(options.copyContent!));
		}

		const contentEl = bubble.createEl("div", { cls: "lecture-lens-chat-content markdown-rendered" });
		return { root, contentEl };
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
			copyContent: role === "assistant" ? content : undefined,
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
			const textEl = contentEl.createEl("div", { cls: "lecture-lens-chat-text" });
			const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
			await renderChatMarkdown(this.app, this, textEl, content, sourcePath);
		}

		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
		return contentEl;
	}

	private async copyToClipboard(text: string): Promise<void> {
		try {
			await navigator.clipboard.writeText(text);
			new Notice(this.plugin.tr("chat.copied"), 2000);
		} catch {
			new Notice(this.plugin.tr("notice.unknownError"), 3000);
		}
	}

	private async handleSend(): Promise<void> {
		const text = this.inputEl.value.trim();
		const images = [...this.pendingImages];
		if ((!text && images.length === 0) || this.isStreaming) return;

		if (images.length > 0 && !this.canUseVision()) {
			this.visionBlockedNotice();
			return;
		}

		const userText = text || this.plugin.tr("chat.defaultImagePrompt");
		this.inputEl.value = "";
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
		this.isStreaming = true;
		this.sendBtn.disabled = true;
		this.sendBtn.addClass("is-loading");

		const { root: assistantMsg, contentEl } = this.createMessageShell("assistant", { streaming: true });
		this.showTypingIndicator(contentEl);

		const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";

		try {
			const messages = await this.buildMessages();
			let fullResponse = "";
			contentEl.removeClass("is-typing");
			contentEl.empty();

			for await (const chunk of this.plugin.llmService.chatCompletionStream(messages, {
				temperature: 0.7,
				max_tokens: 2000,
			})) {
				fullResponse += chunk;
				debounceRender(this.app, this, contentEl, fullResponse, sourcePath, this.streamRenderTimer, 180);
				this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
			}

			if (this.streamRenderTimer.id !== null) {
				window.clearTimeout(this.streamRenderTimer.id);
				this.streamRenderTimer.id = null;
			}
			await renderChatMarkdown(this.app, this, contentEl, fullResponse, sourcePath);
			assistantMsg.removeClass("is-streaming");

			const meta = assistantMsg.querySelector(".lecture-lens-chat-message-meta");
			if (meta && fullResponse) {
				const copyBtn = meta.createEl("button", {
					cls: "lecture-lens-chat-icon-btn lecture-lens-chat-copy-btn",
					attr: {
						"aria-label": this.plugin.tr("chat.copyMessage"),
						title: this.plugin.tr("chat.copyMessage"),
					},
				});
				setIcon(copyBtn, "copy");
				copyBtn.addEventListener("click", () => void this.copyToClipboard(fullResponse));
			}

			this.history.push({ role: "assistant", content: fullResponse });
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
		const activeFile = this.app.workspace.getActiveFile();
		const current = this.includeCurrentNote && activeFile?.extension === "md" ? activeFile : null;
		return this.plugin.noteContextService.dedupeFiles([current, ...this.attachedFiles]);
	}

	private async buildMessages(): Promise<ChatMessage[]> {
		const lastUserMessage = [...this.history].reverse().find((turn) => turn.role === "user");
		const userText = lastUserMessage?.content ?? "";

		const systemParts = [
			"You are Lecture Lens, an AI study assistant for course review.",
			"Answer clearly using markdown, LaTeX math ($...$ or $$...$$), and mermaid when helpful.",
			"Only use note content explicitly provided below; do not claim access to other files.",
		];

		const contextFiles = this.getContextFiles();
		if (contextFiles.length > 0) {
			const noteContext = await this.plugin.noteContextService.buildContext(
				contextFiles,
				this.plugin.settings.maxNoteContextChars
			);
			systemParts.push(
				"The user attached the following vault notes as context:\n\n" + noteContext
			);
		}

		if (this.plugin.settings.ragEnabled && this.plugin.settings.courseFolderPath.trim()) {
			try {
				const chunks = await this.plugin.ragService.retrieve(
					userText,
					this.plugin.settings.embeddingModelName,
					this.plugin.settings.ragTopK
				);
				const context = this.plugin.ragService.formatContext(chunks);
				if (context) {
					systemParts.push(
						"Relevant excerpts retrieved from the indexed course folder:\n\n" + context
					);
				}
			} catch (error) {
				console.warn("RAG retrieval failed:", error);
			}
		}

		const messages: ChatMessage[] = [
			LLMService.createTextMessage("system", systemParts.join("\n\n")),
		];

		for (const turn of this.history.slice(-10)) {
			if (turn.role === "user" && turn.images && turn.images.length > 0) {
				messages.push(
					LLMService.createMultimodalMessage(
						turn.role,
						turn.content,
						turn.images.map((image) => ({
							base64: image.base64,
							mimeType: image.mimeType,
							detail: "high" as const,
						}))
					)
				);
			} else {
				messages.push(LLMService.createTextMessage(turn.role, turn.content));
			}
		}

		return messages;
	}

	private async rebuildIndex(): Promise<void> {
		const folder = this.plugin.settings.courseFolderPath.trim();
		if (!folder) {
			new Notice(this.plugin.tr("notice.setCourseFolderFirst"), 5000);
			return;
		}

		const notice = new Notice(this.plugin.tr("notice.buildingIndex"), 0);
		try {
			const count = await this.plugin.ragService.buildIndex(
				folder,
				this.plugin.settings.embeddingModelName
			);
			notice.hide();
			new Notice(this.plugin.tr("notice.indexRebuilt", { count }), 5000);
			this.renderScopeHint();
		} catch (error) {
			notice.hide();
			const msg = error instanceof Error ? error.message : this.plugin.tr("notice.unknownError");
			new Notice(this.plugin.tr("notice.indexRebuildFailed", { message: msg }), 8000);
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
