/** Chat context limits derived from a model's context window. */
export interface ModelContextPolicy {
	/** Provider-reported or inferred context window (tokens). */
	contextTokens: number;
	/** Reference budget for the context panel (characters). */
	budgetChars: number;
	historyTurnLimit: number;
	ragTopK: number;
	maxNoteContextChars: number;
}
