import { RetrievedChunk } from "../services/ragService";
import { NoteContextPart } from "../types/chatContext";
import { buildWikiLink, stripMarkdownExtension } from "./wikiLink";

const CITATION_FOOTER_RE =
	/\n\n---\n\n\*\*[^*\n]+\*\*\s*\n(?:- \[\[[^\]]+\]\]\s*\n?)+$/u;

export function collectAllowedWikiLinks(
	notes: NoteContextPart[],
	ragChunks: RetrievedChunk[]
): Set<string> {
	const links = new Set<string>();
	for (const note of notes) {
		links.add(buildWikiLink(note.path));
	}
	for (const chunk of ragChunks) {
		links.add(buildWikiLink(chunk.filePath, chunk.heading));
	}
	return links;
}

/** @deprecated Prefer collectAllowedWikiLinks — context file paths are covered by note parts. */
export function collectContextWikiLinks(
	contextFiles: Array<{ path: string }>,
	notes: NoteContextPart[],
	ragChunks: RetrievedChunk[]
): string[] {
	const links = collectAllowedWikiLinks(notes, ragChunks);
	for (const file of contextFiles) {
		links.add(buildWikiLink(file.path));
	}
	return [...links];
}

function wikiLinkMatchesAllowed(rawPath: string, heading: string | undefined, allowed: Set<string>): boolean {
	const withHeading = buildWikiLink(rawPath, heading);
	if (allowed.has(withHeading)) return true;
	if (heading) {
		return allowed.has(buildWikiLink(rawPath));
	}
	return false;
}

/** Removes source footer blocks (auto-appended or copied from earlier turns). */
export function stripCitationFooter(markdown: string): string {
	return markdown.replace(CITATION_FOOTER_RE, "").trimEnd();
}

/** Drop wiki links that are not part of the current request context. */
export function sanitizeWikiLinksInMarkdown(
	markdown: string,
	allowedLinks: Set<string>
): string {
	if (!markdown.includes("[[")) return markdown;

	return markdown.replace(
		/\[\[([^\]|]+)(?:\|([^\]]+))?(?:#([^\]]+))?\]\]/g,
		(match, rawPath: string, alias: string | undefined, heading: string | undefined) => {
			if (wikiLinkMatchesAllowed(rawPath, heading, allowedLinks)) {
				return match;
			}
			const display =
				alias?.trim() ||
				stripMarkdownExtension(rawPath).split("/").pop() ||
				rawPath;
			return display;
		}
	);
}

/** Injected into the system prompt when notes or RAG context is present. */
export function buildCitationSystemBlock(
	notes: NoteContextPart[],
	ragChunks: RetrievedChunk[]
): string | null {
	const links = [...collectAllowedWikiLinks(notes, ragChunks)];
	if (links.length === 0) return null;

	const linkList = links.map((link) => `- ${link}`).join("\n");
	return [
		"## Source citation (required in your reply)",
		"When your answer uses information from attached notes or RAG excerpts below, cite inline with Obsidian wiki links so the user can click to open the source in Obsidian.",
		"Use ONLY these exact link labels from the current message context (copy verbatim):",
		linkList,
		"Rules:",
		"- Cite ONLY sources listed above for this request. Do not cite notes from earlier conversation turns unless they appear in the list above.",
		"- Place the wiki link on the same line or immediately after the claim, e.g. \"FIFO 可能出现 Belady 异常 [[Course/OS#FIFO]].\"",
		"- Do NOT use numbered refs like [1], bare file paths, or vague phrases like \"see above\".",
		"- If multiple sources support one point, cite each with its [[wiki link]].",
	].join("\n");
}

function responseHasAllowedCitation(markdown: string, allowedLinks: Set<string>): boolean {
	if (allowedLinks.size === 0 || !markdown.includes("[[")) return false;
	let found = false;
	const re = /\[\[([^\]|]+)(?:\|[^\]]+)?(?:#([^\]]+))?\]\]/g;
	for (const match of markdown.matchAll(re)) {
		if (wikiLinkMatchesAllowed(match[1]!, match[2], allowedLinks)) {
			found = true;
			break;
		}
	}
	return found;
}

/** Post-process assistant markdown: validate links, map [1] refs, append sources when needed. */
export function enhanceAssistantCitations(
	markdown: string,
	notes: NoteContextPart[],
	ragChunks: RetrievedChunk[],
	sourcesHeading: string
): string {
	const allowedLinks = collectAllowedWikiLinks(notes, ragChunks);
	let text = stripCitationFooter(markdown.trimEnd());

	if (allowedLinks.size === 0) {
		return sanitizeWikiLinksInMarkdown(text, allowedLinks);
	}

	text = sanitizeWikiLinksInMarkdown(text, allowedLinks);

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

	if (!responseHasAllowedCitation(text, allowedLinks)) {
		const lines = [...allowedLinks].map((link) => `- ${link}`).join("\n");
		text = `${text}\n\n---\n\n**${sourcesHeading}**\n${lines}`;
	}

	return text;
}

/** Prepare stored assistant turns before sending them back to the model. */
export function sanitizeAssistantHistoryContent(
	content: string,
	allowedLinks: Set<string>
): string {
	let text = stripCitationFooter(content);
	text = sanitizeWikiLinksInMarkdown(text, allowedLinks);
	return text;
}
