import { lstat, mkdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { DEFAULT_CONFIG_PATH, DEFAULT_ISSUES_DIR } from "../constants.ts";
import { IssueMeError, isNodeError } from "../errors.ts";
import type { IssueMeConfig } from "../types.ts";
import { GITHUB_LOGIN_PATTERN, normalizeAllowedIssueCreatorForLoad, normalizeAllowedIssueCreatorForSave } from "../utils/github-login.ts";
import { withCanonicalFileMutationQueue } from "../utils/mutation-queue.ts";
import { readTrustedTextFile } from "../utils/safe-read.ts";
import { writeFileAtomicSafe } from "../utils/safe-write.ts";
import { assertPathInside, assertSafeIssueDirectoryValue, normalizeIssueDirectoryValue, resolveIssueDirectory } from "../utils/slug.ts";

const SECRET_KEY_PATTERN = /(token|secret|password|credential|api[_-]?key)/i;

export const DEFAULT_ISSUEME_CONFIG: IssueMeConfig = {
	issueDirectory: DEFAULT_ISSUES_DIR,
	allowedIssueCreator: "all",
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
		const configPath = getIssueMeConfigPath(projectRoot);
		const text = await readTrustedTextFile(configPath, {
			projectRoot,
			safeDirectory: dirname(configPath),
			unsafeCode: "unsafe_path",
			unsafeMessage: "IssueMe config file cannot be a symlink.",
			notFileMessage: "IssueMe config path exists but is not a regular file.",
			raceSwapMessage: "IssueMe config changed while it was being opened for reading.",
		});
		const parsed = JSON.parse(text) as unknown;
		return validateLoadedIssueMeConfig(projectRoot, dropSecretLikeKeys(parsed));
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
		await writeFileAtomicSafe(configPath, `${JSON.stringify(config, null, 2)}\n`, {
			validateBeforeCreate: () => assertConfigPathSafe(projectRoot),
			validateBeforeRename: () => assertConfigPathSafe(projectRoot),
			validateAfterRename: () => assertConfigPathSafe(projectRoot),
		});
		return config;
	});
}

export function validateIssueMeConfig(projectRoot: string, input: unknown): IssueMeConfig {
	const config = normalizeIssueMeConfig(input, { strictAllowedIssueCreator: true });
	assertSafeIssueDirectoryValue(config.issueDirectory);
	resolveIssueDirectory(projectRoot, config.issueDirectory);
	validateDefaultSkillPath(projectRoot, config.defaultSkillPath);
	return config;
}

function validateLoadedIssueMeConfig(projectRoot: string, input: unknown): IssueMeConfig {
	const config = normalizeIssueMeConfig(input, { strictAllowedIssueCreator: false });
	assertSafeIssueDirectoryValue(config.issueDirectory);
	resolveIssueDirectory(projectRoot, config.issueDirectory);
	validateDefaultSkillPath(projectRoot, config.defaultSkillPath);
	return config;
}

export function normalizeIssueMeConfig(input: unknown, options: { strictAllowedIssueCreator?: boolean } = {}): IssueMeConfig {
	if (!isObject(input)) return cloneDefaultConfig();
	const allowedIssueCreator = options.strictAllowedIssueCreator
		? normalizeAllowedIssueCreatorForSave(input.allowedIssueCreator)
		: normalizeAllowedIssueCreatorForLoad(input.allowedIssueCreator, { fieldPresent: hasOwn(input, "allowedIssueCreator") });
	return {
		issueDirectory: normalizeIssueDirectoryValue(normalizeOptionalString(input.issueDirectory, DEFAULT_ISSUEME_CONFIG.issueDirectory)),
		allowedIssueCreator,
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
		allowedIssueCreator: DEFAULT_ISSUEME_CONFIG.allowedIssueCreator,
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
	const stripped = defaultSkillPath.trim().replace(/^@/, "");
	const absolute = isAbsolute(stripped) ? resolve(stripped) : resolve(projectRoot, stripped);
	try {
		assertPathInside(projectRoot, absolute, "Default skill path must stay inside the current project.");
	} catch (error) {
		if (error instanceof IssueMeError && error.code === "unsafe_path") {
			throw new IssueMeError("unsafe_skill_path", "Default skill path must stay inside the current project.");
		}
		throw error;
	}
	if (!isAbsolute(stripped)) {
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

function hasOwn(value: Record<string, unknown>, key: string): boolean {
	return Object.prototype.hasOwnProperty.call(value, key);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
