import { MarkdownView, Notice } from "obsidian";
import LectureLensPlugin from "../main";
import { analyzeImageFromBase64 } from "./imageAnalysis";
import { AskImageModal } from "../ui/askImageModal";

export function registerClipboardPaste(plugin: LectureLensPlugin): void {
	if (!plugin.settings.enablePasteOcr) return;

	plugin.registerDomEvent(document, "paste", (evt: ClipboardEvent) => {
		const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.file) return;

		const items = evt.clipboardData?.items;
		if (!items) return;

		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			if (!item || !item.type.startsWith("image/")) continue;

			evt.preventDefault();
			void handlePasteImage(plugin, item, view);
			return;
		}
	});
}

async function handlePasteImage(
	plugin: LectureLensPlugin,
	item: DataTransferItem,
	view: MarkdownView
): Promise<void> {
	const file = item.getAsFile();
	if (!file) {
		new Notice(plugin.tr("notice.couldNotReadPastedImage"), 5000);
		return;
	}

	const arrayBuffer = await file.arrayBuffer();
	const mimeType = file.type || "image/png";
	const saved = await plugin.imageExtractor.saveImageBytes(
		arrayBuffer,
		mimeType,
		plugin.settings.pasteImageFolder
	);

	if (!saved) {
		new Notice(plugin.tr("notice.failedToSavePastedImage"), 5000);
		return;
	}

	const editor = view.editor;
	const cursor = editor.getCursor();
	const wikiLink = `![[${saved.path}]]`;
	editor.replaceRange(`${wikiLink}\n`, cursor);

	const { base64 } = await plugin.imageExtractor.readImageAsBase64(saved);

	const runAnalysis = (prompt: string) => {
		void analyzeImageFromBase64(
			plugin.getAnalysisContext(),
			base64,
			mimeType,
			prompt,
			editor,
			cursor.line
		);
	};

	if (plugin.settings.autoAnalyzeOnPaste) {
		const defaultPrompt =
			plugin.settings.promptTemplates[0]?.prompt ??
			"Analyze this slide and extract structured notes.";
		runAnalysis(defaultPrompt);
		return;
	}

	const modal = new AskImageModal(
		plugin.app,
		plugin.settings.promptTemplates,
		plugin.tr.bind(plugin),
		runAnalysis
	);
	modal.open();
}
