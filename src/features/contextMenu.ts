import { Editor, MarkdownView, Menu } from "obsidian";
import LectureLensPlugin from "../main";
import { analyzeSingleImage } from "./imageAnalysis";
import { AskImageModal } from "../ui/askImageModal";
import { findImageLinkAtPosition } from "../utils/editor";

export function registerContextMenu(plugin: LectureLensPlugin): void {
	plugin.registerEvent(
		plugin.app.workspace.on("editor-menu", (menu: Menu, editor: Editor, view: MarkdownView) => {
			const cursor = editor.getCursor();
			const line = editor.getLine(cursor.line);
			const imageLink = findImageLinkAtPosition(line, cursor.ch);

			if (!imageLink || !view.file) return;

			menu.addItem((item) => {
				item
					.setTitle(plugin.tr("contextMenu.askAiAboutImage"))
					.setIcon("glasses")
					.onClick(() => {
						const modal = new AskImageModal(
							plugin.app,
							plugin.settings.promptTemplates,
							plugin.tr.bind(plugin),
							(prompt) => {
								void analyzeSingleImage(
									plugin.getAnalysisContext(),
									imageLink,
									prompt,
									editor,
									view.file!
								);
							}
						);
						modal.open();
					});
			});
		})
	);
}
