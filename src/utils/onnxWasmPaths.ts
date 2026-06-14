import { App, requestUrl } from "obsidian";

/** ONNX Runtime WASM binaries shipped beside main.js (copied at build time). */
export const ONNX_WASM_FILES = ["ort-wasm-simd.wasm", "ort-wasm.wasm"] as const;

export type OnnxWasmPaths = Record<(typeof ONNX_WASM_FILES)[number], string>;

const TRANSFORMERS_VERSION = "2.17.2";
const ONNX_WASM_CDN_BASE = `https://cdn.jsdelivr.net/npm/@xenova/transformers@${TRANSFORMERS_VERSION}/dist`;

let cachedWasmPaths: OnnxWasmPaths | null = null;

async function blobUrlFromVaultFile(app: App, vaultPath: string): Promise<string> {
	const data = await app.vault.adapter.readBinary(vaultPath);
	const blob = new Blob([new Uint8Array(data)], { type: "application/wasm" });
	return URL.createObjectURL(blob);
}

async function blobUrlFromCdn(fileName: string): Promise<string> {
	const url = `${ONNX_WASM_CDN_BASE}/${fileName}`;
	const response = await requestUrl({ url, method: "GET", throw: false });
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`Failed to download ${fileName} (HTTP ${response.status})`);
	}
	const blob = new Blob([response.arrayBuffer], { type: "application/wasm" });
	return URL.createObjectURL(blob);
}

/**
 * Resolve ONNX WASM paths for transformers.js.
 * Community plugin installs only ship main.js — missing files are fetched from CDN.
 */
export async function resolveOnnxWasmPaths(
	app: App,
	pluginId: string
): Promise<OnnxWasmPaths | null> {
	if (cachedWasmPaths) {
		return cachedWasmPaths;
	}

	const paths = {} as OnnxWasmPaths;
	const localPaths: Partial<Record<(typeof ONNX_WASM_FILES)[number], string>> = {};

	for (const fileName of ONNX_WASM_FILES) {
		const vaultPath = `${app.vault.configDir}/plugins/${pluginId}/${fileName}`;
		if (await app.vault.adapter.exists(vaultPath)) {
			localPaths[fileName] = vaultPath;
		}
	}

	const hasAllLocal = ONNX_WASM_FILES.every((fileName) => localPaths[fileName]);

	try {
		if (hasAllLocal) {
			for (const fileName of ONNX_WASM_FILES) {
				paths[fileName] = await blobUrlFromVaultFile(app, localPaths[fileName]!);
			}
		} else {
			console.warn(
				"Lecture Lens: ONNX WASM files missing from plugin folder; downloading from CDN…"
			);
			for (const fileName of ONNX_WASM_FILES) {
				paths[fileName] = await blobUrlFromCdn(fileName);
			}
		}

		cachedWasmPaths = paths;
		return paths;
	} catch (error) {
		for (const url of Object.values(paths)) {
			URL.revokeObjectURL(url);
		}
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`Lecture Lens: ONNX WASM setup failed (${message}); using CDN wasmPaths.`);
		return null;
	}
}

export function releaseOnnxWasmPaths(): void {
	if (!cachedWasmPaths) {
		return;
	}
	for (const url of Object.values(cachedWasmPaths)) {
		URL.revokeObjectURL(url);
	}
	cachedWasmPaths = null;
}
