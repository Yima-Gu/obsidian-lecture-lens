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
import { buildCitationSystemBlock, collectAllowedWikiLinks, sanitizeAssistantHistoryContent } from "../utils/citationLinks";
import {
	ChatContextSnapshot,
	ChatTurnInput,
	ContextBudgetSegment,
} from "../types/chatContext";
import {
	buildHistoryWithinBudget,
	computePerFileNoteLimit,
	estimateCitationBlockChars,
	resolveEffectiveUserChars,
	trimRagChunksToBudget,
} from "./contextAllocator";

const BASE_SYSTEM_PROMPT_PARTS = [
	"You are Lecture Lens, an AI study assistant for course review.",
	"Answer clearly using markdown, LaTeX math ($...$ or $$...$$), and mermaid when helpful.",
	"For math, always use $...$ (inline) or $$...$$ (block). Do not wrap formulas in bare [ ] or \\\\[ \\\\].",
	"Only use note content explicitly provided below; do not claim access to other files.",
	"When using attached notes or RAG excerpts, cite sources inline with Obsidian wiki links ([[Note]] or [[Note#Section]]). A citation index is provided when sources are available.",
	"When the user asks to edit or update their note, prefer SEARCH/REPLACE blocks so changes can be applied automatically:\n<<<<<<< SEARCH\nexact existing text\n=======\nreplacement text\n>>>>>>> REPLACE",
	"For new content to insert, wrap the markdown in a ```markdown fenced block when possible.",
];

const NOTES_BLOCK_PREFIX = "The user attached the following vault notes as context:\n\n";
const RAG_BLOCK_PREFIX = "Relevant excerpts retrieved from the indexed course folder:\n\n";
const NOTES_BUDGET_RATIO = 0.38;
const RAG_BUDGET_RATIO = 0.32;

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
	const budgetChars = settings.chatContextBudgetChars;
	const effectiveUserChars = resolveEffectiveUserChars(history, userText);
	const noteFileCount = includeNotes ? contextFiles.length : 0;

	const citationEstimate = estimateCitationBlockChars(
		noteFileCount + (includeRag ? settings.ragTopK : 0)
	);

	let remainingAfterCore = Math.max(
		0,
		budgetChars - baseSystemChars - effectiveUserChars - citationEstimate
	);

	let perFileNoteLimit = settings.maxNoteContextChars;
	if (noteFileCount > 0) {
		const noteBudget = Math.min(
			settings.maxNoteContextChars * noteFileCount,
			Math.floor(remainingAfterCore * NOTES_BUDGET_RATIO)
		);
		perFileNoteLimit = computePerFileNoteLimit(
			noteFileCount,
			noteBudget,
			settings.maxNoteContextChars
		);
	}

	let notesChars = 0;
	let noteParts = await noteContextService.buildContextParts(
		includeNotes ? contextFiles : [],
		perFileNoteLimit
	);

	if (includeNotes && contextFiles.length > 0) {
		const noteContext = await noteContextService.buildContext(contextFiles, perFileNoteLimit);
		systemParts.push(NOTES_BLOCK_PREFIX + noteContext);
		notesChars = NOTES_BLOCK_PREFIX.length + noteContext.length;
		segments.push({
			id: "notes",
			labelKey: "chat.contextSegment.notes",
			chars: notesChars,
			colorVar: "--ll-context-notes",
		});
	} else {
		noteParts = [];
	}

	remainingAfterCore = Math.max(
		0,
		budgetChars - baseSystemChars - effectiveUserChars - notesChars - citationEstimate
	);
	const ragBudget = includeRag ? Math.floor(remainingAfterCore * RAG_BUDGET_RATIO) : 0;

	let ragChunks: RetrievedChunk[] = [];
	let ragIssue: RagRetrieveResult["issue"];
	let ragFilteredCount = 0;
	let ragBudgetDropped = 0;
	let ragTruncatedLast = false;
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
					ragFilteredCount = filtered.filtered;
					const trimmed = trimRagChunksToBudget(
						filtered.kept,
						Math.max(0, ragBudget),
						(chunks) => ragService.formatContext(chunks)
					);
					ragChunks = trimmed.kept;
					ragBudgetDropped = trimmed.dropped;
					ragTruncatedLast = trimmed.truncatedLast;
					const context = ragService.formatContext(ragChunks);
					if (context) {
						ragChars = RAG_BLOCK_PREFIX.length + context.length;
						systemParts.push(RAG_BLOCK_PREFIX + context);
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

	const citationBlock = buildCitationSystemBlock(noteParts, ragChunks);
	if (citationBlock) {
		systemParts.push(citationBlock);
	}
	const citationChars = citationBlock?.length ?? 0;
	const allowedWikiLinks = collectAllowedWikiLinks(noteParts, ragChunks);

	const historyBudget = Math.max(
		0,
		budgetChars -
			baseSystemChars -
			effectiveUserChars -
			notesChars -
			ragChars -
			citationChars
	);
	const historyStats = buildHistoryWithinBudget(
		history,
		historyBudget,
		settings.chatHistoryTurnLimit,
		imageOmittedLabel
	);

	if (historyStats.included.length > 0) {
		segments.push({
			id: "history",
			labelKey: "chat.contextSegment.history",
			chars: historyStats.chars,
			colorVar: "--ll-context-history",
		});
	}

	if (effectiveUserChars > 0) {
		segments.push({
			id: "user",
			labelKey: "chat.contextSegment.user",
			chars: effectiveUserChars,
			colorVar: "--ll-context-user",
		});
	}

	const systemChars = systemParts.join("\n\n").length;
	segments.unshift({
		id: "system",
		labelKey: "chat.contextSegment.system",
		chars: systemChars,
		colorVar: "--ll-context-system",
	});

	const totalChars = systemChars + historyStats.chars + effectiveUserChars;
	const budgetPercent = budgetChars > 0 ? (totalChars / budgetChars) * 100 : 0;
	const budgetStatus: ChatContextSnapshot["budgetStatus"] =
		budgetPercent > 100 ? "over" : budgetPercent > 90 ? "tight" : "ok";

	const messages: ChatMessage[] = [LLMService.createTextMessage("system", systemParts.join("\n\n"))];

	if (!isPreview) {
		for (const turn of historyStats.included) {
			let content = turn.content;

			if (turn.role === "assistant") {
				content = sanitizeAssistantHistoryContent(content, allowedWikiLinks);
			} else if (turn.role === "user" && turn.imageDescription) {
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
		historyTurnsOmittedByBudget: historyStats.omittedByBudget,
		historyTurnsOmittedByTurnLimit: historyStats.omittedByTurnLimit,
		historyParts: historyStats.parts,
		userChars: effectiveUserChars,
		notes: noteParts,
		ragChunks,
		ragIssue,
		ragFilteredCount,
		ragBudgetDropped,
		ragTruncatedLast,
		ragEnabled: includeRag && settings.ragEnabled,
		notesEnabled: includeNotes,
		segments,
		totalChars,
		budgetChars,
		budgetPercent,
		budgetStatus,
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
