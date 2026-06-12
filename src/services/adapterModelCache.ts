import { App } from "obsidian";
import { resolvePluginDataSubdir } from "../utils/pluginDataPath";

function hashRequest(request: string): string {
	let hash = 5381;
	for (let i = 0; i < request.length; i++) {
		hash = (hash * 33) ^ request.charCodeAt(i);
	}
	return Math.abs(hash).toString(36);
}

/** Persists transformers.js downloads under `.obsidian/lecture-lens/model-cache/`. */
export class AdapterModelCache {
	private readonly memory = new Map<string, ArrayBuffer>();
	private cacheDir = "";

	constructor(
		private readonly app: App,
		private readonly pluginId: string
	) {}

	async getCacheDir(): Promise<string> {
		if (!this.cacheDir) {
			this.cacheDir = await resolvePluginDataSubdir(this.app, this.pluginId, "model-cache");
		}
		return this.cacheDir;
	}

	private filePathFor(request: string, cacheDir: string): string {
		const suffix = request.includes(".json") ? ".json" : ".bin";
		return `${cacheDir}/${hashRequest(request)}${suffix}`;
	}

	async match(request: string): Promise<Response | undefined> {
		const cached = this.memory.get(request);
		if (cached) {
			return new Response(new Uint8Array(cached));
		}

		const cacheDir = await this.getCacheDir();
		const filePath = this.filePathFor(request, cacheDir);
		if (!(await this.app.vault.adapter.exists(filePath))) {
			return undefined;
		}

		const data = await this.app.vault.adapter.readBinary(filePath);
		this.memory.set(request, data);
		return new Response(new Uint8Array(data));
	}

	async put(request: string, response: Response): Promise<void> {
		const buffer = await response.arrayBuffer();
		this.memory.set(request, buffer);
		const cacheDir = await this.getCacheDir();
		const filePath = this.filePathFor(request, cacheDir);
		await this.app.vault.adapter.writeBinary(filePath, buffer);
	}
}
