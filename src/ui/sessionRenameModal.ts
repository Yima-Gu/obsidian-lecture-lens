import { App, Modal, Setting } from "obsidian";
import { TranslationKey } from "../i18n";

export class SessionRenameModal extends Modal {
	private value = "";

	constructor(
		app: App,
		currentTitle: string,
		private readonly tr: (key: TranslationKey, params?: Record<string, string | number>) => string,
		private readonly onSubmit: (title: string) => void
	) {
		super(app);
		this.value = currentTitle;
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		modalEl.addClass("lecture-lens-modal");
		contentEl.empty();
		contentEl.createEl("h2", { text: this.tr("chat.renameChat") });

		new Setting(contentEl)
			.setName(this.tr("chat.renameChatPrompt"))
			.addText((text) => {
				text
					.setPlaceholder(this.tr("chat.renameChatPlaceholder"))
					.setValue(this.value)
					.onChange((value) => {
						this.value = value;
					});
				text.inputEl.addEventListener("keydown", (event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						this.submit();
					}
				});
				window.setTimeout(() => {
					text.inputEl.focus();
					text.inputEl.select();
				}, 0);
			});

		new Setting(contentEl)
			.addButton((button) =>
				button.setButtonText(this.tr("chat.renameChatCancel")).onClick(() => this.close())
			)
			.addButton((button) =>
				button
					.setButtonText(this.tr("chat.renameChatSave"))
					.setCta()
					.onClick(() => this.submit())
			);
	}

	private submit(): void {
		const title = this.value.trim();
		if (!title) return;
		this.close();
		this.onSubmit(title);
	}
}
