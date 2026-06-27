import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadIssueMeConfig, saveIssueMeConfig } from "../src/config/config.ts";
import { parseGitHubRepository, resolveCurrentRepository } from "../src/github/repository.ts";
import { readIssueByLookup, readIssueByNumber, removeClosedIssueFiles, writeIssueRecord } from "../src/issues/store.ts";
import { parseProjectEnvTokens, resolveGitHubToken } from "../src/utils/env.ts";
import { issueFileName, resolveIssueFilePath, slugifyIssueTitle } from "../src/utils/slug.ts";

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

test("process GH_TOKEN takes precedence over process GITHUB_TOKEN when .env has no token", async () => {
	const cwd = await tempProject();
	const token = await resolveGitHubToken(cwd, { GH_TOKEN: "process-gh", GITHUB_TOKEN: "process-github" });
	assert.equal(token.token, "process-gh");
	assert.equal(token.source, "process-env:GH_TOKEN");
});

test("missing token errors are actionable and do not leak environment values", async () => {
	const cwd = await tempProject();
	await assert.rejects(() => resolveGitHubToken(cwd, {}), (error) => {
		assert.match(error.message, /Set GH_TOKEN or GITHUB_TOKEN/);
		assert.doesNotMatch(error.message, /process-gh|process-github/);
		return true;
	});
});

test("repository resolution supports env and common GitHub origins without shelling out", async () => {
	assert.deepEqual(parseGitHubRepository("owner/repo"), { owner: "owner", repo: "repo", fullName: "owner/repo" });
	assert.deepEqual(parseGitHubRepository("https://github.com/owner/repo.git"), { owner: "owner", repo: "repo", fullName: "owner/repo" });
	assert.deepEqual(parseGitHubRepository("git@github.com:owner/repo.git"), { owner: "owner", repo: "repo", fullName: "owner/repo" });
	assert.equal(parseGitHubRepository("https://example.com/owner/repo.git"), undefined);

	const cwd = await tempProject();
	assert.deepEqual(await resolveCurrentRepository(cwd, { GITHUB_REPOSITORY: "env-owner/env-repo" }), {
		owner: "env-owner",
		repo: "env-repo",
		fullName: "env-owner/env-repo",
	});
	await mkdir(join(cwd, ".git"));
	await writeFile(join(cwd, ".git", "config"), '[remote "origin"]\n\turl = git@github.com:local/repo.git\n', "utf8");
	assert.deepEqual(await resolveCurrentRepository(cwd, {}), { owner: "local", repo: "repo", fullName: "local/repo" });
});

test("slug and issue paths are safe and stable", async () => {
	const cwd = await tempProject();
	assert.equal(slugifyIssueTitle("Crème brûlée!!! Fix cache"), "creme-brulee-fix-cache");
	assert.equal(slugifyIssueTitle("你好 👋"), "issue");
	assert.equal(issueFileName(42, "Fix cache bug"), "42-fix-cache-bug.json");
	assert.match(resolveIssueFilePath(cwd, "issues", 42, "Fix cache bug"), /issues[/\\]42-fix-cache-bug\.json$/);
	assert.throws(() => resolveIssueFilePath(cwd, "../outside", 1, "Oops"), /inside the current project/);
});

test("config loader/saver handles defaults, non-secret settings, and secret-like key refusal", async () => {
	const cwd = await tempProject();
	assert.deepEqual(await loadIssueMeConfig(cwd), {
		issueDirectory: "issues",
		defaultLabels: [],
		defaultAssignees: [],
		defaultSkillPath: null,
	});
	await saveIssueMeConfig(cwd, {
		issueDirectory: "issues/custom",
		defaultLabels: ["bug", "bug", "agent-ready"],
		defaultAssignees: ["octocat"],
		defaultSkillPath: "skills/issue/SKILL.md",
	});
	assert.deepEqual(await loadIssueMeConfig(cwd), {
		issueDirectory: "issues/custom",
		defaultLabels: ["bug", "agent-ready"],
		defaultAssignees: ["octocat"],
		defaultSkillPath: "skills/issue/SKILL.md",
	});
	await assert.rejects(() => saveIssueMeConfig(cwd, { GH_TOKEN: "secret-value" }), (error) => {
		assert.match(error.message, /secret-like/);
		assert.doesNotMatch(error.message, /secret-value/);
		return true;
	});
});

test("issue store writes one pretty JSON file, reads by number, renames title changes, and removes closed issues", async () => {
	const cwd = await tempProject();
	const config = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };
	const first = await writeIssueRecord(cwd, config, sampleIssue());
	assert.equal(first.action, "created");
	assert.match(first.path, /12-fix-cache-bug\.json$/);
	assert.match(await readFile(first.path, "utf8"), /\n  "schemaVersion": 1,/);
	assert.equal((await readIssueByNumber(cwd, config, 12)).title, "Fix Cache Bug");
	assert.equal((await readIssueByLookup(cwd, config, "12-fix-cache-bug.json")).number, 12);

	const renamed = await writeIssueRecord(cwd, config, sampleIssue({ title: "Fix Cache Bug Properly" }));
	assert.equal(renamed.action, "created");
	assert.equal(renamed.removedPaths.length, 1);
	assert.match(renamed.path, /12-fix-cache-bug-properly\.json$/);

	const removed = await removeClosedIssueFiles(cwd, config, new Set());
	assert.equal(removed.length, 1);
	assert.equal(await readIssueByNumber(cwd, config, 12), undefined);
});
