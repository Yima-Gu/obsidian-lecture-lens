import { App, setIcon } from "obsidian";
import { ChatContextSnapshot } from "../types/chatContext";
import { TranslationKey } from "../i18n/en";
import { clampPercent, estimateTokens, formatContextSize } from "../utils/contextBudget";
import { appendWikiLinkEl } from "../utils/wikiLink";

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

	summary.createEl("span", { cls: "lecture-lens-chat-context-summary-chevron" });

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
	tr: Translator,
	app: App
): void {
	bodyContent.empty();

	if (!snapshot) {
		bodyContent.createEl("p", {
			cls: "lecture-lens-chat-context-hint",
			text: tr("chat.contextPanel.hint"),
		});
		return;
	}

	renderBudgetRow(bodyContent, snapshot, tr);

	if (snapshot.notes.length > 0) {
		renderSourcePills(bodyContent, snapshot.notes.map((note) => ({
			path: note.path,
			truncated: note.truncated,
		})), tr, app, "notes");
	}

	renderRagCompact(bodyContent, snapshot, tr, app);
	renderTrimHints(bodyContent, snapshot, tr);
}

function formatContextSummary(snapshot: ChatContextSnapshot, tr: Translator): string {
	const prefix = snapshot.isPreview
		? tr("chat.contextPanel.preview")
		: tr("chat.contextPanel.lastRequest");
	return tr("chat.contextPanel.summary", {
		prefix,
		percent: clampPercent(snapshot.budgetPercent),
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
	const row = parent.createEl("label", {
		cls: `lecture-lens-chat-context-toggle ${checked ? "is-on" : ""}`,
	});
	const input = row.createEl("input", { type: "checkbox" });
	input.checked = checked;
	input.addEventListener("change", () => {
		row.toggleClass("is-on", input.checked);
		onChange(input.checked);
	});
	row.createSpan({ cls: "lecture-lens-chat-context-toggle-label", text: label });
}

function renderBudgetRow(
	parent: HTMLElement,
	snapshot: ChatContextSnapshot,
	tr: Translator
): void {
	const row = parent.createEl("div", { cls: "lecture-lens-chat-context-budget-row" });
	const meta = row.createEl("div", { cls: "lecture-lens-chat-context-budget-head" });
	meta.createSpan({
		cls: "lecture-lens-chat-context-budget-label",
		text: tr("chat.contextPanel.budgetTitle"),
	});
	meta.createSpan({
		cls: "lecture-lens-chat-context-budget-percent",
		text: tr("chat.contextPanel.budgetPercent", {
			percent: clampPercent(snapshot.budgetPercent),
		}),
	});

	const bar = row.createEl("div", {
		cls: `lecture-lens-chat-context-budget-bar ${
			snapshot.budgetStatus === "over"
				? "is-over"
				: snapshot.budgetStatus === "tight"
					? "is-warning"
					: ""
		}`,
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

	row.createSpan({
		cls: "lecture-lens-chat-context-stat-line",
		text: tr("chat.contextPanel.budgetMeta", {
			percent: clampPercent(snapshot.budgetPercent),
			chars: formatContextSize(snapshot.totalChars),
			tokens: estimateTokens(snapshot.totalChars),
		}),
	});

	if (snapshot.budgetStatus === "over") {
		row.createSpan({
			cls: "lecture-lens-chat-context-trim-hint is-over",
			text: tr("chat.contextPanel.budgetOver"),
		});
	} else if (snapshot.budgetStatus === "tight") {
		row.createSpan({
			cls: "lecture-lens-chat-context-trim-hint is-warning",
			text: tr("chat.contextPanel.budgetTight"),
		});
	}

	if (snapshot.historyTurnsIncluded > 0 || snapshot.historyTurnsTotal > 0) {
		row.createSpan({
			cls: "lecture-lens-chat-context-stat-line",
			text: tr("chat.contextPanel.historyCompact", {
				included: snapshot.historyTurnsIncluded,
				total: snapshot.historyTurnsTotal,
			}),
		});
	}

	if (snapshot.historyTurnsOmittedByBudget > 0) {
		row.createSpan({
			cls: "lecture-lens-chat-context-trim-hint",
			text: tr("chat.contextPanel.historyOmittedBudget", {
				count: snapshot.historyTurnsOmittedByBudget,
			}),
		});
	}

	if (snapshot.historyTurnsOmittedByTurnLimit > 0) {
		row.createSpan({
			cls: "lecture-lens-chat-context-trim-hint",
			text: tr("chat.contextPanel.historyOmittedTurnLimit", {
				count: snapshot.historyTurnsOmittedByTurnLimit,
			}),
		});
	}
}

function renderSourcePills(
	parent: HTMLElement,
	items: Array<{ path: string; heading?: string; truncated?: boolean }>,
	tr: Translator,
	app: App,
	kind: "notes" | "rag"
): void {
	const group = parent.createEl("div", { cls: "lecture-lens-chat-context-source-group" });
	group.createSpan({
		cls: "lecture-lens-chat-context-source-label",
		text:
			kind === "notes"
				? tr("chat.contextPanel.notesTitle", { count: items.length })
				: tr("chat.contextPanel.ragTitle", { count: items.length }),
	});

	const pills = group.createEl("div", { cls: "lecture-lens-chat-context-pills" });
	for (const item of items) {
		const pill = pills.createEl("span", { cls: "lecture-lens-chat-context-pill" });
		appendWikiLinkEl(pill, app, item.path, item.heading);
		if (item.truncated) {
			pill.createSpan({
				cls: "lecture-lens-chat-context-pill-tag",
				attr: { title: tr("chat.contextPanel.noteTruncated") },
				text: "…",
			});
		}
	}
}

function renderRagCompact(
	parent: HTMLElement,
	snapshot: ChatContextSnapshot,
	tr: Translator,
	app: App
): void {
	if (!snapshot.ragEnabled) return;

	if (snapshot.ragIssue) {
		parent.createEl("p", {
			cls: "lecture-lens-chat-context-status",
			text: ragIssueLabel(snapshot.ragIssue, tr),
		});
		return;
	}

	if (snapshot.ragChunks.length === 0) {
		parent.createEl("p", {
			cls: "lecture-lens-chat-context-status",
			text: tr("chat.contextPanel.ragAwaitQuery"),
		});
		return;
	}

	renderSourcePills(
		parent,
		snapshot.ragChunks.map((chunk) => ({
			path: chunk.filePath,
			heading: chunk.heading,
		})),
		tr,
		app,
		"rag"
	);
}

function renderTrimHints(
	parent: HTMLElement,
	snapshot: ChatContextSnapshot,
	tr: Translator
): void {
	const hints: string[] = [];

	if (snapshot.ragFilteredCount > 0) {
		hints.push(
			tr("chat.contextPanel.ragFiltered", { count: snapshot.ragFilteredCount })
		);
	}
	if (snapshot.ragBudgetDropped > 0) {
		hints.push(
			tr("chat.contextPanel.ragBudgetDropped", { count: snapshot.ragBudgetDropped })
		);
	}
	if (snapshot.ragTruncatedLast) {
		hints.push(tr("chat.contextPanel.ragBudgetTruncated"));
	}

	if (hints.length === 0) return;

	const group = parent.createEl("div", { cls: "lecture-lens-chat-context-trim-group" });
	for (const hint of hints) {
		group.createSpan({ cls: "lecture-lens-chat-context-trim-hint", text: hint });
	}
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
