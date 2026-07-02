import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getIssueMeConfigPath, loadIssueMeConfig, saveIssueMeConfig } from "../src/config/config.ts";
import { parseGitHubRepository, resolveCurrentRepository } from "../src/github/repository.ts";
import { githubIssueToRecord, issueRecordToToolSummary, formatIssueSummary } from "../src/issues/format.ts";
import { findIssueByLookup, findIssueByNumber, listIssueFileEntries, readIssueByLookup, readIssueByNumber, readIssueFile, removeClosedIssueFiles, removeIssueByNumber, writeIssueRecord } from "../src/issues/store.ts";
import { isValidIsoDateOnly } from "../src/utils/date.ts";
import { parseProjectEnvTokens, readProjectEnvTokens, resolveGitHubToken, getGitHubTokenStatus } from "../src/utils/env.ts";
import { resolveFileMutationQueuePath } from "../src/utils/mutation-queue.ts";
import { resolveIssueMeProjectRoot } from "../src/utils/project-root.ts";
import { assertPathInside, issueFileName, resolveIssueDirectory, resolveIssueFilePath, slugifyIssueTitle } from "../src/utils/slug.ts";

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-test-"));
}

function sampleIssue(overrides = {}) {
	return {
		schemaVersion: 1,
		repository: "owner/repo",
		number: 12,
		title: "Fix Cache Bug",
		state: "open",
		body: "Body",
		labels: ["bug"],
		assignees: ["octocat"],
		milestone: null,
		comments: [],
		html_url: "https://github.com/owner/repo/issues/12",
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		synced_at: "2026-06-27T00:00:01Z",
		...overrides,
	};
}

test("project .env token values override process environment", async () => {
	const cwd = await tempProject();
	await writeFile(join(cwd, ".env"), "GITHUB_TOKEN=from-project\nGH_TOKEN=from-project-gh\n", "utf8");
	assert.deepEqual(parseProjectEnvTokens("GH_TOKEN='abc'\nOTHER=nope"), { GH_TOKEN: "abc" });
	const token = await resolveGitHubToken(cwd, { GH_TOKEN: "process-gh", GITHUB_TOKEN: "process-github" });
	assert.equal(token.token, "from-project-gh");
	assert.equal(token.source, "project-env:GH_TOKEN");
});

test("dotenv parser handles export, quotes, comments, whitespace, empty values, and unsupported multiline values", () => {
	assert.deepEqual(parseProjectEnvTokens("export GH_TOKEN=abc # comment\nGITHUB_TOKEN=unused"), { GH_TOKEN: "abc", GITHUB_TOKEN: "unused" });
	assert.deepEqual(parseProjectEnvTokens("export\tGH_TOKEN = abc # comment\n"), { GH_TOKEN: "abc" });
	assert.deepEqual(parseProjectEnvTokens('GH_TOKEN="abc" # comment\n'), { GH_TOKEN: "abc" });
	assert.deepEqual(parseProjectEnvTokens("  GH_TOKEN = ' abc # still token ' # comment\n"), { GH_TOKEN: " abc # still token " });
	assert.deepEqual(parseProjectEnvTokens('GH_TOKEN="abc#still-token"\n'), { GH_TOKEN: "abc#still-token" });
	assert.deepEqual(parseProjectEnvTokens('GH_TOKEN="a\\"b"\n'), { GH_TOKEN: 'a"b' });
	assert.deepEqual(parseProjectEnvTokens("GH_TOKEN=abc#not-comment\n"), { GH_TOKEN: "abc#not-comment" });
	assert.deepEqual(parseProjectEnvTokens("GH_TOKEN=\nGITHUB_TOKEN= fallback \n"), { GITHUB_TOKEN: "fallback" });
	assert.deepEqual(parseProjectEnvTokens('GH_TOKEN="unterminated\ncontinued"\nGITHUB_TOKEN=ok\n'), { GITHUB_TOKEN: "ok" });
});

test("process GH_TOKEN takes precedence over process GITHUB_TOKEN when .env has no token", async () => {
	const cwd = await tempProject();
	const token = await resolveGitHubToken(cwd, { GH_TOKEN: "process-gh", GITHUB_TOKEN: "process-github" });
	assert.equal(token.token, "process-gh");
	assert.equal(token.source, "process-env:GH_TOKEN");
});

test("missing token errors and .env read status are actionable and do not leak values", async () => {
	const cwd = await tempProject();
	await assert.rejects(() => resolveGitHubToken(cwd, {}), (error) => {
		assert.match(error.message, /Set GH_TOKEN or GITHUB_TOKEN/);
		assert.doesNotMatch(error.message, /process-gh|process-github/);
		return true;
	});
	const envDirProject = await tempProject();
	await mkdir(join(envDirProject, ".env"));
	const status = await getGitHubTokenStatus(envDirProject, { GH_TOKEN: "process-secret" });
	assert.equal(status.error, true);
	assert.doesNotMatch(status.message, /process-secret/);
});

test("token resolution rejects malformed token values and symlinked project env files safely", async (t) => {
	const malformedProjectToken = await tempProject();
	await writeFile(join(malformedProjectToken, ".env"), "GH_TOKEN='bad token value'\nGITHUB_TOKEN=backup-secret\n", "utf8");
	await assert.rejects(() => resolveGitHubToken(malformedProjectToken, {}), (error) => {
		assert.equal(error?.code, "invalid_github_token");
		assert.match(error.message, /project-env:GH_TOKEN/);
		assert.doesNotMatch(error.message, /bad token value|backup-secret/);
		return true;
	});
	const malformedProcessToken = await tempProject();
	await assert.rejects(() => resolveGitHubToken(malformedProcessToken, { GH_TOKEN: "bad process token", GITHUB_TOKEN: "backup-secret" }), (error) => {
		assert.equal(error?.code, "invalid_github_token");
		assert.match(error.message, /process-env:GH_TOKEN/);
		assert.doesNotMatch(error.message, /bad process token|backup-secret/);
		return true;
	});

	try {
		const outside = await tempProject();
		await writeFile(join(outside, "project-env"), "GH_TOKEN=linked-secret\n", "utf8");
		const symlinkProject = await tempProject();
		await symlink(join(outside, "project-env"), join(symlinkProject, ".env"));
		await assert.rejects(() => resolveGitHubToken(symlinkProject, { GH_TOKEN: "process-secret" }), (error) => {
			assert.equal(error?.code, "env_read_failed");
			assert.doesNotMatch(error.message, /linked-secret|process-secret/);
			return true;
		});
		const status = await getGitHubTokenStatus(symlinkProject, { GH_TOKEN: "process-secret" });
		assert.equal(status.error, true);
		assert.doesNotMatch(status.message, /linked-secret|process-secret/);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
			t.skip("symlinks are not permitted on this platform");
			return;
		}
		throw error;
	}
});

test("repository resolution supports env precedence, normal checkouts, worktrees, submodules, nested cwd, and safe errors", async () => {
	assert.deepEqual(parseGitHubRepository("owner/repo"), { owner: "owner", repo: "repo", fullName: "owner/repo" });
	assert.deepEqual(parseGitHubRepository("https://github.com/owner/repo.git"), { owner: "owner", repo: "repo", fullName: "owner/repo" });
	assert.deepEqual(parseGitHubRepository("https://github.com////owner/repo////"), { owner: "owner", repo: "repo", fullName: "owner/repo" });
	assert.deepEqual(parseGitHubRepository("git@github.com:owner/repo.git"), { owner: "owner", repo: "repo", fullName: "owner/repo" });
	assert.equal(parseGitHubRepository("https://example.com/owner/repo.git"), undefined);
	assert.equal(parseGitHubRepository("https://github.com/owner"), undefined);
	assert.equal(parseGitHubRepository("https://github.com/owner//repo.git"), undefined);

	const envWins = await tempProject();
	await mkdir(join(envWins, ".git"));
	await writeFile(join(envWins, ".git", "config"), '[remote "origin"]\n\turl = https://gitlab.com/local/repo.git\n', "utf8");
	assert.deepEqual(await resolveCurrentRepository(envWins, { GITHUB_REPOSITORY: "env-owner/env-repo" }), {
		owner: "env-owner",
		repo: "env-repo",
		fullName: "env-owner/env-repo",
	});

	const normal = await tempProject();
	await mkdir(join(normal, ".git"));
	await writeFile(join(normal, ".git", "config"), '[remote "origin"]\n\turl = git@github.com:local/repo.git\n', "utf8");
	await mkdir(join(normal, "nested", "dir"), { recursive: true });
	assert.equal((await resolveIssueMeProjectRoot(join(normal, "nested", "dir"))).root, normal);
	assert.deepEqual(await resolveCurrentRepository(join(normal, "nested", "dir"), {}), { owner: "local", repo: "repo", fullName: "local/repo" });
	await assert.rejects(() => resolveCurrentRepository(normal, {}, { allowGitConfig: false }), (error) => error?.code === "repository_untrusted_project");

	const worktree = await tempProject();
	const commonGitDir = join(worktree, "actual-git");
	const worktreeGitDir = join(commonGitDir, "worktrees", "feature");
	await mkdir(worktreeGitDir, { recursive: true });
	await writeFile(join(worktree, ".git"), "gitdir: actual-git/worktrees/feature\n", "utf8");
	await writeFile(join(worktreeGitDir, "commondir"), "../..\n", "utf8");
	await writeFile(join(commonGitDir, "config"), '[remote "origin"]\n\turl = https://github.com/work/tree.git\n', "utf8");
	assert.deepEqual(await resolveCurrentRepository(worktree, {}), { owner: "work", repo: "tree", fullName: "work/tree" });

	const parent = await tempProject();
	const submodule = join(parent, "packages", "submodule");
	const submoduleGitDir = join(parent, ".git", "modules", "packages", "submodule");
	await mkdir(join(submodule, "src"), { recursive: true });
	await mkdir(submoduleGitDir, { recursive: true });
	await writeFile(join(submodule, ".git"), "gitdir: ../../.git/modules/packages/submodule\n", "utf8");
	await writeFile(join(submoduleGitDir, "config"), '[remote "origin"]\n\turl = ssh://git@github.com/sub/module.git\n', "utf8");
	assert.deepEqual(await resolveCurrentRepository(join(submodule, "src"), {}), { owner: "sub", repo: "module", fullName: "sub/module" });

	const missingOrigin = await tempProject();
	await mkdir(join(missingOrigin, ".git"));
	await writeFile(join(missingOrigin, ".git", "config"), '[remote "upstream"]\n\turl = https://github.com/up/stream.git\n', "utf8");
	await assert.rejects(() => resolveCurrentRepository(missingOrigin, {}), (error) => error?.code === "repository_origin_missing");

	const malformedOrigin = await tempProject();
	await mkdir(join(malformedOrigin, ".git"));
	await writeFile(join(malformedOrigin, ".git", "config"), '[remote "origin"]\n\turl = https://github.com/owner\n', "utf8");
	await assert.rejects(() => resolveCurrentRepository(malformedOrigin, {}), (error) => error?.code === "repository_origin_malformed");

	const nonGitHubOrigin = await tempProject();
	await mkdir(join(nonGitHubOrigin, ".git"));
	await writeFile(join(nonGitHubOrigin, ".git", "config"), '[remote "origin"]\n\turl = git@gitlab.com:owner/repo.git\n', "utf8");
	await assert.rejects(() => resolveCurrentRepository(nonGitHubOrigin, {}), (error) => error?.code === "repository_origin_not_github");
});

test("slug, issue directory, and issue paths are safe and stable", async () => {
	const cwd = await tempProject();
	assert.equal(slugifyIssueTitle("Crème brûlée!!! Fix cache"), "creme-brulee-fix-cache");
	assert.equal(slugifyIssueTitle("你好 👋"), "issue");
	assert.equal(issueFileName(42, "Fix cache bug"), "42-fix-cache-bug.json");
	assert.match(resolveIssueDirectory(cwd, "issues/sub"), /issues[/\\]sub$/);
	assert.match(resolveIssueDirectory(cwd, "..cache/issues"), /\.\.cache[/\\]issues$/);
	assert.match(resolveIssueDirectory(cwd, ".../issues"), /\.\.\.[/\\]issues$/);
	assert.doesNotThrow(() => assertPathInside(cwd, join(cwd, "..cache", "issue.json")));
	assert.doesNotThrow(() => assertPathInside(cwd, join(cwd, "...", "issue.json")));
	assert.throws(() => assertPathInside(cwd, join(cwd, "..", "outside.json")), /allowed directory/);
	assert.match(resolveIssueFilePath(cwd, "issues", 42, "Fix cache bug"), /issues[/\\]42-fix-cache-bug\.json$/);
	assert.throws(() => resolveIssueFilePath(cwd, "../outside", 1, "Oops"), /path traversal|inside the current project/);
	assert.throws(() => resolveIssueDirectory(cwd, "."), /project root/);
	assert.throws(() => resolveIssueDirectory(cwd, ".git"), /protected/);
	assert.throws(() => resolveIssueDirectory(cwd, ".PI/issues"), /protected/);
	assert.throws(() => resolveIssueDirectory(cwd, "node_modules/issues"), /protected/);
	assert.throws(() => resolveIssueDirectory(cwd, "Build/issues"), /protected/);
	assert.throws(() => resolveIssueDirectory(cwd, "issues\0bad"), /null byte/);
	assert.throws(() => resolveIssueDirectory(cwd, join(cwd, "issues")), /project-relative/);
	assert.throws(() => resolveIssueDirectory(cwd, "C:\\tmp\\issues"), /project-relative/);
	assert.equal(isValidIsoDateOnly("2026-02-28"), true);
	assert.equal(isValidIsoDateOnly("2024-02-29"), true);
	assert.equal(isValidIsoDateOnly("2026-02-30"), false);
	assert.equal(isValidIsoDateOnly("2026-13-01"), false);
	assert.match(await readFile(".gitignore", "utf8"), /^\/issues\/$/m);
});

test("config loader/saver handles defaults, non-secret settings, validation, and nested secret-like key refusal", async () => {
	const cwd = await tempProject();
	assert.deepEqual(await loadIssueMeConfig(cwd), {
		issueDirectory: "issues",
		allowedIssueCreator: "all",
		defaultLabels: [],
		defaultAssignees: [],
		defaultSkillPath: null,
	});
	await saveIssueMeConfig(cwd, {
		issueDirectory: "issues/custom",
		allowedIssueCreator: " Senad-D ",
		defaultLabels: ["bug", "bug", "agent-ready", ""],
		defaultAssignees: ["octocat"],
		defaultSkillPath: "skills/issue/SKILL.md",
	});
	assert.deepEqual(await loadIssueMeConfig(cwd), {
		issueDirectory: "issues/custom",
		allowedIssueCreator: "Senad-D",
		defaultLabels: ["bug", "agent-ready"],
		defaultAssignees: ["octocat"],
		defaultSkillPath: "skills/issue/SKILL.md",
	});
	await saveIssueMeConfig(cwd, { allowedIssueCreator: "ALL" });
	assert.equal((await loadIssueMeConfig(cwd)).allowedIssueCreator, "all");
	await writeFile(getIssueMeConfigPath(cwd), `${JSON.stringify({ issueDirectory: "issues", defaultLabels: ["legacy"] })}\n`, "utf8");
	assert.deepEqual(await loadIssueMeConfig(cwd), {
		issueDirectory: "issues",
		allowedIssueCreator: "all",
		defaultLabels: ["legacy"],
		defaultAssignees: [],
		defaultSkillPath: null,
	});
	for (const invalidAllowedIssueCreator of ["bad login", "", null]) {
		await writeFile(getIssueMeConfigPath(cwd), `${JSON.stringify({ issueDirectory: "issues", allowedIssueCreator: invalidAllowedIssueCreator })}\n`, "utf8");
		await assert.rejects(() => loadIssueMeConfig(cwd), (error) => {
			assert.equal(error?.code, "config_tui_invalid_setting");
			assert.equal(error.safeDetails?.field, "allowedIssueCreator");
			assert.match(error.message, /Allowed issue creator/);
			assert.doesNotMatch(error.message, /bad login/);
			return true;
		});
	}
	await assert.rejects(() => saveIssueMeConfig(cwd, { nested: { GH_TOKEN: "secret-value" } }), (error) => {
		assert.match(error.message, /secret-like/);
		assert.doesNotMatch(error.message, /secret-value/);
		return true;
	});
	await assert.rejects(() => saveIssueMeConfig(cwd, { issueDirectory: ".pi/issues" }), /protected/);
	await assert.rejects(() => saveIssueMeConfig(cwd, { issueDirectory: "../issues" }), /path traversal/);
	await assert.rejects(() => saveIssueMeConfig(cwd, { issueDirectory: "issues\0bad" }), /null byte/);
	await assert.rejects(() => saveIssueMeConfig(cwd, { allowedIssueCreator: "octocat hubot" }), /one GitHub username/);
	await assert.rejects(() => saveIssueMeConfig(cwd, { allowedIssueCreator: ["octocat"] }), /one valid GitHub username/);
	await assert.rejects(() => saveIssueMeConfig(cwd, { allowedIssueCreator: "-bad" }), /valid GitHub username/);
	await assert.rejects(() => saveIssueMeConfig(cwd, { defaultLabels: ["bug\0secret"] }), /null bytes/);
	await assert.rejects(() => saveIssueMeConfig(cwd, { defaultLabels: ["bug\nnext"] }), /one line/);
	await assert.rejects(() => saveIssueMeConfig(cwd, { defaultAssignees: ["octocat\0bad"] }), /null bytes/);
	await assert.rejects(() => saveIssueMeConfig(cwd, { defaultAssignees: ["-bad"] }), /valid GitHub usernames/);
});

test("issue formatting and store preserve creator metadata while legacy records remain readable", async () => {
	const cwd = await tempProject();
	const config = { issueDirectory: "issues", allowedIssueCreator: "all", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };
	const repository = { owner: "owner", repo: "repo", fullName: "owner/repo" };
	const record = githubIssueToRecord(repository, {
		number: 22,
		title: "Creator Metadata",
		state: "open",
		user: { login: "Hubot" },
		body: "Body",
		labels: [{ name: "bug" }],
		assignees: [{ login: "octocat" }],
		milestone: null,
		html_url: "https://github.com/owner/repo/issues/22",
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		comments: 0,
	}, [], "2026-06-27T00:00:01Z");

	assert.equal(record.creator, "Hubot");
	assert.equal(issueRecordToToolSummary(record, "issues/22-creator-metadata.json").creator, "Hubot");
	assert.match(formatIssueSummary(record).text, /Creator: Hubot/);
	const written = await writeIssueRecord(cwd, config, record);
	const cached = JSON.parse(await readFile(written.path, "utf8"));
	assert.equal(cached.creator, "Hubot");
	assert.ok(Object.keys(cached).indexOf("creator") > Object.keys(cached).indexOf("state"));
	assert.ok(Object.keys(cached).indexOf("creator") < Object.keys(cached).indexOf("body"));

	await writeFile(join(cwd, "issues", issueFileName(23, "Legacy Cache")), `${JSON.stringify(sampleIssue({ number: 23, title: "Legacy Cache", html_url: "https://github.com/owner/repo/issues/23" }))}\n`, "utf8");
	assert.equal((await readIssueByNumber(cwd, config, 23, "owner/repo")).creator, undefined);
	await writeFile(join(cwd, "issues", issueFileName(24, "Bad Creator")), `${JSON.stringify(sampleIssue({ number: 24, title: "Bad Creator", creator: "-bad", html_url: "https://github.com/owner/repo/issues/24" }))}\n`, "utf8");
	const entries = await listIssueFileEntries(cwd, config, { repository: "owner/repo" });
	assert.ok(entries.invalidFiles.some((file) => file.reason === "issue_file_creator_invalid"));
});

test("issue store writes pretty JSON, reads by metadata, renames titles, preserves unchanged synced_at, and removes closed issues", async () => {
	const cwd = await tempProject();
	const config = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };
	const first = await writeIssueRecord(cwd, config, sampleIssue());
	assert.equal(first.action, "created");
	assert.match(first.path, /12-fix-cache-bug\.json$/);
	assert.match(await readFile(first.path, "utf8"), /\n {2}"schemaVersion": 1,/);
	assert.equal((await readIssueByNumber(cwd, config, 12)).title, "Fix Cache Bug");
	assert.equal((await readIssueByLookup(cwd, config, "12-fix-cache-bug.json")).number, 12);
	assert.equal((await findIssueByLookup(cwd, config, "cache bug")).path, first.path);

	const unchanged = await writeIssueRecord(cwd, config, sampleIssue({ synced_at: "2099-01-01T00:00:00Z" }));
	assert.equal(unchanged.action, "unchanged");
	assert.match(await readFile(first.path, "utf8"), /2026-06-27T00:00:01Z/);

	const renamed = await writeIssueRecord(cwd, config, sampleIssue({ title: "Fix Cache Bug Properly" }));
	assert.equal(renamed.action, "renamed");
	assert.equal(renamed.removedPaths.length, 1);
	assert.match(renamed.path, /12-fix-cache-bug-properly\.json$/);

	const removed = await removeClosedIssueFiles(cwd, config, new Set(), "owner/repo");
	assert.equal(removed.length, 1);
	assert.equal(await readIssueByNumber(cwd, config, 12, "owner/repo"), undefined);
});

test("repository-scoped issue number lookup rejects duplicate local cache records", async () => {
	const cwd = await tempProject();
	const config = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };
	await mkdir(join(cwd, "issues"));
	await writeFile(join(cwd, "issues", "12-first-title.json"), `${JSON.stringify(sampleIssue({ number: 12, title: "First Title" }))}\n`, "utf8");
	await writeFile(join(cwd, "issues", "12-second-title.json"), `${JSON.stringify(sampleIssue({ number: 12, title: "Second Title" }))}\n`, "utf8");

	for (const lookup of [() => readIssueByNumber(cwd, config, 12, "owner/repo"), () => findIssueByNumber(cwd, config, 12, "owner/repo")]) {
		await assert.rejects(lookup, (error) => {
			assert.equal(error?.code, "issue_lookup_ambiguous");
			assert.match(error.message, /multiple local IssueMe cache files/);
			assert.match(error.message, /issueme_sync_issues/);
			assert.deepEqual(error.safeDetails?.paths, ["issues/12-first-title.json", "issues/12-second-title.json"]);
			return true;
		});
	}
});

test("issue store is repository-aware and reports invalid local files safely", async () => {
	const cwd = await tempProject();
	const config = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };
	await writeIssueRecord(cwd, config, sampleIssue({ repository: "owner/a", number: 1, title: "Repo A", html_url: "https://github.com/owner/a/issues/1" }));
	await writeIssueRecord(cwd, config, sampleIssue({ repository: "owner/b", number: 1, title: "Repo B", html_url: "https://github.com/owner/b/issues/1" }));
	await assert.rejects(() => readIssueByNumber(cwd, config, 1), /multiple repositories/);
	assert.equal((await findIssueByNumber(cwd, config, 1, "owner/b")).metadata.repository, "owner/b");
	assert.equal((await findIssueByLookup(cwd, config, "Repo B", "owner/b")).metadata.repository, "owner/b");

	await writeIssueRecord(cwd, config, sampleIssue({ repository: "owner/a", number: 2, title: "Repo A stale", html_url: "https://github.com/owner/a/issues/2" }));
	await writeIssueRecord(cwd, config, sampleIssue({ repository: "owner/b", number: 2, title: "Repo B must stay", html_url: "https://github.com/owner/b/issues/2" }));
	const staleRemoved = await removeClosedIssueFiles(cwd, config, new Set([1]), "owner/a");
	assert.equal(staleRemoved.length, 1);
	assert.equal(await readIssueByNumber(cwd, config, 2, "owner/a"), undefined);
	assert.equal((await readIssueByNumber(cwd, config, 2, "owner/b")).repository, "owner/b");

	const removed = await removeIssueByNumber(cwd, config, 1, "owner/a");
	assert.equal(removed.length, 1);
	assert.equal((await readIssueByNumber(cwd, config, 1, "owner/b")).repository, "owner/b");
	await assert.rejects(
		() => writeIssueRecord(cwd, config, sampleIssue({ repository: "owner/c", number: 1, title: "Repo B", html_url: "https://github.com/owner/c/issues/1" })),
		(error) => error?.code === "issue_cache_repository_collision" && /refusing to overwrite/.test(error.message),
	);
	assert.equal((await readIssueByNumber(cwd, config, 1, "owner/b")).repository, "owner/b");

	const invalidCases = [
		["3-bad-repository.json", sampleIssue({ number: 3, repository: "bad/repo/extra" }), "issue_file_repository_invalid"],
		["4-bad-number.json", sampleIssue({ number: 0 }), "issue_file_number_invalid"],
		["5-bad-labels.json", sampleIssue({ number: 5, labels: [""] }), "issue_file_labels_invalid"],
		["6-bad-assignees.json", sampleIssue({ number: 6, assignees: ["-bad"] }), "issue_file_assignees_invalid"],
		["7-bad-comments.json", sampleIssue({
			number: 7,
			comments: [{
				id: 0,
				author: "octocat",
				body: "PRIVATE COMMENT BODY",
				created_at: "2026-06-27T00:00:00Z",
				updated_at: "2026-06-27T00:00:00Z",
				html_url: "https://github.com/owner/repo/issues/7#issuecomment-0",
			}],
		}), "issue_file_comment_id_invalid"],
		["8-bad-url.json", sampleIssue({ number: 8, html_url: "https://evil.example/owner/repo/issues/8" }), "issue_file_url_invalid"],
		["9-bad-timestamp.json", sampleIssue({ number: 9, html_url: "https://github.com/owner/repo/issues/9", updated_at: "not-a-timestamp" }), "issue_file_timestamp_invalid"],
		["10-mismatch.json", sampleIssue({ number: 11, html_url: "https://github.com/owner/repo/issues/11" }), "issue_file_number_mismatch"],
		["11-bad-assignee-length.json", sampleIssue({ number: 11, assignees: ["a".repeat(40)], html_url: "https://github.com/owner/repo/issues/11" }), "issue_file_assignees_invalid"],
	];
	await writeFile(join(cwd, "issues", "2-corrupt.json"), "{not json PRIVATE ISSUE BODY", "utf8");
	await writeFile(join(cwd, "issues", "not-an-issue.json"), JSON.stringify({ secret: "PRIVATE ISSUE BODY" }), "utf8");
	for (const [fileName, record] of invalidCases) {
		await writeFile(join(cwd, "issues", fileName), `${JSON.stringify(record)}\n`, "utf8");
	}
	const listed = await listIssueFileEntries(cwd, config);
	const invalidReasons = listed.invalidFiles.map((file) => file.reason).sort();
	assert.equal(listed.invalidFiles.length, invalidCases.length + 2);
	assert.deepEqual(invalidReasons, [
		"issue_file_assignees_invalid",
		"issue_file_assignees_invalid",
		"issue_file_comment_id_invalid",
		"issue_file_labels_invalid",
		"issue_file_name_invalid",
		"issue_file_number_invalid",
		"issue_file_number_mismatch",
		"issue_file_parse_failed",
		"issue_file_repository_invalid",
		"issue_file_timestamp_invalid",
		"issue_file_url_invalid",
	]);
	assert.doesNotMatch(JSON.stringify(listed.invalidFiles), /PRIVATE|secret/);
	await assert.rejects(
		() => readIssueFile(join(cwd, "issues", "5-bad-labels.json")),
		(error) => error?.code === "issue_file_invalid" && error.safeDetails?.reason === "issue_file_labels_invalid" && !/PRIVATE/.test(error.message),
	);
});

test("config and issue store reject symlinked local state paths", async (t) => {
	const outside = await tempProject();
	const config = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };
	try {
		const configParentSymlinkProject = await tempProject();
		await symlink(outside, join(configParentSymlinkProject, ".pi"), "dir");
		await assert.rejects(() => loadIssueMeConfig(configParentSymlinkProject), /symlink/);
		await assert.rejects(() => saveIssueMeConfig(configParentSymlinkProject, config), /symlink/);

		const configFileSymlinkProject = await tempProject();
		await mkdir(join(configFileSymlinkProject, ".pi", "agent"), { recursive: true });
		await writeFile(join(outside, "issueme.json"), JSON.stringify(config), "utf8");
		await symlink(join(outside, "issueme.json"), join(configFileSymlinkProject, ".pi", "agent", "issueme.json"));
		await assert.rejects(() => loadIssueMeConfig(configFileSymlinkProject), /symlink/);
		await assert.rejects(() => saveIssueMeConfig(configFileSymlinkProject, config), /symlink/);

		const directSymlinkProject = await tempProject();
		await symlink(outside, join(directSymlinkProject, "issues"), "dir");
		await assert.rejects(() => writeIssueRecord(directSymlinkProject, config, sampleIssue()), /symlink/);

		const parentSymlinkProject = await tempProject();
		await symlink(outside, join(parentSymlinkProject, "cache"), "dir");
		assert.equal(await resolveFileMutationQueuePath(join(parentSymlinkProject, "cache", "queued", "file.json")), join(await realpath(outside), "queued", "file.json"));
		await assert.rejects(
			() => writeIssueRecord(parentSymlinkProject, { ...config, issueDirectory: "cache/issues" }, sampleIssue()),
			/symlink|inside the current project/,
		);

		const fileSymlinkProject = await tempProject();
		await mkdir(join(fileSymlinkProject, "issues"));
		await writeFile(join(outside, "outside.json"), JSON.stringify(sampleIssue()), "utf8");
		await symlink(join(outside, "outside.json"), join(fileSymlinkProject, "issues", "12-fix-cache-bug.json"));
		await assert.rejects(() => writeIssueRecord(fileSymlinkProject, config, sampleIssue()), /symlink/);
		await assert.rejects(() => readIssueByLookup(fileSymlinkProject, config, "12-fix-cache-bug.json"), /symlink/);

		const nestedSymlinkProject = await tempProject();
		const outsideIssueDir = join(outside, "linked-cache");
		await mkdir(join(nestedSymlinkProject, "issues"));
		await mkdir(outsideIssueDir);
		await writeFile(
			join(outsideIssueDir, "13-linked-escape.json"),
			JSON.stringify(sampleIssue({ number: 13, title: "Linked Escape", html_url: "https://github.com/owner/repo/issues/13" })),
			"utf8",
		);
		await symlink(outsideIssueDir, join(nestedSymlinkProject, "issues", "linked"), "dir");
		await assert.rejects(
			() => readIssueByLookup(nestedSymlinkProject, config, "issues/linked/13-linked-escape.json"),
			/inside the configured issue directory|inside the current project/,
		);
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
			t.skip("symlinks are not permitted on this platform");
			return;
		}
		throw error;
	}
});

test("trusted local state reads reject symlink swaps after initial validation", async (t) => {
	const outside = await tempProject();
	const outsideEnv = join(outside, "outside.env");
	const outsideConfig = join(outside, "outside-config.json");
	const outsideIssue = join(outside, "outside-issue.json");
	await writeFile(outsideEnv, "GH_TOKEN=outside-secret\n", "utf8");
	await writeFile(outsideConfig, JSON.stringify({ defaultLabels: ["outside-secret"] }), "utf8");
	await writeFile(outsideIssue, JSON.stringify(sampleIssue({ title: "Outside Secret" })), "utf8");

	const originalOpen = fs.open;
	const swapped = new Set();
	const swapTargets = new Map();
	t.mock.method(fs, "open", async (...args) => {
		const targetPath = String(args[0]);
		const handle = await originalOpen(...args);
		const outsideTarget = swapTargets.get(targetPath);
		if (outsideTarget && !swapped.has(targetPath)) {
			swapped.add(targetPath);
			await fs.rm(targetPath, { force: true });
			await symlink(outsideTarget, targetPath);
		}
		return handle;
	});

	try {
		const envProject = await tempProject();
		const envPath = join(envProject, ".env");
		await writeFile(envPath, "GH_TOKEN=safe-token\n", "utf8");
		swapTargets.set(envPath, outsideEnv);
		await assert.rejects(() => readProjectEnvTokens(envProject), (error) => {
			assert.equal(error?.code, "env_read_failed");
			assert.doesNotMatch(error.message, /outside-secret|safe-token/);
			return true;
		});

		const configProject = await tempProject();
		const configPath = getIssueMeConfigPath(configProject);
		await mkdir(join(configProject, ".pi", "agent"), { recursive: true });
		await writeFile(configPath, JSON.stringify({ defaultLabels: ["safe"] }), "utf8");
		swapTargets.set(configPath, outsideConfig);
		await assert.rejects(() => loadIssueMeConfig(configProject), (error) => {
			assert.equal(error?.code, "unsafe_path");
			assert.doesNotMatch(error.message, /outside-secret|safe/);
			return true;
		});

		const issueProject = await tempProject();
		await mkdir(join(issueProject, "issues"));
		const issuePath = join(issueProject, "issues", "12-fix-cache-bug.json");
		await writeFile(issuePath, `${JSON.stringify(sampleIssue())}\n`, "utf8");
		swapTargets.set(issuePath, outsideIssue);
		await assert.rejects(() => readIssueFile(issuePath, join(issueProject, "issues"), issueProject), (error) => {
			assert.equal(error?.code, "unsafe_issue_file");
			assert.doesNotMatch(error.message, /Outside Secret/);
			return true;
		});
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
			t.skip("symlink swaps are not permitted on this platform");
			return;
		}
		throw error;
	}
});

test("config and issue store atomic writes do not follow pre-rename symlink swaps", async (t) => {
	const config = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };
	const outside = await tempProject();
	const swapTargets = new Map();
	const swappedTargets = new Set();
	const originalRename = fs.rename;
	t.mock.method(fs, "rename", async (sourcePath, targetPath) => {
		const target = String(targetPath);
		const outsideTarget = swapTargets.get(target);
		if (outsideTarget && !swappedTargets.has(target)) {
			swappedTargets.add(target);
			await symlink(outsideTarget, target);
		}
		return originalRename(sourcePath, targetPath);
	});

	try {
		const configProject = await tempProject();
		const configPath = getIssueMeConfigPath(configProject);
		const outsideConfigTarget = join(outside, "outside-config.json");
		await writeFile(outsideConfigTarget, "outside config\n", "utf8");
		swapTargets.set(configPath, outsideConfigTarget);
		await saveIssueMeConfig(configProject, { ...config, defaultLabels: ["safe"] });
		assert.equal(swappedTargets.has(configPath), true);
		assert.equal(await readFile(outsideConfigTarget, "utf8"), "outside config\n");
		assert.equal((await lstat(configPath)).isSymbolicLink(), false);
		assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")).defaultLabels, ["safe"]);

		const issueProject = await tempProject();
		const issuePath = resolveIssueFilePath(issueProject, config.issueDirectory, 12, "Fix Cache Bug");
		const outsideIssueTarget = join(outside, "outside-issue.json");
		await writeFile(outsideIssueTarget, "outside issue\n", "utf8");
		swapTargets.set(issuePath, outsideIssueTarget);
		const writeResult = await writeIssueRecord(issueProject, config, sampleIssue());
		assert.equal(writeResult.action, "created");
		assert.equal(swappedTargets.has(issuePath), true);
		assert.equal(await readFile(outsideIssueTarget, "utf8"), "outside issue\n");
		assert.equal((await lstat(issuePath)).isSymbolicLink(), false);
		assert.equal((await readIssueFile(issuePath)).title, "Fix Cache Bug");
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
			t.skip("symlinks are not permitted on this platform");
			return;
		}
		throw error;
	}
});
