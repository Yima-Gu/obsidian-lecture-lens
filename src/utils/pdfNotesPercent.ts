import { PdfNotesProgress } from "../types/pdfNotes";

function computeSingleFilePercent(progress: PdfNotesProgress): number {
	const { phase, current, total } = progress;
	switch (phase) {
		case "parsing":
			if (current && total) {
				return Math.round((15 * current) / total);
			}
			return 5;
		case "outline":
			return 20;
		case "sections":
			if (current && total) {
				return Math.round(25 + (60 * current) / total);
			}
			return 30;
		case "merge":
			return 90;
		case "writing":
			return 97;
		case "done":
			return 100;
		case "error":
			return 0;
		default:
			return 0;
	}
}

export function computePdfNotesPercent(
	progress: PdfNotesProgress,
	batchCurrent = 1,
	batchTotal = 1
): number {
	const inFile = computeSingleFilePercent(progress);
	if (batchTotal <= 1) return inFile;

	const fileIndex = Math.max(0, batchCurrent - 1);
	const overall = (fileIndex / batchTotal) * 100 + inFile / batchTotal;
	return Math.min(100, Math.round(overall));
}
