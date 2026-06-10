import { EditorPosition } from "obsidian";

export function advancePosition(pos: EditorPosition, text: string): EditorPosition {
	const lines = text.split("\n");
	if (lines.length === 1) {
		return { line: pos.line, ch: pos.ch + text.length };
	}
	return {
		line: pos.line + lines.length - 1,
		ch: lines[lines.length - 1]?.length ?? 0,
	};
}

export function findLineContaining(editor: { lineCount(): number; getLine(line: number): string }, text: string): number {
	const lineCount = editor.lineCount();
	for (let i = 0; i < lineCount; i++) {
		if (editor.getLine(i).includes(text)) {
			return i;
		}
	}
	return editor.lineCount() - 1;
}

export function findImageLinkAtPosition(line: string, cursorCh: number): string | null {
	const wikiRegex = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
	let match: RegExpExecArray | null;

	while ((match = wikiRegex.exec(line)) !== null) {
		const start = match.index;
		const end = start + match[0].length;
		if (cursorCh >= start && cursorCh <= end) {
			return match[0];
		}
	}

	const markdownRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
	while ((match = markdownRegex.exec(line)) !== null) {
		const start = match.index;
		const end = start + match[0].length;
		if (cursorCh >= start && cursorCh <= end) {
			return match[0];
		}
	}

	return null;
}
