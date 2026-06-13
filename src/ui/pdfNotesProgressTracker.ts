import { Notice, Plugin, TFile } from "obsidian";
import { TranslationKey } from "../i18n";
import { PdfNotesProgress, PdfNotesPhase, PdfNotesResult } from "../types/pdfNotes";
import { computePdfNotesPercent } from "../utils/pdfNotesPercent";
import { PdfNotesProgressHud, PdfNotesProgressView } from "./pdfNotesProgressHud";

export interface PdfNotesProgressReporter {
	report(progress: PdfNotesProgress): void;
	fail(message: string): void;
}

export class PdfNotesProgressTracker implements PdfNotesProgressReporter {
	private hud: PdfNotesProgressHud | null = null;
	private statusBarEl: HTMLElement | null = null;
	private running = false;
	private result: PdfNotesResult | null = null;
	private disposeTimer: number | null = null;
	private batchTotal = 0;
	private batchCurrent = 0;
	private batchResults: PdfNotesResult[] = [];
	private batchFailures = 0;

	constructor(
		private readonly plugin: Plugin,
		private readonly tr: (key: TranslationKey, params?: Record<string, string | number>) => string
	) {}

	isRunning(): boolean {
		return this.running;
	}

	start(pdfFile: TFile): void {
		this.beginBatch(1);
		this.beginBatchItem(pdfFile, 1);
	}

	beginBatch(total: number): void {
		this.dispose(false);
		this.running = true;
		this.result = null;
		this.batchTotal = total;
		this.batchCurrent = 0;
		this.batchResults = [];
		this.batchFailures = 0;

		this.statusBarEl = this.plugin.addStatusBarItem();
		this.statusBarEl.addClass("lecture-lens-pdf-status-text");

		this.hud = new PdfNotesProgressHud(() => {
			if (this.result) {
				void this.plugin.app.workspace.openLinkText(this.result.outputPath, "", false);
			}
		});
		this.hud.mount();
	}

	beginBatchItem(pdfFile: TFile, current: number): void {
		this.batchCurrent = current;
		this.result = null;
		this.paint({ phase: "parsing", message: pdfFile.basename });
	}

	report(progress: PdfNotesProgress): void {
		this.paint(progress);
	}

	private paint(progress: PdfNotesProgress): void {
		const view = this.buildView(progress);
		this.statusBarEl?.setText(`${view.phaseLabel} · ${view.detail} (${view.percent}%)`);
		this.hud?.update(view);
	}

	fail(message: string): void {
		this.running = false;
		const failTitle = this.tr("pdfNotes.statusBarFailed");
		this.hud?.update({
			title: failTitle,
			phaseLabel: this.tr("modal.pdfNotes.phase.error"),
			detail: message,
			hint: "",
			percent: 0,
			phase: "error",
		});
		this.statusBarEl?.setText(`${failTitle}: ${message}`);
		new Notice(`${failTitle}\n${message}`, 12000);

		if (this.disposeTimer !== null) window.clearTimeout(this.disposeTimer);
		this.disposeTimer = window.setTimeout(() => this.dismissHud(), 10000);
	}

	failBatchItem(pdfFile: TFile, message: string): void {
		this.batchFailures += 1;
		new Notice(
			this.tr("notice.pdfNotesBatchItemFailed", {
				name: pdfFile.basename,
				message,
			}),
			8000
		);
	}

	complete(result: PdfNotesResult): void {
		this.completeBatch([result]);
	}

	completeBatch(results: PdfNotesResult[]): void {
		this.running = false;
		this.batchResults = results;
		this.result = results[results.length - 1] ?? null;

		if (this.batchTotal > 1) {
			const succeeded = results.length;
			const failed = this.batchFailures;
			const detail = this.tr("notice.pdfNotesBatchComplete", {
				succeeded,
				total: this.batchTotal,
				failed,
			});
			this.paint({ phase: "done", message: detail });
			this.statusBarEl?.setText(detail);
			new Notice(detail, 8000);
		} else if (this.result) {
			this.paint({ phase: "done", message: this.result.outputPath });
			this.statusBarEl?.setText(
				this.tr("notice.pdfNotesComplete", { path: this.result.outputPath })
			);
			new Notice(this.tr("notice.pdfNotesComplete", { path: this.result.outputPath }), 6000);
		}

		if (this.disposeTimer !== null) window.clearTimeout(this.disposeTimer);
		this.disposeTimer = window.setTimeout(() => this.dismissHud(), 5000);
	}

	recordBatchResult(result: PdfNotesResult): void {
		this.batchResults.push(result);
		this.result = result;
	}

	private dismissHud(): void {
		this.hud?.dismiss();
		this.hud = null;
	}

	dispose(clearResult = true): void {
		if (this.disposeTimer !== null) {
			window.clearTimeout(this.disposeTimer);
			this.disposeTimer = null;
		}
		this.hud?.unmount();
		this.hud = null;
		this.statusBarEl?.remove();
		this.statusBarEl = null;
		this.running = false;
		if (clearResult) {
			this.result = null;
			this.batchResults = [];
		}
	}

	private buildView(progress: PdfNotesProgress): PdfNotesProgressView {
		const percent = computePdfNotesPercent(progress, this.batchCurrent, this.batchTotal);
		const phaseLabel = this.phaseLabel(progress.phase);

		const batchPrefix =
			this.batchTotal > 1
				? `${this.tr("pdfNotes.progress.batchFile", {
						current: this.batchCurrent,
						total: this.batchTotal,
					})} · `
				: "";

		const hint =
			progress.phase === "done"
				? this.tr("pdfNotes.statusBarHint")
				: progress.phase === "error"
					? ""
					: this.tr("pdfNotes.backgroundHint");

		return {
			title: this.tr("modal.pdfNotes.title"),
			phaseLabel,
			detail: `${batchPrefix}${progress.message}`,
			hint,
			percent,
			phase: progress.phase,
		};
	}

	private phaseLabel(phase: PdfNotesPhase): string {
		const key = `modal.pdfNotes.phase.${phase}` as TranslationKey;
		return this.tr(key);
	}
}
