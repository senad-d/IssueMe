import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MAX_TOOL_ISSUES, MAX_TOOL_PATHS } from "../src/constants.ts";
import { registerSyncIssuesTool } from "../src/tools/sync-issues.ts";

function githubIssue(overrides = {}) {
	return {
		number: 1,
		title: "Stable Title",
		state: "open",
		body: "Body",
		labels: [{ name: "bug" }],
		assignees: [{ login: "octocat" }],
		milestone: null,
		html_url: "https://github.com/owner/repo/issues/1",
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		...overrides,
	};
}

function githubComment(id) {
	return {
		id,
		user: { login: "octocat" },
		body: `Comment ${id}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		html_url: `https://github.com/owner/repo/issues/1#issuecomment-${id}`,
	};
}

function jsonResponse(body) {
	return new Response(JSON.stringify(body), {
		status: 200,
		statusText: "OK",
		headers: { "content-type": "application/json" },
	});
}

function fakePi() {
	let syncTool;
	return {
		get syncTool() { return syncTool; },
		registerTool(tool) { syncTool = tool; },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-sync-tool-test-"));
}

async function executeSync(tool, cwd) {
	return tool.execute("sync-call", {}, undefined, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

async function withMockedSync(issueRuns, callback) {
	const projectRoot = await tempProject();
	const pi = fakePi();
	registerSyncIssuesTool(pi);
	const originalFetch = globalThis.fetch;
	const originalGhToken = process.env.GH_TOKEN;
	const originalGithubToken = process.env.GITHUB_TOKEN;
	const originalGithubRepository = process.env.GITHUB_REPOSITORY;
	let issueRunIndex = 0;
	globalThis.fetch = async (input) => {
		const url = new URL(input.toString());
		if (url.pathname === "/repos/owner/repo/issues") {
			const run = issueRuns[Math.min(issueRunIndex, issueRuns.length - 1)];
			issueRunIndex += 1;
			return jsonResponse(run);
		}
		if (url.pathname === "/repos/owner/repo/issues/1/comments") return jsonResponse([]);
		throw new Error(`Unexpected GitHub mock request: ${url.toString()}`);
	};
	process.env.GH_TOKEN = "ghp_test_token";
	delete process.env.GITHUB_TOKEN;
	process.env.GITHUB_REPOSITORY = "owner/repo";
	try {
		return await callback({ projectRoot, syncTool: pi.syncTool });
	} finally {
		globalThis.fetch = originalFetch;
		restoreEnv("GH_TOKEN", originalGhToken);
		restoreEnv("GITHUB_TOKEN", originalGithubToken);
		restoreEnv("GITHUB_REPOSITORY", originalGithubRepository);
	}
}

function restoreEnv(name, value) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}

test("issueme_sync_issues reports unchanged files on repeated unchanged syncs", async () => {
	await withMockedSync([[githubIssue()], [githubIssue()]], async ({ projectRoot, syncTool }) => {
		const first = await executeSync(syncTool, projectRoot);
		assert.equal(first.details.counts.created, 1);
		assert.equal(first.details.counts.unchanged, 0);
		assert.equal(first.details.fileActions[0].action, "created");

		const issuePath = join(projectRoot, "issues", "1-stable-title.json");
		const firstText = await readFile(issuePath, "utf8");
		const second = await executeSync(syncTool, projectRoot);
		const secondText = await readFile(issuePath, "utf8");

		assert.equal(second.details.counts.created, 0);
		assert.equal(second.details.counts.updated, 0);
		assert.equal(second.details.counts.renamed, 0);
		assert.equal(second.details.counts.unchanged, 1);
		assert.equal(second.details.counts.removed, 0);
		assert.equal(second.details.fileActions[0].action, "unchanged");
		assert.deepEqual(second.details.paths, ["issues/1-stable-title.json"]);
		assert.deepEqual(second.details.removedPaths, []);
		assert.equal(secondText, firstText);
		assert.match(second.content[0].text, /unchanged: 1/);
	});
});

test("issueme_sync_issues reports title-slug changes as renames instead of duplicate creates", async () => {
	await withMockedSync([
		[githubIssue({ title: "Original Title" })],
		[githubIssue({ title: "Renamed Title", updated_at: "2026-06-27T00:01:00Z" })],
	], async ({ projectRoot, syncTool }) => {
		const first = await executeSync(syncTool, projectRoot);
		assert.equal(first.details.counts.created, 1);
		assert.deepEqual(await readdir(join(projectRoot, "issues")), ["1-original-title.json"]);

		const second = await executeSync(syncTool, projectRoot);
		assert.equal(second.details.counts.created, 0);
		assert.equal(second.details.counts.renamed, 1);
		assert.equal(second.details.counts.updated, 0);
		assert.equal(second.details.counts.unchanged, 0);
		assert.equal(second.details.counts.removed, 1);
		assert.deepEqual(second.details.paths, ["issues/1-renamed-title.json"]);
		assert.deepEqual(second.details.removedPaths, ["issues/1-original-title.json"]);
		assert.equal(second.details.fileActions[0].action, "renamed");
		assert.deepEqual(second.details.fileActions[0].removedPaths, ["issues/1-original-title.json"]);
		assert.deepEqual(await readdir(join(projectRoot, "issues")), ["1-renamed-title.json"]);
		assert.match(second.content[0].text, /Created: 0, updated: 0, renamed: 1/);
	});
});

test("issueme_sync_issues reports invalid cache files safely and leaves them untouched", async () => {
	await withMockedSync([[githubIssue()]], async ({ projectRoot, syncTool }) => {
		await mkdir(join(projectRoot, "issues"));
		const corruptPath = join(projectRoot, "issues", "98-corrupt.json");
		const invalidPath = join(projectRoot, "issues", "99-invalid.json");
		const corruptText = "{not json PRIVATE ISSUE BODY";
		const invalidText = `${JSON.stringify({
			schemaVersion: 1,
			repository: "owner/repo",
			number: 99,
			title: "Invalid Local Cache",
			state: "open",
			body: "PRIVATE ISSUE BODY",
			labels: [123],
			assignees: ["octocat"],
			milestone: null,
			comments: [],
			html_url: "https://github.com/owner/repo/issues/99",
			created_at: "2026-06-27T00:00:00Z",
			updated_at: "2026-06-27T00:00:00Z",
			closed_at: null,
			synced_at: "2026-06-27T00:00:01Z",
		})}\n`;
		await writeFile(corruptPath, corruptText, "utf8");
		await writeFile(invalidPath, invalidText, "utf8");

		const result = await executeSync(syncTool, projectRoot);
		assert.equal(result.details.counts.invalid, 2);
		assert.deepEqual(result.details.invalidFiles.map((file) => file.path).sort(), ["issues/98-corrupt.json", "issues/99-invalid.json"]);
		assert.deepEqual(result.details.invalidFiles.map((file) => file.reason).sort(), ["issue_file_labels_invalid", "issue_file_parse_failed"]);
		assert.match(result.content[0].text, /Invalid local issue files: 2 left untouched/);
		assert.doesNotMatch(result.content[0].text, /PRIVATE/);
		assert.doesNotMatch(JSON.stringify(result.details), /PRIVATE/);
		assert.equal(await readFile(corruptPath, "utf8"), corruptText);
		assert.equal(await readFile(invalidPath, "utf8"), invalidText);
		assert.deepEqual((await readdir(join(projectRoot, "issues"))).sort(), ["1-stable-title.json", "98-corrupt.json", "99-invalid.json"]);
	});
});

test("issueme_sync_issues bounds cached comments and records truncation metadata", async () => {
	const projectRoot = await tempProject();
	const pi = fakePi();
	registerSyncIssuesTool(pi);
	const originalFetch = globalThis.fetch;
	const originalGhToken = process.env.GH_TOKEN;
	const originalGithubToken = process.env.GITHUB_TOKEN;
	const originalGithubRepository = process.env.GITHUB_REPOSITORY;
	const calls = [];
	globalThis.fetch = async (input) => {
		const url = new URL(input.toString());
		calls.push(url.toString());
		if (url.pathname === "/repos/owner/repo/issues") return jsonResponse([githubIssue({ comments: 101 })]);
		if (url.pathname === "/repos/owner/repo/issues/1/comments") return jsonResponse(Array.from({ length: 100 }, (_value, index) => githubComment(index + 1)));
		throw new Error(`Unexpected GitHub mock request: ${url.toString()}`);
	};
	process.env.GH_TOKEN = "ghp_test_token";
	delete process.env.GITHUB_TOKEN;
	process.env.GITHUB_REPOSITORY = "owner/repo";
	try {
		const result = await executeSync(pi.syncTool, projectRoot);
		const cached = JSON.parse(await readFile(join(projectRoot, "issues", "1-stable-title.json"), "utf8"));
		assert.equal(cached.comments.length, 100);
		assert.equal(cached.comments_truncated, true);
		assert.equal(cached.comments_count, 101);
		assert.equal(cached.comments_fetch_limit, 100);
		assert.equal(result.details.truncated, true);
		assert.equal(result.details.truncation.comments.policy, "bounded_per_issue");
		assert.equal(result.details.truncation.comments.maxPerIssue, 100);
		assert.equal(result.details.truncation.comments.issueCount, 1);
		assert.deepEqual(result.details.truncation.comments.issueNumbers, [1]);
		assert.equal(result.details.issues[0].commentsTruncated, true);
		assert.equal(result.details.issues[0].commentsCount, 101);
		assert.match(result.content[0].text, /100 comments per issue/);
		assert.equal(calls.filter((url) => url.includes("/comments")).length, 1);
	} finally {
		globalThis.fetch = originalFetch;
		restoreEnv("GH_TOKEN", originalGhToken);
		restoreEnv("GITHUB_TOKEN", originalGithubToken);
		restoreEnv("GITHUB_REPOSITORY", originalGithubRepository);
	}
});

test("issueme_sync_issues bounds oversized tool details with truncation metadata", async () => {
	const projectRoot = await tempProject();
	const pi = fakePi();
	registerSyncIssuesTool(pi);
	const originalFetch = globalThis.fetch;
	const originalGhToken = process.env.GH_TOKEN;
	const originalGithubToken = process.env.GITHUB_TOKEN;
	const originalGithubRepository = process.env.GITHUB_REPOSITORY;
	const issues = Array.from({ length: 120 }, (_value, index) => {
		const number = index + 1;
		return githubIssue({
			number,
			title: `Large Sync ${number}`,
			html_url: `https://github.com/owner/repo/issues/${number}`,
		});
	});
	globalThis.fetch = async (input) => {
		const url = new URL(input.toString());
		if (url.pathname === "/repos/owner/repo/issues") return jsonResponse(issues);
		if (/\/repos\/owner\/repo\/issues\/\d+\/comments/.test(url.pathname)) return jsonResponse([]);
		throw new Error(`Unexpected GitHub mock request: ${url.toString()}`);
	};
	process.env.GH_TOKEN = "ghp_test_token";
	delete process.env.GITHUB_TOKEN;
	process.env.GITHUB_REPOSITORY = "owner/repo";
	try {
		const result = await executeSync(pi.syncTool, projectRoot);
		assert.equal(result.details.counts.created, 120);
		assert.equal(result.details.issues.length, MAX_TOOL_ISSUES);
		assert.equal(result.details.fileActions.length, MAX_TOOL_ISSUES);
		assert.equal(result.details.paths.length, MAX_TOOL_PATHS);
		assert.equal(result.details.truncated, true);
		assert.deepEqual(result.details.truncation.issues, { shown: MAX_TOOL_ISSUES, total: 120, max: MAX_TOOL_ISSUES });
		assert.deepEqual(result.details.truncation.fileActions, { shown: MAX_TOOL_ISSUES, total: 120, max: MAX_TOOL_ISSUES });
		assert.deepEqual(result.details.truncation.paths, { shown: MAX_TOOL_PATHS, total: 120, max: MAX_TOOL_PATHS });
	} finally {
		globalThis.fetch = originalFetch;
		restoreEnv("GH_TOKEN", originalGhToken);
		restoreEnv("GITHUB_TOKEN", originalGithubToken);
		restoreEnv("GITHUB_REPOSITORY", originalGithubRepository);
	}
});
