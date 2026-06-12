const LATEX_COMMAND = /\\[a-zA-Z]+/;

function looksLikeLatex(content: string): boolean {
	const trimmed = content.trim();
	if (!trimmed) return false;
	if (LATEX_COMMAND.test(trimmed)) return true;
	if (/[\^_]/.test(trimmed) && /[=+\-*/<>]/.test(trimmed)) return true;
	return false;
}

function toBlockMath(body: string): string {
	return `$$\n${body.trim()}\n$$`;
}

function toInlineMath(body: string): string {
	return `$${body.trim()}$`;
}

/** Normalize common LLM LaTeX delimiters to Obsidian math syntax ($...$ / $$...$$). */
export function normalizeChatMathDelimiters(markdown: string): string {
	let text = markdown;

	text = text.replace(/```(?:latex|math)\s*\n([\s\S]*?)```/gi, (_, body: string) =>
		toBlockMath(body)
	);

	text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, body: string) => toBlockMath(body));
	text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, body: string) => toInlineMath(body));

	text = text.replace(/^\[\s*\n([\s\S]*?)\n\s*\]$/gm, (match, body: string) =>
		looksLikeLatex(body) ? toBlockMath(body) : match
	);

	text = text.replace(/^\[\s*([^\]\n]+)\s*\]$/gm, (match, body: string) =>
		looksLikeLatex(body) ? toBlockMath(body) : match
	);

	return text;
}
