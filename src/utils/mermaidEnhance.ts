import { App, Component } from "obsidian";
import { MermaidZoomModal } from "../ui/mermaidZoomModal";

export interface MermaidEnhanceLabels {
	clickToZoom: string;
	scrollHint: string;
	zoomTitle: string;
	zoomIn: string;
	zoomOut: string;
	zoomReset: string;
	zoomHint: string;
}

const ENHANCED_ATTR = "data-lecture-lens-mermaid-enhanced";

function findMermaidDiagrams(container: HTMLElement): HTMLElement[] {
	return Array.from(
		container.querySelectorAll<HTMLElement>(
			".mermaid, pre.mermaid, div.block-language-mermaid"
		)
	).filter((diagram) => diagram.querySelector("svg") || diagram.classList.contains("mermaid"));
}

function wrapDiagram(
	app: App,
	component: Component,
	diagram: HTMLElement,
	labels: MermaidEnhanceLabels
): void {
	if (diagram.getAttribute(ENHANCED_ATTR) === "true") return;
	if (diagram.closest(".lecture-lens-mermaid-shell")) return;

	const shell = document.createElement("div");
	shell.className = "lecture-lens-mermaid-shell";

	const scroll = document.createElement("div");
	scroll.className = "lecture-lens-mermaid-scroll";
	scroll.setAttribute("role", "button");
	scroll.setAttribute("tabindex", "0");
	scroll.setAttribute("aria-label", labels.clickToZoom);

	const hint = document.createElement("div");
	hint.className = "lecture-lens-mermaid-hint";
	hint.textContent = `${labels.clickToZoom} · ${labels.scrollHint}`;

	const parent = diagram.parentElement;
	if (!parent) return;

	parent.insertBefore(shell, diagram);
	scroll.appendChild(diagram);
	shell.appendChild(scroll);
	shell.appendChild(hint);

	diagram.setAttribute(ENHANCED_ATTR, "true");

	const openZoom = () => {
		new MermaidZoomModal(app, diagram.cloneNode(true) as HTMLElement, labels).open();
	};

	component.registerDomEvent(scroll, "click", (event) => {
		event.preventDefault();
		openZoom();
	});
	component.registerDomEvent(scroll, "keydown", (event) => {
		if (event.key !== "Enter" && event.key !== " ") return;
		event.preventDefault();
		openZoom();
	});
}

export function enhanceChatMermaid(
	app: App,
	component: Component,
	container: HTMLElement,
	labels: MermaidEnhanceLabels
): () => void {
	const process = () => {
		for (const diagram of findMermaidDiagrams(container)) {
			wrapDiagram(app, component, diagram, labels);
		}
	};

	process();

	const observer = new MutationObserver(() => process());
	observer.observe(container, { childList: true, subtree: true });
	const cleanup = () => observer.disconnect();
	component.register(cleanup);
	return cleanup;
}
