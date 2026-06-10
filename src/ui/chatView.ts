// Plugin name uses title case in the sidebar label.
/* eslint-disable obsidianmd/ui/sentence-case */
import {
	ItemView,
	Notice,
	WorkspaceLeaf,
} from "obsidian";
import { CHAT_VIEW_TYPE } from "../constants";
import LectureLensPlugin from "../main";
import { ChatMessage, LLMService, LLMServiceError } from "../services/llm";

interface ChatTurn {
	role: "user" | "assistant";
	content: string;
}

export class ChatView extends ItemView {
	private messagesEl: HTMLElement;
	private inputEl: HTMLTextAreaElement;
	private sendBtn: HTMLButtonElement;
	private history: ChatTurn[] = [];
	private isStreaming = false;

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
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("lecture-lens-chat-view");

		containerEl.createEl("h4", { text: "Lecture Lens Chat", cls: "lecture-lens-chat-title" });

		const scopeEl = containerEl.createEl("div", { cls: "lecture-lens-chat-scope" });
		this.renderScopeHint(scopeEl);

		this.messagesEl = containerEl.createEl("div", { cls: "lecture-lens-chat-messages" });
		this.appendMessage("assistant", "Ask questions about your course notes. Configure a course folder in settings and rebuild the index for RAG.");

		const inputRow = containerEl.createEl("div", { cls: "lecture-lens-chat-input-row" });
		this.inputEl = inputRow.createEl("textarea", {
			cls: "lecture-lens-chat-input",
			attr: { placeholder: "Ask about your course…", rows: "3" },
		});

		const btnRow = containerEl.createEl("div", { cls: "lecture-lens-chat-buttons" });
		this.sendBtn = btnRow.createEl("button", { text: "Send", cls: "mod-cta" });
		btnRow.createEl("button", { text: "Clear" }).addEventListener("click", () => {
			this.history = [];
			this.messagesEl.empty();
			this.appendMessage("assistant", "Conversation cleared.");
		});

		this.sendBtn.addEventListener("click", () => void this.handleSend());
		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				void this.handleSend();
			}
		});
	}

	async onClose(): Promise<void> {
		this.containerEl.empty();
	}

	private renderScopeHint(el: HTMLElement): void {
		el.empty();
		const folder = this.plugin.settings.courseFolderPath.trim();
		if (folder && this.plugin.settings.ragEnabled) {
			el.setText(`Course scope: ${folder}`);
		} else {
			el.setText("RAG disabled — set a course folder in settings.");
		}
	}

	private appendMessage(role: "user" | "assistant", content: string): HTMLElement {
		const msg = this.messagesEl.createEl("div", {
			cls: `lecture-lens-chat-message lecture-lens-chat-${role}`,
		});
		msg.createEl("div", { cls: "lecture-lens-chat-role", text: role === "user" ? "You" : "AI" });
		msg.createEl("div", { cls: "lecture-lens-chat-content", text: content });
		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
		return msg;
	}

	private async handleSend(): Promise<void> {
		const text = this.inputEl.value.trim();
		if (!text || this.isStreaming) return;

		this.inputEl.value = "";
		this.appendMessage("user", text);
		this.history.push({ role: "user", content: text });
		this.isStreaming = true;
		this.sendBtn.disabled = true;

		const assistantMsg = this.messagesEl.createEl("div", {
			cls: "lecture-lens-chat-message lecture-lens-chat-assistant",
		});
		assistantMsg.createEl("div", { cls: "lecture-lens-chat-role", text: "AI" });
		const contentEl = assistantMsg.createEl("div", { cls: "lecture-lens-chat-content" });
		contentEl.setText("…");

		try {
			const messages = await this.buildMessages(text);
			let fullResponse = "";

			for await (const chunk of this.plugin.llmService.chatCompletionStream(messages, {
				temperature: 0.7,
				max_tokens: 2000,
			})) {
				fullResponse += chunk;
				contentEl.setText(fullResponse);
				this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
			}

			this.history.push({ role: "assistant", content: fullResponse });
		} catch (error) {
			const msg = error instanceof LLMServiceError ? error.message : "Unknown error";
			contentEl.setText(`Error: ${msg}`);
		} finally {
			this.isStreaming = false;
			this.sendBtn.disabled = false;
		}
	}

	private async buildMessages(userText: string): Promise<ChatMessage[]> {
		const messages: ChatMessage[] = [];
		let systemParts = [
			"You are Lecture Lens, an AI study assistant for course review.",
			"Answer concisely using markdown when helpful.",
		];

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
						"Use the following excerpts from the user's course notes when relevant:\n\n" +
							context
					);
				}
			} catch (error) {
				console.warn("RAG retrieval failed:", error);
			}
		}

		const activeFile = this.app.workspace.getActiveFile();
		if (activeFile) {
			systemParts.push(`The user is currently viewing: ${activeFile.path}`);
		}

		messages.push(LLMService.createTextMessage("system", systemParts.join("\n\n")));

		for (const turn of this.history.slice(-10)) {
			messages.push(LLMService.createTextMessage(turn.role, turn.content));
		}

		return messages;
	}
}

export async function activateChatView(plugin: LectureLensPlugin): Promise<void> {
	const { workspace } = plugin.app;
	let leaf = workspace.getLeavesOfType(CHAT_VIEW_TYPE)[0];

	if (!leaf) {
		const rightLeaf = workspace.getRightLeaf(false);
		if (!rightLeaf) {
			new Notice("Could not open chat panel.", 5000);
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
