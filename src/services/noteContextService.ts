import { App, TFile } from "obsidian";

const TRUNCATION_MARKER = "\n\n… [content truncated for context limit]";

export class NoteContextService {
	constructor(private app: App) {}

	dedupeFiles(files: Array<TFile | null | undefined>): TFile[] {
		const seen = new Set<string>();
		const result: TFile[] = [];
		for (const file of files) {
			if (!file || seen.has(file.path)) continue;
			seen.add(file.path);
			result.push(file);
		}
		return result;
	}

	async buildContext(files: TFile[], maxCharsPerFile: number): Promise<string> {
		if (files.length === 0) return "";

		const parts: string[] = [];
		for (const file of files) {
			const content = await this.app.vault.read(file);
			const truncated = content.length > maxCharsPerFile;
			const text = truncated ? content.slice(0, maxCharsPerFile) + TRUNCATION_MARKER : content;
			parts.push(`### ${file.path}\n\n${text}`);
		}

		return parts.join("\n\n---\n\n");
	}
}
