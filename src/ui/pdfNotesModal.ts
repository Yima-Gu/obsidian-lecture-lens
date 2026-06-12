 
import { App, Modal } from "obsidian";
import { TranslationKey } from "../i18n";
import { PdfNotesPhase } from "../types/pdfNotes";

export class PdfNotesModal extends Modal {
	private statusEl: HTMLElement;
	private detailEl: HTMLElement;
	private readonly tr: (key: TranslationKey, params?: Record<string, string | number>) => string;

	constructor(
		app: App,
		tr: (key: TranslationKey, params?: Record<string, string | number>) => string
	) {
		super(app);
		this.tr = tr;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("lecture-lens-analysis-modal");

		const titleEl = contentEl.createEl("h2", {
			text: this.tr("modal.pdfNotes.title"),
		});
		titleEl.addClass("lecture-lens-modal-title");

		this.statusEl = contentEl.createEl("div", {
			cls: "lecture-lens-status-container",
		});
		this.detailEl = contentEl.createEl("div", {
			cls: "setting-item-description",
		});

		const progressEl = contentEl.createEl("div", {
			cls: "lecture-lens-progress",
		});
		progressEl.createEl("div", {
			cls: "lecture-lens-progress-bar",
		});

		this.setPhase("parsing");
	}

	onClose(): void {
		this.contentEl.empty();
	}

	setPhase(phase: PdfNotesPhase, detail?: string): void {
		const key = `modal.pdfNotes.phase.${phase}` as TranslationKey;
		this.statusEl.setText(this.tr(key));
		this.detailEl.setText(detail ?? "");
	}

	setProgress(current: number, total: number, detail?: string): void {
		this.statusEl.setText(
			this.tr("modal.pdfNotes.sectionProgress", { current, total })
		);
		if (detail) {
			this.detailEl.setText(detail);
		}
	}

	setError(message: string): void {
		this.statusEl.setText(`❌ ${message}`);
	}
}
