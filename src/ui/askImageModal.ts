// The title uses the plugin name which requires capital letters
/* eslint-disable obsidianmd/ui/sentence-case */
import { App, Modal, Notice, Setting } from "obsidian";
import { TranslationKey } from "../i18n";
import { PromptTemplate } from "../settings";

/**
 * Modal for selecting a prompt template and customizing the prompt
 * before running an image analysis.
 */
export class AskImageModal extends Modal {
	private selectedPrompt: string;
	private readonly templates: PromptTemplate[];
	private readonly tr: (key: TranslationKey, params?: Record<string, string | number>) => string;
	private readonly onSubmit: (prompt: string) => void;

	constructor(
		app: App,
		templates: PromptTemplate[],
		tr: (key: TranslationKey, params?: Record<string, string | number>) => string,
		onSubmit: (prompt: string) => void
	) {
		super(app);
		this.templates = templates;
		this.tr = tr;
		this.selectedPrompt = templates[0]?.prompt ?? "";
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("lecture-lens-ask-modal");

		contentEl.createEl("h2", { text: this.tr("modal.analyzeImages.title") });

		let textAreaEl: HTMLTextAreaElement;

		if (this.templates.length > 0) {
			new Setting(contentEl)
				.setName(this.tr("modal.analyzeImages.templateName"))
				.setDesc(this.tr("modal.analyzeImages.templateDesc"))
				.addDropdown((dropdown) => {
					for (const template of this.templates) {
						dropdown.addOption(template.name, template.name);
					}
					dropdown.setValue(this.templates[0]?.name ?? "");
					dropdown.onChange((value) => {
						const template = this.templates.find((item) => item.name === value);
						if (template) {
							this.selectedPrompt = template.prompt;
							if (textAreaEl) {
								textAreaEl.value = template.prompt;
							}
						}
					});
				});
		}

		const textAreaWrapper = contentEl.createEl("div", {
			cls: "lecture-lens-textarea-wrapper",
		});
		textAreaEl = textAreaWrapper.createEl("textarea", {
			cls: "lecture-lens-prompt-textarea",
		});
		textAreaEl.value = this.selectedPrompt;
		textAreaEl.rows = 5;
		textAreaEl.placeholder = this.tr("modal.analyzeImages.promptPlaceholder");
		textAreaEl.addEventListener("input", () => {
			this.selectedPrompt = textAreaEl.value;
		});

		const buttonRow = contentEl.createEl("div", {
			cls: "lecture-lens-modal-buttons",
		});

		const cancelBtn = buttonRow.createEl("button", { text: this.tr("modal.analyzeImages.cancel") });
		cancelBtn.addEventListener("click", () => this.close());

		const analyzeBtn = buttonRow.createEl("button", {
			text: this.tr("modal.analyzeImages.analyze"),
			cls: "mod-cta",
		});
		analyzeBtn.addEventListener("click", () => {
			const prompt = this.selectedPrompt.trim();
			if (!prompt) {
				new Notice(this.tr("modal.analyzeImages.emptyPrompt"), 3000);
				return;
			}
			this.close();
			this.onSubmit(prompt);
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}
