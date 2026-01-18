import { requestUrl, RequestUrlParam, RequestUrlResponse } from "obsidian";

// Retry configuration constants
const RETRY_BASE_DELAY_MS = 1000; // Base delay for exponential backoff
const RETRY_MAX_DELAY_MS = 10000; // Maximum delay between retries

/**
 * Content part for multimodal messages (text or image)
 */
export interface MessageContentPart {
	type: "text" | "image_url";
	text?: string;
	image_url?: {
		url: string; // data:image/jpeg;base64,... or https://...
		detail?: "auto" | "low" | "high";
	};
}

/**
 * OpenAI API message format
 * Supports both simple string content and multimodal content arrays
 */
export interface ChatMessage {
	/** The role of the message author: 'system' for instructions, 'user' for prompts, 'assistant' for model responses */
	role: "system" | "user" | "assistant";
	/** The content of the message - can be a string or array of content parts for multimodal messages */
	content: string | MessageContentPart[];
}

/**
 * Request payload for OpenAI chat completions API
 */
export interface ChatCompletionRequest {
model: string;
messages: ChatMessage[];
temperature?: number;
max_tokens?: number;
top_p?: number;
stream?: boolean;
}

/**
 * Response from OpenAI chat completions API
 */
export interface ChatCompletionResponse {
id: string;
object: string;
created: number;
model: string;
choices: Array<{
index: number;
message: ChatMessage;
finish_reason: string;
}>;
usage: {
prompt_tokens: number;
completion_tokens: number;
total_tokens: number;
};
}

/**
 * Error response from OpenAI API
 */
export interface ApiErrorResponse {
error: {
message: string;
type: string;
code?: string;
};
}

/**
 * Configuration for LLM service
 */
export interface LLMServiceConfig {
apiKey: string;
baseUrl: string;
modelName: string;
timeout?: number; // in milliseconds
maxRetries?: number;
}

/**
 * Custom error class for LLM service errors
 */
export class LLMServiceError extends Error {
constructor(
message: string,
public statusCode?: number,
public apiError?: ApiErrorResponse
) {
super(message);
this.name = "LLMServiceError";
}
}

/**
 * Service class for interacting with LLM APIs compatible with OpenAI API format.
 * Uses Obsidian's requestUrl to avoid CORS issues.
 */
export class LLMService {
private config: LLMServiceConfig;

constructor(config: LLMServiceConfig) {
this.config = {
timeout: 30000, // 30 seconds default
maxRetries: 2,
...config,
};
}

/**
 * Update the service configuration
 */
public updateConfig(config: Partial<LLMServiceConfig>): void {
this.config = { ...this.config, ...config };
}

/**
 * Validate configuration before making API calls
 */
private validateConfig(): void {
if (!this.config.apiKey || this.config.apiKey.trim() === "") {
throw new LLMServiceError("API key is required");
}
if (!this.config.baseUrl || this.config.baseUrl.trim() === "") {
throw new LLMServiceError("Base URL is required");
}
if (!this.config.modelName || this.config.modelName.trim() === "") {
throw new LLMServiceError("Model name is required");
}
}

/**
 * Make a chat completion request to the LLM API.
 * Automatically handles retries for transient failures.
 * 
 * @param messages - Array of chat messages
 * @param options - Optional parameters for the API request
 * @param useSystemPrompt - Whether to prepend the strict system prompt (default: false)
 * @returns The completion response
 * @throws LLMServiceError on API errors or network failures
 */
public async chatCompletion(
messages: ChatMessage[],
options?: {
temperature?: number;
max_tokens?: number;
top_p?: number;
},
useSystemPrompt = false
): Promise<ChatCompletionResponse> {
this.validateConfig();

// Prepend system prompt if requested
let finalMessages = messages;
if (useSystemPrompt) {
const systemPrompt = LLMService.createSystemPrompt();
finalMessages = [systemPrompt, ...messages];
}

const requestBody: ChatCompletionRequest = {
model: this.config.modelName,
messages: finalMessages,
stream: false,
...options,
};

let lastError: Error | null = null;
const maxRetries = this.config.maxRetries ?? 2;

// Retry loop for transient failures
for (let attempt = 0; attempt <= maxRetries; attempt++) {
try {
return await this.makeRequest(requestBody);
} catch (error) {
lastError = error as Error;

// Don't retry on client errors (4xx except 429) or configuration errors
if (error instanceof LLMServiceError) {
if (
error.statusCode &&
error.statusCode >= 400 &&
error.statusCode < 500 &&
error.statusCode !== 429
) {
throw error;
}
}

// Wait before retrying (exponential backoff)
if (attempt < maxRetries) {
const delay = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, attempt), RETRY_MAX_DELAY_MS);
await this.sleep(delay);
}
}
}

// All retries exhausted
throw lastError ?? new LLMServiceError("Request failed after all retries");
}

/**
 * Make the actual HTTP request to the API
 */
private async makeRequest(
body: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
const url = `${this.config.baseUrl}/chat/completions`;

const requestParams: RequestUrlParam = {
url,
method: "POST",
headers: {
"Content-Type": "application/json",
Authorization: `Bearer ${this.config.apiKey}`,
},
body: JSON.stringify(body),
throw: false, // Handle errors manually
};

let response: RequestUrlResponse;

try {
// Create a timeout promise with cleanup
let timeoutId: ReturnType<typeof setTimeout> | undefined;
const timeoutMs = this.config.timeout ?? 30000;
const timeoutPromise = new Promise<never>((_, reject) => {
timeoutId = setTimeout(() => {
reject(
new LLMServiceError(
`Request timeout after ${timeoutMs}ms`
)
);
}, timeoutMs);
});

// Race between the request and timeout
response = await Promise.race([
requestUrl(requestParams),
timeoutPromise,
]);

// Clear timeout if request completed successfully
if (timeoutId !== undefined) {
clearTimeout(timeoutId);
}
} catch (error) {
// Network errors or timeout
if (error instanceof LLMServiceError) {
throw error;
}
throw new LLMServiceError(
`Network error: ${error instanceof Error ? error.message : "Unknown error"}`
);
}

// Handle HTTP errors
if (response.status < 200 || response.status >= 300) {
let errorMessage = `API request failed with status ${response.status}`;
let apiError: ApiErrorResponse | undefined;

try {
const errorData = response.json as unknown;
// Validate that errorData has the expected structure
if (
errorData &&
typeof errorData === "object" &&
"error" in errorData &&
errorData.error &&
typeof errorData.error === "object" &&
"message" in errorData.error &&
typeof errorData.error.message === "string"
) {
errorMessage = errorData.error.message;
apiError = errorData as ApiErrorResponse;
}
} catch {
// If we can't parse the error, use the text
if (response.text) {
errorMessage = `${errorMessage}: ${response.text}`;
}
}

throw new LLMServiceError(errorMessage, response.status, apiError);
}

// Parse and validate response
try {
const data = response.json as ChatCompletionResponse;
if (!data.choices || data.choices.length === 0) {
throw new LLMServiceError("API response missing choices");
}
return data;
} catch (error) {
if (error instanceof LLMServiceError) {
throw error;
}
throw new LLMServiceError(
`Failed to parse API response: ${error instanceof Error ? error.message : "Unknown error"}`
);
}
}

/**
 * Helper method to sleep for a given duration
 */
private sleep(ms: number): Promise<void> {
return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a multimodal message with text and images
 * @param role - The role of the message
 * @param text - The text content
 * @param images - Array of image data (base64 and MIME type)
 * @returns A message with multimodal content
 */
public static createMultimodalMessage(
role: "system" | "user" | "assistant",
text: string,
images: Array<{ base64: string; mimeType: string; detail?: "auto" | "low" | "high" }>
): ChatMessage {
const contentParts: MessageContentPart[] = [
{
type: "text",
text,
},
];

// Add image parts
for (const image of images) {
contentParts.push({
type: "image_url",
image_url: {
url: `data:${image.mimeType};base64,${image.base64}`,
detail: image.detail ?? "auto",
},
});
}

return {
role,
content: contentParts,
};
}

/**
 * Create a simple text message
 * @param role - The role of the message
 * @param text - The text content
 * @returns A message with text content
 */
public static createTextMessage(
role: "system" | "user" | "assistant",
text: string
): ChatMessage {
return {
role,
content: text,
};
}

/**
 * Create a system prompt with strict output constraints
 * @returns A system message with instructions to prevent conversational fillers
 */
public static createSystemPrompt(): ChatMessage {
const systemPromptText = `You are a helpful assistant that analyzes images. 
Output ONLY the markdown content requested. 
Do NOT start with conversational phrases like 'Certainly', 'Sure', 'Here is', or 'Here's'. 
Do NOT use framing lines like '---' or '\`\`\`markdown' unless specifically asked. 
Do NOT add explanations about what you're doing. 
Just provide the direct markdown output.`;

return {
role: "system",
content: systemPromptText,
};
}
}
