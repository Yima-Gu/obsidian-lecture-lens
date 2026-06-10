/* eslint-disable obsidianmd/ui/sentence-case */
import { App, Editor, MarkdownView, Notice, TFile } from "obsidian";
import { LLMService, LLMServiceError } from "../services/llm";
import { ImageExtractor } from "../services/imageExtractor";
import { LectureLensSettings } from "../settings";
import { AnalysisModal } from "../ui/analysisModal";
import { advancePosition, findLineContaining } from "../utils/editor";

export interface ImageAnalysisContext {
	app: App;
	llmService: LLMService;
	imageExtractor: ImageExtractor;
	settings: LectureLensSettings;
}

export async function analyzeCurrentNote(
	ctx: ImageAnalysisContext,
	prompt: string
): Promise<void> {
	const activeFile = ctx.app.workspace.getActiveFile();
	if (!activeFile) {
		new Notice("No active file. Please open a note first.", 5000);
		return;
	}

	const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView) {
		new Notice("No active Markdown view found.", 5000);
		return;
	}

	const editor = activeView.editor;
	const modal = new AnalysisModal(ctx.app);
	modal.open();

	const thinkingNotice = new Notice("🤔 Thinking…", 0);

	try {
		modal.setStatusFindingImages();
		const content = await ctx.app.vault.read(activeFile);
		const imageData = await ctx.imageExtractor.extractAndReadImages(content, activeFile);

		if (imageData.length === 0) {
			thinkingNotice.hide();
			modal.close();
			new Notice("No images found in the current note", 5000);
			return;
		}

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

		const lastLine = editor.lastLine();
		const lastLineLength = editor.getLine(lastLine).length;
		const header = "\n\n---\n\n## 📝 AI Generated Lecture Notes\n\n";
		editor.replaceRange(header, { line: lastLine, ch: lastLineLength });

		let insertPos = advancePosition({ line: lastLine, ch: lastLineLength }, header);
		let firstChunk = true;

		for await (const chunk of ctx.llmService.chatCompletionStream([userMessage], {
			temperature: 0.7,
			max_tokens: 4000,
		})) {
			if (firstChunk) {
				thinkingNotice.hide();
				firstChunk = false;
			}
			editor.replaceRange(chunk, insertPos);
			insertPos = advancePosition(insertPos, chunk);
		}

		if (firstChunk) {
			thinkingNotice.hide();
			throw new Error("No response received from AI");
		}

		editor.replaceRange("\n", insertPos);
		modal.setStatusDone();
		setTimeout(() => {
			modal.close();
			new Notice("Analysis complete! Generated notes added to the end of the document", 5000);
		}, 500);
	} catch (error) {
		thinkingNotice.hide();
		const errorMessage = formatError(error);
		modal.setStatusError(errorMessage);
		console.error("Analysis failed:", error);
		setTimeout(() => {
			modal.close();
			new Notice(`❌ Analysis failed:\n${errorMessage}`, 8000);
		}, 2000);
	}
}

export async function analyzeSingleImage(
	ctx: ImageAnalysisContext,
	imageLink: string,
	prompt: string,
	editor: Editor,
	sourceFile: TFile
): Promise<void> {
	const thinkingNotice = new Notice("🤔 Thinking…", 0);

	try {
		const imageData = await ctx.imageExtractor.extractOneImage(imageLink, sourceFile);
		if (!imageData) {
			thinkingNotice.hide();
			new Notice("Could not load the image", 5000);
			return;
		}

		const userMessage = LLMService.createMultimodalMessage("user", prompt, [{
			base64: imageData.base64,
			mimeType: imageData.mimeType,
			detail: "high" as const,
		}]);

		const imageLine = findLineContaining(editor, imageLink);
		const imageLineContent = editor.getLine(imageLine);
		const header = "\n\n> [!note]+ AI Analysis\n> ";
		editor.replaceRange(header, { line: imageLine, ch: imageLineContent.length });

		let insertPos = advancePosition({ line: imageLine, ch: imageLineContent.length }, header);
		let firstChunk = true;

		for await (const chunk of ctx.llmService.chatCompletionStream([userMessage], {
			temperature: 0.7,
			max_tokens: 2000,
		})) {
			if (firstChunk) {
				thinkingNotice.hide();
				firstChunk = false;
			}
			const indentedChunk = chunk.replace(/\n/g, "\n> ");
			editor.replaceRange(indentedChunk, insertPos);
			insertPos = advancePosition(insertPos, indentedChunk);
		}

		editor.replaceRange("\n\n", insertPos);
		new Notice("Analysis complete", 3000);
	} catch (error) {
		thinkingNotice.hide();
		new Notice(`Analysis failed: ${formatError(error)}`, 8000);
		console.error("Analysis failed:", error);
	}
}

export async function batchAnalyzeImages(
	ctx: ImageAnalysisContext,
	prompt: string
): Promise<void> {
	const activeFile = ctx.app.workspace.getActiveFile();
	if (!activeFile) {
		new Notice("No active file. Please open a note first.", 5000);
		return;
	}

	const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView) {
		new Notice("No active Markdown view found.", 5000);
		return;
	}

	const editor = activeView.editor;
	const content = await ctx.app.vault.read(activeFile);
	const references = ctx.imageExtractor.extractImageReferences(content);

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
			const file = ctx.imageExtractor.resolveImageFile(reference.path, activeFile);
			if (!file) {
				errorCount++;
				continue;
			}

			const { base64, mimeType } = await ctx.imageExtractor.readImageAsBase64(file);
			const userMessage = LLMService.createMultimodalMessage("user", prompt, [
				{ base64, mimeType, detail: "high" as const },
			]);

			const imageLine = findLineContaining(editor, reference.originalText);
			const imageLineContent = editor.getLine(imageLine);
			const header = "\n\n> [!note]+ AI Analysis\n> ";
			editor.replaceRange(header, { line: imageLine, ch: imageLineContent.length });

			let insertPos = advancePosition({ line: imageLine, ch: imageLineContent.length }, header);

			for await (const chunk of ctx.llmService.chatCompletionStream([userMessage], {
				temperature: 0.7,
				max_tokens: 2000,
			})) {
				const indentedChunk = chunk.replace(/\n/g, "\n> ");
				editor.replaceRange(indentedChunk, insertPos);
				insertPos = advancePosition(insertPos, indentedChunk);
			}

			editor.replaceRange("\n\n", insertPos);
			successCount++;
		} catch (error) {
			console.error(`Failed to analyze image ${reference.path}:`, error);
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

export async function analyzeImageFromBase64(
	ctx: ImageAnalysisContext,
	base64: string,
	mimeType: string,
	prompt: string,
	editor: Editor,
	insertLine: number
): Promise<void> {
	const thinkingNotice = new Notice("🤔 Analyzing pasted image…", 0);

	try {
		const userMessage = LLMService.createMultimodalMessage("user", prompt, [
			{ base64, mimeType, detail: "high" as const },
		]);

		const lineContent = editor.getLine(insertLine);
		const header = "\n\n> [!note]+ AI Analysis\n> ";
		editor.replaceRange(header, { line: insertLine, ch: lineContent.length });

		let insertPos = advancePosition({ line: insertLine, ch: lineContent.length }, header);
		let firstChunk = true;

		for await (const chunk of ctx.llmService.chatCompletionStream([userMessage], {
			temperature: 0.7,
			max_tokens: 2000,
		})) {
			if (firstChunk) {
				thinkingNotice.hide();
				firstChunk = false;
			}
			const indentedChunk = chunk.replace(/\n/g, "\n> ");
			editor.replaceRange(indentedChunk, insertPos);
			insertPos = advancePosition(insertPos, indentedChunk);
		}

		editor.replaceRange("\n\n", insertPos);
		new Notice("Pasted image analysis complete", 3000);
	} catch (error) {
		thinkingNotice.hide();
		new Notice(`Analysis failed: ${formatError(error)}`, 8000);
	}
}

function formatError(error: unknown): string {
	if (error instanceof LLMServiceError) {
		return error.statusCode ? `HTTP ${error.statusCode}: ${error.message}` : error.message;
	}
	if (error instanceof Error) return error.message;
	return "Unknown error";
}
