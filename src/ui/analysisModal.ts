// The title uses the plugin name "Lecture Lens" which requires capital letters
/* eslint-disable obsidianmd/ui/sentence-case */
import { Modal, App } from "obsidian";
import { TranslationKey } from "../i18n";

/**
 * Modal to display analysis progress and status
 */
export class AnalysisModal extends Modal {
	private statusEl: HTMLElement;
	private currentStatus: string;
	private readonly tr: (key: TranslationKey, params?: Record<string, string | number>) => string;

	constructor(
		app: App,
		tr: (key: TranslationKey, params?: Record<string, string | number>) => string
	) {
		super(app);
		this.tr = tr;
		this.currentStatus = "";
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("lecture-lens-analysis-modal");

		const titleEl = contentEl.createEl("h2", {
			text: this.tr("modal.analysis.title"),
		});
		titleEl.addClass("lecture-lens-modal-title");

		this.statusEl = contentEl.createEl("div", {
			cls: "lecture-lens-status-container",
		});

		const progressEl = contentEl.createEl("div", {
			cls: "lecture-lens-progress",
		});
		progressEl.createEl("div", {
			cls: "lecture-lens-progress-bar",
		});

		if (this.currentStatus) {
			this.updateStatus(this.currentStatus);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	updateStatus(status: string): void {
		this.currentStatus = status;
		if (this.statusEl) {
			this.statusEl.setText(status);
		}
	}

	setStatusFindingImages(): void {
		this.updateStatus(this.tr("modal.analysis.findingImages"));
	}

	setStatusAnalyzing(): void {
		this.updateStatus(this.tr("modal.analysis.analyzing"));
	}

	setStatusDone(): void {
		this.updateStatus(this.tr("modal.analysis.done"));
	}

	setStatusError(message: string): void {
		this.updateStatus(`❌ ${message}`);
	}
}
