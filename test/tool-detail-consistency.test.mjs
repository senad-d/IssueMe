import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ClosedIssueMutationError, GitHubApiError } from "../src/errors.ts";
import { registerCommentIssueTool } from "../src/tools/comment-issue.ts";
import { registerCreateIssueTool } from "../src/tools/create-issue.ts";
import { registerUpdateIssueTool } from "../src/tools/update-issue.ts";

function githubIssue(overrides = {}) {
	return {
		number: 1,
		title: "Detail Target",
		state: "open",
		body: "PRIVATE ISSUE BODY SHOULD NOT LEAK",
		labels: [],
		assignees: [],
		milestone: null,
		html_url: "https://github.com/owner/repo/issues/1",
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		...overrides,
	};
}

function githubComment(overrides = {}) {
	return {
		id: 12345,
		user: { login: "octocat" },
		body: "PRIVATE COMMENT BODY SHOULD NOT LEAK IN DETAILS",
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		html_url: "https://github.com/owner/repo/issues/1#issuecomment-12345",
		...overrides,
	};
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json", ...(init.headers ?? {}) },
	});
}

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-tool-detail-test-"));
}

async function execute(tool, cwd, params) {
	return tool.execute("tool-call", params, undefined, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

async function withMockedTools(fetchFn, callback) {
	const projectRoot = await tempProject();
	const pi = fakePi();
	registerCreateIssueTool(pi);
	registerUpdateIssueTool(pi);
	registerCommentIssueTool(pi);
	const originalFetch = globalThis.fetch;
	const originalGhToken = process.env.GH_TOKEN;
	const originalGithubToken = process.env.GITHUB_TOKEN;
	const originalGithubRepository = process.env.GITHUB_REPOSITORY;
	globalThis.fetch = fetchFn;
	process.env.GH_TOKEN = "ghp_test_token";
	delete process.env.GITHUB_TOKEN;
	process.env.GITHUB_REPOSITORY = "owner/repo";
	try {
		return await callback({ projectRoot, tools: pi.tools });
	} finally {
		globalThis.fetch = originalFetch;
		restoreEnv("GH_TOKEN", originalGhToken);
		restoreEnv("GITHUB_TOKEN", originalGithubToken);
		restoreEnv("GITHUB_REPOSITORY", originalGithubRepository);
	}
}

test("issueme_comment_issue returns structured comment details without private comment body", async () => {
	const calls = [];
	await withMockedTools(async (input, init) => {
		const url = new URL(input.toString());
		calls.push({ path: url.pathname, method: init.method, body: init.body });
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") return jsonResponse(githubIssue());
		if (url.pathname === "/repos/owner/repo/issues/1/comments" && init.method === "POST") return jsonResponse(githubComment());
		if (url.pathname === "/repos/owner/repo/issues/1/comments" && init.method === "GET") return jsonResponse([githubComment()]);
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, tools }) => {
		const result = await execute(tools.get("issueme_comment_issue"), projectRoot, {
			number: 1,
			body: "PRIVATE COMMENT BODY SHOULD NOT LEAK IN DETAILS",
		});

		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
			"GET /repos/owner/repo/issues/1",
			"POST /repos/owner/repo/issues/1/comments",
			"GET /repos/owner/repo/issues/1",
			"GET /repos/owner/repo/issues/1/comments",
		]);
		assert.equal(result.details.result, "success");
		assert.equal(result.details.comment.id, 12345);
		assert.equal(result.details.comment.html_url, "https://github.com/owner/repo/issues/1#issuecomment-12345");
		assert.deepEqual(result.details.changedFields, ["comments"]);
		assert.deepEqual(result.details.removedPaths, []);
		assert.equal(result.details.cacheUpdated, true);
		assert.equal(result.details.needsSync, false);
		assert.doesNotMatch(JSON.stringify(result.details), /PRIVATE COMMENT BODY|ghp_test_token/);
	});
});

test("closed issue mutation refusal exposes safe structured issue details", async () => {
	const calls = [];
	await withMockedTools(async (input, init) => {
		const url = new URL(input.toString());
		calls.push({ path: url.pathname, method: init.method, body: init.body });
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") {
			return jsonResponse(githubIssue({ state: "closed", title: "Closed Target", closed_at: "2026-06-27T00:01:00Z" }));
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, tools }) => {
		await assert.rejects(
			() => execute(tools.get("issueme_update_issue"), projectRoot, { number: 1, body: "PRIVATE ISSUE BODY SHOULD NOT LEAK" }),
			(error) => {
				assert.ok(error instanceof ClosedIssueMutationError);
				assert.equal(error.safeDetails.status, "closed_issue_mutation_refused");
				assert.equal(error.safeDetails.repository, "owner/repo");
				assert.equal(error.safeDetails.issue.number, 1);
				assert.equal(error.safeDetails.issue.title, "Closed Target");
				assert.equal(error.safeDetails.issue.state, "closed");
				assert.equal(error.safeDetails.issue.html_url, "https://github.com/owner/repo/issues/1");
				assert.equal(error.safeDetails.cacheUpdated, false);
				assert.equal(error.safeDetails.needsSync, true);
				assert.doesNotMatch(JSON.stringify(error.safeDetails), /PRIVATE ISSUE BODY|ghp_test_token/);
				return true;
			},
		);
		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ["GET /repos/owner/repo/issues/1"]);
	});
});

test("GitHub tool errors redact tokens and request body values from safe messages", async () => {
	const privateBody = "PRIVATE ISSUE BODY SHOULD NOT LEAK";
	await withMockedTools(async (input, init) => {
		const url = new URL(input.toString());
		if (url.pathname === "/repos/owner/repo/issues" && init.method === "POST") {
			return jsonResponse({ message: `validation failed ghp_test_token ${privateBody}` }, { status: 422, statusText: "Unprocessable Entity" });
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, tools }) => {
		await assert.rejects(
			() => execute(tools.get("issueme_create_issue"), projectRoot, { title: "Error Target", body: privateBody }),
			(error) => {
				assert.ok(error instanceof GitHubApiError);
				assert.match(error.message, /422 Unprocessable Entity/);
				assert.match(error.message, /\[REDACTED\]/);
				assert.doesNotMatch(error.message, /ghp_test_token|PRIVATE ISSUE BODY/);
				assert.doesNotMatch(JSON.stringify(error.safeDetails), /ghp_test_token|PRIVATE ISSUE BODY/);
				return true;
			},
		);
	});
});

function restoreEnv(name, value) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}
