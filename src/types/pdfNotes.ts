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
