/* eslint-disable obsidianmd/ui/sentence-case */
import { App, Editor, MarkdownView, Notice, TFile } from "obsidian";
import { TranslationKey } from "../i18n";
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
	tr: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export async function analyzeCurrentNote(
	ctx: ImageAnalysisContext,
	prompt: string
): Promise<void> {
	const activeFile = ctx.app.workspace.getActiveFile();
	if (!activeFile) {
		new Notice(ctx.tr("notice.noActiveFile"), 5000);
		return;
	}

	const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView) {
		new Notice(ctx.tr("notice.noMarkdownView"), 5000);
		return;
	}

	const editor = activeView.editor;
	const modal = new AnalysisModal(ctx.app, ctx.tr);
	modal.open();

	const thinkingNotice = new Notice(ctx.tr("notice.thinking"), 0);

	try {
		modal.setStatusFindingImages();
		const content = await ctx.app.vault.read(activeFile);
		const imageData = await ctx.imageExtractor.extractAndReadImages(content, activeFile);

		if (imageData.length === 0) {
			thinkingNotice.hide();
			modal.close();
			new Notice(ctx.tr("notice.noImagesInNote"), 5000);
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
		const header = `\n\n---\n\n${ctx.tr("generated.aiLectureNotes")}\n\n`;
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
			throw new Error(ctx.tr("notice.noAiResponse"));
		}

		editor.replaceRange("\n", insertPos);
		modal.setStatusDone();
		setTimeout(() => {
			modal.close();
			new Notice(ctx.tr("notice.analysisCompleteWithNotes"), 5000);
		}, 500);
	} catch (error) {
		thinkingNotice.hide();
		const errorMessage = formatError(error, ctx);
		modal.setStatusError(errorMessage);
		console.error("Analysis failed:", error);
		setTimeout(() => {
			modal.close();
			new Notice(ctx.tr("notice.analysisFailedWithPrefix", { message: errorMessage }), 8000);
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
	const thinkingNotice = new Notice(ctx.tr("notice.thinking"), 0);

	try {
		const imageData = await ctx.imageExtractor.extractOneImage(imageLink, sourceFile);
		if (!imageData) {
			thinkingNotice.hide();
			new Notice(ctx.tr("notice.couldNotLoadImage"), 5000);
			return;
		}

		const userMessage = LLMService.createMultimodalMessage("user", prompt, [{
			base64: imageData.base64,
			mimeType: imageData.mimeType,
			detail: "high" as const,
		}]);

		const imageLine = findLineContaining(editor, imageLink);
		const imageLineContent = editor.getLine(imageLine);
		const header = `\n\n${ctx.tr("generated.aiAnalysisCallout")}\n> `;
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
		new Notice(ctx.tr("notice.analysisComplete"), 3000);
	} catch (error) {
		thinkingNotice.hide();
		new Notice(ctx.tr("notice.analysisFailed", { message: formatError(error, ctx) }), 8000);
		console.error("Analysis failed:", error);
	}
}

export async function batchAnalyzeImages(
	ctx: ImageAnalysisContext,
	prompt: string
): Promise<void> {
	const activeFile = ctx.app.workspace.getActiveFile();
	if (!activeFile) {
		new Notice(ctx.tr("notice.noActiveFile"), 5000);
		return;
	}

	const activeView = ctx.app.workspace.getActiveViewOfType(MarkdownView);
	if (!activeView) {
		new Notice(ctx.tr("notice.noMarkdownView"), 5000);
		return;
	}

	const editor = activeView.editor;
	const content = await ctx.app.vault.read(activeFile);
	const references = ctx.imageExtractor.extractImageReferences(content);

	if (references.length === 0) {
		new Notice(ctx.tr("notice.noImagesInNote"), 5000);
		return;
	}

	let successCount = 0;
	let errorCount = 0;

	for (let i = 0; i < references.length; i++) {
		const reference = references[i]!;
		const progressNotice = new Notice(
			ctx.tr("notice.batchProgress", { current: i + 1, total: references.length }),
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
			const header = `\n\n${ctx.tr("generated.aiAnalysisCallout")}\n> `;
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
		ctx.tr("notice.batchComplete", {
			success: successCount,
			failures:
				errorCount > 0 ? ctx.tr("notice.batchFailures", { count: errorCount }) : "",
		}),
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
	const thinkingNotice = new Notice(ctx.tr("notice.analyzingPastedImage"), 0);

	try {
		const userMessage = LLMService.createMultimodalMessage("user", prompt, [
			{ base64, mimeType, detail: "high" as const },
		]);

		const lineContent = editor.getLine(insertLine);
		const header = `\n\n${ctx.tr("generated.aiAnalysisCallout")}\n> `;
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
		new Notice(ctx.tr("notice.pastedAnalysisComplete"), 3000);
	} catch (error) {
		thinkingNotice.hide();
		new Notice(ctx.tr("notice.analysisFailed", { message: formatError(error, ctx) }), 8000);
	}
}

function formatError(error: unknown, ctx: ImageAnalysisContext): string {
	if (error instanceof LLMServiceError) {
		return error.statusCode ? `HTTP ${error.statusCode}: ${error.message}` : error.message;
	}
	if (error instanceof Error) return error.message;
	return ctx.tr("notice.unknownError");
}
