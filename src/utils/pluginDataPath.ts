import { App } from "obsidian";

const PLUGIN_DATA_FOLDER = "lecture-lens";

export function getPluginDataDir(app: App): string {
	return `${app.vault.configDir}/${PLUGIN_DATA_FOLDER}`;
}

export function getLegacyPluginDataDir(app: App, pluginId: string): string {
	return `${app.vault.configDir}/plugins/${pluginId}`;
}

export async function ensurePluginDataDir(app: App): Promise<string> {
	const dir = getPluginDataDir(app);
	if (!(await app.vault.adapter.exists(dir))) {
		await app.vault.adapter.mkdir(dir);
	}
	return dir;
}

/** Resolve a user-data file path under `.obsidian/lecture-lens/`, migrating from the legacy plugin folder if needed. */
export async function resolvePluginDataFile(
	app: App,
	pluginId: string,
	filename: string
): Promise<string> {
	await ensurePluginDataDir(app);
	const newPath = `${getPluginDataDir(app)}/${filename}`;
	const legacyPath = `${getLegacyPluginDataDir(app, pluginId)}/${filename}`;

	if (!(await app.vault.adapter.exists(newPath)) && (await app.vault.adapter.exists(legacyPath))) {
		await app.vault.adapter.copy(legacyPath, newPath);
	}

	return newPath;
}

/** Resolve a user-data subdirectory, migrating files from the legacy plugin folder if needed. */
export async function resolvePluginDataSubdir(
	app: App,
	pluginId: string,
	subdir: string
): Promise<string> {
	await ensurePluginDataDir(app);
	const newDir = `${getPluginDataDir(app)}/${subdir}`;
	const legacyDir = `${getLegacyPluginDataDir(app, pluginId)}/${subdir}`;

	if (!(await app.vault.adapter.exists(newDir)) && (await app.vault.adapter.exists(legacyDir))) {
		await app.vault.adapter.mkdir(newDir);
		const listing = await app.vault.adapter.list(legacyDir);
		for (const file of listing.files) {
			const name = file.substring(file.lastIndexOf("/") + 1);
			await app.vault.adapter.copy(file, `${newDir}/${name}`);
		}
	}

	if (!(await app.vault.adapter.exists(newDir))) {
		await app.vault.adapter.mkdir(newDir);
	}

	return newDir;
}
