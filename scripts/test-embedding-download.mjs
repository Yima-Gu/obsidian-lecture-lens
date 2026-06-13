/**
 * Standalone test: download Xenova embedding model via transformers.js + hf-mirror.
 * Run: node scripts/test-embedding-download.mjs
 */
import { pipeline, env } from "@xenova/transformers/dist/transformers.min.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, "../.test-model-cache");
const MIRROR = "https://hf-mirror.com/";
const MODEL = "Xenova/multilingual-e5-small";

class FileCache {
	constructor(dir) {
		this.dir = dir;
		fs.mkdirSync(dir, { recursive: true });
	}
	hash(url) {
		let h = 5381;
		for (let i = 0; i < url.length; i++) h = (h * 33) ^ url.charCodeAt(i);
		return Math.abs(h).toString(36);
	}
	pathFor(url) {
		const ext = url.includes(".json") ? ".json" : ".bin";
		return path.join(this.dir, `${this.hash(url)}${ext}`);
	}
	async match(url) {
		const p = this.pathFor(url);
		if (!fs.existsSync(p)) return undefined;
		const buf = fs.readFileSync(p);
		return new Response(buf);
	}
	async put(url, response) {
		const buf = Buffer.from(await response.arrayBuffer());
		fs.writeFileSync(this.pathFor(url), buf);
	}
}

const cache = new FileCache(CACHE_DIR);

env.remoteHost = MIRROR;
env.allowLocalModels = false;
env.allowRemoteModels = true;
env.useFS = false;
env.useFSCache = false;
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = cache;
env.backends.onnx.wasm.wasmPaths =
	"https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/";

console.log("Mirror:", MIRROR);
console.log("Model:", MODEL);
console.log("Cache:", CACHE_DIR);

try {
	const extractor = await pipeline("feature-extraction", MODEL, {
		progress_callback: (p) => {
			if (p.status === "progress" && p.file) {
				console.log(`  ${p.file} ${Math.round((p.progress ?? 0) * 100)}%`);
			} else if (p.status === "download") {
				console.log(`  download: ${p.file ?? p.name ?? "?"}`);
			} else {
				console.log("  progress:", p.status, p.file ?? p.name ?? "");
			}
		},
	});
	console.log("Pipeline ready, running test embedding...");
	const out = await extractor("query: hello world", { pooling: "mean", normalize: true });
	const dim = out?.data?.length ?? 0;
	console.log("OK — embedding dimension:", dim);
	if (!dim) process.exit(1);
} catch (err) {
	console.error("FAILED:", err);
	process.exit(1);
}
