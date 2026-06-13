import { App, Modal, Notice, Setting, TFile, TextAreaComponent, TextComponent } from "obsidian";
import { TranslationKey } from "../i18n";
import { PdfNotesBatchItem } from "../types/pdfNotes";
import { defaultPdfOutputBaseName, sanitizeOutputBaseName } from "../utils/pdfOutputName";
import { VaultFileSuggestModal } from "./fileSuggestModal";
import { VaultFolderSuggestModal } from "./folderSuggestModal";
import { PdfFileSuggestModal } from "./pdfFileSuggestModal";

interface OutputEntry {
	pdfFile: TFile;
	outputBaseName: string;
}

export class PdfNotesOptionsModal extends Modal {
	private outputFolder = "";
	private sectionSystemPrompt = "";
	private loadedPromptFilePath = "";
	private entries: OutputEntry[] = [];
	private folderInput: TextComponent | null = null;
	private promptInput: TextAreaComponent | null = null;
	private promptDescEl: HTMLElement | null = null;
	private fileListEl: HTMLElement | null = null;

	constructor(
		app: App,
		pdfFiles: TFile[],
		defaultOutputFolder: string,
		private readonly tr: (key: TranslationKey, params?: Record<string, string | number>) => string,
		private readonly onConfirm: (items: PdfNotesBatchItem[]) => void
	) {
		super(app);
		this.outputFolder =
			defaultOutputFolder.trim() || pdfFiles[0]?.parent?.path || "";
		this.entries = pdfFiles.map((pdfFile) => ({
			pdfFile,
			outputBaseName: defaultPdfOutputBaseName(pdfFile),
		}));
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("lecture-lens-modal");
		contentEl.empty();
		contentEl.addClass("lecture-lens-pdf-notes-options-modal");

		contentEl.createEl("h2", { text: this.tr("modal.pdfNotesOptions.title") });
		contentEl.createEl("p", {
			cls: "setting-item-description",
			text:
				this.entries.length === 1
					? this.tr("modal.pdfNotesOptions.pdfLabel", {
							name: this.entries[0]!.pdfFile.basename,
						})
					: this.tr("modal.pdfNotesOptions.batchLabel", { count: this.entries.length }),
		});

		const fileSection = contentEl.createDiv({ cls: "lecture-lens-pdf-notes-file-section" });
		fileSection.createEl("h3", { text: this.tr("modal.pdfNotesOptions.outputNames") });
		fileSection.createEl("p", {
			cls: "setting-item-description",
			text: this.tr("modal.pdfNotesOptions.outputNamesDesc"),
		});

		const fileHeader = fileSection.createDiv({ cls: "lecture-lens-pdf-notes-file-header" });
		fileHeader.createSpan({ text: this.tr("modal.pdfNotesOptions.columnPdf") });
		fileHeader.createSpan({ text: this.tr("modal.pdfNotesOptions.columnOutputName") });

		this.fileListEl = fileSection.createDiv({ cls: "lecture-lens-pdf-notes-file-list" });
		this.renderFileList();

		new Setting(fileSection)
			.addButton((button) =>
				button
					.setButtonText(this.tr("modal.pdfNotesOptions.addPdf"))
					.onClick(() => this.addPdfFile())
			);

		new Setting(contentEl)
			.setName(this.tr("modal.pdfNotesOptions.outputFolder"))
			.setDesc(this.tr("modal.pdfNotesOptions.outputFolderDesc"))
			.addText((text) => {
				this.folderInput = text;
				text
					.setPlaceholder(this.tr("settings.pdfNotesOutputFolder.placeholder"))
					.setValue(this.outputFolder)
					.onChange((value) => {
						this.outputFolder = value.trim();
					});
			})
			.addButton((button) =>
				button
					.setButtonText(this.tr("settings.courseFolder.browse"))
					.onClick(() => {
						new VaultFolderSuggestModal(
							this.app,
							(folder) => {
								this.outputFolder = folder.path || "";
								this.folderInput?.setValue(this.outputFolder);
							},
							this.tr("settings.pdfNotesOutputFolder.browseHint")
						).open();
					})
			);

		const promptSetting = new Setting(contentEl)
			.setName(this.tr("modal.pdfNotesOptions.sectionSystemPrompt"))
			.setDesc(this.tr("modal.pdfNotesOptions.sectionSystemPromptDesc"))
			.addButton((button) =>
				button
					.setButtonText(this.tr("modal.pdfNotesOptions.loadPromptFile"))
					.onClick(() => this.loadPromptFromFile())
			);
		promptSetting.settingEl.addClass("lecture-lens-pdf-notes-prompt-setting");

		this.promptDescEl = promptSetting.descEl;

		promptSetting.addTextArea((text) => {
			this.promptInput = text;
			text
				.setPlaceholder(this.tr("modal.pdfNotesOptions.sectionSystemPromptPlaceholder"))
				.setValue(this.sectionSystemPrompt)
				.onChange((value) => {
					this.sectionSystemPrompt = value;
					this.loadedPromptFilePath = "";
					this.refreshPromptDesc();
				});
			text.inputEl.rows = 6;
			text.inputEl.spellcheck = false;
		});

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText(this.tr("modal.pdfNotesOptions.cancel")).onClick(() => this.close())
			)
			.addButton((button) =>
				button
					.setButtonText(
						this.entries.length > 1
							? this.tr("modal.pdfNotesOptions.startBatch", { count: this.entries.length })
							: this.tr("modal.pdfNotesOptions.start")
					)
					.setCta()
					.onClick(() => this.confirm())
			);
	}

	private renderFileList(): void {
		if (!this.fileListEl) return;
		this.fileListEl.empty();

		for (let index = 0; index < this.entries.length; index++) {
			const entry = this.entries[index]!;
			const row = this.fileListEl.createDiv({
				cls:
					this.entries.length > 1
						? "lecture-lens-pdf-notes-file-row lecture-lens-pdf-notes-file-row-with-remove"
						: "lecture-lens-pdf-notes-file-row",
			});

			const pdfCell = row.createDiv({ cls: "lecture-lens-pdf-notes-file-pdf" });
			pdfCell.createSpan({
				text: entry.pdfFile.path,
				attr: { title: entry.pdfFile.path },
			});

			const nameCell = row.createDiv({ cls: "lecture-lens-pdf-notes-file-name" });
			const input = nameCell.createEl("input", {
				type: "text",
				value: entry.outputBaseName,
				cls: "lecture-lens-pdf-notes-name-input",
			});
			nameCell.createSpan({ cls: "lecture-lens-pdf-notes-name-suffix", text: ".md" });
			input.addEventListener("input", () => {
				entry.outputBaseName = input.value;
			});

			if (this.entries.length > 1) {
				const removeBtn = row.createEl("button", {
					cls: "clickable-icon lecture-lens-pdf-notes-remove",
					attr: { "aria-label": this.tr("modal.pdfNotesOptions.removePdf") },
					text: "×",
				});
				removeBtn.addEventListener("click", () => {
					this.entries.splice(index, 1);
					this.renderFileList();
				});
			}
		}
	}

	private addPdfFile(): void {
		new PdfFileSuggestModal(this.app, (file) => {
			if (this.entries.some((entry) => entry.pdfFile.path === file.path)) {
				new Notice(this.tr("notice.pdfNotesAlreadyInList"), 4000);
				return;
			}
			this.entries.push({
				pdfFile: file,
				outputBaseName: defaultPdfOutputBaseName(file),
			});
			this.renderFileList();
		}).open();
	}

	private refreshPromptDesc(): void {
		if (!this.promptDescEl) return;
		const baseDesc = this.tr("modal.pdfNotesOptions.sectionSystemPromptDesc");
		if (this.loadedPromptFilePath) {
			this.promptDescEl.setText(
				`${baseDesc} ${this.tr("modal.pdfNotesOptions.promptLoadedFrom", {
					path: this.loadedPromptFilePath,
				})}`
			);
		} else {
			this.promptDescEl.setText(baseDesc);
		}
	}

	private loadPromptFromFile(): void {
		new VaultFileSuggestModal(this.app, (file) => {
			void this.applyPromptFile(file);
		}).open();
	}

	private async applyPromptFile(file: TFile): Promise<void> {
		try {
			const content = (await this.app.vault.read(file)).trim();
			if (!content) {
				new Notice(this.tr("notice.pdfNotesPromptFileEmpty"), 4000);
				return;
			}
			this.sectionSystemPrompt = content;
			this.loadedPromptFilePath = file.path;
			this.promptInput?.setValue(content);
			this.refreshPromptDesc();
		} catch (error) {
			console.error("Failed to read prompt file:", error);
			new Notice(this.tr("notice.pdfNotesPromptFileReadFailed"), 5000);
		}
	}

	private validateEntries(): PdfNotesBatchItem[] | null {
		if (this.entries.length === 0) {
			new Notice(this.tr("notice.pdfNotesNoFilesSelected"), 4000);
			return null;
		}

		const trimmedPrompt = this.sectionSystemPrompt.trim();
		const items: PdfNotesBatchItem[] = [];
		const seenNames = new Set<string>();

		for (const entry of this.entries) {
			const outputBaseName = sanitizeOutputBaseName(entry.outputBaseName);
			if (!outputBaseName) {
				new Notice(
					this.tr("notice.pdfNotesInvalidOutputName", { name: entry.pdfFile.basename }),
					5000
				);
				return null;
			}

			const resolvedFolder =
				this.outputFolder.trim() || entry.pdfFile.parent?.path || "";
			const key = `${resolvedFolder}/${outputBaseName.toLowerCase()}`;
			if (seenNames.has(key)) {
				new Notice(
					this.tr("notice.pdfNotesDuplicateOutputName", { name: outputBaseName }),
					5000
				);
				return null;
			}
			seenNames.add(key);

			items.push({
				pdfFile: entry.pdfFile,
				runOptions: {
					outputFolder: resolvedFolder,
					sectionSystemPrompt: trimmedPrompt || undefined,
					outputBaseName,
				},
			});
		}

		return items;
	}

	private confirm(): void {
		const items = this.validateEntries();
		if (!items) return;
		this.close();
		this.onConfirm(items);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
