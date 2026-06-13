/**
 * Mac/CI test: prefetch embedding model files via HTTP (same URLs as Obsidian requestUrl).
 * Run: node scripts/test-prefetch-download.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIRROR = "https://hf-mirror.com/";
const MODEL = "Xenova/multilingual-e5-small";
const FILES = [
	"config.json",
	"tokenizer.json",
	"tokenizer_config.json",
	"special_tokens_map.json",
	"sentencepiece.bpe.model",
	"onnx/model_quantized.onnx",
];
const OUT_DIR = path.join(__dirname, "../.test-prefetch-cache");

function buildUrl(filePath) {
	return `${MIRROR}${MODEL}/resolve/main/${filePath}`;
}

function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

fs.mkdirSync(OUT_DIR, { recursive: true });

console.log("Mirror:", MIRROR);
console.log("Model:", MODEL);
console.log("Output:", OUT_DIR);

let totalBytes = 0;

for (let i = 0; i < FILES.length; i++) {
	const filePath = FILES[i];
	const url = buildUrl(filePath);
	process.stdout.write(`[${i + 1}/${FILES.length}] ${filePath} … `);

	const response = await fetch(url, { redirect: "follow" });
	if (!response.ok) {
		console.error(`\nFAILED HTTP ${response.status} for ${url}`);
		process.exit(1);
	}

	const buffer = Buffer.from(await response.arrayBuffer());
	const safeName = filePath.replace(/\//g, "__");
	fs.writeFileSync(path.join(OUT_DIR, safeName), buffer);
	totalBytes += buffer.length;
	console.log(`${formatBytes(buffer.length)} OK`);
}

console.log(`\nAll ${FILES.length} files downloaded (${formatBytes(totalBytes)} total).`);
console.log("Obsidian plugin uses requestUrl for the same URLs — this confirms network/mirror access.");
