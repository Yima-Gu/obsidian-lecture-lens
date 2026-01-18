// The title uses the plugin name "Lecture Lens" which requires capital letters
/* eslint-disable obsidianmd/ui/sentence-case */
import { Modal, App, TextAreaComponent, ButtonComponent } from "obsidian";

/**
 * Modal for asking custom questions about a specific image
 */
export class AskImageModal extends Modal {
	private textArea: TextAreaComponent;
	private submitCallback: (prompt: string) => void;
	private defaultPrompt = "Analyze this slide and extract key concepts.";

	constructor(app: App, onSubmit: (prompt: string) => void) {
		super(app);
		this.submitCallback = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("lecture-lens-ask-modal");

		// Create title
		contentEl.createEl("h2", {
			text: "Lecture Lens: Ask AI",
		});

		// Create description
		contentEl.createEl("p", {
			text: "Ask a question about the selected image:",
			cls: "lecture-lens-modal-description",
		});

		// Create text area for user input
		const textAreaContainer = contentEl.createDiv({
			cls: "lecture-lens-textarea-container",
		});

		this.textArea = new TextAreaComponent(textAreaContainer);
		this.textArea.setValue(this.defaultPrompt);
		this.textArea.inputEl.rows = 4;
		this.textArea.inputEl.placeholder = "Enter your question...";
		this.textArea.inputEl.addClass("lecture-lens-prompt-input");

		// Handle Enter key (without Shift) to submit
		this.textArea.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.handleSubmit();
			}
		});

		// Auto-focus and select the text area
		setTimeout(() => {
			this.textArea.inputEl.focus();
			this.textArea.inputEl.select();
		}, 10);

		// Create button container
		const buttonContainer = contentEl.createDiv({
			cls: "lecture-lens-button-container",
		});

		// Create submit button
		new ButtonComponent(buttonContainer)
			.setButtonText("Submit")
			.setCta()
			.onClick(() => {
				this.handleSubmit();
			});

		// Create cancel button
		new ButtonComponent(buttonContainer)
			.setButtonText("Cancel")
			.onClick(() => {
				this.close();
			});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private handleSubmit(): void {
		const prompt = this.textArea.getValue().trim();
		if (prompt) {
			this.close();
			this.submitCallback(prompt);
		}
	}
}
