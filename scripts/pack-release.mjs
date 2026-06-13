import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const pluginId = manifest.id;
const version = manifest.version;

const requiredFiles = [
	"main.js",
	"manifest.json",
	"styles.css",
	"transformers.min.js",
	"ort-wasm-simd.wasm",
	"ort-wasm.wasm",
];

const workerFiles = fs
	.readdirSync(root)
	.filter((name) => name.startsWith("pdf.worker") && name.endsWith(".min.mjs"));

const releaseFiles = [...requiredFiles, ...workerFiles];
const missing = releaseFiles.filter((name) => !fs.existsSync(path.join(root, name)));
if (missing.length > 0) {
	console.error("Missing release files. Run npm run build first:");
	for (const name of missing) console.error(`  - ${name}`);
	process.exit(1);
}

const stagingRoot = path.join(root, "dist-pack");
const pluginDir = path.join(stagingRoot, pluginId);
fs.rmSync(stagingRoot, { recursive: true, force: true });
fs.mkdirSync(pluginDir, { recursive: true });

for (const name of releaseFiles) {
	fs.copyFileSync(path.join(root, name), path.join(pluginDir, name));
}

const zipName = `${pluginId}-${version}.zip`;
const zipPath = path.join(root, zipName);
fs.rmSync(zipPath, { force: true });

execSync(`zip -r ${JSON.stringify(zipPath)} ${JSON.stringify(pluginId)}`, {
	cwd: stagingRoot,
	stdio: "inherit",
});

fs.rmSync(stagingRoot, { recursive: true, force: true });
console.log(`Created ${zipName}`);
