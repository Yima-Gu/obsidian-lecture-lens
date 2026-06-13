import { App, getLanguage } from "obsidian";
import { en, TranslationKey } from "./en";
import { zh } from "./zh";

export type UiLanguage = "auto" | "en" | "zh";
export type ResolvedLocale = "en" | "zh";

const catalogs = { en, zh } as const;

export function resolveLocale(uiLanguage: UiLanguage, _app: App): ResolvedLocale {
	if (uiLanguage === "en") return "en";
	if (uiLanguage === "zh") return "zh";

	const obsidianLang = getLanguage();
	return obsidianLang.startsWith("zh") ? "zh" : "en";
}

export function t(
	locale: ResolvedLocale,
	key: TranslationKey,
	params?: Record<string, string | number>
): string {
	let text: string = catalogs[locale][key] ?? en[key];
	if (params) {
		for (const [name, value] of Object.entries(params)) {
			text = text.split(`{{${name}}}`).join(String(value));
		}
	}
	return text;
}

export type { TranslationKey };
