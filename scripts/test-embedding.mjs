/**
 * Pre-Obsidian smoke tests for local embedding stack.
 * Run: npm run test:embedding
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const REQUIRED_FILES = [
	{ name: "main.js", minBytes: 50_000 },
	{ name: "transformers.min.js", minBytes: 500_000 },
	{ name: "ort-wasm-simd.wasm", minBytes: 5_000_000 },
	{ name: "ort-wasm.wasm", minBytes: 5_000_000 },
];

const WASM_MAGIC = Buffer.from([0x00, 0x61, 0x73, 0x6d]);

function ok(message) {
	console.log(`  OK  ${message}`);
}

function fail(message) {
	console.error(`  FAIL  ${message}`);
	process.exitCode = 1;
}

function applyObsidianProcessPatch() {
	globalThis.self = globalThis;
	globalThis.window = globalThis;
	if (process.release) {
		Object.defineProperty(process.release, "name", {
			value: "obsidian-renderer",
			configurable: true,
			writable: true,
		});
	}
	if (process.versions) {
		Object.defineProperty(process.versions, "node", {
			value: undefined,
			configurable: true,
			writable: true,
		});
	}
}

console.log("1/4 Checking build artifacts…");
for (const file of REQUIRED_FILES) {
	const filePath = path.join(ROOT, file.name);
	if (!fs.existsSync(filePath)) {
		fail(`${file.name} is missing — run npm run build`);
		continue;
	}
	const size = fs.statSync(filePath).size;
	if (size < file.minBytes) {
		fail(`${file.name} looks too small (${size} bytes)`);
		continue;
	}
	ok(`${file.name} (${(size / (1024 * 1024)).toFixed(2)} MB)`);
}

for (const wasmName of ["ort-wasm-simd.wasm", "ort-wasm.wasm"]) {
	const header = fs.readFileSync(path.join(ROOT, wasmName)).subarray(0, 4);
	if (!header.equals(WASM_MAGIC)) {
		fail(`${wasmName} is not a valid WASM binary`);
	} else {
		ok(`${wasmName} has valid WASM header`);
	}
}

console.log("\n2/4 Checking bundled plugin logic…");
const mainJs = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
for (const needle of [
	"obsidian-renderer",
	"resolveOnnxWasmPaths",
	"ort-wasm-simd.wasm",
	"installObsidianFetch",
]) {
	if (!mainJs.includes(needle)) {
		fail(`main.js missing expected snippet: ${needle}`);
	} else {
		ok(`main.js contains ${needle}`);
	}
}

console.log("\n3/4 Checking hf-mirror model prefetch…");
try {
	const { spawnSync } = await import("node:child_process");
	const result = spawnSync(process.execPath, ["scripts/test-prefetch-download.mjs"], {
		cwd: ROOT,
		encoding: "utf8",
	});
	process.stdout.write(result.stdout ?? "");
	process.stderr.write(result.stderr ?? "");
	if (result.status !== 0) {
		fail("model prefetch test failed");
	} else {
		ok("model files downloadable from hf-mirror");
	}
} catch (error) {
	fail(`model prefetch test crashed: ${error instanceof Error ? error.message : String(error)}`);
}

console.log("\n4/4 Checking local transformers + local WASM load…");
try {
	applyObsidianProcessPatch();

	const { pathToFileURL } = await import("node:url");
	const transformersUrl = pathToFileURL(path.join(ROOT, "transformers.min.js")).href;
	const mod = await import(transformersUrl);

	if (!mod.pipeline || !mod.env) {
		fail("transformers.min.js did not export pipeline/env");
	} else {
		ok("transformers.min.js loaded with Obsidian process patch");
	}

	const wasm = mod.env.backends?.onnx?.wasm;
	let simdBlob = "";
	let fallbackBlob = "";
	if (!wasm) {
		fail("ONNX wasm backend missing on env.backends.onnx");
	} else {
		simdBlob = URL.createObjectURL(
			new Blob([fs.readFileSync(path.join(ROOT, "ort-wasm-simd.wasm"))], {
				type: "application/wasm",
			})
		);
		fallbackBlob = URL.createObjectURL(
			new Blob([fs.readFileSync(path.join(ROOT, "ort-wasm.wasm"))], {
				type: "application/wasm",
			})
		);
		wasm.wasmPaths = {
			"ort-wasm-simd.wasm": simdBlob,
			"ort-wasm.wasm": fallbackBlob,
		};
		wasm.numThreads = 1;
		wasm.proxy = false;
		wasm.simd = true;
		ok("local WASM blob paths configured on env.backends.onnx.wasm");
	}

	if (simdBlob) {
		ok(`local WASM blob URL created (${simdBlob.slice(0, 32)}…)`);
		URL.revokeObjectURL(simdBlob);
		URL.revokeObjectURL(fallbackBlob);
	}
} catch (error) {
	fail(
		`local transformers/WASM test failed: ${error instanceof Error ? error.message : String(error)}`
	);
}

console.log(
	process.exitCode
		? "\nSome tests failed."
		: "\nAll embedding smoke tests passed. You can now reload the plugin in Obsidian."
);
