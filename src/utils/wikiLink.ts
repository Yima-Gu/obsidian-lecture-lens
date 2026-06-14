import { App } from "obsidian";

export function stripMarkdownExtension(filePath: string): string {
	return filePath.replace(/\.md$/i, "");
}

/** Obsidian wiki link label, e.g. [[Course/Note#Section]] */
export function buildWikiLink(filePath: string, heading?: string | null): string {
	const base = stripMarkdownExtension(filePath);
	const section = heading?.trim();
	if (section && section !== "Overview") {
		return `[[${base}#${section}]]`;
	}
	return `[[${base}]]`;
}

/** Argument for workspace.openLinkText */
export function buildWikiLinkOpenText(filePath: string, heading?: string | null): string {
	const base = stripMarkdownExtension(filePath);
	const section = heading?.trim();
	if (section && section !== "Overview") {
		return `${base}#${section}`;
	}
	return base;
}

export function openWikiLink(app: App, filePath: string, heading?: string | null): void {
	void app.workspace.openLinkText(buildWikiLinkOpenText(filePath, heading), "", false);
}

export function appendWikiLinkEl(
	parent: HTMLElement,
	app: App,
	filePath: string,
	heading?: string | null
): HTMLAnchorElement {
	const link = parent.createEl("a", {
		cls: "lecture-lens-wiki-link internal-link",
		text: buildWikiLink(filePath, heading),
		href: "#",
	});
	link.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		openWikiLink(app, filePath, heading);
	});
	return link;
}
