import { Component, MarkdownRenderer } from "obsidian";

export async function renderChatMarkdown(
	component: Component,
	container: HTMLElement,
	markdown: string,
	sourcePath: string
): Promise<void> {
	container.empty();
	container.addClass("markdown-rendered");
	await MarkdownRenderer.renderMarkdown(markdown, container, sourcePath, component);
}

export function debounceRender(
	component: Component,
	container: HTMLElement,
	markdown: string,
	sourcePath: string,
	timerRef: { id: number | null },
	delayMs = 200
): void {
	if (timerRef.id !== null) {
		window.clearTimeout(timerRef.id);
	}
	timerRef.id = window.setTimeout(() => {
		timerRef.id = null;
		void renderChatMarkdown(component, container, markdown, sourcePath);
	}, delayMs);
}
