import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { IssueMeError, isNodeError } from "../errors.ts";
import type { GitHubRepository } from "../types.ts";

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]+$/;

export function parseGitHubRepository(value: string): GitHubRepository | undefined {
	const input = value.trim();
	if (!input) return undefined;

	const shorthand = parseOwnerRepo(input);
	if (shorthand) return shorthand;

	const scpLike = input.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
	if (scpLike) return parseOwnerRepo(`${scpLike[1]}/${scpLike[2]}`);

	try {
		const url = new URL(input);
		if (url.hostname.toLowerCase() !== "github.com") return undefined;
		const pathParts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
		if (pathParts.length < 2) return undefined;
		const owner = decodeURIComponent(pathParts[0] ?? "");
		const repo = decodeURIComponent((pathParts[1] ?? "").replace(/\.git$/i, ""));
		return parseOwnerRepo(`${owner}/${repo}`);
	} catch {
		return undefined;
	}
}

export function parseGitConfigOriginUrl(configText: string): string | undefined {
	let inOriginRemote = false;
	for (const rawLine of configText.split(/\r?\n/)) {
		const line = rawLine.trim();
		const section = line.match(/^\[remote\s+"(.+)"\]$/);
		if (section) {
			inOriginRemote = section[1] === "origin";
			continue;
		}
		if (!inOriginRemote) continue;
		const url = line.match(/^url\s*=\s*(.+)$/);
		if (url) return url[1]?.trim();
	}
	return undefined;
}

export async function resolveCurrentRepository(
	cwd: string,
	env: NodeJS.ProcessEnv = process.env,
): Promise<GitHubRepository> {
	const envRepository = env.GITHUB_REPOSITORY?.trim();
	if (envRepository) {
		const parsed = parseGitHubRepository(envRepository);
		if (parsed) return parsed;
		throw new IssueMeError(
			"invalid_github_repository_env",
			"GITHUB_REPOSITORY is set but is not a valid GitHub owner/repo value.",
		);
	}

	let gitConfig: string;
	try {
		gitConfig = await readFile(join(cwd, ".git", "config"), "utf8");
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			throw new IssueMeError(
				"repository_not_found",
				"Unable to resolve GitHub repository. Set GITHUB_REPOSITORY or run IssueMe in a GitHub checkout.",
			);
		}
		throw new IssueMeError("repository_read_failed", "Unable to read .git/config for repository resolution.");
	}

	const originUrl = parseGitConfigOriginUrl(gitConfig);
	if (!originUrl) {
		throw new IssueMeError("repository_origin_missing", "No origin remote URL found in .git/config.");
	}

	const parsed = parseGitHubRepository(originUrl);
	if (!parsed) {
		throw new IssueMeError("repository_origin_not_github", "The origin remote is not a supported GitHub repository URL.");
	}
	return parsed;
}

function parseOwnerRepo(value: string): GitHubRepository | undefined {
	const parts = value.replace(/\.git$/i, "").split("/");
	if (parts.length !== 2) return undefined;
	const [owner, repo] = parts;
	if (!owner || !repo) return undefined;
	if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) return undefined;
	return { owner, repo, fullName: `${owner}/${repo}` };
}
