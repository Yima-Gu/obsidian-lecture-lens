import { requestUrl } from "obsidian";
import { normalizeMirrorUrl } from "../constants/localEmbeddingModels";

export type FetchPatcher = () => void;

/** Route HTTPS downloads through Obsidian requestUrl (bypasses browser CORS in Electron). */
export function installObsidianFetch(): FetchPatcher {
	const originalFetch = globalThis.fetch.bind(globalThis);

	globalThis.fetch = (async (
		input: RequestInfo | URL,
		init?: RequestInit
	): Promise<Response> => {
		const url =
			typeof input === "string"
				? input
				: input instanceof URL
					? input.toString()
					: input.url;

		if (/^https?:\/\//i.test(url)) {
			try {
				const method = init?.method ?? "GET";
				let headers: Record<string, string> | undefined;
				if (init?.headers) {
					headers = {};
					const headerList = new Headers(init.headers);
					headerList.forEach((value, key) => {
						headers![key] = value;
					});
				}

				const response = await requestUrl({
					url,
					method,
					headers,
					throw: false,
				});

				if (response.status >= 200 && response.status < 300) {
					return new Response(response.arrayBuffer, {
						status: response.status,
						headers: response.headers,
					});
				}

				if (response.status >= 400) {
					throw new Error(`HTTP ${response.status} for ${url}`);
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Download failed for ${url}: ${message}`);
			}
		}

		return originalFetch(input, init);
	}) as typeof fetch;

	return () => {
		globalThis.fetch = originalFetch;
	};
}

export function buildModelFileUrl(
	mirrorUrl: string,
	modelId: string,
	filePath: string,
	revision = "main"
): string {
	const host = normalizeMirrorUrl(mirrorUrl);
	const path = `${modelId}/resolve/${revision}/${filePath}`;
	return `${host}${path}`;
}
