/** Convert binary data to base64 (Electron Buffer or browser fallback). */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	if (typeof Buffer !== "undefined") {
		// eslint-disable-next-line no-undef -- Buffer exists in Obsidian's Electron renderer.
		return Buffer.from(buffer).toString("base64");
	}

	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
		binary += String.fromCharCode.apply(null, Array.from(chunk));
	}
	return btoa(binary);
}
