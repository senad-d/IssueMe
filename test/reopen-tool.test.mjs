import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { registerReopenIssueTool } from "../src/tools/reopen-issue.ts";

function githubIssue(number, title, overrides = {}) {
	return {
		number,
		title,
		state: "open",
		body: "Body",
		labels: [],
		assignees: [],
		milestone: null,
		html_url: `https://github.com/owner/repo/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		comments: 0,
		...overrides,
	};
}

function githubComment(issueNumber, id = 1, body = "Reopened because product scope changed.") {
	return {
		id,
		user: { login: "octocat" },
		body,
		created_at: "2026-06-27T00:02:00Z",
		updated_at: "2026-06-27T00:02:00Z",
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
	let reopenTool;
	return {
		get reopenTool() { return reopenTool; },
		registerTool(tool) { reopenTool = tool; },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-reopen-tool-test-"));
}

function registerReopenTool() {
	const pi = fakePi();
	registerReopenIssueTool(pi);
	return pi.reopenTool;
}

async function executeReopen(tool, cwd, params) {
	return tool.execute("reopen-call", params, undefined, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

async function withMockedReopenTool(fetchFn, callback, options = {}) {
	const projectRoot = await tempProject();
	if (options.blockIssueDirectory) await writeFile(join(projectRoot, "issues"), "not a directory\n", "utf8");
	const reopenTool = registerReopenTool();
	const originalFetch = globalThis.fetch;
	const originalGhToken = process.env.GH_TOKEN;
	const originalGithubToken = process.env.GITHUB_TOKEN;
	const originalGithubRepository = process.env.GITHUB_REPOSITORY;
	globalThis.fetch = fetchFn;
	process.env.GH_TOKEN = "ghp_test_token";
	delete process.env.GITHUB_TOKEN;
	process.env.GITHUB_REPOSITORY = "owner/repo";
	try {
		return await callback({ projectRoot, reopenTool });
	} finally {
		globalThis.fetch = originalFetch;
		restoreEnv("GH_TOKEN", originalGhToken);
		restoreEnv("GITHUB_TOKEN", originalGithubToken);
		restoreEnv("GITHUB_REPOSITORY", originalGithubRepository);
	}
}

test("issueme_reopen_issue reopens closed issues, posts an optional comment, and refreshes local cache", async () => {
	const calls = [];
	const comment = githubComment(7, 77, "Reopen with context");
	let issueGetCount = 0;
	await withMockedReopenTool(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ path: url.pathname, method: init.method, body });
		if (url.pathname === "/repos/owner/repo/issues/7" && init.method === "GET") {
			issueGetCount += 1;
			return jsonResponse(issueGetCount === 1
				? githubIssue(7, "Reopen Target", { state: "closed", closed_at: "2026-06-27T00:01:00Z" })
				: githubIssue(7, "Reopen Target", { comments: 1 }));
		}
		if (url.pathname === "/repos/owner/repo/issues/7" && init.method === "PATCH") {
			return jsonResponse(githubIssue(7, "Reopen Target", { comments: 0 }));
		}
		if (url.pathname === "/repos/owner/repo/issues/7/comments" && init.method === "POST") return jsonResponse(comment);
		if (url.pathname === "/repos/owner/repo/issues/7/comments" && init.method === "GET") return jsonResponse([comment]);
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, reopenTool }) => {
		const result = await executeReopen(reopenTool, projectRoot, { number: 7, comment: "  Reopen with context  " });

		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
			"GET /repos/owner/repo/issues/7",
			"PATCH /repos/owner/repo/issues/7",
			"GET /repos/owner/repo/issues/7",
			"POST /repos/owner/repo/issues/7/comments",
			"GET /repos/owner/repo/issues/7",
			"GET /repos/owner/repo/issues/7/comments",
		]);
		assert.deepEqual(calls[1].body, { state: "open", state_reason: "reopened" });
		assert.equal(calls[3].body.body, "Reopen with context");
		assert.match(result.content[0].text, /Reopened issue #7: Reopen Target/);
		assert.match(result.content[0].text, /Comment: https:\/\/github.com\/owner\/repo\/issues\/7#issuecomment-77/);
		assert.equal(result.details.status, "reopened");
		assert.equal(result.details.issue.state, "open");
		assert.deepEqual(result.details.changedFields, ["state", "comments"]);
		assert.equal(result.details.comment.id, 77);
		assert.deepEqual(result.details.paths, ["issues/7-reopen-target.json"]);
		assert.equal(result.details.cacheUpdated, true);

		const cached = JSON.parse(await readFile(join(projectRoot, "issues", "7-reopen-target.json"), "utf8"));
		assert.equal(cached.state, "open");
		assert.equal(cached.comments[0].body, "Reopen with context");
	});
});

test("issueme_reopen_issue treats already-open issues as no-op successes without posting comments", async () => {
	const calls = [];
	await withMockedReopenTool(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ path: url.pathname, method: init.method, body });
		if (url.pathname === "/repos/owner/repo/issues/7" && init.method === "GET") return jsonResponse(githubIssue(7, "Already Open"));
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, reopenTool }) => {
		const result = await executeReopen(reopenTool, projectRoot, { number: 7, comment: "Should not be posted" });

		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ["GET /repos/owner/repo/issues/7"]);
		assert.equal(calls.some((call) => ["PATCH", "POST"].includes(call.method)), false);
		assert.match(result.content[0].text, /Issue #7 is already open: Already Open/);
		assert.equal(result.details.status, "already_open");
		assert.deepEqual(result.details.changedFields, []);
		assert.equal(result.details.cacheUpdated, false);
		assert.equal(result.details.needsSync, false);
	});
});

test("issueme_reopen_issue surfaces permission API failures without leaking tokens", async () => {
	await withMockedReopenTool(async (input, init) => {
		const url = new URL(input.toString());
		if (url.pathname === "/repos/owner/repo/issues/7" && init.method === "GET") {
			return jsonResponse(githubIssue(7, "Forbidden Reopen", { state: "closed", closed_at: "2026-06-27T00:01:00Z" }));
		}
		if (url.pathname === "/repos/owner/repo/issues/7" && init.method === "PATCH") {
			return jsonResponse({ message: "bad token ghp_test_token" }, { status: 403, statusText: "Forbidden" });
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, reopenTool }) => {
		await assert.rejects(
			() => executeReopen(reopenTool, projectRoot, { number: 7, comment: "Private reopen reason" }),
			(error) => error?.code === "github_api_error" && error.status === 403 && !JSON.stringify(error).includes("ghp_test_token"),
		);
	});
});

test("issueme_reopen_issue reports partial success when cache refresh fails after remote reopen", async () => {
	const calls = [];
	let issueGetCount = 0;
	await withMockedReopenTool(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ path: url.pathname, method: init.method, body });
		if (url.pathname === "/repos/owner/repo/issues/9" && init.method === "GET") {
			issueGetCount += 1;
			return jsonResponse(issueGetCount === 1
				? githubIssue(9, "Cache Partial", { state: "closed", closed_at: "2026-06-27T00:01:00Z" })
				: githubIssue(9, "Cache Partial"));
		}
		if (url.pathname === "/repos/owner/repo/issues/9" && init.method === "PATCH") return jsonResponse(githubIssue(9, "Cache Partial"));
		if (url.pathname === "/repos/owner/repo/issues/9/comments" && init.method === "GET") return jsonResponse([]);
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, reopenTool }) => {
		const result = await executeReopen(reopenTool, projectRoot, { number: 9 });

		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
			"GET /repos/owner/repo/issues/9",
			"PATCH /repos/owner/repo/issues/9",
			"GET /repos/owner/repo/issues/9",
			"GET /repos/owner/repo/issues/9/comments",
		]);
		assert.equal(calls[1].body.state, "open");
		assert.match(result.content[0].text, /Reopened issue #9: Cache Partial/);
		assert.match(result.content[0].text, /Local cache refresh failed; run issueme_sync_issues before relying on cache state/);
		assert.equal(result.details.result, "partial_success");
		assert.equal(result.details.status, "reopened_partial_success");
		assert.equal(result.details.cacheUpdated, false);
		assert.equal(result.details.needsSync, true);
		assert.equal(result.details.issue.state, "open");
		assert.equal(result.details.error.code, "unsafe_issue_directory");
		assert.doesNotMatch(JSON.stringify(result.details), /ghp_test_token/);
	}, { blockIssueDirectory: true });
});

function restoreEnv(name, value) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}
