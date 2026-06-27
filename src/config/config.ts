import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { DEFAULT_CONFIG_PATH, DEFAULT_ISSUES_DIR } from "../constants.ts";
import { IssueMeError, isNodeError } from "../errors.ts";
import type { IssueMeConfig } from "../types.ts";

const SECRET_KEY_PATTERN = /(token|secret|password|credential|api[_-]?key)/i;

export const DEFAULT_ISSUEME_CONFIG: IssueMeConfig = {
	issueDirectory: DEFAULT_ISSUES_DIR,
	defaultLabels: [],
	defaultAssignees: [],
	defaultSkillPath: null,
};

export function getIssueMeConfigPath(cwd: string): string {
	return join(cwd, DEFAULT_CONFIG_PATH);
}

export async function loadIssueMeConfig(cwd: string): Promise<IssueMeConfig> {
	try {
		const text = await readFile(getIssueMeConfigPath(cwd), "utf8");
		const parsed = JSON.parse(text) as unknown;
		return normalizeIssueMeConfig(dropSecretLikeKeys(parsed));
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return cloneDefaultConfig();
		if (error instanceof SyntaxError) {
			throw new IssueMeError("config_parse_failed", "IssueMe config is not valid JSON.");
		}
		if (error instanceof IssueMeError) throw error;
		throw new IssueMeError("config_read_failed", "Unable to read IssueMe config.");
	}
}

export async function saveIssueMeConfig(cwd: string, input: unknown): Promise<IssueMeConfig> {
	assertNoSecretLikeKeys(input);
	const config = normalizeIssueMeConfig(input);
	const configPath = getIssueMeConfigPath(cwd);
	await mkdir(dirname(configPath), { recursive: true });
	await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
	return config;
}

export function normalizeIssueMeConfig(input: unknown): IssueMeConfig {
	if (!isObject(input)) return cloneDefaultConfig();
	return {
		issueDirectory: normalizeOptionalString(input.issueDirectory, DEFAULT_ISSUEME_CONFIG.issueDirectory),
		defaultLabels: normalizeStringArray(input.defaultLabels),
		defaultAssignees: normalizeStringArray(input.defaultAssignees),
		defaultSkillPath: normalizeNullableString(input.defaultSkillPath),
	};
}

export function assertNoSecretLikeKeys(input: unknown, path: string[] = []): void {
	if (!isObject(input)) return;
	for (const [key, value] of Object.entries(input)) {
		const nextPath = [...path, key];
		if (SECRET_KEY_PATTERN.test(key)) {
			throw new IssueMeError(
				"config_secret_key_refused",
				`Refusing to persist secret-like IssueMe config key: ${nextPath.join(".")}.`,
			);
		}
		if (isObject(value)) assertNoSecretLikeKeys(value, nextPath);
	}
}

function dropSecretLikeKeys(input: unknown): unknown {
	if (!isObject(input)) return input;
	const output: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input)) {
		if (SECRET_KEY_PATTERN.test(key)) continue;
		output[key] = value;
	}
	return output;
}

function cloneDefaultConfig(): IssueMeConfig {
	return {
		issueDirectory: DEFAULT_ISSUEME_CONFIG.issueDirectory,
		defaultLabels: [...DEFAULT_ISSUEME_CONFIG.defaultLabels],
		defaultAssignees: [...DEFAULT_ISSUEME_CONFIG.defaultAssignees],
		defaultSkillPath: DEFAULT_ISSUEME_CONFIG.defaultSkillPath,
	};
}

function normalizeOptionalString(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeNullableString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))];
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
