import { RetrievedChunk } from "./ragService";
import { ChatTurnInput, HistoryContextPart } from "../types/chatContext";
import { previewText } from "../utils/contextBudget";

const MIN_NOTE_CHARS_PER_FILE = 2000;
const RAG_TRUNCATION_MARKER = "\n\n… [excerpt truncated for context budget]";

export interface HistoryBudgetResult {
	parts: HistoryContextPart[];
	included: ChatTurnInput[];
	chars: number;
	omittedByBudget: number;
	omittedByTurnLimit: number;
}

export interface RagBudgetResult {
	kept: RetrievedChunk[];
	chars: number;
	dropped: number;
	truncatedLast: boolean;
}

/** User text already in history should not be counted twice toward the budget. */
export function resolveEffectiveUserChars(history: ChatTurnInput[], userText: string): number {
	const trimmed = userText.trim();
	if (!trimmed) return 0;
	const last = history[history.length - 1];
	if (last?.role === "user" && last.content.trim() === trimmed) {
		return 0;
	}
	return trimmed.length;
}

export function computePerFileNoteLimit(
	fileCount: number,
	noteBudget: number,
	maxPerFileSetting: number
): number {
	if (fileCount <= 0) return 0;
	const equalShare = Math.floor(noteBudget / fileCount);
	return Math.min(maxPerFileSetting, Math.max(MIN_NOTE_CHARS_PER_FILE, equalShare));
}

export function estimateTurnChars(turn: ChatTurnInput, imageOmittedSuffix = 0): number {
	let chars = turn.content.length;
	if (turn.imageDescription) {
		chars += turn.imageDescription.length + 80;
	} else if (turn.images?.length) {
		chars += imageOmittedSuffix;
	}
	return chars;
}

export function buildHistoryWithinBudget(
	history: ChatTurnInput[],
	maxChars: number,
	maxTurns: number,
	imageOmittedLabel: string
): HistoryBudgetResult {
	const imageSuffix = imageOmittedLabel.length + 4;
	const parts: HistoryContextPart[] = [];
	const included: ChatTurnInput[] = [];
	let chars = 0;
	let stoppedByBudget = false;
	let stoppedByTurnLimit = false;

	for (let i = history.length - 1; i >= 0; i--) {
		if (included.length >= maxTurns) {
			stoppedByTurnLimit = true;
			break;
		}

		const turn = history[i]!;
		const turnChars = estimateTurnChars(turn, imageSuffix);

		if (chars + turnChars > maxChars && included.length > 0) {
			stoppedByBudget = true;
			break;
		}

		included.unshift(turn);
		chars += turnChars;
		parts.unshift({
			role: turn.role,
			preview: previewText(turn.content, 56),
			chars: turnChars,
			hasImages: Boolean(turn.images?.length),
			hasImageDescription: Boolean(turn.imageDescription),
		});
	}

	const omittedTotal = history.length - included.length;
	let omittedByBudget = 0;
	let omittedByTurnLimit = 0;
	if (stoppedByBudget) {
		omittedByBudget = omittedTotal;
	} else if (stoppedByTurnLimit) {
		omittedByTurnLimit = omittedTotal;
	}

	return {
		parts,
		included,
		chars,
		omittedByBudget,
		omittedByTurnLimit,
	};
}

function truncateChunkContent(chunk: RetrievedChunk, maxContentChars: number): RetrievedChunk {
	if (maxContentChars <= 0) return { ...chunk, content: RAG_TRUNCATION_MARKER.trim() };
	if (chunk.content.length <= maxContentChars) return chunk;
	const sliceLen = Math.max(0, maxContentChars - RAG_TRUNCATION_MARKER.length);
	return {
		...chunk,
		content: chunk.content.slice(0, sliceLen) + RAG_TRUNCATION_MARKER,
	};
}

export function trimRagChunksToBudget(
	chunks: RetrievedChunk[],
	maxChars: number,
	formatContext: (chunks: RetrievedChunk[]) => string
): RagBudgetResult {
	if (chunks.length === 0 || maxChars <= 0) {
		return { kept: [], chars: 0, dropped: chunks.length, truncatedLast: false };
	}

	const kept: RetrievedChunk[] = [];
	for (const chunk of chunks) {
		const candidate = [...kept, chunk];
		const candidateLen = formatContext(candidate).length;
		if (candidateLen <= maxChars) {
			kept.push(chunk);
			continue;
		}

		if (kept.length === 0) {
			const separatorOverhead = formatContext([chunk]).length - chunk.content.length;
			const contentBudget = Math.max(0, maxChars - separatorOverhead);
			const truncated = truncateChunkContent(chunk, contentBudget);
			const truncatedLen = formatContext([truncated]).length;
			if (truncatedLen > 0 && truncatedLen <= maxChars) {
				return {
					kept: [truncated],
					chars: truncatedLen,
					dropped: chunks.length - 1,
					truncatedLast: true,
				};
			}
			break;
		}
		break;
	}

	const chars = kept.length > 0 ? formatContext(kept).length : 0;
	return {
		kept,
		chars,
		dropped: chunks.length - kept.length,
		truncatedLast: false,
	};
}

export function estimateCitationBlockChars(linkCount: number): number {
	if (linkCount <= 0) return 0;
	return 420 + linkCount * 32;
}
