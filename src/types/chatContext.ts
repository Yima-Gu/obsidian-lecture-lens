import { RetrievedChunk, RagRetrieveIssue } from "../services/ragService";

export interface NoteContextPart {
	path: string;
	basename: string;
	originalChars: number;
	usedChars: number;
	truncated: boolean;
}

export interface HistoryContextPart {
	role: "user" | "assistant";
	preview: string;
	chars: number;
	hasImages: boolean;
	hasImageDescription: boolean;
}

export interface ContextBudgetSegment {
	id: "system" | "notes" | "rag" | "history" | "user";
	labelKey:
		| "chat.contextSegment.system"
		| "chat.contextSegment.notes"
		| "chat.contextSegment.rag"
		| "chat.contextSegment.history"
		| "chat.contextSegment.user";
	chars: number;
	colorVar: string;
}

export interface ChatContextSnapshot {
	builtAt: number;
	queryPreview: string;
	historyTurnsIncluded: number;
	historyTurnsTotal: number;
	historyTurnsOmittedByBudget: number;
	historyTurnsOmittedByTurnLimit: number;
	historyParts: HistoryContextPart[];
	userChars: number;
	notes: NoteContextPart[];
	ragChunks: RetrievedChunk[];
	ragIssue?: RagRetrieveIssue;
	ragFilteredCount: number;
	ragBudgetDropped: number;
	ragTruncatedLast: boolean;
	ragEnabled: boolean;
	notesEnabled: boolean;
	segments: ContextBudgetSegment[];
	totalChars: number;
	budgetChars: number;
	budgetPercent: number;
	budgetStatus: "ok" | "tight" | "over";
	isPreview: boolean;
}

export interface ChatTurnInput {
	role: "user" | "assistant";
	content: string;
	images?: Array<{ base64: string; mimeType: string }>;
	imageDescription?: string;
}
