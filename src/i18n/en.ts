export const en = {
	// Settings — general
	"settings.uiLanguage.name": "Display language",
	"settings.uiLanguage.desc": "Interface language for Lecture Lens. Reload the plugin after changing.",
	"settings.uiLanguage.auto": "Auto (follow Obsidian)",
	"settings.uiLanguage.en": "English",
	"settings.uiLanguage.zh": "中文",

	"settings.apiProvider.name": "API provider",
	"settings.apiProvider.desc":
		"Pick a preset to auto-fill Base URL and model. Choose Custom for other OpenAI-compatible endpoints.",
	"settings.apiProvider.custom": "Custom",
	"settings.apiProvider.openai": "OpenAI",
	"settings.apiProvider.deepseek": "DeepSeek",
	"settings.apiProvider.kimi": "Kimi (Moonshot)",
	"settings.apiProvider.gemini": "Google Gemini",
	"settings.apiProvider.presetHint": "Preset: {{baseUrl}} · {{model}}",
	"settings.apiKey.name": "API key",
	"settings.apiKey.descPlain":
		"Warning: Your API key is stored in this vault's plugin data. Anyone with vault access can read it. Prefer desktop for OS keychain encryption.",
	"settings.apiKey.descSecure":
		"Stored encrypted with your OS keychain (Electron safeStorage). Still keep vault backups private.",
	"settings.baseUrl.name": "Base URL",
	"settings.baseUrl.desc": "Set the base URL for the API.",
	"settings.baseUrl.invalidTitle": "Base URL must start with http:// or https://",
	"settings.modelName.name": "Model name",
	"settings.modelName.desc": "Model identifier for chat and vision, e.g. gpt-4o or moonshot-v1-8k-vision-preview.",
	"settings.modelPreset.name": "Quick model preset",
	"settings.modelPreset.desc":
		"Pick a common model for the selected provider. DeepSeek: v4-flash / v4-pro are current; chat/reasoner names retire 2026-07-24.",
	"settings.modelPreset.custom": "Custom (use field above)",
	"settings.supportsVision.name": "Vision model (VLM)",
	"settings.supportsVision.desc":
		"Turn on to attach images in chat. Your model must support vision (e.g. gpt-4o, Kimi vision, deepseek-vl2). deepseek-v4-flash is text-only.",
	"settings.testConnection.name": "Test connection",
	"settings.testConnection.desc": "Verify that your API key and settings are working correctly.",
	"settings.testConnection.button": "Check connection",
	"settings.testConnection.testing": "Testing...",
	"settings.testConnection.success": "✅ Connection successful!\nModel: {{model}}\nResponse: {{message}}",
	"settings.testConnection.noResponse": "No response",
	"settings.testConnection.errorUnknown": "❌ Connection error: unknown error (see console for details)",
	"settings.testConnection.error401": "❌ Authentication failed (401): check your API key.",
	"settings.testConnection.error404": "❌ Not found (404): check Base URL or model name.",
	"settings.testConnection.error429": "❌ Rate limit (429): quota exceeded or too many requests.",
	"settings.testConnection.errorTimeout": "❌ Request timed out. Try again later.",
	"settings.testConnection.errorNetwork": "❌ Network error: check your connection.",
	"settings.testConnection.errorGeneric": "❌ Connection error: {{message}}... (see console for details)",

	"settings.promptTemplates.heading": "Prompt templates",
	"settings.promptTemplates.desc": "Customize the preset prompts available in the analysis modal.",
	"settings.promptTemplates.namePlaceholder": "Template name",
	"settings.promptTemplates.promptPlaceholder": "Prompt text",
	"settings.promptTemplates.removeTooltip": "Remove template",
	"settings.promptTemplates.addButton": "Add template",
	"settings.promptTemplates.newName": "New template",

	"settings.rag.heading": "Course context (RAG)",
	"settings.autoAttachCurrentNote.name": "Attach current note in chat",
	"settings.autoAttachCurrentNote.desc":
		"When enabled, the open note is included as context. You can toggle it off per message in the chat panel.",
	"settings.maxNoteContextChars.name": "Max characters per attached note",
	"settings.maxNoteContextChars.desc":
		"Limits how much of each attached vault note is sent to the model. Keeps requests smaller and safer.",
	"settings.courseFolder.name": "Course folder",
	"settings.courseFolder.desc":
		"Vault path to the course folder used for retrieval, e.g. Courses/Linear Algebra.",
	"settings.embeddingModel.name": "Embedding model",
	"settings.embeddingModel.desc": "Model used to build and query the course index.",
	"settings.ragEnabled.name": "Enable RAG in chat",
	"settings.ragEnabled.desc": "Include retrieved course notes as context in the chat sidebar.",
	"settings.ragTopK.name": "Retrieval top K",
	"settings.ragTopK.desc": "Number of note chunks to inject per chat message.",
	"settings.rebuildIndex.name": "Rebuild course index",
	"settings.rebuildIndex.desc": "Scan the course folder and rebuild the local embedding index.",
	"settings.rebuildIndex.button": "Rebuild index",
	"settings.rebuildIndex.indexing": "Indexing…",
	"settings.rebuildIndex.noFolder": "Set a course folder path first.",
	"settings.rebuildIndex.success": "✅ Index rebuilt with {{count}} chunks.",
	"settings.rebuildIndex.failed": "❌ Index rebuild failed: {{message}}",

	"settings.clipboard.heading": "Clipboard OCR",
	"settings.enablePasteOcr.name": "Enable paste OCR",
	"settings.enablePasteOcr.desc": "When pasting an image into a note, save it and optionally analyze with AI.",
	"settings.pasteImageFolder.name": "Paste image folder",
	"settings.pasteImageFolder.desc": "Folder where pasted screenshots are saved.",
	"settings.autoAnalyzeOnPaste.name": "Auto-analyze on paste",
	"settings.autoAnalyzeOnPaste.desc": "Skip the prompt modal and analyze immediately using the first template.",

	// Commands
	"command.openChat": "Open chat sidebar",
	"command.analyzeNoteImages": "Analyze images in current note",
	"command.batchAnalyzeImages": "Analyze all images in note (one by one)",
	"command.rebuildRagIndex": "Rebuild course RAG index",
	"command.testLlmConnection": "Test language model connection",
	"command.testImageExtraction": "Test image extraction from current note",

	// Ribbon
	"ribbon.openChat": "Open Lecture Lens chat",
	"ribbon.analyzeImages": "Analyze note images",

	// Context menu
	"contextMenu.askAiAboutImage": "Ask AI about image",

	// Ask image modal
	"modal.analyzeImages.title": "Lecture Lens: Analyze images",
	"modal.analyzeImages.templateName": "Prompt template",
	"modal.analyzeImages.templateDesc": "Select a preset or customize the prompt below.",
	"modal.analyzeImages.promptPlaceholder": "Enter your prompt…",
	"modal.analyzeImages.cancel": "Cancel",
	"modal.analyzeImages.analyze": "Analyze",
	"modal.analyzeImages.emptyPrompt": "Please enter a prompt before analyzing.",

	// Analysis modal
	"modal.analysis.title": "Lecture Lens Analysis",
	"modal.analysis.findingImages": "🔍 Finding images...",
	"modal.analysis.analyzing": "🧠 AI Analyzing...",
	"modal.analysis.done": "✅ Done!",

	// Chat view
	"chat.title": "Lecture Lens Chat",
	"chat.subtitle": "AI study assistant",
	"chat.welcome":
		"Ask about your notes. Type **@** or use the clip icon to attach vault files. Rebuild the index for course-wide RAG.",
	"chat.inputPlaceholder": "Ask about your course… (@ to attach a note)",
	"chat.send": "Send",
	"chat.clear": "Clear",
	"chat.buildIndex": "Build index",
	"chat.addContext": "Attach vault note",
	"chat.addImage": "Upload image",
	"chat.removeImage": "Remove image",
	"chat.defaultImagePrompt": "Analyze this image and answer in detail.",
	"chat.visionRequired":
		"Enable Vision model (VLM) in settings and choose a vision-capable model.",
	"chat.modelNoVision":
		"Model \"{{model}}\" does not accept images. Use deepseek-vl2, Kimi vision (moonshot-*-vision-*), or gpt-4o.",
	"chat.imageTooLarge": "Image is too large (max 4 MB) or unsupported format.",
	"chat.imageAdded": "Image attached",
	"chat.currentNote": "Current",
	"chat.removeContext": "Remove attached note",
	"chat.noContextAttached": "No note context attached",
	"chat.contextHint": "Vault notes only · @ to attach",
	"chat.contextSecurityHint":
		"Context is read only from your Obsidian vault. Attach notes explicitly; external files are never accessed.",
	"chat.copyMessage": "Copy message",
	"chat.copied": "Copied to clipboard",
	"chat.cleared": "Conversation cleared.",
	"chat.courseScope": "Course scope: {{folder}}",
	"chat.ragDisabled": "RAG disabled — set a course folder in settings.",
	"chat.roleUser": "You",
	"chat.roleAi": "AI",
	"chat.errorPrefix": "Error: ",
	"chat.openFailed": "Could not open chat panel.",

	// Notices — general
	"notice.noActiveFile": "No active file. Please open a note first.",
	"notice.noMarkdownView": "No active Markdown view found.",
	"notice.unknownError": "Unknown error",
	"notice.reloadForLanguage": "Reload the plugin (Cmd+R) to apply the new display language everywhere.",

	// Notices — RAG / index
	"notice.setCourseFolderFirst": "Set a course folder in settings first.",
	"notice.buildingIndex": "Building course index…",
	"notice.indexRebuilt": "✅ Index rebuilt with {{count}} chunks.",
	"notice.indexRebuildFailed": "❌ Index rebuild failed: {{message}}",

	// Notices — LLM test
	"notice.testingLlm": "Testing language model connection...",
	"notice.llmSuccess": "✅ LLM connection successful!\nModel: {{model}}\nResponse: {{message}}",
	"notice.llmFailed": "❌ LLM connection failed:\n{{message}}",
	"notice.noResponse": "No response",

	// Notices — image extraction test
	"notice.extractingImages": "Extracting images from current note...",
	"notice.noImagesInNote": "No images found in the current note.",
	"notice.extractionSuccess":
		"✅ Image extraction successful!\n\nFound {{references}} reference(s), loaded {{loaded}} image(s):\n{{summary}}",
	"notice.extractionFailed": "❌ Image extraction failed:\n{{message}}",

	// Notices — analysis
	"notice.thinking": "🤔 Thinking…",
	"notice.analyzingPastedImage": "🤔 Analyzing pasted image…",
	"notice.couldNotLoadImage": "Could not load the image",
	"notice.analysisComplete": "Analysis complete",
	"notice.analysisCompleteWithNotes":
		"Analysis complete! Generated notes added to the end of the document",
	"notice.analysisFailed": "Analysis failed: {{message}}",
	"notice.analysisFailedWithPrefix": "❌ Analysis failed:\n{{message}}",
	"notice.noAiResponse": "No response received from AI",
	"notice.batchProgress": "🖼️ Processing image {{current}} of {{total}}…",
	"notice.batchComplete": "✅ Batch analysis complete! {{success}} succeeded{{failures}}.",
	"notice.batchFailures": ", {{count}} failed",
	"notice.pastedAnalysisComplete": "Pasted image analysis complete",

	// Notices — clipboard
	"notice.couldNotReadPastedImage": "Could not read pasted image.",
	"notice.failedToSavePastedImage": "Failed to save pasted image.",

	// Generated note headings (inserted into markdown)
	"generated.aiLectureNotes": "## 📝 AI Generated Lecture Notes",
	"generated.aiAnalysisCallout": "> [!note]+ AI Analysis",
} as const;

export type TranslationKey = keyof typeof en;
