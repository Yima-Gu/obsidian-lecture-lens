# Image Extraction and Base64 Encoding Usage

This document describes how to use the image extraction and Base64 encoding functionality implemented in the Lecture Lens plugin.

## Overview

The image extraction feature enables the plugin to:

1. Detect image links in markdown notes (both Wiki-style and Markdown-style)
2. Read image files from the Obsidian vault
3. Convert image data to Base64 encoding
4. Prepare multimodal messages for LLM APIs that support vision

## Key Components

### ImageExtractor Service

Located in `src/services/imageExtractor.ts`, this service provides:

- **`extractImageReferences(content: string)`**: Parses markdown content and extracts all image references
    - Supports Wiki-style links: `![[image.png]]` and `![[image.png|alt text]]`
    - Supports Markdown-style links: `![alt text](image.png)`

- **`resolveImageFile(imagePath: string, sourceFile?: TFile)`**: Resolves image paths to actual files in the vault
    - Handles absolute paths
    - Handles relative paths
    - Searches by filename in the vault

- **`readImageAsBase64(file: TFile)`**: Reads an image file and converts it to Base64
    - Returns base64 string, MIME type, and file size
    - Supports: PNG, JPG, JPEG, GIF, BMP, SVG, WEBP

- **`extractAndReadImages(content: string, sourceFile?: TFile)`**: Complete pipeline to extract and read all images from content

- **`extractOneImage(linkText: string, sourceFile?: TFile)`**: Extract and read a single image from its link text
    - Parses Wiki-style `![[image.png]]` or Markdown-style `![alt](image.png)`
    - Returns image data with base64 encoding, or null if not found
    - Used for context-menu based single image analysis

### LLM Service Extensions

Located in `src/services/llm.ts`, the LLM service now supports:

- **Multimodal Messages**: The `ChatMessage` interface now supports both string content and content arrays with text and images
- **System Prompt**: `LLMService.createSystemPrompt()` creates a system message with strict output constraints to prevent conversational fillers
- **Helper Methods**:
    - `LLMService.createMultimodalMessage(role, text, images)`: Create a message with text and images
    - `LLMService.createTextMessage(role, text)`: Create a simple text message
    - `chatCompletion(messages, options, useSystemPrompt)`: Optional third parameter to prepend strict system prompt

## Usage Examples

### Example 1: Extract Images from Current Note

```typescript
// In your plugin code
const activeFile = this.app.workspace.getActiveFile();
if (activeFile) {
	const content = await this.app.vault.read(activeFile);

	// Extract all image references
	const references = this.imageExtractor.extractImageReferences(content);
	console.log(`Found ${references.length} image references`);

	// Read images and convert to Base64
	const imageData = await this.imageExtractor.extractAndReadImages(
		content,
		activeFile,
	);

	for (const img of imageData) {
		console.log(`Image: ${img.reference.path}`);
		console.log(`Size: ${img.size} bytes`);
		console.log(`MIME: ${img.mimeType}`);
		console.log(`Base64 length: ${img.base64.length}`);
	}
}
```

### Example 2: Send Images to LLM

```typescript
// Extract images from current note
const activeFile = this.app.workspace.getActiveFile();
if (activeFile) {
	const content = await this.app.vault.read(activeFile);
	const imageData = await this.imageExtractor.extractAndReadImages(
		content,
		activeFile,
	);

	// Prepare images for LLM
	const images = imageData.map((img) => ({
		base64: img.base64,
		mimeType: img.mimeType,
		detail: "auto" as const,
	}));

	// Create multimodal message
	const message = LLMService.createMultimodalMessage(
		"user",
		"Please analyze these images from my lecture notes and summarize the key concepts.",
		images,
	);

	// Send to LLM
	const response = await this.llmService.chatCompletion([message], {
		max_tokens: 1000,
		temperature: 0.7,
	});
}
```

### Example 3: Context-Menu Single Image Analysis

```typescript
// Extract a single image from its link text (used in context menu)
const imageLink = "![[lecture-slide.png]]"; // or "![diagram](diagram.jpg)"
const activeFile = this.app.workspace.getActiveFile();

if (activeFile) {
	// Extract the single image
	const imageData = await this.imageExtractor.extractOneImage(
		imageLink,
		activeFile,
	);

	if (imageData) {
		// Create multimodal message with custom user prompt
		const userPrompt = "Explain the formulas shown in this image";
		const message = LLMService.createMultimodalMessage("user", userPrompt, [
			{
				base64: imageData.base64,
				mimeType: imageData.mimeType,
				detail: "high" as const,
			},
		]);

		// Send to LLM with system prompt to prevent conversational fillers
		const response = await this.llmService.chatCompletion(
			[message],
			{
				temperature: 0.7,
				max_tokens: 4000,
			},
			true, // Use system prompt
		);

		// Insert response below the image
		const aiResponse = response.choices[0]?.message?.content;
		// ... insert into editor
	}
}
```

### Example 4: Manual Test Command

The plugin includes a test command to verify image extraction:

1. Open a note with embedded images (e.g., `![[diagram.png]]` or `![chart](chart.jpg)`)
2. Open the command palette (Ctrl/Cmd + P)
3. Run "Test image extraction from current note"
4. The plugin will show a notification with:
    - Number of image references found
    - Number of images successfully loaded
    - Size and MIME type of each image

## How to Use the Context-Menu Workflow

The plugin now supports a context-menu based interaction for analyzing individual images:

1. **Right-click on an image link** in your note (either `![[image.png]]` or `![alt](image.png)`)
2. Select **"Ask AI about image"** from the context menu
3. A modal will appear with a text area containing the default prompt
4. **Customize the prompt** to ask specific questions (e.g., "Explain this formula", "Summarize the key concepts")
5. Press **Enter** (or click Submit) to start the analysis
6. The modal closes immediately, and a non-blocking notice shows "Thinking..."
7. The AI response is **inserted directly below the image** in your note
8. The response contains clean markdown output without conversational fillers

**Note:** Right-clicking on regular text will NOT show the menu item - it only appears when clicking on image links.

## Supported Image Formats

- PNG (`.png`) - `image/png`
- JPEG (`.jpg`, `.jpeg`) - `image/jpeg`
- GIF (`.gif`) - `image/gif`
- BMP (`.bmp`) - `image/bmp`
- SVG (`.svg`) - `image/svg+xml`
- WebP (`.webp`) - `image/webp`

## Technical Details

### Image Link Detection

The extractor uses regular expressions to find image links:

- **Wiki-style**: `!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]`
    - Matches: `![[image.png]]` and `![[image.png|alt text]]`
- **Markdown-style**: `!\[([^\]]*)\]\(([^)]+)\)`
    - Matches: `![alt text](image.png)`

### Path Resolution Strategy

1. Try direct path lookup in vault
2. Use Obsidian's metadata cache to resolve wiki-links
3. Fall back to searching by filename in entire vault

### Base64 Encoding

Images are read as `ArrayBuffer` and converted to Base64 using:

1. Convert `ArrayBuffer` to `Uint8Array`
2. Convert bytes to binary string
3. Encode using `btoa()`

The resulting format for LLM APIs is:

```
data:image/jpeg;base64,/9j/4AAQSkZJRg...
```

## Testing the Feature

### Unit Testing (Manual)

Create a test note with various image formats:

```markdown
# Test Note

## Wiki-style images

![[test-image.png]]
![[diagram.jpg|My Diagram]]

## Markdown-style images

![Chart](chart.png)
![](photo.jpeg)
```

Then run the "Test image extraction from current note" command.

### Integration Testing

The image extraction integrates with the LLM service to send multimodal messages. To test:

1. Ensure your LLM API key is configured (Settings → Lecture Lens)
2. Ensure you're using a vision-capable model (e.g., gpt-4o, gemini-1.5-pro)
3. Create a note with images
4. Use the plugin features that send images to the LLM

## Future Enhancements

Potential improvements:

- Image size optimization (resize large images before sending)
- Caching of Base64-encoded images
- Support for external image URLs
- Image quality/detail level selection in UI
