import { App, FuzzySuggestModal, TFolder } from "obsidian";

export class VaultFolderSuggestModal extends FuzzySuggestModal<TFolder> {
	constructor(
		app: App,
		private readonly onChoose: (folder: TFolder) => void,
		instructions: string
	) {
		super(app);
		this.setInstructions([
			{
				command: instructions,
				purpose: "",
			},
		]);
	}

	getItems(): TFolder[] {
		return this.app.vault
			.getAllLoadedFiles()
			.filter((item): item is TFolder => item instanceof TFolder)
			.sort((a, b) => (a.path || "/").localeCompare(b.path || "/"));
	}

	getItemText(folder: TFolder): string {
		return folder.path || "/";
	}

	onChooseItem(folder: TFolder): void {
		this.onChoose(folder);
	}
}
