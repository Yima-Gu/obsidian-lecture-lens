import { Platform } from "obsidian";

const ENCRYPTED_PREFIX = "enc:v1:";

type SafeStorage = {
	isEncryptionAvailable(): boolean;
	encryptString(plainText: string): Buffer;
	decryptString(encrypted: Buffer): string;
};

function getSafeStorage(): SafeStorage | null {
	if (!Platform.isDesktopApp) return null;
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const electron = require("electron") as { safeStorage?: SafeStorage };
		const safeStorage = electron.safeStorage;
		if (!safeStorage?.isEncryptionAvailable()) return null;
		return safeStorage;
	} catch {
		return null;
	}
}

export function canEncryptSecrets(): boolean {
	return getSafeStorage() !== null;
}

export function isSecretEncrypted(stored: string): boolean {
	return stored.startsWith(ENCRYPTED_PREFIX);
}

export function encryptSecret(plainText: string): string {
	const trimmed = plainText.trim();
	if (!trimmed) return "";

	const storage = getSafeStorage();
	if (!storage) return trimmed;

	const encrypted = storage.encryptString(trimmed);
	return ENCRYPTED_PREFIX + encrypted.toString("base64");
}

export function decryptSecret(stored: string): string {
	if (!stored) return "";
	if (!isSecretEncrypted(stored)) return stored;

	const storage = getSafeStorage();
	if (!storage) return "";

	try {
		const payload = stored.slice(ENCRYPTED_PREFIX.length);
		return storage.decryptString(Buffer.from(payload, "base64"));
	} catch {
		return "";
	}
}
