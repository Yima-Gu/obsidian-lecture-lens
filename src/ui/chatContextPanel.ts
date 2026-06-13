import { setIcon } from "obsidian";
import { ChatContextSnapshot } from "../types/chatContext";
import { TranslationKey } from "../i18n/en";
import {
	clampPercent,
	estimateTokens,
	formatContextSize,
} from "../utils/contextBudget";

export interface ContextPanelControls {
	includeRag: boolean;
	includeNotes: boolean;
	onIncludeRagChange: (value: boolean) => void;
	onIncludeNotesChange: (value: boolean) => void;
}

export interface ContextPanelElements {
	panel: HTMLDetailsElement;
	summaryText: HTMLElement;
	bodyContent: HTMLElement;
}

type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

export function mountContextPanel(
	container: HTMLElement,
	tr: Translator,
	controls: ContextPanelControls,
	onToggle?: (open: boolean) => void
): ContextPanelElements {
	container.empty();

	const panel = container.createEl("details", {
		cls: "lecture-lens-chat-context-panel",
	});

	const summary = panel.createEl("summary", { cls: "lecture-lens-chat-context-summary" });
	const summaryIcon = summary.createEl("span", { cls: "lecture-lens-chat-context-summary-icon" });
	setIcon(summaryIcon, "layers");

	const summaryText = summary.createEl("span", { cls: "lecture-lens-chat-context-summary-text" });
	summaryText.setText(tr("chat.contextPanel.empty"));

	const body = panel.createEl("div", { cls: "lecture-lens-chat-context-body" });
	const toggles = body.createEl("div", { cls: "lecture-lens-chat-context-toggles" });
	renderToggle(
		toggles,
		tr("chat.contextPanel.includeNotes"),
		controls.includeNotes,
		controls.onIncludeNotesChange
	);
	renderToggle(
		toggles,
		tr("chat.contextPanel.includeRag"),
		controls.includeRag,
		controls.onIncludeRagChange
	);

	const bodyContent = body.createEl("div", { cls: "lecture-lens-chat-context-body-content" });
	bodyContent.createEl("p", {
		cls: "lecture-lens-chat-context-hint",
		text: tr("chat.contextPanel.hint"),
	});

	panel.addEventListener("toggle", () => {
		onToggle?.(panel.open);
	});

	return { panel, summaryText, bodyContent };
}

export function updateContextPanelSummary(
	summaryText: HTMLElement,
	snapshot: ChatContextSnapshot | null,
	tr: Translator
): void {
	if (!snapshot) {
		summaryText.setText(tr("chat.contextPanel.empty"));
		return;
	}
	summaryText.setText(formatContextSummary(snapshot, tr));
}

export function renderContextPanelBody(
	bodyContent: HTMLElement,
	snapshot: ChatContextSnapshot | null,
	tr: Translator
): void {
	bodyContent.empty();

	if (!snapshot) {
		bodyContent.createEl("p", {
			cls: "lecture-lens-chat-context-hint",
			text: tr("chat.contextPanel.hint"),
		});
		return;
	}

	renderBudgetBar(bodyContent, snapshot, tr);
	renderSegmentLegend(bodyContent, snapshot, tr);

	if (snapshot.historyParts.length > 0) {
		renderHistorySection(bodyContent, snapshot, tr);
	}

	if (snapshot.notes.length > 0) {
		renderNotesSection(bodyContent, snapshot, tr);
	} else if (snapshot.notesEnabled) {
		bodyContent.createEl("p", {
			cls: "lecture-lens-chat-context-empty-line",
			text: tr("chat.contextPanel.noNotes"),
		});
	}

	renderRagSection(bodyContent, snapshot, tr);
}

function formatContextSummary(
	snapshot: ChatContextSnapshot,
	tr: Translator
): string {
	const prefix = snapshot.isPreview
		? tr("chat.contextPanel.preview")
		: tr("chat.contextPanel.lastRequest");
	return tr("chat.contextPanel.summary", {
		prefix,
		used: formatContextSize(snapshot.totalChars),
		budget: formatContextSize(snapshot.budgetChars),
		tokens: estimateTokens(snapshot.totalChars),
		turns: snapshot.historyTurnsIncluded,
		notes: snapshot.notes.length,
		rag: snapshot.ragChunks.length,
	});
}

function renderToggle(
	parent: HTMLElement,
	label: string,
	checked: boolean,
	onChange: (value: boolean) => void
): void {
	const row = parent.createEl("label", { cls: "lecture-lens-chat-context-toggle" });
	const input = row.createEl("input", { type: "checkbox" });
	input.checked = checked;
	input.addEventListener("change", () => {
		onChange(input.checked);
	});
	row.createSpan({ text: label });
}

function renderBudgetBar(
	parent: HTMLElement,
	snapshot: ChatContextSnapshot,
	tr: Translator
): void {
	const section = parent.createEl("div", { cls: "lecture-lens-chat-context-section" });
	section.createEl("div", {
		cls: "lecture-lens-chat-context-section-title",
		text: tr("chat.contextPanel.budgetTitle"),
	});

	const bar = section.createEl("div", {
		cls: `lecture-lens-chat-context-budget-bar ${snapshot.budgetPercent > 90 ? "is-warning" : ""}`,
	});
	const fill = bar.createEl("div", { cls: "lecture-lens-chat-context-budget-fill" });

	const totalSegmentChars = snapshot.segments.reduce((sum, seg) => sum + seg.chars, 0) || 1;
	for (const segment of snapshot.segments) {
		const width = (segment.chars / totalSegmentChars) * Math.min(snapshot.budgetPercent, 100);
		if (width <= 0) continue;
		fill.createEl("span", {
			cls: "lecture-lens-chat-context-budget-segment",
			attr: {
				style: `width:${width.toFixed(2)}%;background:var(${segment.colorVar});`,
				title: tr(segment.labelKey),
			},
		});
	}

	section.createEl("div", {
		cls: "lecture-lens-chat-context-budget-meta",
		text: tr("chat.contextPanel.budgetMeta", {
			percent: clampPercent(snapshot.budgetPercent),
			chars: snapshot.totalChars.toLocaleString(),
			tokens: estimateTokens(snapshot.totalChars),
		}),
	});
}

function renderSegmentLegend(
	parent: HTMLElement,
	snapshot: ChatContextSnapshot,
	tr: Translator
): void {
	const legend = parent.createEl("div", { cls: "lecture-lens-chat-context-legend" });
	for (const segment of snapshot.segments) {
		const item = legend.createEl("span", { cls: "lecture-lens-chat-context-legend-item" });
		item.createEl("span", {
			cls: "lecture-lens-chat-context-legend-dot",
			attr: { style: `background:var(${segment.colorVar});` },
		});
		item.createSpan({
			text: `${tr(segment.labelKey)} · ${formatContextSize(segment.chars)}`,
		});
	}
}

function renderHistorySection(
	parent: HTMLElement,
	snapshot: ChatContextSnapshot,
	tr: Translator
): void {
	const section = parent.createEl("div", { cls: "lecture-lens-chat-context-section" });
	section.createEl("div", {
		cls: "lecture-lens-chat-context-section-title",
		text: tr("chat.contextPanel.historyTitle", {
			included: snapshot.historyTurnsIncluded,
			total: snapshot.historyTurnsTotal,
		}),
	});

	const list = section.createEl("div", { cls: "lecture-lens-chat-context-history-list" });
	for (const part of snapshot.historyParts) {
		const row = list.createEl("div", {
			cls: `lecture-lens-chat-context-history-item is-${part.role}`,
		});
		row.createSpan({
			cls: "lecture-lens-chat-context-history-role",
			text: part.role === "user" ? tr("chat.roleUser") : tr("chat.roleAi"),
		});
		row.createSpan({ cls: "lecture-lens-chat-context-history-preview", text: part.preview });
		row.createSpan({
			cls: "lecture-lens-chat-context-history-meta",
			text: formatContextSize(part.chars),
		});
	}
}

function renderNotesSection(
	parent: HTMLElement,
	snapshot: ChatContextSnapshot,
	tr: Translator
): void {
	const section = parent.createEl("div", { cls: "lecture-lens-chat-context-section" });
	section.createEl("div", {
		cls: "lecture-lens-chat-context-section-title",
		text: tr("chat.contextPanel.notesTitle", { count: snapshot.notes.length }),
	});

	const list = section.createEl("div", { cls: "lecture-lens-chat-context-note-list" });
	for (const note of snapshot.notes) {
		const row = list.createEl("div", { cls: "lecture-lens-chat-context-note-item" });
		const meta = row.createEl("div", { cls: "lecture-lens-chat-context-note-meta" });
		meta.createSpan({ cls: "lecture-lens-chat-context-note-name", text: note.basename });
		meta.createSpan({
			cls: "lecture-lens-chat-context-note-size",
			text: tr("chat.contextPanel.noteSize", {
				used: formatContextSize(note.usedChars),
				total: formatContextSize(note.originalChars),
			}),
		});

		const bar = row.createEl("div", { cls: "lecture-lens-chat-context-note-bar" });
		const usedPercent =
			note.originalChars > 0 ? clampPercent((note.usedChars / note.originalChars) * 100) : 100;
		bar.createEl("span", {
			cls: `lecture-lens-chat-context-note-bar-fill ${note.truncated ? "is-truncated" : ""}`,
			attr: { style: `width:${usedPercent}%;` },
		});

		if (note.truncated) {
			row.createSpan({
				cls: "lecture-lens-chat-context-note-truncated",
				text: tr("chat.contextPanel.noteTruncated"),
			});
		}
	}
}

function renderRagSection(
	parent: HTMLElement,
	snapshot: ChatContextSnapshot,
	tr: Translator
): void {
	const section = parent.createEl("div", { cls: "lecture-lens-chat-context-section" });
	section.createEl("div", {
		cls: "lecture-lens-chat-context-section-title",
		text: tr("chat.contextPanel.ragTitle", { count: snapshot.ragChunks.length }),
	});

	if (!snapshot.ragEnabled) {
		section.createEl("p", {
			cls: "lecture-lens-chat-context-empty-line",
			text: tr("chat.contextPanel.ragDisabled"),
		});
		return;
	}

	if (snapshot.ragIssue) {
		section.createEl("p", {
			cls: "lecture-lens-chat-context-rag-issue",
			text: ragIssueLabel(snapshot.ragIssue, tr),
		});
	}

	if (snapshot.ragFilteredCount > 0) {
		section.createEl("p", {
			cls: "lecture-lens-chat-context-rag-filtered",
			text: tr("chat.contextPanel.ragFiltered", { count: snapshot.ragFilteredCount }),
		});
	}

	if (snapshot.ragChunks.length === 0) {
		if (!snapshot.ragIssue) {
			section.createEl("p", {
				cls: "lecture-lens-chat-context-empty-line",
				text: tr("chat.contextPanel.ragEmpty"),
			});
		}
		return;
	}

	const list = section.createEl("div", { cls: "lecture-lens-chat-context-rag-list" });
	for (const chunk of snapshot.ragChunks) {
		const row = list.createEl("div", { cls: "lecture-lens-chat-context-rag-item" });
		const scoreRow = row.createEl("div", { cls: "lecture-lens-chat-context-rag-score-row" });
		scoreRow.createSpan({
			cls: "lecture-lens-chat-context-rag-score-label",
			text: tr("chat.contextPanel.ragScore", {
				score: clampPercent(chunk.score * 100),
			}),
		});
		const scoreBar = scoreRow.createEl("div", { cls: "lecture-lens-chat-context-rag-score-bar" });
		scoreBar.createEl("span", {
			cls: "lecture-lens-chat-context-rag-score-fill",
			attr: { style: `width:${clampPercent(chunk.score * 100)}%;` },
		});

		row.createEl("div", {
			cls: "lecture-lens-chat-context-rag-source",
			text: `${chunk.filePath} · ${chunk.heading}`,
		});
		row.createEl("div", {
			cls: "lecture-lens-chat-context-rag-preview",
			text: previewText(chunk.content, 120),
		});
	}
}

function previewText(text: string, maxLen: number): string {
	const trimmed = text.trim().replace(/\s+/g, " ");
	if (!trimmed) return "…";
	return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}…` : trimmed;
}

function ragIssueLabel(
	issue: NonNullable<ChatContextSnapshot["ragIssue"]>,
	tr: Translator
): string {
	switch (issue) {
		case "no_index":
			return tr("chat.ragRetrieveNoIndex");
		case "signature_mismatch":
			return tr("chat.ragRetrieveStale");
		case "folder_mismatch":
			return tr("chat.ragRetrieveFolderMismatch");
		case "empty_query":
			return tr("chat.contextPanel.ragAwaitQuery");
		default:
			return "";
	}
}
