import { lstat, readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { IssueMeError, isNodeError } from "../errors.ts";

export interface ProjectRootResolution {
	root: string;
	gitRootFound: boolean;
	gitEntryPath?: string;
}

/**
 * Resolve the IssueMe project root without shelling out.
 *
 * Pi currently exposes ctx.cwd but not a dedicated project-root field, so IssueMe
 * walks upward to the nearest Git entry. If no Git entry exists, the resolved cwd
 * is used as a safe fallback for command/help rendering.
 */
export async function resolveIssueMeProjectRoot(cwd: string): Promise<ProjectRootResolution> {
	const start = resolve(cwd);
	const gitRoot = await findNearestGitRoot(start);
	if (gitRoot) return gitRoot;
	return { root: start, gitRootFound: false };
}

export async function findNearestGitRoot(cwd: string): Promise<ProjectRootResolution | undefined> {
	let current = resolve(cwd);
	while (true) {
		const gitEntryPath = join(current, ".git");
		try {
			const stat = await lstat(gitEntryPath);
			if (stat.isDirectory() || stat.isFile()) {
				return { root: current, gitRootFound: true, gitEntryPath };
			}
		} catch (error) {
			if (!(isNodeError(error) && error.code === "ENOENT")) {
				throw new IssueMeError("project_root_read_failed", "Unable to inspect project Git metadata safely.");
			}
		}

		const parent = dirname(current);
		if (parent === current) return undefined;
		current = parent;
	}
}

export async function realpathIfExists(path: string): Promise<string | undefined> {
	try {
		return await realpath(path);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return undefined;
		throw error;
	}
}

export async function resolveGitDirectory(gitRoot: string): Promise<string> {
	const gitEntryPath = join(gitRoot, ".git");
	const stat = await lstat(gitEntryPath);
	if (stat.isDirectory()) return gitEntryPath;
	if (!stat.isFile()) {
		throw new IssueMeError("repository_git_entry_invalid", "The .git entry is neither a directory nor a gitdir file.");
	}

	const text = await readFile(gitEntryPath, "utf8");
	const match = text.match(/^gitdir:\s*(.+)\s*$/im);
	if (!match?.[1]) {
		throw new IssueMeError("repository_gitdir_invalid", "The .git file does not contain a valid gitdir entry.");
	}
	const rawGitDir = match[1].trim();
	if (rawGitDir.includes("\0")) {
		throw new IssueMeError("repository_gitdir_invalid", "The .git file contains an invalid gitdir path.");
	}
	return isAbsolute(rawGitDir) ? resolve(rawGitDir) : resolve(gitRoot, rawGitDir);
}

export async function resolveCommonGitDirectory(gitDirectory: string): Promise<string> {
	try {
		const text = await readFile(join(gitDirectory, "commondir"), "utf8");
		const rawCommonDir = text.trim();
		if (!rawCommonDir || rawCommonDir.includes("\0")) return gitDirectory;
		return isAbsolute(rawCommonDir) ? resolve(rawCommonDir) : resolve(gitDirectory, rawCommonDir);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return gitDirectory;
		throw new IssueMeError("repository_common_dir_read_failed", "Unable to read Git worktree common directory metadata.");
	}
}
