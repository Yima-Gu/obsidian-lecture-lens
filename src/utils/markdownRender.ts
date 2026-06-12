import { App, Component, MarkdownRenderer } from "obsidian";
import { enhanceChatMermaid, MermaidEnhanceLabels } from "./mermaidEnhance";
import { normalizeChatMathDelimiters } from "./normalizeChatMath";

export interface ChatMarkdownRenderOptions {
	mermaidLabels?: MermaidEnhanceLabels;
}

const mermaidCleanupByContainer = new WeakMap<HTMLElement, () => void>();

export async function renderChatMarkdown(
	app: App,
	component: Component,
	container: HTMLElement,
	markdown: string,
	sourcePath: string,
	options?: ChatMarkdownRenderOptions
): Promise<void> {
	mermaidCleanupByContainer.get(container)?.();
	container.empty();
	container.addClass("markdown-rendered");
	const normalizedMarkdown = normalizeChatMathDelimiters(markdown);
	await MarkdownRenderer.render(app, normalizedMarkdown, container, sourcePath, component);

	if (options?.mermaidLabels) {
		const cleanup = enhanceChatMermaid(app, component, container, options.mermaidLabels);
		mermaidCleanupByContainer.set(container, cleanup);
	}
}

export function debounceRender(
	app: App,
	component: Component,
	container: HTMLElement,
	markdown: string,
	sourcePath: string,
	timerRef: { id: number | null },
	delayMs = 200,
	options?: ChatMarkdownRenderOptions
): void {
	if (timerRef.id !== null) {
		window.clearTimeout(timerRef.id);
	}
	timerRef.id = window.setTimeout(() => {
		timerRef.id = null;
		void renderChatMarkdown(app, component, container, markdown, sourcePath, options);
	}, delayMs);
}
