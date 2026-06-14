import { TFile } from "obsidian";
import { RetrievedChunk } from "../services/ragService";
import { NoteContextPart } from "../types/chatContext";
import { buildWikiLink } from "./wikiLink";

export function collectContextWikiLinks(
	contextFiles: TFile[],
	notes: NoteContextPart[],
	ragChunks: RetrievedChunk[]
): string[] {
	const links = new Set<string>();
	for (const file of contextFiles) {
		links.add(buildWikiLink(file.path));
	}
	for (const note of notes) {
		links.add(buildWikiLink(note.path));
	}
	for (const chunk of ragChunks) {
		links.add(buildWikiLink(chunk.filePath, chunk.heading));
	}
	return [...links];
}

/** Injected into the system prompt when notes or RAG context is present. */
export function buildCitationSystemBlock(
	contextFiles: TFile[],
	notes: NoteContextPart[],
	ragChunks: RetrievedChunk[]
): string | null {
	const links = collectContextWikiLinks(contextFiles, notes, ragChunks);
	if (links.length === 0) return null;

	const linkList = links.map((link) => `- ${link}`).join("\n");
	return [
		"## Source citation (required in your reply)",
		"When your answer uses information from attached notes or RAG excerpts below, cite inline with Obsidian wiki links so the user can click to open the source in Obsidian.",
		"Use ONLY these exact link labels (copy verbatim):",
		linkList,
		"Rules:",
		"- Place the wiki link on the same line or immediately after the claim, e.g. \"FIFO 可能出现 Belady 异常 [[Course/OS#FIFO]].\"",
		"- Do NOT use numbered refs like [1], bare file paths, or vague phrases like \"see above\".",
		"- If multiple sources support one point, cite each with its [[wiki link]].",
	].join("\n");
}

/** Post-process assistant markdown: [1] → wiki link; append source list if model omitted links. */
export function enhanceAssistantCitations(
	markdown: string,
	contextFiles: TFile[],
	notes: NoteContextPart[],
	ragChunks: RetrievedChunk[],
	sourcesHeading: string
): string {
	let text = markdown.trimEnd();
	const sourceLinks = collectContextWikiLinks(contextFiles, notes, ragChunks);
	if (sourceLinks.length === 0) return text;

	if (ragChunks.length > 0) {
		text = text.replace(
			/\[(\d{1,2})\]/g,
			(match: string, numStr: string, offset: number, whole: string) => {
				const before = whole.charAt(offset - 1);
				const after = whole.charAt(offset + match.length);
				if (before === "[" || after === "]") return match;

				const idx = Number.parseInt(numStr, 10) - 1;
				if (idx < 0 || idx >= ragChunks.length) return match;
				const chunk = ragChunks[idx]!;
				return buildWikiLink(chunk.filePath, chunk.heading);
			}
		);
	}

	if (!/\[\[[^\]]+\]\]/.test(text)) {
		const lines = sourceLinks.map((link) => `- ${link}`).join("\n");
		text = `${text}\n\n---\n\n**${sourcesHeading}**\n${lines}`;
	}

	return text;
}
