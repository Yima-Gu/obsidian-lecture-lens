import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { TranslationKey } from "../i18n";

export class PdfMultiSelectModal extends Modal {
	private query = "";
	private selected = new Set<string>();
	private listEl: HTMLElement | null = null;
	private searchInput: HTMLInputElement | null = null;

	constructor(
		app: App,
		private readonly tr: (key: TranslationKey, params?: Record<string, string | number>) => string,
		private readonly onConfirm: (files: TFile[]) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("lecture-lens-modal");
		contentEl.empty();
		contentEl.addClass("lecture-lens-pdf-multi-select-modal");

		contentEl.createEl("h2", { text: this.tr("modal.pdfMultiSelect.title") });
		contentEl.createEl("p", {
			cls: "setting-item-description",
			text: this.tr("modal.pdfMultiSelect.desc"),
		});

		new Setting(contentEl)
			.setName(this.tr("modal.pdfMultiSelect.search"))
			.addText((text) => {
				this.searchInput = text.inputEl;
				text.setPlaceholder(this.tr("modal.pdfMultiSelect.searchPlaceholder"));
				text.onChange((value) => {
					this.query = value.trim().toLowerCase();
					this.renderList();
				});
			});

		this.listEl = contentEl.createDiv({ cls: "lecture-lens-pdf-multi-select-list" });
		this.renderList();

		const buttonRow = contentEl.createDiv({ cls: "lecture-lens-pdf-multi-select-actions" });
		const selectAllBtn = buttonRow.createEl("button", {
			text: this.tr("modal.pdfMultiSelect.selectVisible"),
		});
		selectAllBtn.addEventListener("click", () => this.selectVisible(true));
		const clearBtn = buttonRow.createEl("button", {
			text: this.tr("modal.pdfMultiSelect.clearSelection"),
		});
		clearBtn.addEventListener("click", () => {
			this.selected.clear();
			this.renderList();
		});

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText(this.tr("modal.pdfNotesOptions.cancel")).onClick(() => this.close())
			)
			.addButton((button) =>
				button
					.setButtonText(this.tr("modal.pdfMultiSelect.continue"))
					.setCta()
					.onClick(() => this.confirm())
			);
	}

	private getPdfFiles(): TFile[] {
		return this.app.vault
			.getFiles()
			.filter((file) => file.extension.toLowerCase() === "pdf")
			.sort((a, b) => a.path.localeCompare(b.path));
	}

	private getFilteredFiles(): TFile[] {
		const pdfs = this.getPdfFiles();
		if (!this.query) return pdfs;
		return pdfs.filter((file) => file.path.toLowerCase().includes(this.query));
	}

	private renderList(): void {
		if (!this.listEl) return;
		this.listEl.empty();

		const files = this.getFilteredFiles();
		if (files.length === 0) {
			this.listEl.createEl("p", {
				cls: "lecture-lens-pdf-multi-select-empty",
				text: this.tr("modal.pdfMultiSelect.empty"),
			});
			return;
		}

		for (const file of files) {
			const row = this.listEl.createDiv({ cls: "lecture-lens-pdf-multi-select-row" });
			const checkbox = row.createEl("input", { type: "checkbox" });
			checkbox.checked = this.selected.has(file.path);
			checkbox.addEventListener("change", () => {
				if (checkbox.checked) {
					this.selected.add(file.path);
				} else {
					this.selected.delete(file.path);
				}
			});
			row.createEl("span", {
				cls: "lecture-lens-pdf-multi-select-path",
				text: file.path,
				attr: { title: file.path },
			});
		}
	}

	private selectVisible(select: boolean): void {
		for (const file of this.getFilteredFiles()) {
			if (select) {
				this.selected.add(file.path);
			} else {
				this.selected.delete(file.path);
			}
		}
		this.renderList();
	}

	private confirm(): void {
		const pdfs = this.getPdfFiles();
		const chosen = pdfs.filter((file) => this.selected.has(file.path));
		if (chosen.length === 0) {
			new Notice(this.tr("notice.pdfNotesNoFilesSelected"), 4000);
			return;
		}
		this.close();
		this.onConfirm(chosen);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
