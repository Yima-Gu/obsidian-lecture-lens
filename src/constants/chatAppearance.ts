export const CHAT_MESSAGE_FONT_SIZE_MIN = 12;
export const CHAT_MESSAGE_FONT_SIZE_MAX = 24;
export const DEFAULT_CHAT_MESSAGE_FONT_SIZE = 14;
export const DEFAULT_CHAT_MAX_TOKENS = 8192;

export function clampChatMessageFontSize(size: number): number {
	return Math.min(
		CHAT_MESSAGE_FONT_SIZE_MAX,
		Math.max(CHAT_MESSAGE_FONT_SIZE_MIN, Math.round(size))
	);
}
