import { App } from "obsidian";

/** ONNX Runtime WASM binaries shipped beside main.js (copied at build time). */
export const ONNX_WASM_FILES = ["ort-wasm-simd.wasm", "ort-wasm.wasm"] as const;

export type OnnxWasmPaths = Record<(typeof ONNX_WASM_FILES)[number], string>;

let cachedWasmPaths: OnnxWasmPaths | null = null;

export async function resolveOnnxWasmPaths(
	app: App,
	pluginId: string
): Promise<OnnxWasmPaths> {
	if (cachedWasmPaths) {
		return cachedWasmPaths;
	}

	const paths = {} as OnnxWasmPaths;
	for (const fileName of ONNX_WASM_FILES) {
		const vaultPath = `${app.vault.configDir}/plugins/${pluginId}/${fileName}`;
		if (!(await app.vault.adapter.exists(vaultPath))) {
			throw new Error(
				`${fileName} is missing from the plugin folder. Run "npm run build" and reload the plugin.`
			);
		}
		const data = await app.vault.adapter.readBinary(vaultPath);
		const blob = new Blob([new Uint8Array(data)], { type: "application/wasm" });
		paths[fileName] = URL.createObjectURL(blob);
	}

	cachedWasmPaths = paths;
	return paths;
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
