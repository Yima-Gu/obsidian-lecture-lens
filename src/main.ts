import { Editor, EditorPosition, MarkdownView, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LectureLensSettingTab, LectureLensSettings } from "./settings";
import { LLMService, LLMServiceError } from "./services/llm";
import { ImageExtractor } from "./services/imageExtractor";
import { AnalysisModal } from "./ui/analysisModal";
import { AskImageModal } from "./ui/askImageModal";

// Plugin entry point for Lecture Lens.
export default class LectureLensPlugin extends Plugin {
	settings: LectureLensSettings;
	llmService: LLMService;
	imageExtractor: ImageExtractor;

	async onload() {
		await this.loadSettings();
		
		// Initialize LLM service
		this.llmService = new LLMService({
			apiKey: this.settings.apiKey,
			baseUrl: this.settings.baseUrl,
			modelName: this.settings.modelName,
		});

		// Initialize image extractor
		this.imageExtractor = new ImageExtractor(this.app);
		
		this.addSettingTab(new LectureLensSettingTab(this.app, this));
		
		// Add ribbon icon for quick analysis
		this.addRibbonIcon("glasses", "Analyze note images", () => {
			const modal = new AskImageModal(
				this.app,
				this.settings.promptTemplates,
				(prompt) => void this.analyzeCurrentNote(prompt)
			);
			modal.open();
		});
		
		// Add test command for LLM connectivity
		this.addCommand({
			id: "test-llm-connection",
			name: "Test language model connection",
			callback: () => this.testLLMConnection(),
		});

		// Add test command for image extraction
		this.addCommand({
			id: "test-image-extraction",
			name: "Test image extraction from current note",
			callback: () => this.testImageExtraction(),
		});

		// Batch-process each image in the note individually
		this.addCommand({
			id: "batch-analyze-images",
			name: "Analyze all images in note (one by one)",
			callback: () => {
				const modal = new AskImageModal(
					this.app,
					this.settings.promptTemplates,
					(prompt) => void this.batchAnalyzeImages(prompt)
				);
				modal.open();
			},
		});
	}

	onunload() {}

	private async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<LectureLensSettings>
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		// Update LLM service configuration when settings change
		if (this.llmService) {
			this.llmService.updateConfig({
				apiKey: this.settings.apiKey,
				baseUrl: this.settings.baseUrl,
				modelName: this.settings.modelName,
			});
		}
	}

	/**
	 * Test command to verify LLM API connectivity
	 */
	private async testLLMConnection(): Promise<void> {
		const testNotice = new Notice("Testing language model connection...", 0);
		
		try {
			// Simple test message
			const response = await this.llmService.chatCompletion([
				{
					role: "user",
					content: "Hello! Please respond with 'OK' to confirm connection.",
				},
			], {
				max_tokens: 10,
				temperature: 0,
			});

			testNotice.hide();
			
			const firstChoice = response.choices[0];
			const messageContent = firstChoice?.message?.content;
			const message = typeof messageContent === "string" 
				? messageContent 
				: "No response";
			new Notice(
				`✅ LLM connection successful!\nModel: ${response.model}\nResponse: ${message}`,
				5000
			);
		} catch (error) {
			testNotice.hide();
			
			let errorMessage = "Unknown error";
			if (error instanceof LLMServiceError) {
				errorMessage = error.message;
				if (error.statusCode) {
					errorMessage = `HTTP ${error.statusCode}: ${errorMessage}`;
				}
			} else if (error instanceof Error) {
				errorMessage = error.message;
			}
			
			new Notice(`❌ LLM connection failed:\n${errorMessage}`, 8000);
			console.error("LLM connection test failed:", error);
		}
	}

	/**
	 * Test command to verify image extraction functionality
	 */
	private async testImageExtraction(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		
		if (!activeFile) {
			new Notice("No active file. Please open a note first.", 5000);
			return;
		}

		const testNotice = new Notice("Extracting images from current note...", 0);

		try {
			// Read the file content
			const content = await this.app.vault.read(activeFile);

			// Extract image references
			const references = this.imageExtractor.extractImageReferences(content);

			if (references.length === 0) {
				testNotice.hide();
				new Notice("No images found in the current note.", 5000);
				return;
			}

			// Try to read and encode the images
			const imageData = await this.imageExtractor.extractAndReadImages(
				content,
				activeFile
			);

			testNotice.hide();

			// Display results
			const foundCount = imageData.length;
			const referencesCount = references.length;
			const summary = imageData
				.map((img) => {
					const sizeKB = (img.size / 1024).toFixed(2);
					return `  • ${img.reference.path} (${sizeKB} KB, ${img.mimeType})`;
				})
				.join("\n");

			new Notice(
				`✅ Image extraction successful!\n\nFound ${referencesCount} reference(s), loaded ${foundCount} image(s):\n${summary}`,
				10000
			);
		} catch (error) {
			testNotice.hide();

			let errorMessage = "Unknown error";
			if (error instanceof Error) {
				errorMessage = error.message;
			}

			new Notice(`❌ Image extraction failed:\n${errorMessage}`, 8000);
			console.error("Image extraction test failed:", error);
		}
	}

	/**
	 * Main analysis workflow: Extract images from the current note and generate lecture notes.
	 * Streams the LLM response directly into the editor for a typewriter effect.
	 */
	private async analyzeCurrentNote(prompt: string): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			new Notice("No active file. Please open a note first.", 5000);
			return;
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			new Notice("No active Markdown view found.", 5000);
			return;
		}

		const editor = activeView.editor;

		// Create and open the analysis modal
		const modal = new AnalysisModal(this.app);
		modal.open();

		// eslint-disable-next-line obsidianmd/ui/sentence-case
		const thinkingNotice = new Notice("🤔 Thinking…", 0);

		try {
			// Step 1: Find and extract images
			modal.setStatusFindingImages();
			const content = await this.app.vault.read(activeFile);
			const imageData = await this.imageExtractor.extractAndReadImages(
				content,
				activeFile
			);

			// Check if any images were found
			if (imageData.length === 0) {
				thinkingNotice.hide();
				modal.close();
				new Notice("No images found in the current note", 5000);
				return;
			}

			// Step 2: Prepare multimodal message
			modal.setStatusAnalyzing();

			const userMessage = LLMService.createMultimodalMessage(
				"user",
				prompt,
				imageData.map((img) => ({
					base64: img.base64,
					mimeType: img.mimeType,
					detail: "high" as const,
				}))
			);

			// Step 3: Insert separator at the end of the document
			const lastLine = editor.lastLine();
			const lastLineLength = editor.getLine(lastLine).length;
			const header = "\n\n---\n\n## 📝 AI Generated Lecture Notes\n\n";
			editor.replaceRange(header, { line: lastLine, ch: lastLineLength });

			// Track the position where we'll append streaming chunks
			let insertPos = this.advancePosition(
				{ line: lastLine, ch: lastLineLength },
				header
			);

			// Step 4: Stream the response into the editor
			let firstChunk = true;
			for await (const chunk of this.llmService.chatCompletionStream(
				[userMessage],
				{ temperature: 0.7, max_tokens: 4000 }
			)) {
				if (firstChunk) {
					thinkingNotice.hide();
					firstChunk = false;
				}
				editor.replaceRange(chunk, insertPos);
				insertPos = this.advancePosition(insertPos, chunk);
			}

			if (firstChunk) {
				// No chunks received
				thinkingNotice.hide();
				throw new Error("No response received from AI");
			}

			// Add a trailing newline after the streamed content
			editor.replaceRange("\n", insertPos);

			modal.setStatusDone();
			setTimeout(() => {
				modal.close();
				new Notice(
					"Analysis complete! Generated notes added to the end of the document",
					5000
				);
			}, 500);
		} catch (error) {
			thinkingNotice.hide();

			let errorMessage = "Unknown error";
			if (error instanceof LLMServiceError) {
				errorMessage = error.message;
				if (error.statusCode) {
					errorMessage = `HTTP ${error.statusCode}: ${errorMessage}`;
				}
			} else if (error instanceof Error) {
				errorMessage = error.message;
			}

			modal.setStatusError(errorMessage);
			console.error("Analysis failed:", error);

			setTimeout(() => {
				modal.close();
				new Notice(`❌ Analysis failed:\n${errorMessage}`, 8000);
			}, 2000);
		}
	}

	/**
	 * Batch analysis: process each image in the note individually, inserting
	 * streamed notes directly below each image reference.
	 */
	private async batchAnalyzeImages(prompt: string): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();

		if (!activeFile) {
			new Notice("No active file. Please open a note first.", 5000);
			return;
		}

		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			new Notice("No active Markdown view found.", 5000);
			return;
		}

		const editor = activeView.editor;

		// Extract image references from the initial content
		const content = await this.app.vault.read(activeFile);
		const references = this.imageExtractor.extractImageReferences(content);

		if (references.length === 0) {
			new Notice("No images found in the current note", 5000);
			return;
		}

		let successCount = 0;
		let errorCount = 0;

		for (let i = 0; i < references.length; i++) {
			const reference = references[i]!;
			const progressNotice = new Notice(
				`🖼️ Processing image ${i + 1} of ${references.length}…`,
				0
			);

			try {
				// Resolve and read the image
				const file = this.imageExtractor.resolveImageFile(
					reference.path,
					activeFile
				);
				if (!file) {
					progressNotice.hide();
					console.warn(`Image not found: ${reference.path}`);
					errorCount++;
					continue;
				}

				const { base64, mimeType } =
					await this.imageExtractor.readImageAsBase64(file);

				const userMessage = LLMService.createMultimodalMessage(
					"user",
					prompt,
					[{ base64, mimeType, detail: "high" as const }]
				);

				// Find the line of this image reference in the current editor content
				const imageLine = this.findImageLine(editor, reference.originalText);

				// Insert a section header after the image line
				const imageLineContent = editor.getLine(imageLine);
				const header = "\n\n> [!note]+ AI Analysis\n> ";
				editor.replaceRange(header, {
					line: imageLine,
					ch: imageLineContent.length,
				});

				// Track where to append stream chunks
				let insertPos = this.advancePosition(
					{ line: imageLine, ch: imageLineContent.length },
					header
				);

				// Stream response below the image
				for await (const chunk of this.llmService.chatCompletionStream(
					[userMessage],
					{ temperature: 0.7, max_tokens: 2000 }
				)) {
					// Indent continuation lines inside the callout block
					const indentedChunk = chunk.replace(/\n/g, "\n> ");
					editor.replaceRange(indentedChunk, insertPos);
					insertPos = this.advancePosition(insertPos, indentedChunk);
				}

				// Close callout block with a blank line
				editor.replaceRange("\n\n", insertPos);

				successCount++;
			} catch (error) {
				console.error(
					`Failed to analyze image ${reference.path}:`,
					error
				);
				errorCount++;
			} finally {
				progressNotice.hide();
			}
		}

		new Notice(
			`✅ Batch analysis complete! ${successCount} succeeded${errorCount > 0 ? `, ${errorCount} failed` : ""}.`,
			5000
		);
	}

	/**
	 * Advance an EditorPosition by the characters in the given string,
	 * accounting for embedded newlines.
	 */
	private advancePosition(pos: EditorPosition, text: string): EditorPosition {
		const lines = text.split("\n");
		if (lines.length === 1) {
			return { line: pos.line, ch: pos.ch + text.length };
		}
		return {
			line: pos.line + lines.length - 1,
			ch: lines[lines.length - 1]?.length ?? 0,
		};
	}

	/**
	 * Find the line number of the first line that contains the given text.
	 * Falls back to the last line if the text is not found.
	 */
	private findImageLine(editor: Editor, originalText: string): number {
		const lineCount = editor.lineCount();
		for (let i = 0; i < lineCount; i++) {
			if (editor.getLine(i).includes(originalText)) {
				return i;
			}
		}
		return editor.lastLine();
	}
}
