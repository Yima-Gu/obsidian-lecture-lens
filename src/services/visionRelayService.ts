import { LLMService, LLMServiceConfig } from "./llm";
import { LlmProfile } from "../types/llmProfile";
import { DEFAULT_CHAT_MAX_TOKENS } from "../constants/chatAppearance";

const VISION_EXTRACTION_SYSTEM_PROMPT = `You are a vision analysis assistant. Your output will be passed to a text-only AI that cannot see images.

Describe everything visible in the image(s) objectively and thoroughly:
- All readable text (OCR), including small labels
- Mathematical formulas (use LaTeX where helpful)
- Diagrams, flowcharts, tables, and charts (describe structure and relationships)
- Colors, arrows, and spatial layout when relevant

Do NOT answer the user's question. Do NOT add opinions or study advice.
Output in markdown. Be concise but complete.`;

export interface VisionRelayImage {
	base64: string;
	mimeType: string;
}

export class VisionRelayService {
	constructor(private readonly llmService: LLMService) {}

	async describeImages(
		visionProfile: LlmProfile,
		restoreConfig: LLMServiceConfig,
		userPrompt: string,
		images: VisionRelayImage[],
		onChunk?: (chunk: string, fullText: string) => void
	): Promise<string> {
		this.llmService.updateConfig({
			apiKey: visionProfile.apiKey,
			baseUrl: visionProfile.baseUrl,
			modelName: visionProfile.modelName,
		});

		try {
			const userMessage = LLMService.createMultimodalMessage(
				"user",
				`User question (for context only — do not answer):\n${userPrompt}`,
				images.map((image) => ({
					base64: image.base64,
					mimeType: image.mimeType,
					detail: "high" as const,
				}))
			);

			let description = "";
			for await (const chunk of this.llmService.chatCompletionStream(
				[
					LLMService.createTextMessage("system", VISION_EXTRACTION_SYSTEM_PROMPT),
					userMessage,
				],
				{ temperature: 0.2, max_tokens: DEFAULT_CHAT_MAX_TOKENS }
			)) {
				description += chunk;
				onChunk?.(chunk, description);
			}

			description = description.trim();
			if (!description) {
				throw new Error("Vision model returned an empty image description.");
			}
			return description;
		} finally {
			this.llmService.updateConfig(restoreConfig);
		}
	}
}

export function formatImageDescriptionForChat(description: string): string {
	return `[Image content extracted by vision model]\n\n${description}`;
}
