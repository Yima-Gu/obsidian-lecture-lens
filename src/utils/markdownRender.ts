import { App, Component, MarkdownRenderer } from "obsidian";
import { enhanceChatMermaid, MermaidEnhanceLabels } from "./mermaidEnhance";
import { normalizeChatMathDelimiters } from "./normalizeChatMath";

export interface ChatMarkdownRenderOptions {
	mermaidLabels?: MermaidEnhanceLabels;
}

const mermaidCleanupByContainer = new WeakMap<HTMLElement, () => void>();

function wrapChatTables(container: HTMLElement): void {
	for (const table of Array.from(container.querySelectorAll("table"))) {
		if (table.closest(".lecture-lens-table-scroll")) continue;
		const parent = table.parentElement;
		if (!parent) continue;

		const scroll = document.createElement("div");
		scroll.className = "lecture-lens-table-scroll";
		parent.insertBefore(scroll, table);
		scroll.appendChild(table);
	}
}

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
	wrapChatTables(container);

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

export interface StreamingMarkdownRenderer {
	update(markdown: string): void;
	flush(): Promise<void>;
	dispose(): void;
}

/** Throttled markdown renderer for SSE streams (not debounce — debounce never fires until idle). */
export function createStreamingMarkdownRenderer(
	app: App,
	component: Component,
	container: HTMLElement,
	sourcePath: string,
	options?: ChatMarkdownRenderOptions,
	throttleMs = 120,
	onRendered?: () => void
): StreamingMarkdownRenderer {
	let markdown = "";
	let lastRenderAt = 0;
	let throttleTimer: number | null = null;
	let renderChain = Promise.resolve();
	let disposed = false;

	const runRender = (): void => {
		if (disposed) return;
		lastRenderAt = Date.now();
		renderChain = renderChain.then(async () => {
			if (disposed) return;
			const text = markdown;
			if (!text) return;
			await renderChatMarkdown(app, component, container, text, sourcePath, options);
			onRendered?.();
			if (!disposed && markdown !== text) {
				schedule(false);
			}
		});
	};

	const schedule = (force: boolean): void => {
		if (disposed) return;
		if (force) {
			if (throttleTimer !== null) {
				window.clearTimeout(throttleTimer);
				throttleTimer = null;
			}
			runRender();
			return;
		}
		const now = Date.now();
		if (now - lastRenderAt >= throttleMs) {
			runRender();
			return;
		}
		if (throttleTimer === null) {
			throttleTimer = window.setTimeout(() => {
				throttleTimer = null;
				runRender();
			}, throttleMs - (now - lastRenderAt));
		}
	};

	return {
		update(next: string) {
			markdown = next;
			schedule(false);
		},
		async flush() {
			schedule(true);
			await renderChain;
		},
		dispose() {
			disposed = true;
			if (throttleTimer !== null) {
				window.clearTimeout(throttleTimer);
				throttleTimer = null;
			}
		},
	};
}
