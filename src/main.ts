import { Editor, EditorPosition, MarkdownView, Menu, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LectureLensSettingTab, LectureLensSettings } from "./settings";
import { LLMService, LLMServiceError } from "./services/llm";
import { ImageExtractor } from "./services/imageExtractor";
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
		
		// Add editor menu event listener for context menu
		this.registerEvent(
			this.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, view: MarkdownView) => {
				this.handleEditorMenu(menu, editor, view);
			})
		);
		
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
	 * Handle editor context menu event
	 * Show "Lecture Lens: Ask AI" menu item only when right-clicking on an image
	 */
	private handleEditorMenu(menu: Menu, editor: Editor, view: MarkdownView): void {
		const cursor = editor.getCursor();
		const line = editor.getLine(cursor.line);
		
		// Check if the current line contains an image link
		const imageLink = this.findImageLinkAtPosition(line, cursor.ch);
		
		if (imageLink) {
			menu.addItem((item) => {
				item
					.setTitle("Ask AI about image")
					.setIcon("glasses")
					.onClick(() => {
						this.handleAskAI(imageLink, editor, view);
					});
			});
		}
	}

	/**
	 * Find an image link at the cursor position in a line
	 * @param line - The line of text
	 * @param cursorCh - The cursor character position
	 * @returns The image link text or null if not found
	 */
	private findImageLinkAtPosition(line: string, cursorCh: number): string | null {
		// Pattern for wiki-style: ![[image.png]] or ![[image.png|alt text]]
		const wikiRegex = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
		let match: RegExpExecArray | null;
		
		while ((match = wikiRegex.exec(line)) !== null) {
			const start = match.index;
			const end = start + match[0].length;
			if (cursorCh >= start && cursorCh <= end) {
				return match[0];
			}
		}
		
		// Pattern for markdown-style: ![alt text](image.png)
		const markdownRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
		
		while ((match = markdownRegex.exec(line)) !== null) {
			const start = match.index;
			const end = start + match[0].length;
			if (cursorCh >= start && cursorCh <= end) {
				return match[0];
			}
		}
		
		return null;
	}

	/**
	 * Handle the "Ask AI" action for a specific image
	 */
	private handleAskAI(imageLink: string, editor: Editor, view: MarkdownView): void {
		const modal = new AskImageModal(this.app, (userPrompt: string) => {
			void this.analyzeImage(imageLink, userPrompt, editor, view);
		});
		modal.open();
	}

	/**
	 * Analyze a single image with a custom user prompt
	 */
	private async analyzeImage(
		imageLink: string,
		userPrompt: string,
		editor: Editor,
		view: MarkdownView
	): Promise<void> {
		const activeFile = view.file;
		
		if (!activeFile) {
			new Notice("No active file found", 5000);
			return;
		}

		// Show non-blocking notice
		new Notice("Thinking...", 5000);

		try {
			// Extract the single image
			const imageData = await this.imageExtractor.extractOneImage(imageLink, activeFile);

			if (!imageData) {
				new Notice("Could not load the image", 5000);
				return;
			}

			// Create multimodal message with the user's custom prompt
			const userMessage = LLMService.createMultimodalMessage(
				"user",
				userPrompt,
				[{
					base64: imageData.base64,
					mimeType: imageData.mimeType,
					detail: "high" as const,
				}]
			);

			// Make API call with system prompt to prevent conversational fillers
			const response = await this.llmService.chatCompletion(
				[userMessage],
				{
					temperature: 0.7,
					max_tokens: 4000,
				},
				true // Use system prompt
			);

			// Extract the AI's response
			const firstChoice = response.choices[0];
			const aiResponse = firstChoice?.message?.content;

			if (!aiResponse || typeof aiResponse !== "string") {
				throw new Error("No valid response from AI");
			}

			// Find the position of the image link in the document
			const cursor = editor.getCursor();
			const lineContent = editor.getLine(cursor.line);
			const imageLinkIndex = lineContent.indexOf(imageLink);
			
			if (imageLinkIndex === -1) {
				// Fallback: insert at cursor position
				const insertPosition: EditorPosition = {
					line: cursor.line + 1,
					ch: 0,
				};
				editor.replaceRange("\n" + aiResponse + "\n", insertPosition);
			} else {
				// Insert below the image line
				const insertPosition: EditorPosition = {
					line: cursor.line + 1,
					ch: 0,
				};
				editor.replaceRange("\n" + aiResponse + "\n", insertPosition);
			}

			new Notice("Analysis complete", 3000);
		} catch (error) {
			// Handle errors
			let errorMessage = "Unknown error";
			if (error instanceof LLMServiceError) {
				errorMessage = error.message;
				if (error.statusCode) {
					errorMessage = `HTTP ${error.statusCode}: ${errorMessage}`;
				}
			} else if (error instanceof Error) {
				errorMessage = error.message;
			}

			new Notice(`Analysis failed: ${errorMessage}`, 8000);
			console.error("Analysis failed:", error);
		}
	}
}
