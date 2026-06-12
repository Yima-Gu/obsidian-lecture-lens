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
	id: "system" | "notes" | "rag" | "history";
	labelKey:
		| "chat.contextSegment.system"
		| "chat.contextSegment.notes"
		| "chat.contextSegment.rag"
		| "chat.contextSegment.history";
	chars: number;
	colorVar: string;
}

export interface ChatContextSnapshot {
	builtAt: number;
	queryPreview: string;
	historyTurnsIncluded: number;
	historyTurnsTotal: number;
	historyParts: HistoryContextPart[];
	notes: NoteContextPart[];
	ragChunks: RetrievedChunk[];
	ragIssue?: RagRetrieveIssue;
	ragFilteredCount: number;
	ragEnabled: boolean;
	notesEnabled: boolean;
	segments: ContextBudgetSegment[];
	totalChars: number;
	budgetChars: number;
	budgetPercent: number;
	isPreview: boolean;
}

export interface ChatTurnInput {
	role: "user" | "assistant";
	content: string;
	images?: Array<{ base64: string; mimeType: string }>;
	imageDescription?: string;
}
