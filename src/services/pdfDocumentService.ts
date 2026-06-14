import { App, Plugin, requestUrl, TFile } from "obsidian";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { PdfPageText } from "../types/pdfNotes";

const PDFJS_VERSION = "4.10.38";
const PDF_WORKER_FILE = "pdf.worker.min.mjs";
const PDF_WORKER_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

let workerReady: Promise<void> | null = null;
let workerBlobUrl: string | null = null;

async function setupPdfWorker(plugin: Plugin): Promise<void> {
	const vaultPath = `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}/${PDF_WORKER_FILE}`;

	if (await plugin.app.vault.adapter.exists(vaultPath)) {
		try {
			const code = await plugin.app.vault.adapter.read(vaultPath);
			workerBlobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
			pdfjsLib.GlobalWorkerOptions.workerSrc = workerBlobUrl;
			return;
		} catch (error) {
			console.warn("Lecture Lens: local PDF worker unreadable, trying CDN…", error);
		}
	} else {
		console.warn("Lecture Lens: PDF worker missing from plugin folder, downloading from CDN…");
	}

	const response = await requestUrl({ url: PDF_WORKER_CDN, method: "GET", throw: false });
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`Failed to download PDF worker (HTTP ${response.status}).`);
	}
	workerBlobUrl = URL.createObjectURL(new Blob([response.text], { type: "text/javascript" }));
	pdfjsLib.GlobalWorkerOptions.workerSrc = workerBlobUrl;
}

/** Start PDF.js worker setup (local blob URL or CDN fallback for community installs). */
export function configurePdfWorker(plugin: Plugin): void {
	if (!workerReady) {
		workerReady = setupPdfWorker(plugin);
	}
}

export function releasePdfWorker(): void {
	if (workerBlobUrl) {
		URL.revokeObjectURL(workerBlobUrl);
		workerBlobUrl = null;
	}
	workerReady = null;
}

async function ensurePdfWorkerReady(): Promise<void> {
	if (!workerReady) {
		throw new Error("PDF worker is not configured. Reload the plugin and try again.");
	}
	await workerReady;
}

const MAX_CHARS_PER_PAGE = 2000;

export async function extractPdfPageTexts(
	app: App,
	file: TFile,
	maxPages: number,
	onPageProgress?: (current: number, total: number) => void
): Promise<{ pages: PdfPageText[]; totalPages: number; truncated: boolean }> {
	await ensurePdfWorkerReady();

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
		onPageProgress?.(pageNumber, limit);
	}

	await pdf.destroy();
	return { pages, totalPages, truncated: totalPages > limit };
}
