export function formatContextSize(chars: number): string {
	if (chars < 1000) return `${chars}`;
	if (chars < 10000) return `${(chars / 1000).toFixed(1)}k`;
	return `${Math.round(chars / 1000)}k`;
}

export function clampPercent(value: number): number {
	return Math.min(100, Math.max(0, Math.round(value)));
}

export function previewText(text: string, maxLen = 48): string {
	const trimmed = text.trim().replace(/\s+/g, " ");
	if (!trimmed) return "…";
	return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen)}…` : trimmed;
}

/** Rough token estimate for UI (≈ chars / 2 for mixed CN/EN). */
export function estimateTokens(chars: number): number {
	return Math.ceil(chars / 2);
}
