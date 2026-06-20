/** Model entry from provider GET /models (Kimi, DeepSeek). */
export interface RemoteModelInfo {
	id: string;
	contextLength?: number;
	supportsImageIn?: boolean;
	supportsVideoIn?: boolean;
	supportsReasoning?: boolean;
}

export interface RemoteModelListResponse {
	object?: string;
	data?: Array<{
		id?: string;
		context_length?: number;
		supports_image_in?: boolean;
		supports_video_in?: boolean;
		supports_reasoning?: boolean;
	}>;
}
