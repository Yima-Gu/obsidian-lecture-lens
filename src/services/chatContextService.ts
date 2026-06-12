import { TFile } from "obsidian";
import { TranslationKey } from "../i18n/en";
import { RetrievedChunk, RagRetrieveResult, RagService } from "./ragService";
import { NoteContextService } from "./noteContextService";
import { LLMService, ChatMessage } from "./llm";
import { formatImageDescriptionForChat } from "./visionRelayService";
import { LectureLensSettings } from "../settings";
import { EmbeddingRuntimeConfig } from "./embeddingConfig";
import { hasCourseFolderInput } from "../utils/vaultPath";
import { previewText } from "../utils/contextBudget";
import {
	ChatContextSnapshot,
	ChatTurnInput,
	ContextBudgetSegment,
	HistoryContextPart,
} from "../types/chatContext";

const BASE_SYSTEM_PROMPT_PARTS = [
	"You are Lecture Lens, an AI study assistant for course review.",
	"Answer clearly using markdown, LaTeX math ($...$ or $$...$$), and mermaid when helpful.",
	"For math, always use $...$ (inline) or $$...$$ (block). Do not wrap formulas in bare [ ] or \\\\[ \\\\].",
	"Only use note content explicitly provided below; do not claim access to other files.",
	"When the user asks to edit or update their note, prefer SEARCH/REPLACE blocks so changes can be applied automatically:\n<<<<<<< SEARCH\nexact existing text\n=======\nreplacement text\n>>>>>>> REPLACE",
	"For new content to insert, wrap the markdown in a ```markdown fenced block when possible.",
];

export interface BuildChatContextOptions {
	settings: LectureLensSettings;
	history: ChatTurnInput[];
	contextFiles: TFile[];
	userText: string;
	visionEnabled: boolean;
	includeRag: boolean;
	includeNotes: boolean;
	ragService: RagService;
	noteContextService: NoteContextService;
	embeddingConfig: EmbeddingRuntimeConfig;
	tr: (key: TranslationKey, params?: Record<string, string | number>) => string;
	formatEmbeddingError: (error: unknown) => string;
	imageOmittedLabel: string;
	isPreview?: boolean;
}

export interface BuildChatContextResult {
	messages: ChatMessage[];
	snapshot: ChatContextSnapshot;
}

function estimateTurnChars(turn: ChatTurnInput, imageOmittedSuffix = 0): number {
	let chars = turn.content.length;
	if (turn.imageDescription) {
		chars += turn.imageDescription.length + 80;
	} else if (turn.images?.length) {
		chars += imageOmittedSuffix;
	}
	return chars;
}

function buildHistoryParts(
	history: ChatTurnInput[],
	limit: number,
	imageOmittedLabel: string
): { parts: HistoryContextPart[]; included: ChatTurnInput[]; chars: number } {
	const included = history.slice(-limit);
	const parts: HistoryContextPart[] = [];
	let chars = 0;
	for (const turn of included) {
		const partChars = estimateTurnChars(turn, imageOmittedLabel.length + 4);
		chars += partChars;
		parts.push({
			role: turn.role,
			preview: previewText(turn.content, 56),
			chars: partChars,
			hasImages: Boolean(turn.images?.length),
			hasImageDescription: Boolean(turn.imageDescription),
		});
	}
	return { parts, included, chars };
}

function filterRagChunks(
	chunks: RetrievedChunk[],
	minScore: number
): { kept: RetrievedChunk[]; filtered: number } {
	if (minScore <= 0) return { kept: chunks, filtered: 0 };
	const kept = chunks.filter((chunk) => chunk.score >= minScore);
	return { kept, filtered: chunks.length - kept.length };
}

export async function buildChatContext(
	options: BuildChatContextOptions
): Promise<BuildChatContextResult> {
	const {
		settings,
		history,
		contextFiles,
		userText,
		visionEnabled,
		includeRag,
		includeNotes,
		ragService,
		noteContextService,
		embeddingConfig,
		tr,
		formatEmbeddingError,
		imageOmittedLabel,
		isPreview = false,
	} = options;

	const systemParts = [...BASE_SYSTEM_PROMPT_PARTS];
	const segments: ContextBudgetSegment[] = [];

	const baseSystemChars = BASE_SYSTEM_PROMPT_PARTS.join("\n\n").length;
	segments.push({
		id: "system",
		labelKey: "chat.contextSegment.system",
		chars: baseSystemChars,
		colorVar: "--ll-context-system",
	});

	let notesChars = 0;
	let noteParts = await noteContextService.buildContextParts(
		includeNotes ? contextFiles : [],
		settings.maxNoteContextChars
	);
	notesChars = noteParts.reduce((sum, part) => sum + part.usedChars, 0);

	if (includeNotes && contextFiles.length > 0) {
		const noteContext = await noteContextService.buildContext(
			contextFiles,
			settings.maxNoteContextChars
		);
		systemParts.push("The user attached the following vault notes as context:\n\n" + noteContext);
		notesChars = noteContext.length;
		segments.push({
			id: "notes",
			labelKey: "chat.contextSegment.notes",
			chars: notesChars,
			colorVar: "--ll-context-notes",
		});
	} else {
		noteParts = [];
	}

	let ragChunks: RetrievedChunk[] = [];
	let ragIssue: RagRetrieveResult["issue"];
	let ragFilteredCount = 0;
	let ragChars = 0;

	if (includeRag && settings.ragEnabled && hasCourseFolderInput(settings.courseFolderPath)) {
		if (isPreview || !userText.trim()) {
			ragIssue = userText.trim() ? undefined : "empty_query";
		} else {
			try {
				const result = await ragService.retrieve(
					userText,
					settings.courseFolderPath,
					embeddingConfig,
					settings.ragTopK
				);
				ragIssue = result.issue;
				if (result.issue) {
					const issueMessage = ragIssueToSystemMessage(result.issue, tr);
					if (issueMessage) systemParts.push(issueMessage);
				} else {
					const filtered = filterRagChunks(result.chunks, settings.chatRagMinScore);
					ragChunks = filtered.kept;
					ragFilteredCount = filtered.filtered;
					const context = ragService.formatContext(ragChunks);
					if (context) {
						ragChars = context.length;
						systemParts.push(
							"Relevant excerpts retrieved from the indexed course folder:\n\n" + context
						);
						segments.push({
							id: "rag",
							labelKey: "chat.contextSegment.rag",
							chars: ragChars,
							colorVar: "--ll-context-rag",
						});
					}
				}
			} catch (error) {
				systemParts.push(
					tr("chat.ragRetrieveFailed", {
						message: formatEmbeddingError(error),
					})
				);
			}
		}
	}

	const historyLimit = settings.chatHistoryTurnLimit;
	const historyStats = buildHistoryParts(history, historyLimit, imageOmittedLabel);
	let historyChars = 0;
	for (const turn of historyStats.included) {
		historyChars += estimateTurnChars(turn, imageOmittedLabel.length + 4);
	}
	if (historyStats.included.length > 0) {
		segments.push({
			id: "history",
			labelKey: "chat.contextSegment.history",
			chars: historyChars,
			colorVar: "--ll-context-history",
		});
	}

	const systemChars = systemParts.join("\n\n").length;
	segments[0]!.chars = systemChars;

	const totalChars = systemChars + historyChars;
	const budgetChars = settings.chatContextBudgetChars;
	const budgetPercent = budgetChars > 0 ? (totalChars / budgetChars) * 100 : 0;

	const messages: ChatMessage[] = [LLMService.createTextMessage("system", systemParts.join("\n\n"))];

	if (!isPreview) {
		for (const turn of historyStats.included) {
			let content = turn.content;

			if (turn.role === "user" && turn.imageDescription) {
				content = `${content}\n\n${formatImageDescriptionForChat(turn.imageDescription)}`;
			} else if (
				turn.role === "user" &&
				turn.images &&
				turn.images.length > 0 &&
				visionEnabled
			) {
				messages.push(
					LLMService.createMultimodalMessage(
						turn.role,
						turn.content,
						turn.images.map((image) => ({
							base64: image.base64,
							mimeType: image.mimeType,
							detail: "auto" as const,
						}))
					)
				);
				continue;
			} else if (turn.role === "user" && turn.images && turn.images.length > 0) {
				content = `${content}\n\n*${imageOmittedLabel}*`;
			}

			messages.push(LLMService.createTextMessage(turn.role, content));
		}
	}

	const snapshot: ChatContextSnapshot = {
		builtAt: Date.now(),
		queryPreview: previewText(userText, 64),
		historyTurnsIncluded: historyStats.included.length,
		historyTurnsTotal: history.length,
		historyParts: historyStats.parts,
		notes: noteParts,
		ragChunks,
		ragIssue,
		ragFilteredCount,
		ragEnabled: includeRag && settings.ragEnabled,
		notesEnabled: includeNotes,
		segments,
		totalChars,
		budgetChars,
		budgetPercent,
		isPreview,
	};

	return { messages, snapshot };
}

function ragIssueToSystemMessage(
	issue: NonNullable<RagRetrieveResult["issue"]>,
	tr: (key: TranslationKey, params?: Record<string, string | number>) => string
): string {
	switch (issue) {
		case "no_index":
			return tr("chat.ragRetrieveNoIndex");
		case "signature_mismatch":
			return tr("chat.ragRetrieveStale");
		case "folder_mismatch":
			return tr("chat.ragRetrieveFolderMismatch");
		case "empty_query":
			return tr("chat.ragRetrieveEmptyQuery");
		default:
			return "";
	}
}

export async function buildChatContextPreview(
	options: Omit<BuildChatContextOptions, "isPreview">
): Promise<ChatContextSnapshot> {
	const result = await buildChatContext({ ...options, isPreview: true });
	return result.snapshot;
}
