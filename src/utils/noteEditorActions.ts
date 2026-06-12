import { App, Editor, MarkdownView, WorkspaceLeaf } from "obsidian";
import { CHAT_VIEW_TYPE } from "../constants";

export type NoteInsertMode = "cursor" | "end" | "selection";

export interface ActiveMarkdownEditor {
	editor: Editor;
	view: MarkdownView;
}

export interface SearchReplaceEdit {
	search: string;
	replace: string;
}

function isChatLeaf(leaf: WorkspaceLeaf): boolean {
	return leaf.view.getViewType() === CHAT_VIEW_TYPE;
}

function toActiveEditor(view: MarkdownView): ActiveMarkdownEditor | null {
	if (!view.file || view.file.extension !== "md") return null;
	return { editor: view.editor, view };
}

function findMarkdownEditorByPath(app: App, path: string): ActiveMarkdownEditor | null {
	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		const view = leaf.view;
		if (!(view instanceof MarkdownView) || view.file?.path !== path) continue;
		const active = toActiveEditor(view);
		if (active) return active;
	}
	return null;
}

function findBestMarkdownEditor(app: App): ActiveMarkdownEditor | null {
	const mdLeaves = app.workspace.getLeavesOfType("markdown");
	const focusedLeaf = app.workspace.getMostRecentLeaf();
	let fallback: ActiveMarkdownEditor | null = null;

	for (const leaf of mdLeaves) {
		if (!(leaf.view instanceof MarkdownView)) continue;
		const active = toActiveEditor(leaf.view);
		if (!active) continue;

		fallback = active;

		// Chat sidebar focused: use the markdown pane the user was editing.
		if (focusedLeaf && isChatLeaf(focusedLeaf) && leaf !== focusedLeaf) {
			return active;
		}

		if (leaf === focusedLeaf) {
			return active;
		}
	}

	return fallback;
}

export function getActiveMarkdownEditor(
	app: App,
	preferredPath?: string | null
): ActiveMarkdownEditor | null {
	if (preferredPath) {
		const byPath = findMarkdownEditorByPath(app, preferredPath);
		if (byPath) return byPath;
	}

	const activeView = app.workspace.getActiveViewOfType(MarkdownView);
	if (activeView) {
		const active = toActiveEditor(activeView);
		if (active) return active;
	}

	const activeFile = app.workspace.getActiveFile();
	if (activeFile?.extension === "md") {
		const byActiveFile = findMarkdownEditorByPath(app, activeFile.path);
		if (byActiveFile) return byActiveFile;
	}

	return findBestMarkdownEditor(app);
}

/** Prefer the note the user is chatting about when the chat sidebar has focus. */
export function resolveTargetMarkdownPath(app: App, lastMarkdownPath?: string | null): string | null {
	if (lastMarkdownPath) {
		const byLast = findMarkdownEditorByPath(app, lastMarkdownPath);
		if (byLast) return lastMarkdownPath;
	}

	const activeView = app.workspace.getActiveViewOfType(MarkdownView);
	if (activeView?.file?.extension === "md") return activeView.file.path;

	const activeFile = app.workspace.getActiveFile();
	if (activeFile?.extension === "md") return activeFile.path;

	for (const leaf of app.workspace.getLeavesOfType("markdown")) {
		const view = leaf.view;
		if (view instanceof MarkdownView && view.file?.extension === "md") {
			return view.file.path;
		}
	}

	return null;
}

/** Prefer fenced markdown blocks when the model wraps insertable content. */
export function extractMarkdownForInsert(content: string): string {
	const markdownFence = content.match(/```(?:markdown|md)\n([\s\S]*?)```/i);
	if (markdownFence?.[1]?.trim()) return markdownFence[1].trim();

	const anyFence = content.match(/```[^\n]*\n([\s\S]*?)```/);
	if (anyFence?.[1]?.trim()) return anyFence[1].trim();

	return content.trim();
}

export function parseSearchReplaceEdits(content: string): SearchReplaceEdit[] {
	const edits: SearchReplaceEdit[] = [];
	const blockRegex =
		/<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>>>>> REPLACE/g;

	for (const match of content.matchAll(blockRegex)) {
		const search = match[1];
		const replace = match[2];
		if (search === undefined || replace === undefined) continue;
		edits.push({ search, replace });
	}

	return edits;
}

export function applySearchReplaceEdits(editor: Editor, content: string): number {
	const edits = parseSearchReplaceEdits(content);
	if (edits.length === 0) return 0;

	let noteText = editor.getValue();
	let applied = 0;

	for (const edit of edits) {
		const index = noteText.indexOf(edit.search);
		if (index === -1) continue;
		noteText =
			noteText.slice(0, index) + edit.replace + noteText.slice(index + edit.search.length);
		applied++;
	}

	if (applied > 0) {
		editor.setValue(noteText);
	}

	return applied;
}

function prefixForCursorInsert(editor: Editor, cursor: { line: number; ch: number }): string {
	if (editor.lineCount() === 1 && editor.getLine(0).length === 0) return "";
	if (cursor.line === 0 && cursor.ch === 0) return "";
	const lineText = editor.getLine(cursor.line);
	if (cursor.ch === 0) return "\n\n";
	if (lineText.length > 0) return "\n\n";
	return "\n\n";
}

export function insertIntoNote(
	app: App,
	content: string,
	mode: NoteInsertMode,
	preferredPath?: string | null
): boolean {
	const active = getActiveMarkdownEditor(app, preferredPath);
	if (!active) return false;

	const markdown = extractMarkdownForInsert(content);
	if (!markdown) return false;

	const { editor, view } = active;

	switch (mode) {
		case "cursor": {
			const cursor = editor.getCursor();
			const insertion = `${prefixForCursorInsert(editor, cursor)}${markdown}\n`;
			editor.replaceRange(insertion, cursor);
			break;
		}
		case "end": {
			const lastLine = editor.lastLine();
			const lastCh = editor.getLine(lastLine).length;
			editor.replaceRange(`\n\n${markdown}\n`, { line: lastLine, ch: lastCh });
			break;
		}
		case "selection": {
			app.workspace.setActiveLeaf(view.leaf, { focus: false });
			if (!editor.getSelection()) return false;
			editor.replaceSelection(markdown);
			break;
		}
	}

	return true;
}

export function applyAssistantContentToNote(
	app: App,
	content: string,
	preferredPath?: string | null
): "patch" | "selection" | "cursor" | null {
	const active = getActiveMarkdownEditor(app, preferredPath);
	if (!active) return null;

	const patchCount = applySearchReplaceEdits(active.editor, content);
	if (patchCount > 0) return "patch";

	const markdown = extractMarkdownForInsert(content);
	if (!markdown) return null;

	app.workspace.setActiveLeaf(active.view.leaf, { focus: false });

	if (active.editor.getSelection()) {
		active.editor.replaceSelection(markdown);
		return "selection";
	}

	const cursor = active.editor.getCursor();
	const insertion = `${prefixForCursorInsert(active.editor, cursor)}${markdown}\n`;
	active.editor.replaceRange(insertion, cursor);
	return "cursor";
}
