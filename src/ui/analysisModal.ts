/* eslint-disable obsidianmd/ui/sentence-case */
import { Modal, App } from "obsidian";

/**
 * Modal to display analysis progress and status
 */
export class AnalysisModal extends Modal {
	private statusEl: HTMLElement;
	private currentStatus: string;

	constructor(app: App) {
		super(app);
		this.currentStatus = "";
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("lecture-lens-analysis-modal");

		// Create title
		const titleEl = contentEl.createEl("h2", {
			text: "Lecture Lens Analysis",
		});
		titleEl.addClass("lecture-lens-modal-title");

		// Create status container
		this.statusEl = contentEl.createEl("div", {
			cls: "lecture-lens-status-container",
		});

		// Create progress indicator
		const progressEl = contentEl.createEl("div", {
			cls: "lecture-lens-progress",
		});
		progressEl.createEl("div", {
			cls: "lecture-lens-progress-bar",
		});

		// Set initial status if provided
		if (this.currentStatus) {
			this.updateStatus(this.currentStatus);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	/**
	 * Update the status message displayed in the modal
	 * @param status - The status message to display (supports emoji)
	 */
	updateStatus(status: string): void {
		this.currentStatus = status;
		if (this.statusEl) {
			this.statusEl.setText(status);
		}
	}

	/**
	 * Set status to "Finding images..."
	 */
	setStatusFindingImages(): void {
		this.updateStatus("🔍 Finding images...");
	}

	/**
	 * Set status to "AI Analyzing..."
	 */
	setStatusAnalyzing(): void {
		this.updateStatus("🧠 AI Analyzing...");
	}

	/**
	 * Set status to "Done!"
	 */
	setStatusDone(): void {
		this.updateStatus("✅ Done!");
	}

	/**
	 * Set status to an error message
	 */
	setStatusError(message: string): void {
		this.updateStatus(`❌ ${message}`);
	}
}
