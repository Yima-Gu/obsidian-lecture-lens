import { App, Plugin, TFile } from "obsidian";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { PdfPageText } from "../types/pdfNotes";

let workerConfigured = false;

export function configurePdfWorker(plugin: Plugin): void {
	if (workerConfigured) return;
	const workerPath = plugin.app.vault.adapter.getResourcePath(
		`${plugin.manifest.dir}/pdf.worker.min.mjs`
	);
	pdfjsLib.GlobalWorkerOptions.workerSrc = workerPath;
	workerConfigured = true;
}

const MAX_CHARS_PER_PAGE = 2000;

export async function extractPdfPageTexts(
	app: App,
	file: TFile,
	maxPages: number
): Promise<{ pages: PdfPageText[]; totalPages: number; truncated: boolean }> {
	const data = await app.vault.readBinary(file);
	const loadingTask = pdfjsLib.getDocument({ data });
	const pdf = await loadingTask.promise;
	const totalPages = pdf.numPages;
	const limit = Math.min(totalPages, Math.max(1, maxPages));
	const pages: PdfPageText[] = [];

	for (let pageNumber = 1; pageNumber <= limit; pageNumber++) {
		const page = await pdf.getPage(pageNumber);
		const content = await page.getTextContent();
		let text = content.items
			.map((item) => ("str" in item ? item.str : ""))
			.join(" ")
			.replace(/\s+/g, " ")
			.trim();
		if (text.length > MAX_CHARS_PER_PAGE) {
			text = `${text.slice(0, MAX_CHARS_PER_PAGE)}…`;
		}
		pages.push({ pageNumber, text });
	}

	await pdf.destroy();
	return { pages, totalPages, truncated: totalPages > limit };
}
