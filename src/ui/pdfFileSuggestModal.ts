import { App, FuzzySuggestModal, TFile } from "obsidian";

export class PdfFileSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private readonly onChoose: (file: TFile) => void
	) {
		super(app);
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles().filter((file) => file.extension.toLowerCase() === "pdf");
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}
