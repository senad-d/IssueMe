import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MAX_CACHE_COMMENTS, MAX_TOOL_TEXT_CHARS } from "../src/constants.ts";
import { GitHubClient } from "../src/github/client.ts";
import { writeIssueRecord } from "../src/issues/store.ts";
import { registerGetIssueTool } from "../src/tools/get-issue.ts";

const config = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };

function issue(number, title, overrides = {}) {
	return {
		schemaVersion: 1,
		repository: "owner/repo",
		number,
		title,
		state: "open",
		body: `Body for ${title}`,
		labels: ["bug"],
		assignees: ["octocat"],
		milestone: null,
		comments: [],
		html_url: `https://github.com/owner/repo/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		synced_at: "2026-06-27T00:00:01Z",
		...overrides,
	};
}

function githubIssue(number, title, overrides = {}) {
	return {
		number,
		title,
		state: "open",
		body: `Remote body for ${title}`,
		labels: [{ name: "refreshed" }],
		assignees: [{ login: "octocat" }],
		milestone: null,
		html_url: `https://github.com/owner/repo/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:05:00Z",
		closed_at: null,
		...overrides,
	};
}

function issueComment(id, body = `Comment ${id}`) {
	return {
		id,
		author: "octocat",
		body,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		html_url: `https://github.com/owner/repo/issues/99#issuecomment-${id}`,
	};
}

function githubIssueComment(issueNumber, id, body = `Comment ${id}`) {
	return {
		id,
		user: { login: "octocat" },
		body,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		html_url: `https://github.com/owner/repo/issues/${issueNumber}#issuecomment-${id}`,
	};
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json" },
	});
}

function fakePi() {
	let getTool;
	return {
		get getTool() { return getTool; },
		registerTool(tool) { getTool = tool; },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-get-tool-test-"));
}

async function registerGetTool(options) {
	const pi = fakePi();
	registerGetIssueTool(pi, options);
	return pi.getTool;
}

async function executeGet(tool, cwd, params) {
	return tool.execute("get-call", params, undefined, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

async function setupLookupProject() {
	const projectRoot = await tempProject();
	await initGitHubOrigin(projectRoot);
	await writeIssueRecord(projectRoot, config, issue(12, "Fix Cache Bug"));
	await writeIssueRecord(projectRoot, config, issue(13, "Crash On Startup"));
	return projectRoot;
}

async function initGitHubOrigin(projectRoot) {
	await mkdir(join(projectRoot, ".git"));
	await writeFile(join(projectRoot, ".git", "config"), '[remote "origin"]\n\turl = https://github.com/owner/repo.git\n', "utf8");
}

async function withMockedGitHub(fetchFn, callback) {
	const originalFetch = globalThis.fetch;
	const originalGhToken = process.env.GH_TOKEN;
	const originalGithubToken = process.env.GITHUB_TOKEN;
	const originalGithubRepository = process.env.GITHUB_REPOSITORY;
	globalThis.fetch = fetchFn;
	process.env.GH_TOKEN = "ghp_test_token";
	delete process.env.GITHUB_TOKEN;
	process.env.GITHUB_REPOSITORY = "owner/repo";
	try {
		return await callback();
	} finally {
		globalThis.fetch = originalFetch;
		restoreEnv("GH_TOKEN", originalGhToken);
		restoreEnv("GITHUB_TOKEN", originalGithubToken);
		restoreEnv("GITHUB_REPOSITORY", originalGithubRepository);
	}
}

test("issueme_get_issue resolves number, filename, slug, and title fragment to the actual local path", async () => {
	const projectRoot = await setupLookupProject();
	const getTool = await registerGetTool();
	const cases = [
		[{ number: 12 }, "number"],
		[{ lookup: "12-fix-cache-bug.json" }, "filename"],
		[{ lookup: "fix-cache-bug" }, "slug"],
		[{ lookup: "Cache Bug" }, "title fragment"],
	];

	for (const [params, label] of cases) {
		const result = await executeGet(getTool, projectRoot, params);
		assert.match(result.content[0].text, /#12 Fix Cache Bug/, label);
		assert.deepEqual(result.details.paths, ["issues/12-fix-cache-bug.json"], label);
		assert.equal(result.details.issue.localPath, "issues/12-fix-cache-bug.json", label);
		assert.equal(result.details.issue.number, 12, label);
	}
});

test("issueme_get_issue rejects conflicting number and lookup inputs", async () => {
	const projectRoot = await setupLookupProject();
	const getTool = await registerGetTool();
	await assert.rejects(
		() => executeGet(getTool, projectRoot, { number: 12, lookup: "13-crash-on-startup" }),
		(error) => error?.code === "invalid_tool_input" && /number or lookup/.test(error.message),
	);
});

test("issueme_get_issue reports ambiguous title or slug lookup instead of returning a random issue", async () => {
	const projectRoot = await tempProject();
	await initGitHubOrigin(projectRoot);
	const getTool = await registerGetTool();
	await writeIssueRecord(projectRoot, config, issue(20, "Cache Timeout"));
	await writeIssueRecord(projectRoot, config, issue(21, "Cache Miss"));

	await assert.rejects(
		() => executeGet(getTool, projectRoot, { lookup: "cache" }),
		(error) => error?.code === "issue_lookup_ambiguous" && /matches multiple/.test(error.message),
	);
});

test("issueme_get_issue rejects mismatched injected local lookup repositories", async () => {
	const projectRoot = await setupLookupProject();
	const client = new GitHubClient({
		repository: { owner: "owner", repo: "repo", fullName: "owner/repo" },
		token: "ghp_test_token",
		fetchFn: async () => {
			throw new Error("fetch should not run for local lookup");
		},
	});
	const getTool = await registerGetTool({ runtime: { config, client, repository: "other/repo" } });
	await assert.rejects(
		() => executeGet(getTool, projectRoot, { number: 12 }),
		(error) => error?.code === "runtime_repository_mismatch",
	);
});

test("issueme_get_issue filters local lookups to the resolved current repository", async () => {
	const projectRoot = await tempProject();
	await initGitHubOrigin(projectRoot);
	const getTool = await registerGetTool();
	await writeIssueRecord(projectRoot, config, issue(12, "Current Repo Issue"));
	await writeIssueRecord(projectRoot, config, issue(12, "Other Repo Issue", {
		repository: "owner/other",
		html_url: "https://github.com/owner/other/issues/12",
	}));
	await writeIssueRecord(projectRoot, config, issue(44, "Other Repo Secret", {
		repository: "owner/other",
		html_url: "https://github.com/owner/other/issues/44",
	}));

	const byNumber = await executeGet(getTool, projectRoot, { number: 12 });
	assert.match(byNumber.content[0].text, /#12 Current Repo Issue/);
	assert.equal(byNumber.details.issue.repository, "owner/repo");

	await assert.rejects(
		() => executeGet(getTool, projectRoot, { lookup: "Other Repo Secret" }),
		(error) => error?.code === "issue_not_found" && /current repository/.test(error.message),
	);
});

test("issueme_get_issue refuses local lookup paths that escape through symlinked cache subdirectories", async (t) => {
	const projectRoot = await tempProject();
	const outsideRoot = await tempProject();
	const outsideIssueDir = join(outsideRoot, "cache");
	await initGitHubOrigin(projectRoot);
	await mkdir(join(projectRoot, "issues"));
	await mkdir(outsideIssueDir);
	await writeFile(
		join(outsideIssueDir, "77-outside.json"),
		JSON.stringify(issue(77, "Outside", { html_url: "https://github.com/owner/repo/issues/77" })),
		"utf8",
	);
	try {
		await symlink(outsideIssueDir, join(projectRoot, "issues", "linked"), "dir");
	} catch (error) {
		if (error && typeof error === "object" && "code" in error && error.code === "EPERM") {
			t.skip("symlinks are not permitted on this platform");
			return;
		}
		throw error;
	}

	const getTool = await registerGetTool();
	await assert.rejects(
		() => executeGet(getTool, projectRoot, { lookup: "issues/linked/77-outside.json" }),
		(error) => error?.code === "unsafe_path" && /configured issue directory|current project/.test(error.message),
	);
});

test("issueme_get_issue reports missing explicit cache paths as not found", async () => {
	const projectRoot = await tempProject();
	await initGitHubOrigin(projectRoot);
	await mkdir(join(projectRoot, "issues"));
	const getTool = await registerGetTool();

	await assert.rejects(
		() => executeGet(getTool, projectRoot, { lookup: "issues/missing/99-nope.json" }),
		(error) => error?.code === "issue_not_found" && /local IssueMe cache/.test(error.message),
	);
});

test("issueme_get_issue refresh resolves a local lookup before fetching GitHub and returns refreshed path details", async () => {
	const projectRoot = await tempProject();
	const getTool = await registerGetTool();
	await writeIssueRecord(projectRoot, config, issue(12, "Old Local Title"));

	const originalFetch = globalThis.fetch;
	const originalGhToken = process.env.GH_TOKEN;
	const originalGithubToken = process.env.GITHUB_TOKEN;
	const originalGithubRepository = process.env.GITHUB_REPOSITORY;
	const calls = [];
	globalThis.fetch = async (input) => {
		const url = new URL(input.toString());
		calls.push(url.pathname);
		if (url.pathname === "/repos/owner/repo/issues/12") return jsonResponse(githubIssue(12, "Fresh Remote Title"));
		if (url.pathname === "/repos/owner/repo/issues/12/comments") return jsonResponse([]);
		throw new Error(`Unexpected GitHub mock request: ${url.toString()}`);
	};
	process.env.GH_TOKEN = "ghp_test_token";
	delete process.env.GITHUB_TOKEN;
	process.env.GITHUB_REPOSITORY = "owner/repo";
	try {
		const result = await executeGet(getTool, projectRoot, { lookup: "old-local-title", refresh: true });
		assert.deepEqual(calls, ["/repos/owner/repo/issues/12", "/repos/owner/repo/issues/12/comments"]);
		assert.match(result.content[0].text, /#12 Fresh Remote Title/);
		assert.match(result.content[0].text, /Local cache action: renamed/);
		assert.match(result.content[0].text, /Local file: issues\/12-fresh-remote-title\.json/);
		assert.deepEqual(result.details.paths, ["issues/12-fresh-remote-title.json"]);
		assert.deepEqual(result.details.removedPaths, ["issues/12-old-local-title.json"]);
		assert.equal(result.details.fileActions[0].action, "renamed");
		assert.deepEqual(result.details.fileActions[0].removedPaths, ["issues/12-old-local-title.json"]);
		assert.equal(result.details.status, "cache_renamed");
		assert.equal(result.details.issue.localPath, "issues/12-fresh-remote-title.json");
		assert.equal(result.details.cacheUpdated, true);
		assert.deepEqual(await readdir(join(projectRoot, "issues")), ["12-fresh-remote-title.json"]);
	} finally {
		globalThis.fetch = originalFetch;
		restoreEnv("GH_TOKEN", originalGhToken);
		restoreEnv("GITHUB_TOKEN", originalGithubToken);
		restoreEnv("GITHUB_REPOSITORY", originalGithubRepository);
	}
});

test("issueme_get_issue refresh creates one open issue file and reports the cache action", async () => {
	const projectRoot = await tempProject();
	const getTool = await registerGetTool();
	const calls = [];

	await withMockedGitHub(async (input) => {
		const url = new URL(input.toString());
		calls.push(url.pathname);
		if (url.pathname === "/repos/owner/repo/issues/30") return jsonResponse(githubIssue(30, "Single Open Refresh"));
		if (url.pathname === "/repos/owner/repo/issues/30/comments") return jsonResponse([]);
		throw new Error(`Unexpected GitHub mock request: ${url.toString()}`);
	}, async () => {
		const result = await executeGet(getTool, projectRoot, { number: 30, refresh: true });
		const cached = JSON.parse(await readFile(join(projectRoot, "issues", "30-single-open-refresh.json"), "utf8"));
		assert.deepEqual(calls, ["/repos/owner/repo/issues/30", "/repos/owner/repo/issues/30/comments"]);
		assert.equal(cached.title, "Single Open Refresh");
		assert.match(result.content[0].text, /#30 Single Open Refresh/);
		assert.match(result.content[0].text, /Local cache action: created/);
		assert.deepEqual(result.details.paths, ["issues/30-single-open-refresh.json"]);
		assert.deepEqual(result.details.removedPaths, []);
		assert.equal(result.details.fileActions[0].action, "created");
		assert.equal(result.details.fileActions[0].path, "issues/30-single-open-refresh.json");
		assert.equal(result.details.status, "cache_created");
		assert.equal(result.details.issue.localPath, "issues/30-single-open-refresh.json");
		assert.equal(result.details.cacheUpdated, true);
	});
});

test("issueme_get_issue refresh returns closed remote details and removes stale local cache", async () => {
	const projectRoot = await tempProject();
	const getTool = await registerGetTool();
	await writeIssueRecord(projectRoot, config, issue(31, "Stale Open Title"));
	const calls = [];

	await withMockedGitHub(async (input) => {
		const url = new URL(input.toString());
		calls.push(url.pathname);
		if (url.pathname === "/repos/owner/repo/issues/31") {
			return jsonResponse(githubIssue(31, "Closed Remote Title", {
				state: "closed",
				body: "Closed because the work was completed elsewhere.",
				closed_at: "2026-06-27T00:10:00Z",
				comments: 1,
			}));
		}
		if (url.pathname === "/repos/owner/repo/issues/31/comments") return jsonResponse([githubIssueComment(31, 1, "Closing rationale")]);
		throw new Error(`Unexpected GitHub mock request: ${url.toString()}`);
	}, async () => {
		const result = await executeGet(getTool, projectRoot, { number: 31, refresh: true });
		assert.deepEqual(calls, ["/repos/owner/repo/issues/31", "/repos/owner/repo/issues/31/comments"]);
		assert.match(result.content[0].text, /#31 Closed Remote Title/);
		assert.match(result.content[0].text, /State: closed/);
		assert.match(result.content[0].text, /Closing rationale/);
		assert.match(result.content[0].text, /Local cache action: removed/);
		assert.match(result.content[0].text, /Local file: removed \(issue is closed\)/);
		assert.deepEqual(result.details.paths, []);
		assert.deepEqual(result.details.removedPaths, ["issues/31-stale-open-title.json"]);
		assert.equal(result.details.fileActions[0].action, "removed");
		assert.deepEqual(result.details.fileActions[0].removedPaths, ["issues/31-stale-open-title.json"]);
		assert.equal(result.details.status, "cache_removed");
		assert.equal(result.details.issue.state, "closed");
		assert.equal(result.details.issue.localPath, undefined);
		assert.equal(result.details.cacheUpdated, true);
		assert.deepEqual(await readdir(join(projectRoot, "issues")), []);
	});
});

test("issueme_get_issue refresh reports a missing remote issue safely", async () => {
	const projectRoot = await tempProject();
	const getTool = await registerGetTool();
	const calls = [];

	await withMockedGitHub(async (input) => {
		const url = new URL(input.toString());
		calls.push(url.pathname);
		if (url.pathname === "/repos/owner/repo/issues/404") return jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
		throw new Error(`Unexpected GitHub mock request: ${url.toString()}`);
	}, async () => {
		await assert.rejects(
			() => executeGet(getTool, projectRoot, { number: 404, refresh: true }),
			(error) => error?.code === "github_api_error" && error.status === 404 && /404 Not Found/.test(error.message) && !JSON.stringify(error).includes("ghp_test_token"),
		);
		assert.deepEqual(calls, ["/repos/owner/repo/issues/404"]);
	});
});

test("issueme_get_issue refresh bounds remote comments and reports truncation metadata", async () => {
	const projectRoot = await tempProject();
	const getTool = await registerGetTool();
	const comments = Array.from({ length: MAX_CACHE_COMMENTS }, (_value, index) => githubIssueComment(32, index + 1));
	const calls = [];

	await withMockedGitHub(async (input) => {
		const url = new URL(input.toString());
		calls.push(url.pathname);
		if (url.pathname === "/repos/owner/repo/issues/32") return jsonResponse(githubIssue(32, "Comment Heavy", { comments: MAX_CACHE_COMMENTS + 1 }));
		if (url.pathname === "/repos/owner/repo/issues/32/comments") return jsonResponse(comments);
		throw new Error(`Unexpected GitHub mock request: ${url.toString()}`);
	}, async () => {
		const result = await executeGet(getTool, projectRoot, { number: 32, refresh: true });
		const cached = JSON.parse(await readFile(join(projectRoot, "issues", "32-comment-heavy.json"), "utf8"));
		assert.deepEqual(calls, ["/repos/owner/repo/issues/32", "/repos/owner/repo/issues/32/comments"]);
		assert.equal(cached.comments.length, MAX_CACHE_COMMENTS);
		assert.equal(cached.comments_truncated, true);
		assert.equal(cached.comments_count, MAX_CACHE_COMMENTS + 1);
		assert.equal(cached.comments_fetch_limit, MAX_CACHE_COMMENTS);
		assert.equal(result.details.truncated, true);
		assert.equal(result.details.issue.commentsTruncated, true);
		assert.equal(result.details.issue.commentsCount, MAX_CACHE_COMMENTS + 1);
		assert.equal(result.details.issue.commentsFetchLimit, MAX_CACHE_COMMENTS);
		assert.equal(result.details.truncation.cacheComments.limit, MAX_CACHE_COMMENTS);
		assert.equal(result.details.fileActions[0].action, "created");
		assert.match(result.content[0].text, /Comments fetched: 100 of 101 \(limit 100; truncated\)/);
	});
});

test("issueme_get_issue bounds oversized issue output with machine-readable truncation metadata", async () => {
	const projectRoot = await tempProject();
	await initGitHubOrigin(projectRoot);
	const getTool = await registerGetTool();
	await writeIssueRecord(projectRoot, config, issue(99, "Oversized Issue", {
		body: "B".repeat(12000),
		comments: Array.from({ length: 6 }, (_value, index) => issueComment(index + 1, "C".repeat(2500))),
		comments_count: 6,
		comments_fetch_limit: 6,
	}));

	const result = await executeGet(getTool, projectRoot, { number: 99 });
	assert.ok(result.content[0].text.length <= MAX_TOOL_TEXT_CHARS);
	assert.match(result.content[0].text, /IssueMe tool output truncated/);
	assert.equal(result.details.truncated, true);
	assert.equal(result.details.truncation.body.maxChars, 4000);
	assert.equal(result.details.truncation.comments.shown, 5);
	assert.equal(result.details.truncation.comments.total, 6);
	assert.equal(result.details.truncation.commentBodies.affected, 5);
	assert.equal(result.details.truncation.content.maxChars, MAX_TOOL_TEXT_CHARS);
	assert.equal(result.details.issue.number, 99);
});

function restoreEnv(name, value) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}
