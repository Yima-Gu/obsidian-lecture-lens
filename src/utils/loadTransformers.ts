import { App, requestUrl } from "obsidian";

export const TRANSFORMERS_SCRIPT = "transformers.min.js";
const TRANSFORMERS_CDN =
	"https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js";

/**
 * Obsidian's Electron renderer exposes Node-like `process`, which makes
 * transformers pick onnxruntime-node and makes ort-wasm use fs.writeSync.
 * Patch only specific fields — never replace the whole process object.
 */
const OBSIDIAN_PROCESS_SHIM =
	'(()=>{const p=window.process;if(!p)return;const r=p.release;if(r){try{Object.defineProperty(r,"name",{value:"obsidian-renderer",configurable:true,writable:true});}catch(e){r.name="obsidian-renderer";}}const v=p.versions;if(v){try{Object.defineProperty(v,"node",{value:undefined,configurable:true,writable:true});}catch(e){delete v.node;}}})();\n';

export interface TransformersModule {
	env: {
		remoteHost: string;
		allowLocalModels: boolean;
		allowRemoteModels: boolean;
		useFS: boolean;
		useFSCache: boolean;
		useBrowserCache: boolean;
		useCustomCache: boolean;
		customCache: unknown;
		__dirname: string;
		localModelPath: string;
		cacheDir: string;
		backends?: {
			onnx?: {
				wasm?: {
					wasmPaths?: string | Record<string, string>;
					numThreads?: number;
					simd?: boolean;
					proxy?: boolean;
				};
			};
		};
	};
	pipeline: (
		task: string,
		model: string,
		options?: Record<string, unknown>
	) => Promise<unknown>;
}

let transformersModulePromise: Promise<TransformersModule> | null = null;
let processPatchApplied = false;
let originalReleaseName: string | undefined;
let originalNodeVersion: string | undefined;

type ObsidianProcess = {
	release?: { name?: string };
	versions?: { node?: string };
};

function getObsidianProcess(): ObsidianProcess | undefined {
	return (window as Window & { process?: ObsidianProcess }).process;
}

/** Keep WASM on the browser path for the entire plugin session. */
export function applyObsidianProcessPatch(): void {
	if (processPatchApplied) {
		return;
	}

	const proc = getObsidianProcess();

	if (!proc) {
		return;
	}

	originalReleaseName = proc.release?.name;
	originalNodeVersion = proc.versions?.node;

	if (proc.release) {
		try {
			Object.defineProperty(proc.release, "name", {
				value: "obsidian-renderer",
				configurable: true,
				writable: true,
			});
		} catch {
			proc.release.name = "obsidian-renderer";
		}
	}

	if (proc.versions) {
		try {
			Object.defineProperty(proc.versions, "node", {
				value: undefined,
				configurable: true,
				writable: true,
			});
		} catch {
			delete proc.versions.node;
		}
	}

	processPatchApplied = true;
}

export function restoreObsidianProcessPatch(): void {
	if (!processPatchApplied) {
		return;
	}

	const proc = getObsidianProcess();

	if (proc?.release && originalReleaseName !== undefined) {
		try {
			Object.defineProperty(proc.release, "name", {
				value: originalReleaseName,
				configurable: true,
				writable: true,
			});
		} catch {
			proc.release.name = originalReleaseName;
		}
	}

	if (proc?.versions && originalNodeVersion !== undefined) {
		try {
			Object.defineProperty(proc.versions, "node", {
				value: originalNodeVersion,
				configurable: true,
				writable: true,
			});
		} catch {
			proc.versions.node = originalNodeVersion;
		}
	}

	processPatchApplied = false;
	transformersModulePromise = null;
}

function assertOnnxRuntimeReady(mod: TransformersModule): void {
	if (!mod.env.backends?.onnx?.wasm) {
		throw new Error("ONNX WASM backend is unavailable after loading transformers.js.");
	}
}

/** Load the prebuilt browser bundle without esbuild re-bundling (preserves ONNX runtime). */
export async function loadTransformersModule(
	app: App,
	pluginId: string
): Promise<TransformersModule> {
	applyObsidianProcessPatch();

	if (!transformersModulePromise) {
		transformersModulePromise = importTransformersBundle(app, pluginId).catch((error: unknown) => {
			transformersModulePromise = null;
			throw error;
		});
	}
	return transformersModulePromise;
}

async function importTransformersBundle(
	app: App,
	pluginId: string
): Promise<TransformersModule> {
	const scriptPath = `${app.vault.configDir}/plugins/${pluginId}/${TRANSFORMERS_SCRIPT}`;
	if (await app.vault.adapter.exists(scriptPath)) {
		try {
			const code = await app.vault.adapter.read(scriptPath);
			return await importTransformersFromBlob(code);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`Lecture Lens: local ${TRANSFORMERS_SCRIPT} failed (${message}), trying CDN…`);
		}
	} else {
		console.warn(`Lecture Lens: ${TRANSFORMERS_SCRIPT} not found in plugin folder, trying CDN…`);
	}

	const response = await requestUrl({ url: TRANSFORMERS_CDN, method: "GET", throw: false });
	if (response.status < 200 || response.status >= 300) {
		throw new Error(`Failed to download transformers.js from CDN (HTTP ${response.status}).`);
	}
	return await importTransformersFromBlob(response.text);
}

async function importTransformersFromBlob(code: string): Promise<TransformersModule> {
	applyObsidianProcessPatch();
	const blob = new Blob([OBSIDIAN_PROCESS_SHIM + code], { type: "text/javascript" });
	const url = URL.createObjectURL(blob);

	try {
		// Blob URLs only reference plugin-local or CDN-fetched transformers code.
		// eslint-disable-next-line no-unsanitized/method -- createObjectURL output is never user-controlled.
		const mod = (await import(/* webpackIgnore: true */ url)) as TransformersModule;
		if (!mod.pipeline || !mod.env) {
			throw new Error("transformers.min.js loaded but pipeline/env exports are missing.");
		}
		assertOnnxRuntimeReady(mod);
		return mod;
	} finally {
		URL.revokeObjectURL(url);
	}
}
