import { App, TFile } from "obsidian";

/**
 * Represents an image found in a note
 */
export interface ImageReference {
	/** Original markdown text of the image reference */
	originalText: string;
	/** Path to the image file (can be relative or absolute within vault) */
	path: string;
	/** Alt text for the image (if any) */
	altText?: string;
	/** Type of link: wiki-style or markdown-style */
	linkType: "wiki" | "markdown";
}

/**
 * Represents an image with its binary data and metadata
 */
export interface ImageData {
	/** The image reference information */
	reference: ImageReference;
	/** Base64-encoded image data */
	base64: string;
	/** MIME type of the image */
	mimeType: string;
	/** File size in bytes */
	size: number;
}

/**
 * Regular expressions for detecting image links
 */
const IMAGE_REGEX = {
	// Wiki-style: ![[image.png]] or ![[image.png|alt text]]
	wiki: /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
	// Markdown-style: ![alt text](image.png)
	markdown: /!\[([^\]]*)\]\(([^)]+)\)/g,
};

/**
 * Supported image file extensions
 */
const IMAGE_EXTENSIONS = [
	"png",
	"jpg",
	"jpeg",
	"gif",
	"bmp",
	"svg",
	"webp",
];

/**
 * Service for extracting and processing images from Obsidian notes
 */
export class ImageExtractor {
	constructor(private app: App) {}

	/**
	 * Extract all image references from markdown content
	 * @param content - The markdown content to parse
	 * @returns Array of image references found in the content
	 */
	public extractImageReferences(content: string): ImageReference[] {
		const references: ImageReference[] = [];

		// Extract wiki-style images: ![[image.png]] or ![[image.png|alt text]]
		const wikiMatches = content.matchAll(IMAGE_REGEX.wiki);
		for (const match of wikiMatches) {
			const path = match[1]?.trim();
			const altText = match[2]?.trim();
			if (path) {
				references.push({
					originalText: match[0],
					path,
					altText,
					linkType: "wiki",
				});
			}
		}

		// Extract markdown-style images: ![alt text](image.png)
		const markdownMatches = content.matchAll(IMAGE_REGEX.markdown);
		for (const match of markdownMatches) {
			const altText = match[1]?.trim();
			const path = match[2]?.trim();
			if (path) {
				references.push({
					originalText: match[0],
					path,
					altText: altText || undefined,
					linkType: "markdown",
				});
			}
		}

		return references;
	}

	/**
	 * Resolve an image path to a TFile in the vault
	 * @param imagePath - The path from the image reference
	 * @param sourceFile - The file containing the image reference (for resolving relative paths)
	 * @returns The TFile if found, null otherwise
	 */
	public resolveImageFile(
		imagePath: string,
		sourceFile?: TFile
	): TFile | null {
		const vault = this.app.vault;
		const metadataCache = this.app.metadataCache;

		// Try direct path resolution first
		const directFile = vault.getAbstractFileByPath(imagePath);
		if (directFile instanceof TFile && this.isImageFile(directFile)) {
			return directFile;
		}

		// Try resolving as a link (handles wiki-links)
		if (sourceFile) {
			const resolvedFile = metadataCache.getFirstLinkpathDest(
				imagePath,
				sourceFile.path
			);
			if (resolvedFile && this.isImageFile(resolvedFile)) {
				return resolvedFile;
			}
		}

		// Try finding by filename in the entire vault
		const filename = imagePath.split("/").pop();
		if (filename) {
			const files = vault.getFiles();
			for (const file of files) {
				if (file.name === filename && this.isImageFile(file)) {
					return file;
				}
			}
		}

		return null;
	}

	/**
	 * Check if a file is an image based on its extension
	 */
	private isImageFile(file: TFile): boolean {
		const extension = file.extension.toLowerCase();
		return IMAGE_EXTENSIONS.includes(extension);
	}

	/**
	 * Read an image file and convert it to base64
	 * @param file - The image file to read
	 * @returns Promise with base64 data and metadata
	 */
	public async readImageAsBase64(file: TFile): Promise<{
		base64: string;
		mimeType: string;
		size: number;
	}> {
		const vault = this.app.vault;

		// Read the file as binary data (ArrayBuffer)
		const arrayBuffer = await vault.readBinary(file);

		// Convert ArrayBuffer to base64
		const base64 = this.arrayBufferToBase64(arrayBuffer);

		// Determine MIME type from file extension
		const mimeType = this.getMimeType(file.extension);

		return {
			base64,
			mimeType,
			size: arrayBuffer.byteLength,
		};
	}

	/**
	 * Convert ArrayBuffer to base64 string
	 * Uses optimized method for Electron environment to handle large images efficiently
	 */
	private arrayBufferToBase64(buffer: ArrayBuffer): string {
		// In Electron/Node.js environment, use Buffer for optimal performance
		// This is much more efficient than Array.from() for large images (5MB+)
		if (typeof Buffer !== 'undefined') {
			// Node.js/Electron environment - use Buffer (optimal)
			// eslint-disable-next-line no-undef
			return Buffer.from(buffer).toString('base64');
		}
		
		// Fallback for browser environment
		// Convert ArrayBuffer to Uint8Array
		const bytes = new Uint8Array(buffer);
		
		// Use string concatenation with chunks to avoid call stack issues
		let binary = '';
		const chunkSize = 0x8000; // 32KB chunks
		for (let i = 0; i < bytes.length; i += chunkSize) {
			const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
			binary += String.fromCharCode.apply(null, Array.from(chunk));
		}
		
		// Encode to base64
		return btoa(binary);
	}

	/**
	 * Get MIME type from file extension
	 */
	private getMimeType(extension: string): string {
		const ext = extension.toLowerCase();
		const mimeTypes: Record<string, string> = {
			png: "image/png",
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			gif: "image/gif",
			bmp: "image/bmp",
			svg: "image/svg+xml",
			webp: "image/webp",
		};
		return mimeTypes[ext] ?? "image/png";
	}

	/**
	 * Extract all images from content and read them as base64
	 * @param content - The markdown content
	 * @param sourceFile - The source file (for path resolution)
	 * @returns Array of image data with base64 encoding
	 */
	public async extractAndReadImages(
		content: string,
		sourceFile?: TFile
	): Promise<ImageData[]> {
		const references = this.extractImageReferences(content);
		const imageDataArray: ImageData[] = [];

		for (const reference of references) {
			try {
				const file = this.resolveImageFile(reference.path, sourceFile);
				if (!file) {
					console.warn(
						`Image file not found: ${reference.path}`
					);
					continue;
				}

				const { base64, mimeType, size } = await this.readImageAsBase64(file);

				imageDataArray.push({
					reference,
					base64,
					mimeType,
					size,
				});
			} catch (error) {
				console.error(
					`Failed to read image ${reference.path}:`,
					error
				);
			}
		}

		return imageDataArray;
	}

	/**
	 * Extract a single image from its link text
	 * @param linkText - The complete link text (e.g., "![[image.png]]" or "![alt](image.png)")
	 * @param sourceFile - The source file (for path resolution)
	 * @returns Image data with base64 encoding, or null if not found
	 */
	public async extractOneImage(
		linkText: string,
		sourceFile?: TFile
	): Promise<ImageData | null> {
		// Parse the link text to extract the image path
		let imagePath: string | null = null;
		let altText: string | undefined;
		let linkType: "wiki" | "markdown";

		// Try wiki-style: ![[image.png]] or ![[image.png|alt text]]
		const wikiMatch = linkText.match(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
		if (wikiMatch) {
			imagePath = wikiMatch[1]?.trim() ?? null;
			altText = wikiMatch[2]?.trim();
			linkType = "wiki";
		} else {
			// Try markdown-style: ![alt text](image.png)
			const markdownMatch = linkText.match(/!\[([^\]]*)\]\(([^)]+)\)/);
			if (markdownMatch) {
				altText = markdownMatch[1]?.trim() || undefined;
				imagePath = markdownMatch[2]?.trim() ?? null;
				linkType = "markdown";
			} else {
				// No valid image link found
				return null;
			}
		}

		if (!imagePath) {
			return null;
		}

		// Try to resolve and read the image
		try {
			const file = this.resolveImageFile(imagePath, sourceFile);
			if (!file) {
				console.warn(`Image file not found: ${imagePath}`);
				return null;
			}

			const { base64, mimeType, size } = await this.readImageAsBase64(file);

			return {
				reference: {
					originalText: linkText,
					path: imagePath,
					altText,
					linkType,
				},
				base64,
				mimeType,
				size,
			};
		} catch (error) {
			console.error(`Failed to read image ${imagePath}:`, error);
			return null;
		}
	}
}
