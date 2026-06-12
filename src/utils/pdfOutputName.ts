import { TFile } from "obsidian";

/** Default Markdown base name for a PDF (same stem, no extension). */
export function defaultPdfOutputBaseName(pdfFile: TFile): string {
	return pdfFile.basename.replace(/\.pdf$/i, "");
}

/** Remove characters invalid in vault file names. */
export function sanitizeOutputBaseName(name: string): string {
	return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}
