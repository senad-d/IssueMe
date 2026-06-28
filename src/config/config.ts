import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { DEFAULT_CONFIG_PATH, DEFAULT_ISSUES_DIR } from "../constants.ts";
import { IssueMeError, isNodeError } from "../errors.ts";
import type { IssueMeConfig } from "../types.ts";
import { withCanonicalFileMutationQueue } from "../utils/mutation-queue.ts";
import { assertPathInside, assertSafeIssueDirectoryValue, normalizeIssueDirectoryValue, resolveIssueDirectory } from "../utils/slug.ts";

const SECRET_KEY_PATTERN = /(token|secret|password|credential|api[_-]?key)/i;
const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export const DEFAULT_ISSUEME_CONFIG: IssueMeConfig = {
	issueDirectory: DEFAULT_ISSUES_DIR,
	defaultLabels: [],
	defaultAssignees: [],
	defaultSkillPath: null,
};

export function getIssueMeConfigPath(projectRoot: string): string {
	return join(projectRoot, DEFAULT_CONFIG_PATH);
}

export async function loadIssueMeConfig(projectRoot: string): Promise<IssueMeConfig> {
	try {
		await assertConfigPathSafe(projectRoot);
		const text = await readFile(getIssueMeConfigPath(projectRoot), "utf8");
		const parsed = JSON.parse(text) as unknown;
		return validateIssueMeConfig(projectRoot, dropSecretLikeKeys(parsed));
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return cloneDefaultConfig();
		if (error instanceof SyntaxError) {
			throw new IssueMeError("config_parse_failed", "IssueMe config is not valid JSON.");
		}
		if (error instanceof IssueMeError) throw error;
		throw new IssueMeError("config_read_failed", "Unable to read IssueMe config.");
	}
}

export async function saveIssueMeConfig(projectRoot: string, input: unknown): Promise<IssueMeConfig> {
	assertNoSecretLikeKeys(input);
	const config = validateIssueMeConfig(projectRoot, input);
	const configPath = getIssueMeConfigPath(projectRoot);
	return withCanonicalFileMutationQueue(configPath, async () => {
		await assertConfigPathSafe(projectRoot);
		await mkdir(dirname(configPath), { recursive: true });
		await assertConfigPathSafe(projectRoot);
		await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
		return config;
	});
}

export function validateIssueMeConfig(projectRoot: string, input: unknown): IssueMeConfig {
	const config = normalizeIssueMeConfig(input);
	assertSafeIssueDirectoryValue(config.issueDirectory);
	resolveIssueDirectory(projectRoot, config.issueDirectory);
	validateDefaultSkillPath(projectRoot, config.defaultSkillPath);
	return config;
}

export function normalizeIssueMeConfig(input: unknown): IssueMeConfig {
	if (!isObject(input)) return cloneDefaultConfig();
	return {
		issueDirectory: normalizeIssueDirectoryValue(normalizeOptionalString(input.issueDirectory, DEFAULT_ISSUEME_CONFIG.issueDirectory)),
		defaultLabels: normalizeStringArray(input.defaultLabels, "defaultLabels"),
		defaultAssignees: normalizeStringArray(input.defaultAssignees, "defaultAssignees"),
		defaultSkillPath: normalizeNullableString(input.defaultSkillPath),
	};
}

export function assertNoSecretLikeKeys(input: unknown, path: string[] = []): void {
	if (Array.isArray(input)) {
		input.forEach((value, index) => assertNoSecretLikeKeys(value, [...path, String(index)]));
		return;
	}
	if (!isObject(input)) return;
	for (const [key, value] of Object.entries(input)) {
		const nextPath = [...path, key];
		if (SECRET_KEY_PATTERN.test(key)) {
			throw new IssueMeError(
				"config_secret_key_refused",
				`Refusing to persist secret-like IssueMe config key: ${nextPath.join(".")}.`,
			);
		}
		assertNoSecretLikeKeys(value, nextPath);
	}
}

function dropSecretLikeKeys(input: unknown): unknown {
	if (Array.isArray(input)) return input.map(dropSecretLikeKeys);
	if (!isObject(input)) return input;
	const output: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input)) {
		if (SECRET_KEY_PATTERN.test(key)) continue;
		output[key] = dropSecretLikeKeys(value);
	}
	return output;
}

async function assertConfigPathSafe(projectRoot: string): Promise<void> {
	const configPath = getIssueMeConfigPath(projectRoot);
	const rootRealPath = await realpath(projectRoot);
	await assertConfigParentSafe(projectRoot, dirname(configPath), rootRealPath);
	try {
		const configStat = await lstat(configPath);
		if (configStat.isSymbolicLink()) throw new IssueMeError("unsafe_path", "IssueMe config file cannot be a symlink.");
		if (!configStat.isFile()) throw new IssueMeError("unsafe_path", "IssueMe config path exists but is not a regular file.");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return;
		throw error;
	}
}

async function assertConfigParentSafe(projectRoot: string, targetDirectory: string, rootRealPath: string): Promise<void> {
	let current = resolve(projectRoot);
	const relativeParent = relative(current, targetDirectory);
	const parts = relativeParent.split(/[\\/]+/).filter(Boolean);
	for (const part of parts) {
		current = join(current, part);
		try {
			const currentStat = await lstat(current);
			if (currentStat.isSymbolicLink()) throw new IssueMeError("unsafe_path", "IssueMe config directory cannot contain symlinked parents.");
			if (!currentStat.isDirectory()) throw new IssueMeError("unsafe_path", "IssueMe config parent path exists but is not a directory.");
			assertPathInside(rootRealPath, await realpath(current), "IssueMe config directory must resolve inside the current project.");
		} catch (error) {
			if (isNodeError(error) && error.code === "ENOENT") return;
			throw error;
		}
	}
}

function cloneDefaultConfig(): IssueMeConfig {
	return {
		issueDirectory: DEFAULT_ISSUEME_CONFIG.issueDirectory,
		defaultLabels: [...DEFAULT_ISSUEME_CONFIG.defaultLabels],
		defaultAssignees: [...DEFAULT_ISSUEME_CONFIG.defaultAssignees],
		defaultSkillPath: DEFAULT_ISSUEME_CONFIG.defaultSkillPath,
	};
}

function validateDefaultSkillPath(projectRoot: string, defaultSkillPath: string | null): void {
	if (defaultSkillPath === null) return;
	if (defaultSkillPath.includes("\0")) {
		throw new IssueMeError("unsafe_skill_path", "Default skill path contains an invalid null byte.");
	}
	const absolute = isAbsolute(defaultSkillPath) ? resolve(defaultSkillPath) : resolve(projectRoot, defaultSkillPath);
	assertPathInside(projectRoot, absolute, "Default skill path must stay inside the current project.");
	if (!isAbsolute(defaultSkillPath)) {
		const rel = relative(projectRoot, absolute);
		if (rel === ".." || rel.startsWith(`..${"/"}`) || rel.startsWith("..\\")) {
			throw new IssueMeError("unsafe_skill_path", "Default skill path cannot use path traversal.");
		}
	}
}

function normalizeOptionalString(value: unknown, fallback: string): string {
	return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeNullableString(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStringArray(value: unknown, fieldName: string): string[] {
	if (!Array.isArray(value)) return [];
	const normalized: string[] = [];
	for (const item of value) {
		if (typeof item !== "string") continue;
		const trimmed = item.trim();
		if (!trimmed) continue;
		if (trimmed.includes("\0")) {
			throw new IssueMeError("config_tui_invalid_setting", `${fieldName} must not contain null bytes.`, { field: fieldName });
		}
		if (/\r|\n/.test(trimmed)) {
			throw new IssueMeError("config_tui_invalid_setting", `${fieldName} entries must fit on one line.`, { field: fieldName });
		}
		if (fieldName === "defaultAssignees" && !GITHUB_LOGIN_PATTERN.test(trimmed)) {
			throw new IssueMeError("config_tui_invalid_setting", "defaultAssignees entries must be valid GitHub usernames.", { field: fieldName });
		}
		normalized.push(trimmed);
	}
	return [...new Set(normalized)];
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
