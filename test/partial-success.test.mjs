import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { registerCloseIssueTool } from "../src/tools/close-issue.ts";
import { registerCreateIssueTool } from "../src/tools/create-issue.ts";

function githubIssue(overrides = {}) {
	return {
		number: 1,
		title: "Partial Success Target",
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

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json" },
	});
}

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

async function tempProjectWithBlockedIssueDirectory() {
	const root = await mkdtemp(join(tmpdir(), "issueme-partial-success-test-"));
	await writeFile(join(root, "issues"), "not a directory\n", "utf8");
	return root;
}

async function execute(tool, cwd, params) {
	return tool.execute("tool-call", params, undefined, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

async function withMockedTools(fetchFn, callback) {
	const projectRoot = await tempProjectWithBlockedIssueDirectory();
	const pi = fakePi();
	registerCreateIssueTool(pi);
	registerCloseIssueTool(pi);
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

test("issueme_create_issue reports remote success when local cache write fails", async () => {
	const calls = [];
	await withMockedTools(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ path: url.pathname, method: init.method, body });
		if (url.pathname === "/repos/owner/repo/issues" && init.method === "POST") {
			return jsonResponse(githubIssue({
				number: 44,
				title: body.title,
				body: body.body,
				html_url: "https://github.com/owner/repo/issues/44",
			}));
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, tools }) => {
		const result = await execute(tools.get("issueme_create_issue"), projectRoot, {
			title: "Partial create",
			body: "PRIVATE ISSUE BODY SHOULD NOT LEAK",
		});

		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ["POST /repos/owner/repo/issues"]);
		assert.match(result.content[0].text, /Created issue #44: Partial create/);
		assert.match(result.content[0].text, /Local cache update failed; run issueme_sync_issues before retrying local work/);
		assert.equal(result.details.status, "partial_success");
		assert.equal(result.details.cacheUpdated, false);
		assert.equal(result.details.needsSync, true);
		assert.equal(result.details.issue.number, 44);
		assert.equal(result.details.issue.html_url, "https://github.com/owner/repo/issues/44");
		assert.equal(result.details.error.code, "unsafe_issue_directory");
		assert.doesNotMatch(JSON.stringify(result.details), /PRIVATE ISSUE BODY|ghp_test_token/);
	});
});

test("issueme_close_issue reports closed remote issue when local cache removal fails", async () => {
	const calls = [];
	await withMockedTools(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ path: url.pathname, method: init.method, body });
		if (url.pathname === "/repos/owner/repo/issues/9" && init.method === "GET") {
			return jsonResponse(githubIssue({
				number: 9,
				title: "Close Partial",
				html_url: "https://github.com/owner/repo/issues/9",
			}));
		}
		if (url.pathname === "/repos/owner/repo/issues/9" && init.method === "PATCH") {
			return jsonResponse(githubIssue({
				number: 9,
				title: "Close Partial",
				state: "closed",
				html_url: "https://github.com/owner/repo/issues/9",
				closed_at: "2026-06-27T00:01:00Z",
			}));
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, tools }) => {
		const result = await execute(tools.get("issueme_close_issue"), projectRoot, { number: 9 });

		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
			"GET /repos/owner/repo/issues/9",
			"GET /repos/owner/repo/issues/9",
			"PATCH /repos/owner/repo/issues/9",
		]);
		assert.equal(calls[2].body.state, "closed");
		assert.match(result.content[0].text, /Closed issue #9: Close Partial/);
		assert.match(result.content[0].text, /URL: https:\/\/github.com\/owner\/repo\/issues\/9/);
		assert.match(result.content[0].text, /Local cache removal failed; run issueme_sync_issues before relying on cache state/);
		assert.equal(result.details.status, "closed_now_partial_success");
		assert.equal(result.details.cacheUpdated, false);
		assert.equal(result.details.needsSync, true);
		assert.equal(result.details.issue.number, 9);
		assert.equal(result.details.issue.state, "closed");
		assert.equal(result.details.issue.html_url, "https://github.com/owner/repo/issues/9");
		assert.equal(result.details.error.code, "unsafe_issue_directory");
		assert.doesNotMatch(JSON.stringify(result.details), /PRIVATE ISSUE BODY|ghp_test_token/);
	});
});

function restoreEnv(name, value) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}
