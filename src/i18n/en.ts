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
		"Turn on to attach images in chat. Use gpt-4o or Kimi vision. DeepSeek (api.deepseek.com) is text-only.",
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

	"settings.llmProfiles.heading": "LLM API profiles",
	"settings.llmProfiles.desc":
		"Save multiple API configurations (DeepSeek, Kimi, OpenAI, etc.). Choose which profile to use in the chat panel.",
	"settings.llmProfiles.name": "Profile name",
	"settings.llmProfiles.add": "Add profile",
	"settings.llmProfiles.newName": "New profile",
	"settings.llmProfiles.defaultBadge": "default",
	"settings.llmProfiles.setDefault": "Set as default",
	"settings.llmProfiles.test": "Test this profile",
	"settings.llmProfiles.delete": "Delete profile",
	"settings.llmProfiles.configure": "Expand profile settings",
	"settings.llmProfiles.noKey": "no key",

	"settings.visionRelay.heading": "Image vision relay",
	"settings.visionRelay.desc":
		"When the chat model cannot read images (e.g. DeepSeek), send images to a vision profile first (e.g. Kimi), then pass the text description to the chat model. Images are sent to the vision provider only for that step.",
	"settings.visionRelay.enabled.name": "Enable vision relay",
	"settings.visionRelay.enabled.desc":
		"Use Kimi (or another vision profile) to interpret images, then answer with DeepSeek or another text model.",
	"settings.visionRelay.profile.name": "Vision profile",
	"settings.visionRelay.profile.desc":
		"Profile used to read images. Requires a vision-capable model and API key (moonshot-*-vision-* for Kimi).",
	"settings.visionRelay.noVisionProfile":
		"No vision-capable profile found. Add a Kimi or OpenAI profile with a vision model.",
	"settings.visionRelay.missingKey": "Vision profile \"{{profile}}\" has no API key.",

	"settings.pdfNotes.heading": "PDF to Markdown",
	"settings.pdfNotesOutputFolder.name": "Output folder",
	"settings.pdfNotesOutputFolder.desc":
		"Folder where generated notes are saved. Leave empty to save next to the PDF.",
	"settings.pdfNotesOutputFolder.placeholder": "Same folder as PDF",
	"settings.pdfNotesOutputFolder.browseHint": "Pick an output folder",
	"settings.pdfNotesMaxPages.name": "Maximum pages",
	"settings.pdfNotesMaxPages.desc": "Only the first N pages are parsed and sent to the model.",
	"settings.pdfNotesSkipMerge.name": "Skip merge pass",
	"settings.pdfNotesSkipMerge.desc":
		"Concatenate section drafts without a final polish step (faster, fewer API calls).",

	"settings.rag.heading": "Course context (RAG)",
	"settings.autoAttachCurrentNote.name": "Attach current note in chat",
	"settings.autoAttachCurrentNote.desc":
		"When enabled, the open note is included as context. You can toggle it off per message in the chat panel.",
	"settings.maxNoteContextChars.name": "Max characters per attached note",
	"settings.maxNoteContextChars.desc":
		"Limits how much of each attached vault note is sent to the model. Keeps requests smaller and safer.",
	"settings.chatMessageFontSize.name": "Chat message font size",
	"settings.chatMessageFontSize.desc":
		"Font size for AI and user messages in the chat sidebar (12–24 px). You can also use A− / A+ in the chat header.",
	"settings.chatContext.heading": "Chat context",
	"settings.chatHistoryTurnLimit.name": "History turns per request",
	"settings.chatHistoryTurnLimit.desc":
		"How many recent user/assistant turns are sent with each message. Lower values save context space.",
	"settings.chatContextBudgetChars.name": "Context budget (characters)",
	"settings.chatContextBudgetChars.desc":
		"Reference budget shown in the chat context panel. Helps you see when prompts are getting large.",
	"settings.chatRagMinScore.name": "RAG minimum relevance",
	"settings.chatRagMinScore.desc":
		"Retrieved course chunks below this similarity score (0–0.8) are excluded from the prompt.",
	"settings.courseFolder.name": "Course folder",
	"settings.courseFolder.desc":
		"Folder scanned for RAG. Click Browse to pick from the vault, or type a vault path (Courses/My Course) or an absolute path inside this vault. Works on macOS and Windows.",
	"settings.courseFolder.placeholder": "Courses/My Course",
	"settings.courseFolder.browse": "Browse",
	"settings.courseFolder.browseHint": "Pick a folder from this vault",
	"settings.embeddingModel.name": "Embedding model",
	"settings.embeddingModel.desc": "Model used to build and query the course index.",
	"settings.embeddingBaseUrl.name": "Embedding API base URL",
	"settings.embeddingBaseUrl.desc":
		"OpenAI-compatible /embeddings endpoint. Required when chat uses DeepSeek or Kimi. Example: https://api.openai.com/v1",
	"settings.embeddingApiKey.name": "Embedding API key",
	"settings.embeddingApiKey.descSecure":
		"Optional separate key for embeddings. Leave empty to reuse the chat API key.",
	"settings.embeddingApiKey.descPlain":
		"Optional separate key for embeddings. Leave empty to reuse the chat API key. Stored locally in plain text on this device.",
	"settings.embeddingProviderWarning":
		"DeepSeek and Kimi do not provide embeddings over the chat API. Use local embedding mode, or switch to API mode with an OpenAI-compatible embedding endpoint.",
	"settings.embeddingMode.name": "Embedding source",
	"settings.embeddingMode.desc":
		"Local models run on your device and download weights once (via mirror). API mode uses a cloud /embeddings endpoint.",
	"settings.embeddingMode.local": "Local model (recommended for DeepSeek/Kimi)",
	"settings.embeddingMode.api": "Cloud API",
	"settings.localEmbeddingModel.name": "Local embedding model",
	"settings.localEmbeddingModel.desc":
		"Models are not bundled with the plugin. Download them below and check progress before indexing.",
	"settings.embeddingDownload.name": "Download embedding model",
	"settings.embeddingDownload.desc":
		"Download the selected model from your HuggingFace mirror into the plugin folder, then rebuild the course index.",
	"settings.embeddingDownload.button": "Download model",
	"settings.embeddingDownload.downloading": "Downloading…",
	"settings.embeddingDownload.starting": "Preparing download…",
	"settings.embeddingDownload.success": "✅ Embedding model downloaded and verified.",
	"settings.embeddingDownload.failed": "❌ Model download failed: {{message}}",
	"settings.embeddingDownload.stateNotDownloaded": "Not downloaded",
	"settings.embeddingDownload.stateDownloading": "Downloading",
	"settings.embeddingDownload.stateReady": "Ready",
	"settings.embeddingDownload.stateError": "Download failed",
	"settings.embeddingDownload.cachePath": "Data directory: {{path}}",
	"settings.embeddingDownload.verify.name": "Verify model",
	"settings.embeddingDownload.verify.desc": "Run a test embedding on the downloaded model to confirm it works.",
	"settings.embeddingDownload.verify.button": "Verify",
	"settings.embeddingDownload.verify.success": "✅ Model verification passed.",
	"settings.embeddingDownload.verify.failed": "❌ Model verification failed: {{message}}",
	"settings.localEmbeddingModel.e5": "Multilingual E5 Small (recommended, Chinese + English)",
	"settings.localEmbeddingModel.minilm12": "Multilingual MiniLM L12",
	"settings.localEmbeddingModel.minilm6": "MiniLM L6 (English-focused, smallest)",
	"settings.hfMirrorUrl.name": "Model download mirror",
	"settings.hfMirrorUrl.desc":
		"HuggingFace mirror used when downloading local model weights. Default: https://hf-mirror.com",
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

	// Commands
	"command.openChat": "Open chat sidebar",
	"command.generatePdfNotes": "Generate Markdown notes from PDF",
	"command.rebuildRagIndex": "Rebuild course RAG index",
	"command.testLlmConnection": "Test language model connection",

	// Ribbon
	"ribbon.openChat": "Open Lecture Lens chat",
	"ribbon.generatePdfNotes": "PDF to Markdown notes",

	// PDF notes modal
	"modal.pdfNotes.title": "Lecture Lens: PDF → Markdown",
	"modal.pdfNotes.phase.parsing": "📄 Parsing PDF…",
	"modal.pdfNotes.phase.outline": "🧭 Building outline…",
	"modal.pdfNotes.phase.sections": "✍️ Writing sections…",
	"modal.pdfNotes.phase.merge": "🔗 Merging notes…",
	"modal.pdfNotes.phase.writing": "💾 Saving note…",
	"modal.pdfNotes.phase.done": "✅ Done!",
	"modal.pdfNotes.phase.error": "Error",
	"modal.pdfNotes.sectionProgress": "Section {{current}} / {{total}}",

	// PDF notes prompts (sent to LLM)
	"pdfNotes.prompt.outlineSystem":
		"You are an academic document analyst. Given excerpted text from PDF pages, output JSON only (no markdown fences). Schema: {\"title\": string, \"sections\": [{\"id\": string, \"title\": string, \"summary\": string, \"pageStart\": number, \"pageEnd\": number}]}. Create 4–12 logical sections that cover all provided pages.",
	"pdfNotes.prompt.outlineUser": "Build a structured outline for these PDF page excerpts:",
	"pdfNotes.prompt.sectionSystem":
		"You write clear Markdown study notes for one section of a lecture document. Use headings, bullet lists, and LaTeX for math. Do not invent facts beyond the provided pages.",
	"pdfNotes.prompt.sectionUser":
		"Write Markdown notes for this section using only the excerpts below. Start with a level-2 heading for the section title.",
	"pdfNotes.prompt.mergeSystem":
		"You merge section drafts into one cohesive Markdown document. Remove repetition, unify tone, preserve facts, and use proper heading hierarchy with a single level-1 title.",
	"pdfNotes.prompt.mergeUser": "Merge the following section drafts into one polished Markdown document:",

	// File menu
	"fileMenu.generatePdfNotes": "Generate Markdown notes",

	// Chat view
	"chat.title": "Lecture Lens Chat",
	"chat.subtitle": "AI study assistant",
	"chat.welcome":
		"Ask about your notes. Type **@** or use the clip icon to attach vault files. Rebuild the index for course-wide RAG.",
	"chat.inputPlaceholder": "Ask about your course… (@ to attach a note)",
	"chat.send": "Send",
	"chat.clear": "Clear",
	"chat.buildIndex": "Build index",
	"chat.fontSize": "Size",
	"chat.fontSizeDecrease": "Decrease message font size",
	"chat.fontSizeIncrease": "Increase message font size",
	"chat.addContext": "Attach vault note",
	"chat.addImage": "Upload image",
	"chat.removeImage": "Remove image",
	"chat.defaultImagePrompt": "Analyze this image and answer in detail.",
	"chat.visionRequired":
		"Enable Vision model (VLM) in settings and choose a vision-capable model.",
	"chat.modelNoVision":
		"Model \"{{model}}\" does not accept images. Use deepseek-v4-pro, Kimi vision (moonshot-*-vision-*), or gpt-4o.",
	"chat.visionApiRejected":
		"Model \"{{model}}\" rejected the image request: {{detail}}",
	"chat.deepseekTextOnly":
		"DeepSeek (api.deepseek.com) supports text only. Use Kimi vision or gpt-4o for images.",
	"chat.deepseekTextOnlyRelayHint":
		"DeepSeek cannot read images. Enable vision relay in settings and configure a Kimi vision profile with an API key.",
	"chat.analyzingImages": "Analyzing image with vision model…",
	"chat.imageRelayNote": "Image was interpreted via vision relay (not shown in history).",
	"chat.visionRelayNoProfile":
		"Vision relay is enabled but no vision profile with an API key is configured.",
	"chat.visionRelayUnavailable":
		"Cannot attach images. Configure a vision profile with an API key in settings, or enable vision relay.",
	"chat.imageOmitted": "Image omitted — this model does not accept images.",
	"chat.imageTooLarge": "Image is too large (max 4 MB) or unsupported format.",
	"chat.imageAdded": "Image attached",
	"chat.currentNote": "Current",
	"chat.removeContext": "Remove attached note",
	"chat.noContextAttached": "No note context attached",
	"chat.contextHint": "Vault notes only · @ to attach",
	"chat.contextSecurityHint":
		"Context is read only from your Obsidian vault. Attach notes explicitly; external files are never accessed.",
	"chat.copyMessage": "Copy message",
	"chat.insertAtCursor": "Insert at cursor",
	"chat.appendToNote": "Append to note",
	"chat.replaceSelection": "Replace selection",
	"chat.applyToNote": "Apply to note",
	"chat.noActiveMarkdownNote": "Open a markdown note to insert or edit content.",
	"chat.noSelection": "Select text in the note first, then use Replace selection.",
	"chat.insertedAtCursor": "Inserted at cursor.",
	"chat.appendedToNote": "Appended to note.",
	"chat.replacedSelection": "Selection replaced.",
	"chat.appliedPatches": "Applied note edits.",
	"chat.copied": "Copied to clipboard",
	"chat.contextPanel.empty": "Context",
	"chat.contextPanel.hint": "Type a message or attach notes to preview what will be sent to the model.",
	"chat.contextPanel.preview": "Preview",
	"chat.contextPanel.lastRequest": "Last request",
	"chat.contextPanel.summary":
		"{{prefix}} · {{used}}/{{budget}} chars (~{{tokens}} tok) · {{turns}} turns · {{notes}} notes · {{rag}} RAG",
	"chat.contextPanel.includeNotes": "Attached notes",
	"chat.contextPanel.includeRag": "Course RAG",
	"chat.contextPanel.budgetTitle": "Context budget",
	"chat.contextPanel.budgetMeta": "{{percent}}% of budget · {{chars}} chars · ~{{tokens}} tokens",
	"chat.contextPanel.historyTitle": "Conversation ({{included}}/{{total}} turns)",
	"chat.contextPanel.notesTitle": "Attached notes ({{count}})",
	"chat.contextPanel.noteSize": "{{used}} / {{total}} chars",
	"chat.contextPanel.noteTruncated": "Truncated to per-note limit",
	"chat.contextPanel.noNotes": "No notes attached for the next message.",
	"chat.contextPanel.ragTitle": "RAG excerpts ({{count}})",
	"chat.contextPanel.ragDisabled": "RAG is off for the next message.",
	"chat.contextPanel.ragEmpty": "No relevant course excerpts matched this query.",
	"chat.contextPanel.ragAwaitQuery": "RAG runs when you send a non-empty message.",
	"chat.contextPanel.ragFiltered": "{{count}} low-relevance chunk(s) filtered out.",
	"chat.contextPanel.ragScore": "{{score}}% match",
	"chat.contextSegment.system": "Instructions & context",
	"chat.contextSegment.notes": "Attached notes",
	"chat.contextSegment.rag": "RAG excerpts",
	"chat.contextSegment.history": "Conversation",
	"chat.cleared": "Conversation cleared.",
	"chat.courseScope": "Course scope: {{folder}}",
	"chat.ragDisabled": "RAG disabled — set a course folder in settings.",
	"chat.ragScopeLabel": "Course folder",
	"chat.ragScopeDesc": "Retrieves relevant notes from this folder when you ask questions.",
	"chat.ragScopeToggle": "Show RAG scope details",
	"chat.ragStatusOn": "RAG on",
	"chat.ragStatusOff": "RAG off",
	"chat.ragNotConfigured": "Not configured — set a course folder in settings",
	"chat.ragDisabledShort": "Enable RAG and set a course folder in settings",
	"chat.ragIndexReady": "Indexed: {{count}} passages",
	"chat.ragIndexMissing": "No index yet — click Rebuild index in the header",
	"chat.ragScopeLoading": "Checking index status…",
	"chat.ragIndexStale": "Index outdated — embedding settings changed; rebuild the index",
	"chat.ragIndexFolderMismatch":
		"Index folder mismatch (index: {{indexFolder}}, current: {{currentFolder}}) — rebuild the index",
	"chat.ragRetrieveNoIndex":
		"[RAG] No course index found. Rebuild the index from the chat header or settings.",
	"chat.ragRetrieveStale":
		"[RAG] Index is outdated after embedding settings changed. Rebuild the index before asking course questions.",
	"chat.ragRetrieveFolderMismatch":
		"[RAG] Course folder changed since the index was built. Rebuild the index for the current folder.",
	"chat.ragRetrieveEmptyQuery": "[RAG] Empty query — no course context retrieved.",
	"chat.ragRetrieveFailed": "[RAG] Retrieval failed: {{message}}",
	"chat.roleUser": "You",
	"chat.roleAi": "AI",
	"chat.errorPrefix": "Error: ",
	"chat.openFailed": "Could not open chat panel.",
	"chat.profileSelect": "Model",
	"chat.providerSelect": "Provider",
	"chat.modelSelect": "Model",
	"chat.sessionSelect": "Conversation",
	"chat.newChat": "New chat",
	"chat.deleteChat": "Delete chat",
	"chat.newSessionTitle": "New conversation",
	"chat.imageNotRestored": "Image from this message was not restored from history.",

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
	"notice.embeddingsHint":
		"Tip: DeepSeek/Kimi chat APIs cannot build RAG indexes. Configure Embedding API base URL + key (e.g. OpenAI) in settings.",
	"notice.embeddingPathHint":
		"Tip: Download the embedding model in Settings → RAG first. If it still fails, check your HF mirror or switch to Cloud API.",
	"notice.embeddingValidation.missing_key": "Set an embedding API key (or chat API key) before rebuilding the index.",
	"notice.embeddingValidation.missing_base": "Set an embedding API base URL before rebuilding the index.",
	"notice.embeddingValidation.missing_model": "Set an embedding model name before rebuilding the index.",
	"notice.embeddingValidation.provider_unsupported":
		"DeepSeek/Kimi do not support /embeddings. Switch Embedding source to Local model, or set an OpenAI-compatible Embedding API.",
	"notice.embeddingValidation.missing_mirror": "Set a model download mirror URL before rebuilding the index.",
	"notice.embeddingValidation.model_not_ready":
		"Download the embedding model in Settings → RAG first, then rebuild the index.",

	// Notices — LLM test
	"notice.testingLlm": "Testing language model connection...",
	"notice.llmSuccess": "✅ LLM connection successful!\nModel: {{model}}\nResponse: {{message}}",
	"notice.llmFailed": "❌ LLM connection failed:\n{{message}}",
	"notice.noResponse": "No response",

	// Notices — PDF notes
	"notice.pdfNotesNoApiKey": "Configure a default LLM profile with an API key before generating PDF notes.",
	"notice.pdfNotesNoText":
		"No extractable text found in this PDF. Scanned PDFs are not supported yet.",
	"notice.pdfNotesTruncated": "Only the first {{limit}} of {{total}} pages will be processed.",
	"notice.pdfNotesWriteFailed": "Could not create the output note.",
	"notice.pdfNotesComplete": "✅ Notes saved to {{path}}",
	"notice.pdfNotesFailed": "❌ PDF notes failed:\n{{message}}",
	"notice.noPdfInVault": "No PDF files found in the vault.",
} as const;

export type TranslationKey = keyof typeof en;
