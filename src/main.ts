import { MarkdownView, Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, LectureLensSettingTab, LectureLensSettings } from "./settings";
import { LLMService, LLMServiceError } from "./services/llm";
import { ImageExtractor } from "./services/imageExtractor";
import { AnalysisModal } from "./ui/analysisModal";

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
			void this.analyzeCurrentNote();
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
	 * Main analysis workflow: Extract images from the current note and generate lecture notes
	 */
	private async analyzeCurrentNote(): Promise<void> {
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
				modal.close();
				new Notice("No images found in the current note", 5000);
				return;
			}

			// Step 2: Call LLM for analysis
			modal.setStatusAnalyzing();

			// Create multimodal message with images
			const userMessage = LLMService.createMultimodalMessage(
				"user",
				"Please generate structured lecture notes based on these images. Analyze the content carefully and create clear, well-organized notes with proper headings, bullet points, and key concepts.",
				imageData.map((img) => ({
					base64: img.base64,
					mimeType: img.mimeType,
					detail: "high" as const,
				}))
			);

			// Make API call
			const response = await this.llmService.chatCompletion(
				[userMessage],
				{
					temperature: 0.7,
					max_tokens: 4000,
				}
			);

			// Extract the AI's response
			const firstChoice = response.choices[0];
			const aiResponse = firstChoice?.message?.content;

			if (!aiResponse || typeof aiResponse !== "string") {
				throw new Error("No valid response from AI");
			}

			// Step 3: Insert the response into the editor
			modal.setStatusDone();

			// Get the end of the document
			const lastLine = editor.lastLine();
			const lastLineLength = editor.getLine(lastLine).length;

			// Add a separator and the AI response
			const separator = "\n\n---\n\n## 📝 AI Generated Lecture Notes\n\n";
			const textToInsert = separator + aiResponse + "\n";

			// Insert at the end of the document
			editor.replaceRange(textToInsert, {
				line: lastLine,
				ch: lastLineLength,
			});

			// Close modal after a brief delay
			setTimeout(() => {
				modal.close();
				new Notice(
					"Analysis complete! Generated notes added to the end of the document",
					5000
				);
			}, 500);
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

			modal.setStatusError(errorMessage);
			console.error("Analysis failed:", error);

			// Close modal after showing error
			setTimeout(() => {
				modal.close();
				new Notice(`❌ Analysis failed:\n${errorMessage}`, 8000);
			}, 2000);
		}
	}
}
