import { App } from "obsidian";
import {
	normalizeLocalModelId,
	normalizeMirrorUrl,
} from "../constants/localEmbeddingModels";
import { ensurePluginDataDir, resolvePluginDataFile } from "../utils/pluginDataPath";

export type EmbeddingModelState = "not_downloaded" | "downloading" | "ready" | "error";

export interface EmbeddingModelStatus {
	modelId: string;
	mirrorUrl: string;
	state: EmbeddingModelState;
	message: string;
	error?: string;
	updatedAt: number;
}

export function createDefaultEmbeddingModelStatus(
	modelId: string,
	mirrorUrl: string
): EmbeddingModelStatus {
	return {
		modelId,
		mirrorUrl,
		state: "not_downloaded",
		message: "",
		updatedAt: Date.now(),
	};
}

export class EmbeddingModelStatusService {
	private cache: EmbeddingModelStatus | null = null;

	constructor(
		private readonly app: App,
		private readonly pluginId: string
	) {}

	private async getStatusPath(): Promise<string> {
		return resolvePluginDataFile(this.app, this.pluginId, "embedding-model-status.json");
	}

	async load(): Promise<EmbeddingModelStatus | null> {
		if (this.cache) return this.cache;
		const path = await this.getStatusPath();
		if (!(await this.app.vault.adapter.exists(path))) {
			return null;
		}
		try {
			const raw = await this.app.vault.adapter.read(path);
			const parsed = JSON.parse(raw) as EmbeddingModelStatus;
			this.cache = parsed;
			return parsed;
		} catch {
			return null;
		}
	}

	async save(status: EmbeddingModelStatus): Promise<void> {
		await ensurePluginDataDir(this.app);
		const path = await this.getStatusPath();
		status.updatedAt = Date.now();
		await this.app.vault.adapter.write(path, JSON.stringify(status, null, 2));
		this.cache = status;
	}

	async isReady(modelId: string, mirrorUrl: string): Promise<boolean> {
		const status = await this.load();
		if (!status || status.state !== "ready") {
			return false;
		}
		return (
			normalizeLocalModelId(status.modelId) === normalizeLocalModelId(modelId) &&
			normalizeMirrorUrl(status.mirrorUrl) === normalizeMirrorUrl(mirrorUrl)
		);
	}

	clearCache(): void {
		this.cache = null;
	}
}
