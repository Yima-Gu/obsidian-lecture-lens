// The title uses the plugin name which requires capital letters
/* eslint-disable obsidianmd/ui/sentence-case */
import { App, Modal, Notice, Setting } from "obsidian";
import { PromptTemplate } from "../settings";

/**
 * Modal for selecting a prompt template and customizing the prompt
 * before running an image analysis.
 */
export class AskImageModal extends Modal {
	private selectedPrompt: string;
	private readonly templates: PromptTemplate[];
	private readonly onSubmit: (prompt: string) => void;

	constructor(
		app: App,
		templates: PromptTemplate[],
		onSubmit: (prompt: string) => void
	) {
		super(app);
		this.templates = templates;
		this.selectedPrompt = templates[0]?.prompt ?? "";
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("lecture-lens-ask-modal");

		contentEl.createEl("h2", { text: "Lecture Lens: Analyze images" });

		// Textarea for the prompt (declared before the dropdown so the
		// dropdown's onChange callback can reference it)
		let textAreaEl: HTMLTextAreaElement;

		if (this.templates.length > 0) {
			new Setting(contentEl)
				.setName("Prompt template")
				.setDesc("Select a preset or customize the prompt below.")
				.addDropdown((dropdown) => {
					for (const template of this.templates) {
						dropdown.addOption(template.name, template.name);
					}
					dropdown.setValue(this.templates[0]?.name ?? "");
					dropdown.onChange((value) => {
						const template = this.templates.find(
							(t) => t.name === value
						);
						if (template) {
							this.selectedPrompt = template.prompt;
							if (textAreaEl) {
								textAreaEl.value = template.prompt;
							}
						}
					});
				});
		}

		// Prompt textarea
		const textAreaWrapper = contentEl.createEl("div", {
			cls: "lecture-lens-textarea-wrapper",
		});
		textAreaEl = textAreaWrapper.createEl("textarea", {
			cls: "lecture-lens-prompt-textarea",
		});
		textAreaEl.value = this.selectedPrompt;
		textAreaEl.rows = 5;
		textAreaEl.placeholder = "Enter your prompt…";
		textAreaEl.addEventListener("input", () => {
			this.selectedPrompt = textAreaEl.value;
		});

		// Action buttons
		const buttonRow = contentEl.createEl("div", {
			cls: "lecture-lens-modal-buttons",
		});

		const cancelBtn = buttonRow.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const analyzeBtn = buttonRow.createEl("button", {
			text: "Analyze",
			cls: "mod-cta",
		});
		analyzeBtn.addEventListener("click", () => {
			const prompt = this.selectedPrompt.trim();
			if (!prompt) {
				new Notice("Please enter a prompt before analyzing.", 3000);
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
