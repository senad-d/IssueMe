import { readFile } from "node:fs/promises";
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

		const withoutExport = line.startsWith("export ") ? line.slice("export ".length).trimStart() : line;
		const equalsIndex = withoutExport.indexOf("=");
		if (equalsIndex <= 0) continue;

		const key = withoutExport.slice(0, equalsIndex).trim();
		if (!isTokenKey(key)) continue;

		const rawValue = withoutExport.slice(equalsIndex + 1).trim();
		const value = unquoteEnvValue(rawValue);
		if (value) tokens[key] = value;
	}
	return tokens;
}

export async function readProjectEnvTokens(cwd: string): Promise<ProjectEnvTokens> {
	try {
		const text = await readFile(join(cwd, ".env"), "utf8");
		return parseProjectEnvTokens(text);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return {};
		throw new IssueMeError("env_read_failed", "Unable to read project .env for GitHub token resolution.");
	}
}

export async function resolveGitHubToken(
	cwd: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<TokenResolution> {
	const projectTokens = await readProjectEnvTokens(cwd);

	for (const key of PROJECT_ENV_TOKEN_ORDER) {
		const token = projectTokens[key]?.trim();
		if (token) {
			return { token, key, source: `project-env:${key}`, fromProjectEnv: true };
		}
	}

	for (const key of PROCESS_ENV_TOKEN_ORDER) {
		const token = env[key]?.trim();
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
	cwd: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<TokenStatus> {
	try {
		const resolution = await resolveGitHubToken(cwd, env);
		return {
			present: true,
			source: resolution.source,
			message: `GitHub token present via ${resolution.source}.`,
		};
	} catch (error) {
		if (error instanceof IssueMeError && error.code === "missing_github_token") {
			return { present: false, message: error.message };
		}
		throw error;
	}
}

function isTokenKey(value: string): value is TokenKey {
	return (TOKEN_KEYS as readonly string[]).includes(value);
}

function unquoteEnvValue(rawValue: string): string {
	if (!rawValue) return "";
	const first = rawValue[0];
	const last = rawValue.at(-1);
	if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
		const inner = rawValue.slice(1, -1);
		return first === '"' ? inner.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "\t") : inner;
	}
	const commentIndex = rawValue.search(/\s#/);
	return (commentIndex >= 0 ? rawValue.slice(0, commentIndex) : rawValue).trim();
}
