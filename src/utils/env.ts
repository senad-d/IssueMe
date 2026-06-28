import { lstat, readFile } from "node:fs/promises";
import { join } from "node:path";

import { IssueMeError, isNodeError } from "../errors.ts";
import type { TokenKey, TokenResolution, TokenStatus } from "../types.ts";

const TOKEN_KEYS = ["GH_TOKEN", "GITHUB_TOKEN"] as const satisfies readonly TokenKey[];
const PROJECT_ENV_TOKEN_ORDER = TOKEN_KEYS;
const PROCESS_ENV_TOKEN_ORDER = TOKEN_KEYS;

export type ProjectEnvTokens = Partial<Record<TokenKey, string>>;

export function stripLeadingAt(value: string): string {
	return value.startsWith("@") ? value.slice(1) : value;
}

export function redactSecrets(text: string, secrets: readonly (string | undefined)[]): string {
	let redacted = text;
	for (const secret of secrets) {
		if (!secret) continue;
		redacted = redacted.split(secret).join("[REDACTED]");
	}
	return redacted;
}

export function parseProjectEnvTokens(text: string): ProjectEnvTokens {
	const tokens: ProjectEnvTokens = {};
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;

		const withoutExport = line.replace(/^export\s+/, "").trimStart();
		const equalsIndex = withoutExport.indexOf("=");
		if (equalsIndex <= 0) continue;

		const key = withoutExport.slice(0, equalsIndex).trim();
		if (!isTokenKey(key)) continue;

		const rawValue = withoutExport.slice(equalsIndex + 1).trim();
		const value = parseEnvValue(rawValue);
		if (value?.trim()) tokens[key] = value;
	}
	return tokens;
}

export async function readProjectEnvTokens(projectRoot: string): Promise<ProjectEnvTokens> {
	const envPath = join(projectRoot, ".env");
	try {
		const envStat = await lstat(envPath);
		if (envStat.isSymbolicLink() || !envStat.isFile()) {
			throw new IssueMeError("env_read_failed", "Project .env must be a regular, non-symlinked file for GitHub token resolution.");
		}
		const text = await readFile(envPath, "utf8");
		return parseProjectEnvTokens(text);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return {};
		if (error instanceof IssueMeError) throw error;
		throw new IssueMeError("env_read_failed", "Unable to read project .env for GitHub token resolution.");
	}
}

export async function resolveGitHubToken(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env,
	options: { readProjectEnv?: boolean } = {},
): Promise<TokenResolution> {
	const readProjectEnv = options.readProjectEnv ?? true;
	const projectTokens = readProjectEnv ? await readProjectEnvTokens(projectRoot) : {};

	for (const key of PROJECT_ENV_TOKEN_ORDER) {
		const token = normalizeTokenValue(projectTokens[key], `project-env:${key}`);
		if (token) {
			return { token, key, source: `project-env:${key}`, fromProjectEnv: true };
		}
	}

	for (const key of PROCESS_ENV_TOKEN_ORDER) {
		const token = normalizeTokenValue(env[key], `process-env:${key}`);
		if (token) {
			return { token, key, source: `process-env:${key}`, fromProjectEnv: false };
		}
	}

	throw new IssueMeError(
		"missing_github_token",
		"GitHub token not found. Set GH_TOKEN or GITHUB_TOKEN in the project .env or process environment.",
	);
}

export async function getGitHubTokenStatus(
	projectRoot: string,
	env: NodeJS.ProcessEnv = process.env,
	options: { readProjectEnv?: boolean } = {},
): Promise<TokenStatus> {
	try {
		const resolution = await resolveGitHubToken(projectRoot, env, options);
		return {
			present: true,
			source: resolution.source,
			message: `GitHub token present via ${resolution.source}.`,
		};
	} catch (error) {
		if (error instanceof IssueMeError && error.code === "missing_github_token") {
			return { present: false, message: error.message };
		}
		if (error instanceof IssueMeError && error.code === "env_read_failed") {
			return { present: false, error: true, message: "Project .env could not be read safely; process token fallback was not used to avoid hiding the read error." };
		}
		if (error instanceof IssueMeError && error.code === "invalid_github_token") {
			return { present: false, error: true, message: error.message };
		}
		throw error;
	}
}

function isTokenKey(value: string): value is TokenKey {
	return (TOKEN_KEYS as readonly string[]).includes(value);
}

function normalizeTokenValue(value: string | undefined, source: string): string | undefined {
	const token = value?.trim();
	if (!token) return undefined;
	if (/\s|[\u0000-\u001F\u007F]/.test(token)) {
		throw new IssueMeError(
			"invalid_github_token",
			`GitHub token from ${source} contains embedded whitespace or control characters; use the raw token value only.`,
			{ source },
		);
	}
	return token;
}

function parseEnvValue(rawValue: string): string | undefined {
	if (!rawValue) return undefined;
	const first = rawValue[0];
	if (first === "\"" || first === "'") return parseQuotedValue(rawValue, first);
	return stripUnquotedComment(rawValue).trim();
}

function parseQuotedValue(rawValue: string, quote: "\"" | "'"): string | undefined {
	let escaped = false;
	let value = "";
	for (let index = 1; index < rawValue.length; index += 1) {
		const char = rawValue[index];
		if (escaped) {
			value += quote === "\"" ? decodeDoubleQuotedEscape(char) : char;
			escaped = false;
			continue;
		}
		if (char === "\\") {
			escaped = true;
			continue;
		}
		if (char === quote) return value;
		value += char;
	}
	return undefined;
}

function stripUnquotedComment(rawValue: string): string {
	for (let index = 0; index < rawValue.length; index += 1) {
		if (rawValue[index] === "#" && (index === 0 || /\s/.test(rawValue[index - 1] ?? ""))) {
			return rawValue.slice(0, index);
		}
	}
	return rawValue;
}

function decodeDoubleQuotedEscape(char: string | undefined): string {
	switch (char) {
		case "n": return "\n";
		case "r": return "\r";
		case "t": return "\t";
		case "\"": return "\"";
		case "\\": return "\\";
		case undefined: return "";
		default: return char;
	}
}
