import { App, Component, MarkdownRenderer } from "obsidian";

export async function renderChatMarkdown(
	app: App,
	component: Component,
	container: HTMLElement,
	markdown: string,
	sourcePath: string
): Promise<void> {
	container.empty();
	container.addClass("markdown-rendered");
	await MarkdownRenderer.render(app, markdown, container, sourcePath, component);
}

export function debounceRender(
	app: App,
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
		void renderChatMarkdown(app, component, container, markdown, sourcePath);
	}, delayMs);
}
