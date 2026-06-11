const MAX_CHAT_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/jpg",
	"image/gif",
	"image/webp",
]);

export interface ChatImageAttachment {
	id: string;
	base64: string;
	mimeType: string;
	previewUrl: string;
	name: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	// eslint-disable-next-line no-undef
	if (typeof Buffer !== "undefined") return Buffer.from(buffer).toString("base64");

	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
		binary += String.fromCharCode(...chunk);
	}
	return btoa(binary);
}

function normalizeMimeType(mimeType: string): string {
	if (mimeType === "image/jpg") return "image/jpeg";
	return mimeType;
}

const EXTENSION_MIME: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
};

function mimeFromFilename(filename: string): string | null {
	const ext = filename.split(".").pop()?.toLowerCase();
	if (!ext) return null;
	return EXTENSION_MIME[ext] ?? null;
}

export async function fileToChatImage(file: File): Promise<ChatImageAttachment | null> {
	let mimeType = normalizeMimeType(file.type);
	if (!ALLOWED_MIME_TYPES.has(mimeType)) {
		const fromName = mimeFromFilename(file.name);
		if (!fromName) return null;
		mimeType = fromName;
	}
	if (file.size > MAX_CHAT_IMAGE_BYTES) return null;

	const buffer = await file.arrayBuffer();
	const base64 = arrayBufferToBase64(buffer);
	const previewUrl = `data:${mimeType};base64,${base64}`;

	return {
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		base64,
		mimeType,
		previewUrl,
		name: file.name || "image",
	};
}

export function chatImageToLlmPayload(image: ChatImageAttachment): {
	base64: string;
	mimeType: string;
	detail: "high";
} {
	return {
		base64: image.base64,
		mimeType: image.mimeType,
		detail: "high",
	};
}
