import { normalizePath, Notice, TFile, App } from "obsidian";
import { TranslationKey } from "../../i18n";
import { DEFAULT_CHAT_MAX_TOKENS } from "../../constants/chatAppearance";
import { LLMService, LLMServiceError } from "../../services/llm";
import { extractPdfPageTexts } from "../../services/pdfDocumentService";
import { LectureLensSettings } from "../../settings";
import { LlmProfile } from "../../types/llmProfile";
import { PdfNotesProgress, PdfOutline, PdfOutlineSection, PdfPageText } from "../../types/pdfNotes";
import { extractJsonFromLlmResponse } from "../../utils/jsonExtract";
import { PdfNotesModal } from "../../ui/pdfNotesModal";

const OUTLINE_MAX_TOKENS = 4096;
const SECTION_MAX_TOKENS = 4096;
const MERGE_MAX_TOKENS = DEFAULT_CHAT_MAX_TOKENS;
const LLM_TIMEOUT_MS = 120000;

export interface PdfNotesHost {
	app: App;
	settings: LectureLensSettings;
	llmService: LLMService;
	tr: (key: TranslationKey, params?: Record<string, string | number>) => string;
	getDefaultLlmProfile(): LlmProfile;
	applyLlmProfile(profile: LlmProfile): void;
}

export interface PdfNotesResult {
	outputPath: string;
	outputFile: TFile;
}

function buildPageCorpus(pages: PdfPageText[]): string {
	return pages
		.map((page) => {
			const excerpt = page.text || "(no extractable text on this page)";
			return `--- Page ${page.pageNumber} ---\n${excerpt}`;
		})
		.join("\n\n");
}

function pagesForSection(pages: PdfPageText[], section: PdfOutlineSection): PdfPageText[] {
	return pages.filter(
		(page) => page.pageNumber >= section.pageStart && page.pageNumber <= section.pageEnd
	);
}

async function callLlmText(
	llmService: LLMService,
	systemPrompt: string,
	userPrompt: string,
	maxTokens: number
): Promise<string> {
	const response = await llmService.chatCompletion(
		[
			LLMService.createTextMessage("system", systemPrompt),
			LLMService.createTextMessage("user", userPrompt),
		],
		{ temperature: 0.3, max_tokens: maxTokens }
	);
	const content = response.choices[0]?.message?.content;
	if (typeof content !== "string" || !content.trim()) {
		throw new Error("Empty LLM response");
	}
	return content.trim();
}

function validateOutline(raw: PdfOutline, pageCount: number): PdfOutline {
	if (!raw?.title?.trim() || !Array.isArray(raw.sections) || raw.sections.length === 0) {
		throw new Error("Invalid outline JSON");
	}
	const sections = raw.sections.map((section, index) => {
		const pageStart = Math.max(1, Math.min(section.pageStart ?? 1, pageCount));
		const pageEnd = Math.max(1, Math.min(section.pageEnd ?? pageCount, pageCount));
		return {
			id: section.id?.trim() || `section-${index + 1}`,
			title: section.title?.trim() || `Section ${index + 1}`,
			summary: section.summary?.trim() || "",
			pageStart: Math.min(pageStart, pageEnd),
			pageEnd: Math.max(pageStart, pageEnd),
		};
	});
	return { title: raw.title.trim(), sections };
}

async function generateOutline(
	llmService: LLMService,
	pages: PdfPageText[],
	tr: (key: TranslationKey) => string
): Promise<PdfOutline> {
	const systemPrompt = tr("pdfNotes.prompt.outlineSystem");
	const userPrompt = `${tr("pdfNotes.prompt.outlineUser")}\n\n${buildPageCorpus(pages)}`;
	const response = await callLlmText(llmService, systemPrompt, userPrompt, OUTLINE_MAX_TOKENS);
	const parsed = extractJsonFromLlmResponse<PdfOutline>(response);
	return validateOutline(parsed, pages.length);
}

async function writeSectionMarkdown(
	llmService: LLMService,
	outline: PdfOutline,
	section: PdfOutlineSection,
	pages: PdfPageText[],
	tr: (key: TranslationKey) => string
): Promise<string> {
	const relevantPages = pagesForSection(pages, section);
	const systemPrompt = tr("pdfNotes.prompt.sectionSystem");
	const userPrompt = [
		tr("pdfNotes.prompt.sectionUser"),
		`Document title: ${outline.title}`,
		`Section: ${section.title}`,
		`Summary: ${section.summary}`,
		`Pages: ${section.pageStart}-${section.pageEnd}`,
		"",
		buildPageCorpus(relevantPages),
	].join("\n");
	return callLlmText(llmService, systemPrompt, userPrompt, SECTION_MAX_TOKENS);
}

async function mergeSections(
	llmService: LLMService,
	outline: PdfOutline,
	sectionsMarkdown: string[],
	tr: (key: TranslationKey) => string
): Promise<string> {
	const systemPrompt = tr("pdfNotes.prompt.mergeSystem");
	const userPrompt = [
		tr("pdfNotes.prompt.mergeUser"),
		`Document title: ${outline.title}`,
		"",
		sectionsMarkdown.join("\n\n---\n\n"),
	].join("\n");
	return callLlmText(llmService, systemPrompt, userPrompt, MERGE_MAX_TOKENS);
}

function buildFrontmatter(pdfFile: TFile, totalPages: number, outlineTitle: string): string {
	const sourceLink = pdfFile.basename;
	return [
		"---",
		`title: "${outlineTitle.replace(/"/g, '\\"')}"`,
		`source: "[[${sourceLink}]]"`,
		`source_path: "${pdfFile.path.replace(/"/g, '\\"')}"`,
		`pages: ${totalPages}`,
		"generated_by: lecture-lens",
		"---",
		"",
	].join("\n");
}

async function resolveOutputPath(
	host: PdfNotesHost,
	pdfFile: TFile,
	outlineTitle: string
): Promise<string> {
	const folder =
		host.settings.pdfNotesOutputFolder.trim() ||
		(pdfFile.parent?.path ?? "");
	const baseName = outlineTitle.replace(/[\\/:*?"<>|]/g, "-").trim() || pdfFile.basename;
	let candidate = normalizePath(`${folder}/${baseName}.md`);
	let suffix = 1;
	while (host.app.vault.getAbstractFileByPath(candidate)) {
		suffix += 1;
		candidate = normalizePath(`${folder}/${baseName} ${suffix}.md`);
	}
	return candidate;
}

function formatError(error: unknown, tr: (key: TranslationKey) => string): string {
	if (error instanceof LLMServiceError) {
		return error.statusCode ? `HTTP ${error.statusCode}: ${error.message}` : error.message;
	}
	if (error instanceof Error) return error.message;
	return tr("notice.unknownError");
}

export async function runPdfNotesPipeline(
	host: PdfNotesHost,
	pdfFile: TFile,
	modal: PdfNotesModal,
	onProgress?: (progress: PdfNotesProgress) => void
): Promise<PdfNotesResult> {
	const tr = host.tr;
	const previousProfile = host.getDefaultLlmProfile();

	host.applyLlmProfile(previousProfile);
	host.llmService.updateConfig({ timeout: LLM_TIMEOUT_MS });

	const report = (progress: PdfNotesProgress) => {
		onProgress?.(progress);
		if (progress.phase === "sections" && progress.current && progress.total) {
			modal.setProgress(progress.current, progress.total, progress.message);
		} else {
			modal.setPhase(progress.phase, progress.message);
		}
	};

	try {
		report({ phase: "parsing", message: pdfFile.path });
		const { pages, totalPages, truncated } = await extractPdfPageTexts(
			host.app,
			pdfFile,
			host.settings.pdfNotesMaxPages
		);
		if (pages.every((page) => !page.text)) {
			throw new Error(tr("notice.pdfNotesNoText"));
		}
		if (truncated) {
			report({
				phase: "parsing",
				message: tr("notice.pdfNotesTruncated", {
					limit: host.settings.pdfNotesMaxPages,
					total: totalPages,
				}),
			});
		}

		report({ phase: "outline", message: tr("modal.pdfNotes.phase.outline") });
		const outline = await generateOutline(host.llmService, pages, tr);

		const sectionBodies: string[] = [];
		for (let index = 0; index < outline.sections.length; index++) {
			const section = outline.sections[index]!;
			report({
				phase: "sections",
				message: section.title,
				current: index + 1,
				total: outline.sections.length,
			});
			const body = await writeSectionMarkdown(
				host.llmService,
				outline,
				section,
				pages,
				tr
			);
			sectionBodies.push(body);
		}

		let markdownBody: string;
		if (host.settings.pdfNotesSkipMerge) {
			markdownBody = [`# ${outline.title}`, ...sectionBodies].join("\n\n");
		} else {
			report({ phase: "merge", message: tr("modal.pdfNotes.phase.merge") });
			markdownBody = await mergeSections(host.llmService, outline, sectionBodies, tr);
		}

		report({ phase: "writing", message: tr("modal.pdfNotes.phase.writing") });
		const outputPath = await resolveOutputPath(host, pdfFile, outline.title);
		const content = buildFrontmatter(pdfFile, totalPages, outline.title) + markdownBody;
		await host.app.vault.create(outputPath, content);
		const outputFile = host.app.vault.getAbstractFileByPath(outputPath);
		if (!(outputFile instanceof TFile)) {
			throw new Error(tr("notice.pdfNotesWriteFailed"));
		}

		report({ phase: "done", message: outputPath });
		modal.setPhase("done", outputPath);
		return { outputPath, outputFile };
	} finally {
		host.applyLlmProfile(previousProfile);
		host.llmService.updateConfig({ timeout: 30000 });
	}
}

export async function generatePdfNotes(
	host: PdfNotesHost,
	pdfFile: TFile
): Promise<void> {
	const profile = host.getDefaultLlmProfile();
	if (!profile.apiKey.trim()) {
		new Notice(host.tr("notice.pdfNotesNoApiKey"), 8000);
		return;
	}

	const modal = new PdfNotesModal(host.app, host.tr);
	modal.open();

	try {
		const result = await runPdfNotesPipeline(host, pdfFile, modal);
		setTimeout(() => {
			modal.close();
			new Notice(
				host.tr("notice.pdfNotesComplete", { path: result.outputPath }),
				6000
			);
		}, 800);
	} catch (error) {
		const message = formatError(error, host.tr);
		modal.setError(message);
		console.error("PDF notes generation failed:", error);
		setTimeout(() => {
			modal.close();
			new Notice(host.tr("notice.pdfNotesFailed", { message }), 10000);
		}, 2000);
	}
}
