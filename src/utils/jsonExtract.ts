export function extractJsonFromLlmResponse<T>(text: string): T {
	const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const raw = (fenceMatch?.[1] ?? text).trim();
	return JSON.parse(raw) as T;
}
