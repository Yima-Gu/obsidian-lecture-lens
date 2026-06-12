import { TFile } from "obsidian";

export interface PdfPageText {
	pageNumber: number;
	text: string;
}

export interface PdfOutlineSection {
	id: string;
	title: string;
	summary: string;
	pageStart: number;
	pageEnd: number;
}

export interface PdfOutline {
	title: string;
	sections: PdfOutlineSection[];
}

export type PdfNotesPhase =
	| "parsing"
	| "outline"
	| "sections"
	| "merge"
	| "writing"
	| "done"
	| "error";

export interface PdfNotesProgress {
	phase: PdfNotesPhase;
	message: string;
	current?: number;
	total?: number;
}

export interface PdfNotesResult {
	outputPath: string;
	outputFile: TFile;
}

/** Per-run options chosen before starting PDF → Markdown conversion. */
export interface PdfNotesRunOptions {
	outputFolder: string;
	/** When set, replaces the default section-writing system prompt for this run. */
	sectionSystemPrompt?: string;
	/** Base file name without `.md`. When set, used instead of the outline title. */
	outputBaseName?: string;
}

/** One PDF in a batch conversion job. */
export interface PdfNotesBatchItem {
	pdfFile: TFile;
	runOptions: PdfNotesRunOptions;
}
