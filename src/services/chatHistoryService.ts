import { App } from "obsidian";
import { ensurePluginDataDir, resolvePluginDataFile } from "../utils/pluginDataPath";

export interface StoredChatTurn {
	role: "user" | "assistant";
	content: string;
	hasImages?: boolean;
	/** Text extracted from images via vision relay (Kimi → DeepSeek pipeline). */
	imageDescription?: string;
}

export interface ChatSession {
	id: string;
	title: string;
	/** When true, title is not overwritten from the first user message. */
	titleManuallySet?: boolean;
	profileId: string;
	/** Per-session model override (does not change profile settings). */
	modelName?: string;
	createdAt: number;
	updatedAt: number;
	turns: StoredChatTurn[];
}

interface ChatHistoryStore {
	version: number;
	sessions: ChatSession[];
	activeSessionId: string;
}

const STORE_VERSION = 1;

function generateSessionId(): string {
	return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function deriveSessionTitle(firstUserMessage: string, fallback: string): string {
	const trimmed = firstUserMessage.trim().replace(/\s+/g, " ");
	if (!trimmed) return fallback;
	return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
}

export class ChatHistoryService {
	private cache: ChatHistoryStore | null = null;

	constructor(
		private readonly app: App,
		private readonly pluginId: string
	) {}

	private async getStorePath(): Promise<string> {
		return resolvePluginDataFile(this.app, this.pluginId, "chat-history.json");
	}

	private createEmptyStore(): ChatHistoryStore {
		return { version: STORE_VERSION, sessions: [], activeSessionId: "" };
	}

	async loadStore(): Promise<ChatHistoryStore> {
		if (this.cache) return this.cache;

		const path = await this.getStorePath();
		if (!(await this.app.vault.adapter.exists(path))) {
			this.cache = this.createEmptyStore();
			return this.cache;
		}

		try {
			const raw = await this.app.vault.adapter.read(path);
			const parsed = JSON.parse(raw) as ChatHistoryStore;
			if (parsed.version !== STORE_VERSION || !Array.isArray(parsed.sessions)) {
				this.cache = this.createEmptyStore();
				return this.cache;
			}
			this.cache = parsed;
			return parsed;
		} catch {
			this.cache = this.createEmptyStore();
			return this.cache;
		}
	}

	private async persistStore(store: ChatHistoryStore): Promise<void> {
		await ensurePluginDataDir(this.app);
		const path = await this.getStorePath();
		await this.app.vault.adapter.write(path, JSON.stringify(store));
		this.cache = store;
	}

	async listSessions(): Promise<ChatSession[]> {
		const store = await this.loadStore();
		return [...store.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
	}

	async getActiveSessionId(): Promise<string> {
		const store = await this.loadStore();
		return store.activeSessionId;
	}

	async setActiveSessionId(sessionId: string): Promise<void> {
		const store = await this.loadStore();
		store.activeSessionId = sessionId;
		await this.persistStore(store);
	}

	async getSession(sessionId: string): Promise<ChatSession | null> {
		const store = await this.loadStore();
		return store.sessions.find((session) => session.id === sessionId) ?? null;
	}

	async createSession(profileId: string, title: string): Promise<ChatSession> {
		const store = await this.loadStore();
		const now = Date.now();
		const session: ChatSession = {
			id: generateSessionId(),
			title,
			profileId,
			createdAt: now,
			updatedAt: now,
			turns: [],
		};
		store.sessions.unshift(session);
		store.activeSessionId = session.id;
		await this.persistStore(store);
		return session;
	}

	async saveSession(session: ChatSession): Promise<void> {
		const store = await this.loadStore();
		const index = store.sessions.findIndex((item) => item.id === session.id);
		session.updatedAt = Date.now();
		if (index >= 0) {
			store.sessions[index] = session;
		} else {
			store.sessions.unshift(session);
		}
		store.activeSessionId = session.id;
		await this.persistStore(store);
	}

	async renameSession(sessionId: string, title: string): Promise<ChatSession | null> {
		const session = await this.getSession(sessionId);
		if (!session) return null;
		const trimmed = title.trim();
		if (!trimmed) return null;
		session.title = trimmed;
		session.titleManuallySet = true;
		await this.saveSession(session);
		return session;
	}

	async deleteSession(sessionId: string): Promise<ChatSession | null> {
		const store = await this.loadStore();
		const removed = store.sessions.find((session) => session.id === sessionId) ?? null;
		store.sessions = store.sessions.filter((session) => session.id !== sessionId);
		if (store.activeSessionId === sessionId) {
			store.activeSessionId = store.sessions[0]?.id ?? "";
		}
		await this.persistStore(store);
		return removed;
	}

	async clearAllSessions(): Promise<void> {
		const store = this.createEmptyStore();
		await this.persistStore(store);
	}
}
