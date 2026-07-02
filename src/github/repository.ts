import { join } from "node:path";

import { IssueMeError, isNodeError } from "../errors.ts";
import type { GitHubRepository } from "../types.ts";
import { readTrustedTextFile } from "../utils/safe-read.ts";
import { resolveCommonGitDirectory, resolveGitDirectory, resolveIssueMeProjectRoot } from "../utils/project-root.ts";

const OWNER_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const REPO_PATTERN = /^[A-Za-z0-9._-]+$/;

export function parseGitHubRepository(value: string): GitHubRepository | undefined {
	const parsed = classifyRepositorySource(value);
	return parsed.kind === "github" ? parsed.repository : undefined;
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
	options: { allowGitConfig?: boolean } = {},
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

	if (options.allowGitConfig === false) {
		throw new IssueMeError(
			"repository_untrusted_project",
			"Project trust is required before IssueMe reads local Git config for repository resolution.",
		);
	}

	const root = await resolveIssueMeProjectRoot(cwd);
	if (!root.gitRootFound) {
		throw new IssueMeError(
			"repository_not_found",
			"Unable to resolve GitHub repository. Set GITHUB_REPOSITORY or run IssueMe in a GitHub checkout.",
		);
	}

	const configTexts = await readRepositoryConfigTexts(root.root);
	const originUrl = configTexts.map(parseGitConfigOriginUrl).find((url) => url !== undefined);
	if (!originUrl) {
		throw new IssueMeError("repository_origin_missing", "No origin remote URL found in local Git config.");
	}

	const parsed = classifyRepositorySource(originUrl);
	if (parsed.kind === "github") return parsed.repository;
	if (parsed.kind === "non_github") {
		throw new IssueMeError("repository_origin_not_github", "The origin remote is not a supported GitHub repository URL.");
	}
	throw new IssueMeError("repository_origin_malformed", "The origin remote URL is malformed and cannot be resolved as a GitHub repository.");
}

async function readRepositoryConfigTexts(gitRoot: string): Promise<string[]> {
	try {
		const gitDirectory = await resolveGitDirectory(gitRoot);
		const commonGitDirectory = await resolveCommonGitDirectory(gitDirectory);
		const candidatePaths = uniquePathCandidates([
			{ path: join(gitDirectory, "config"), safeDirectory: gitDirectory },
			{ path: join(gitDirectory, "config.worktree"), safeDirectory: gitDirectory },
			{ path: join(commonGitDirectory, "config"), safeDirectory: commonGitDirectory },
		]);
		const configTexts: string[] = [];
		for (const candidate of candidatePaths) {
			const text = await readConfigIfExists(candidate.path, candidate.safeDirectory);
			if (text !== undefined) configTexts.push(text);
		}
		return configTexts;
	} catch (error) {
		if (error instanceof IssueMeError) throw error;
		throw new IssueMeError("repository_read_failed", "Unable to read Git config for repository resolution.");
	}
}

async function readConfigIfExists(path: string, safeDirectory: string): Promise<string | undefined> {
	try {
		return await readTrustedTextFile(path, {
			safeDirectory,
			unsafeCode: "repository_read_failed",
			unsafeMessage: "Git config must be a regular, non-symlinked file.",
			notFileMessage: "Git config path exists but is not a regular file.",
			raceSwapMessage: "Git config changed while it was being opened for repository resolution.",
		});
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return undefined;
		throw error;
	}
}

function uniquePathCandidates(candidates: Array<{ path: string; safeDirectory: string }>): Array<{ path: string; safeDirectory: string }> {
	const seen = new Set<string>();
	return candidates.filter((candidate) => {
		if (seen.has(candidate.path)) return false;
		seen.add(candidate.path);
		return true;
	});
}

type RepositorySourceClassification =
	| { kind: "github"; repository: GitHubRepository }
	| { kind: "non_github" }
	| { kind: "malformed" };

function classifyRepositorySource(value: string): RepositorySourceClassification {
	const input = value.trim();
	if (!input) return { kind: "malformed" };

	const shorthand = parseOwnerRepo(input);
	if (shorthand) return { kind: "github", repository: shorthand };

	const scpLike = /^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/.exec(input);
	if (scpLike && !input.includes("://")) {
		const host = scpLike[1]?.toLowerCase();
		if (host !== "github.com") return { kind: "non_github" };
		const repository = parseOwnerRepo(scpLike[2] ?? "");
		return repository ? { kind: "github", repository } : { kind: "malformed" };
	}

	try {
		const url = new URL(input);
		if (url.hostname.toLowerCase() !== "github.com") return { kind: "non_github" };
		const pathParts = trimPathSlashes(url.pathname).split("/");
		if (pathParts.length !== 2) return { kind: "malformed" };
		const owner = safeDecodeURIComponent(pathParts[0] ?? "");
		const repo = safeDecodeURIComponent((pathParts[1] ?? "").replace(/\.git$/i, ""));
		const repository = parseOwnerRepo(`${owner}/${repo}`);
		return repository ? { kind: "github", repository } : { kind: "malformed" };
	} catch {
		return { kind: "malformed" };
	}
}

function trimPathSlashes(pathname: string): string {
	let start = 0;
	let end = pathname.length;
	while (start < end && pathname[start] === "/") start += 1;
	while (end > start && pathname[end - 1] === "/") end -= 1;
	return pathname.slice(start, end);
}

function parseOwnerRepo(value: string): GitHubRepository | undefined {
	const parts = value.replace(/\.git$/i, "").split("/");
	if (parts.length !== 2) return undefined;
	const [owner, repo] = parts;
	if (!owner || !repo) return undefined;
	if (!OWNER_PATTERN.test(owner) || !REPO_PATTERN.test(repo)) return undefined;
	return { owner, repo, fullName: `${owner}/${repo}` };
}

function safeDecodeURIComponent(value: string): string {
	try {
		return decodeURIComponent(value);
	} catch {
		return "";
	}
}
