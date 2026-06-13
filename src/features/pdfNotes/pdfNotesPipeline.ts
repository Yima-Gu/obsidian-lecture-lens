import { normalizePath, TFile, App } from "obsidian";
import { TranslationKey } from "../../i18n";
import { LLMService, LLMServiceError } from "../../services/llm";
import { extractPdfPageTexts } from "../../services/pdfDocumentService";
import { LectureLensSettings } from "../../settings";
import { LlmProfile } from "../../types/llmProfile";
import {
	PdfNotesProgress,
	PdfNotesResult,
	PdfNotesRunOptions,
	PdfOutline,
	PdfOutlineSection,
	PdfPageText,
} from "../../types/pdfNotes";
import { extractJsonFromLlmResponse } from "../../utils/jsonExtract";
import { normalizeChatMathDelimiters } from "../../utils/normalizeChatMath";
import { PdfNotesProgressReporter, PdfNotesProgressTracker } from "../../ui/pdfNotesProgressTracker";

const OUTLINE_MAX_TOKENS = 4096;
const DEFAULT_SECTION_MAX_TOKENS = 8192;
const DEFAULT_MERGE_MAX_TOKENS = 16384;
const LLM_TIMEOUT_MS = 180000;
const OUTLINE_SNIPPET_CHARS = 480;
/** Skip LLM merge when stitched sections exceed this (merge would truncate). */
const MERGE_INPUT_CHAR_BUDGET = 24_000;

export interface PdfNotesHost {
	app: App;
	settings: LectureLensSettings;
	llmService: LLMService;
	tr: (key: TranslationKey, params?: Record<string, string | number>) => string;
	getDefaultLlmProfile(): LlmProfile;
	applyLlmProfile(profile: LlmProfile): void;
	isPdfNotesRunning?(): boolean;
}

export type { PdfNotesResult };

function buildPageCorpus(pages: PdfPageText[]): string {
	return pages
		.map((page) => {
			const excerpt = page.text || "(no extractable text on this page)";
			return `--- Page ${page.pageNumber} ---\n${excerpt}`;
		})
		.join("\n\n");
}

function buildOutlineCorpus(pages: PdfPageText[]): string {
	return pages
		.map((page) => {
			const raw = page.text || "(empty)";
			const snippet =
				raw.length > OUTLINE_SNIPPET_CHARS
					? `${raw.slice(0, OUTLINE_SNIPPET_CHARS)}…`
					: raw;
			return `--- Page ${page.pageNumber} ---\n${snippet}`;
		})
		.join("\n\n");
}

function pagesForSection(pages: PdfPageText[], section: PdfOutlineSection): PdfPageText[] {
	return pages.filter(
		(page) => page.pageNumber >= section.pageStart && page.pageNumber <= section.pageEnd
	);
}

function normalizeNoteMarkdown(markdown: string): string {
	return normalizeChatMathDelimiters(markdown.trim());
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
	return normalizeNoteMarkdown(content);
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

	sections.sort((a, b) => a.pageStart - b.pageStart || a.pageEnd - b.pageEnd);

	const normalized: PdfOutlineSection[] = [];
	for (let index = 0; index < sections.length; index++) {
		const section = sections[index]!;
		let prevEnd = index > 0 ? normalized[index - 1]!.pageEnd : 0;
		if (index > 0 && section.pageStart > prevEnd + 1) {
			const gapStart = prevEnd + 1;
			const gapEnd = section.pageStart - 1;
			normalized[index - 1]!.pageEnd = Math.min(gapEnd, pageCount);
			prevEnd = normalized[index - 1]!.pageEnd;
			console.warn(`PDF outline page gap filled: pages ${gapStart}-${gapEnd}`);
		}
		const pageStart = index === 0 ? 1 : Math.max(section.pageStart, prevEnd + 1);
		const pageEnd = Math.max(pageStart, section.pageEnd);
		if (pageStart > pageCount) break;
		normalized.push({
			...section,
			pageStart,
			pageEnd: Math.min(pageEnd, pageCount),
		});
	}

	if (normalized.length === 0) {
		throw new Error("Invalid outline JSON");
	}

	const last = normalized[normalized.length - 1]!;
	if (last.pageEnd < pageCount) {
		last.pageEnd = pageCount;
	}

	return { title: raw.title.trim(), sections: normalized };
}

async function generateOutline(
	llmService: LLMService,
	pages: PdfPageText[],
	tr: (key: TranslationKey) => string
): Promise<PdfOutline> {
	const systemPrompt = tr("pdfNotes.prompt.outlineSystem");
	const userPrompt = `${tr("pdfNotes.prompt.outlineUser")}\n\n${buildOutlineCorpus(pages)}`;
	const response = await callLlmText(llmService, systemPrompt, userPrompt, OUTLINE_MAX_TOKENS);
	const parsed = extractJsonFromLlmResponse<PdfOutline>(response);
	return validateOutline(parsed, pages.length);
}

async function writeSectionMarkdown(
	llmService: LLMService,
	outline: PdfOutline,
	section: PdfOutlineSection,
	sectionIndex: number,
	pages: PdfPageText[],
	tr: (key: TranslationKey) => string,
	sectionMaxTokens: number,
	stylePrompt?: string,
	sectionSystemPrompt?: string
): Promise<string> {
	const relevantPages = pagesForSection(pages, section);
	let systemPrompt = sectionSystemPrompt?.trim() || tr("pdfNotes.prompt.sectionSystem");
	if (stylePrompt) {
		systemPrompt += `\n\nStyle preference: ${stylePrompt}`;
	}

	const contextLines: string[] = [];
	const prevSection = sectionIndex > 0 ? outline.sections[sectionIndex - 1] : null;
	const nextSection = sectionIndex < outline.sections.length - 1 ? outline.sections[sectionIndex + 1] : null;
	if (prevSection) {
		contextLines.push(
			`Previous section (context only — do not repeat): ${prevSection.title}: ${prevSection.summary}`
		);
	}
	if (nextSection) {
		contextLines.push(
			`Next section (context only — do not cover yet): ${nextSection.title}: ${nextSection.summary}`
		);
	}

	const userPromptParts = [
		tr("pdfNotes.prompt.sectionUser"),
		`Document title: ${outline.title}`,
		`Section: ${section.title}`,
		`Summary: ${section.summary}`,
		`Pages: ${section.pageStart}-${section.pageEnd}`,
	];
	if (contextLines.length > 0) {
		userPromptParts.push(contextLines.join("\n"));
	}
	userPromptParts.push("", buildPageCorpus(relevantPages));

	return callLlmText(
		llmService,
		systemPrompt,
		userPromptParts.join("\n"),
		sectionMaxTokens
	);
}

async function mergeSections(
	llmService: LLMService,
	outline: PdfOutline,
	sectionsMarkdown: string[],
	tr: (key: TranslationKey) => string,
	maxTokens: number,
	stylePrompt?: string
): Promise<string> {
	let systemPrompt = tr("pdfNotes.prompt.mergeSystem");
	if (stylePrompt) {
		systemPrompt += `\n\nStyle preference: ${stylePrompt}`;
	}
	const userPrompt = [
		tr("pdfNotes.prompt.mergeUser"),
		`Document title: ${outline.title}`,
		"Section index (for structure only):",
		outline.sections
			.map((section, index) => `${index + 1}. ${section.title}: ${section.summary}`)
			.join("\n"),
		"",
		sectionsMarkdown.join("\n\n---\n\n"),
	].join("\n");
	return callLlmText(llmService, systemPrompt, userPrompt, maxTokens);
}

function stitchSections(title: string, sectionBodies: string[]): string {
	return normalizeNoteMarkdown([`# ${title}`, ...sectionBodies].join("\n\n"));
}

function shouldSkipMerge(settings: LectureLensSettings, sectionBodies: string[]): boolean {
	if (settings.pdfNotesSkipMerge) return true;
	const totalChars = sectionBodies.reduce((sum, body) => sum + body.length, 0);
	return totalChars > MERGE_INPUT_CHAR_BUDGET;
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
	outlineTitle: string,
	runOptions?: PdfNotesRunOptions
): Promise<string> {
	const folder =
		runOptions?.outputFolder?.trim() ||
		host.settings.pdfNotesOutputFolder.trim() ||
		(pdfFile.parent?.path ?? "");
	const baseName =
		runOptions?.outputBaseName?.trim() ||
		outlineTitle.replace(/[\\/:*?"<>|]/g, "-").trim() ||
		pdfFile.basename;
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

/** Run async tasks with a fixed concurrency pool; results preserve input order. */
async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	run: (item: T, index: number) => Promise<R>,
	onItemDone?: (index: number, completed: number) => void
): Promise<R[]> {
	if (items.length === 0) return [];

	const limit = Math.max(1, Math.min(concurrency, items.length));
	const results = new Array<R>(items.length);
	let nextIndex = 0;
	let completed = 0;

	const worker = async (): Promise<void> => {
		while (true) {
			const index = nextIndex;
			nextIndex += 1;
			if (index >= items.length) return;

			results[index] = await run(items[index]!, index);
			completed += 1;
			onItemDone?.(index, completed);
		}
	};

	await Promise.all(Array.from({ length: limit }, () => worker()));
	return results;
}

async function writeAllSections(
	host: PdfNotesHost,
	outline: PdfOutline,
	pages: PdfPageText[],
	sectionMaxTokens: number,
	concurrency: number,
	stylePrompt: string | undefined,
	sectionSystemPrompt: string | undefined,
	tr: (key: TranslationKey, params?: Record<string, string | number>) => string,
	report: (progress: PdfNotesProgress) => void
): Promise<string[]> {
	const total = outline.sections.length;

	report({
		phase: "sections",
		message: tr("pdfNotes.progress.sectionsParallel", {
			done: 0,
			total,
			title: outline.sections[0]?.title ?? "",
		}),
		current: 0,
		total,
	});

	return mapWithConcurrency(
		outline.sections,
		concurrency,
		async (section, index) =>
			writeSectionMarkdown(
				host.llmService,
				outline,
				section,
				index,
				pages,
				tr,
				sectionMaxTokens,
				stylePrompt,
				sectionSystemPrompt
			),
		(index, completed) => {
			const section = outline.sections[index]!;
			report({
				phase: "sections",
				message: tr("pdfNotes.progress.sectionsParallel", {
					done: completed,
					total,
					title: section.title,
				}),
				current: completed,
				total,
			});
		}
	);
}

export async function runPdfNotesPipeline(
	host: PdfNotesHost,
	pdfFile: TFile,
	reporter: PdfNotesProgressReporter,
	runOptions?: PdfNotesRunOptions
): Promise<PdfNotesResult> {
	const tr = (key: TranslationKey, params?: Record<string, string | number>) =>
		host.tr(key, params);
	const previousProfile = host.getDefaultLlmProfile();
		const sectionMaxTokens =
			host.settings.pdfNotesSectionMaxTokens || DEFAULT_SECTION_MAX_TOKENS;
		const sectionConcurrency = Math.max(
			1,
			Math.min(4, host.settings.pdfNotesSectionConcurrency || 2)
		);
		const mergeMaxTokens =
		host.settings.pdfNotesMergeMaxTokens || DEFAULT_MERGE_MAX_TOKENS;

	host.applyLlmProfile(previousProfile);
	host.llmService.updateConfig({ timeout: LLM_TIMEOUT_MS });

	const report = (progress: PdfNotesProgress) => {
		reporter.report(progress);
	};

	try {
		report({
			phase: "parsing",
			message: tr("pdfNotes.progress.parsingPages", { name: pdfFile.basename }),
		});

		const { pages, totalPages, truncated } = await extractPdfPageTexts(
			host.app,
			pdfFile,
			host.settings.pdfNotesMaxPages,
			(current, total) => {
				report({
					phase: "parsing",
					message: tr("pdfNotes.progress.parsingPage", { current, total }),
					current,
					total,
				});
			}
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
				current: pages.length,
				total: pages.length,
			});
		}

		report({ phase: "outline", message: tr("modal.pdfNotes.phase.outline") });
		const outline = await generateOutline(host.llmService, pages, tr);

		const stylePrompt = host.settings.pdfNotesStylePrompt?.trim() || undefined;
		const sectionSystemPrompt = runOptions?.sectionSystemPrompt?.trim() || undefined;

		const sectionBodies = await writeAllSections(
			host,
			outline,
			pages,
			sectionMaxTokens,
			sectionConcurrency,
			stylePrompt,
			sectionSystemPrompt,
			tr,
			report
		);

		let markdownBody: string;
		if (shouldSkipMerge(host.settings, sectionBodies)) {
			markdownBody = stitchSections(outline.title, sectionBodies);
		} else {
			report({ phase: "merge", message: tr("modal.pdfNotes.phase.merge") });
			markdownBody = await mergeSections(
				host.llmService,
				outline,
				sectionBodies,
				tr,
				mergeMaxTokens,
				stylePrompt
			);
		}

		report({ phase: "writing", message: tr("modal.pdfNotes.phase.writing") });
		const outputPath = await resolveOutputPath(host, pdfFile, outline.title, runOptions);
		const content = buildFrontmatter(pdfFile, totalPages, outline.title) + markdownBody;
		await host.app.vault.create(outputPath, content);
		const outputFile = host.app.vault.getAbstractFileByPath(outputPath);
		if (!(outputFile instanceof TFile)) {
			throw new Error(tr("notice.pdfNotesWriteFailed"));
		}

		report({ phase: "done", message: outputPath });
		return { outputPath, outputFile };
	} finally {
		host.applyLlmProfile(previousProfile);
		host.llmService.updateConfig({ timeout: 30000 });
	}
}

export async function generatePdfNotes(
	host: PdfNotesHost,
	pdfFile: TFile,
	tracker: PdfNotesProgressTracker,
	runOptions?: PdfNotesRunOptions
): Promise<void> {
	if (!tracker.isRunning()) {
		tracker.start(pdfFile);
	}

	try {
		const result = await runPdfNotesPipeline(host, pdfFile, tracker, runOptions);
		tracker.complete(result);
	} catch (error) {
		const message = formatError(error, host.tr);
		tracker.fail(message);
		console.error("PDF notes generation failed:", error);
	}
}
