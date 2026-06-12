import { App, FileSystemAdapter, Platform, TFile, TFolder } from "obsidian";

/** Normalize vault-relative path segments (not for filesystem absolute paths). */
export function normalizeVaultRelativePath(input: string): string {
	let path = input.trim();
	if (!path) return "";

	const wikiMatch = path.match(/^\[\[(.+?)]]$/);
	if (wikiMatch) {
		path = wikiMatch[1] ?? path;
	}
	if (path.includes("|")) {
		path = path.split("|")[0]?.trim() ?? path;
	}

	path = path.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
	return path;
}

/** @deprecated Use normalizeVaultRelativePath or canonicalizeCourseFolderInput. */
export function normalizeVaultPath(input: string): string {
	return normalizeVaultRelativePath(input);
}

function getVaultBasePath(app: App): string | null {
	const adapter = app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		return adapter.getBasePath();
	}
	return null;
}

function normalizeFilesystemPath(path: string): string {
	let normalized = path.trim().replace(/\\/g, "/");
	if (normalized.length > 1) {
		normalized = normalized.replace(/\/+$/, "");
	}
	return normalized;
}

export function isAbsoluteFilesystemPath(path: string): boolean {
	const normalized = normalizeFilesystemPath(path);
	if (/^[a-zA-Z]:\//.test(normalized) || /^[a-zA-Z]:$/.test(normalized)) {
		return true;
	}
	if (normalized.startsWith("//")) return true;
	if (normalized.startsWith("/")) return true;
	return false;
}

function pathStartsWith(path: string, prefix: string): boolean {
	if (Platform.isWin) {
		return path.toLowerCase().startsWith(prefix.toLowerCase());
	}
	return path.startsWith(prefix);
}

/** Convert an on-disk path inside the vault to a vault-relative path. */
export function absolutePathToVaultRelative(app: App, input: string): string | null {
	const basePath = getVaultBasePath(app);
	if (!basePath) return null;

	const absPath = normalizeFilesystemPath(input);
	const base = normalizeFilesystemPath(basePath);
	if (!pathStartsWith(absPath, base)) return null;

	let relative = absPath.slice(base.length).replace(/^\/+/, "").replace(/\/+$/, "");
	return relative;
}

/**
 * Normalize user input for storage/display.
 * Absolute paths under the vault are converted to vault-relative paths.
 */
export function canonicalizeCourseFolderInput(app: App, input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return "";

	if (isAbsoluteFilesystemPath(trimmed)) {
		const relative = absolutePathToVaultRelative(app, trimmed);
		if (relative !== null) return relative;
		return normalizeFilesystemPath(trimmed);
	}

	const relative = normalizeVaultRelativePath(trimmed);
	if (relative === "/" || relative === ".") return "";
	return relative;
}

function findFolderCaseInsensitive(app: App, targetPath: string): TFolder | null {
	const target = targetPath.toLowerCase();
	for (const item of app.vault.getAllLoadedFiles()) {
		if (item instanceof TFolder && item.path.toLowerCase() === target) {
			return item;
		}
	}
	return null;
}

function resolveVaultRelativeFolder(app: App, vaultPath: string): TFolder | null {
	const direct = app.vault.getAbstractFileByPath(vaultPath);
	if (direct instanceof TFolder) return direct;
	if (direct instanceof TFile) {
		const parent = direct.parent;
		if (parent instanceof TFolder) return parent;
	}
	return findFolderCaseInsensitive(app, vaultPath);
}

/** Resolve a course folder from browse selection, vault-relative, or absolute path. */
export function resolveVaultFolder(app: App, input: string): TFolder | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	let vaultPath: string;
	if (isAbsoluteFilesystemPath(trimmed)) {
		const relative = absolutePathToVaultRelative(app, trimmed);
		if (relative === null) return null;
		vaultPath = relative;
	} else {
		vaultPath = normalizeVaultRelativePath(trimmed);
	}

	if (vaultPath === "" || vaultPath === "/" || vaultPath === ".") {
		return app.vault.getRoot();
	}

	return resolveVaultRelativeFolder(app, vaultPath);
}

export function formatCourseFolderNotFound(input: string): string {
	const shown = input.trim() || "(empty)";
	return (
		`Course folder not found: ${shown}. ` +
		"Pick a folder with Browse, or enter a vault path like Courses/My Course, " +
		"or an absolute path inside this vault (macOS/Windows)."
	);
}

export function getCourseFolderDisplayPath(app: App, input: string): string {
	return canonicalizeCourseFolderInput(app, input) || input.trim();
}

export function hasCourseFolderInput(input: string): boolean {
	return input.trim().length > 0;
}
