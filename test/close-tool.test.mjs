import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeIssueRecord } from "../src/issues/store.ts";
import { registerCloseIssueTool } from "../src/tools/close-issue.ts";

const config = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };

function issueRecord(number, title, overrides = {}) {
	return {
		schemaVersion: 1,
		repository: "owner/repo",
		number,
		title,
		state: "open",
		body: "Body",
		labels: [],
		assignees: [],
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
		body: "Body",
		labels: [],
		assignees: [],
		milestone: null,
		html_url: `https://github.com/owner/repo/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		...overrides,
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
	let closeTool;
	return {
		get closeTool() { return closeTool; },
		registerTool(tool) { closeTool = tool; },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-close-tool-test-"));
}

async function registerCloseTool() {
	const pi = fakePi();
	registerCloseIssueTool(pi);
	return pi.closeTool;
}

async function executeClose(tool, cwd, params) {
	return tool.execute("close-call", params, undefined, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

async function withMockedCloseTool(fetchFn, callback) {
	const projectRoot = await tempProject();
	const closeTool = await registerCloseTool();
	const originalFetch = globalThis.fetch;
	const originalGhToken = process.env.GH_TOKEN;
	const originalGithubToken = process.env.GITHUB_TOKEN;
	const originalGithubRepository = process.env.GITHUB_REPOSITORY;
	globalThis.fetch = fetchFn;
	process.env.GH_TOKEN = "ghp_test_token";
	delete process.env.GITHUB_TOKEN;
	process.env.GITHUB_REPOSITORY = "owner/repo";
	try {
		return await callback({ projectRoot, closeTool });
	} finally {
		globalThis.fetch = originalFetch;
		restoreEnv("GH_TOKEN", originalGhToken);
		restoreEnv("GITHUB_TOKEN", originalGithubToken);
		restoreEnv("GITHUB_REPOSITORY", originalGithubRepository);
	}
}

test("issueme_close_issue closes open issues and removes matching local cache files", async () => {
	const calls = [];
	await withMockedCloseTool(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ path: url.pathname, method: init.method, body });
		if (url.pathname === "/repos/owner/repo/issues/5" && init.method === "GET") return jsonResponse(githubIssue(5, "Close Target"));
		if (url.pathname === "/repos/owner/repo/issues/5" && init.method === "PATCH") {
			return jsonResponse(githubIssue(5, "Close Target", { state: "closed", closed_at: "2026-06-27T00:01:00Z" }));
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, closeTool }) => {
		await writeIssueRecord(projectRoot, config, issueRecord(5, "Close Target"));
		const result = await executeClose(closeTool, projectRoot, { number: 5 });

		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
			"GET /repos/owner/repo/issues/5",
			"GET /repos/owner/repo/issues/5",
			"PATCH /repos/owner/repo/issues/5",
		]);
		assert.equal(calls[2].body.state, "closed");
		assert.equal(calls[2].body.state_reason, undefined);
		assert.match(result.content[0].text, /Closed issue #5: Close Target/);
		assert.equal(result.details.status, "closed_now");
		assert.equal(result.details.issue.state, "closed");
		assert.deepEqual(result.details.removedPaths, ["issues/5-close-target.json"]);
		assert.equal(result.details.cacheUpdated, true);
		assert.deepEqual(await readdir(join(projectRoot, "issues")), []);
	});
});

test("issueme_close_issue sends completed close reason when requested", async () => {
	const calls = [];
	await withMockedCloseTool(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ path: url.pathname, method: init.method, body });
		if (url.pathname === "/repos/owner/repo/issues/6" && init.method === "GET") return jsonResponse(githubIssue(6, "Completed Target"));
		if (url.pathname === "/repos/owner/repo/issues/6" && init.method === "PATCH") {
			return jsonResponse(githubIssue(6, "Completed Target", { state: "closed", closed_at: "2026-06-27T00:01:00Z" }));
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, closeTool }) => {
		const result = await executeClose(closeTool, projectRoot, { number: 6, reason: "completed" });

		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
			"GET /repos/owner/repo/issues/6",
			"GET /repos/owner/repo/issues/6",
			"PATCH /repos/owner/repo/issues/6",
		]);
		assert.deepEqual(calls[2].body, { state: "closed", state_reason: "completed" });
		assert.match(result.content[0].text, /Close reason: completed/);
		assert.deepEqual(result.details.changedFields, ["state", "state_reason"]);
	});
});

test("issueme_close_issue sends not_planned close reason when requested", async () => {
	const calls = [];
	await withMockedCloseTool(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ path: url.pathname, method: init.method, body });
		if (url.pathname === "/repos/owner/repo/issues/7" && init.method === "GET") return jsonResponse(githubIssue(7, "Declined Target"));
		if (url.pathname === "/repos/owner/repo/issues/7" && init.method === "PATCH") {
			return jsonResponse(githubIssue(7, "Declined Target", { state: "closed", closed_at: "2026-06-27T00:01:00Z" }));
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, closeTool }) => {
		const result = await executeClose(closeTool, projectRoot, { number: 7, reason: "not_planned" });

		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
			"GET /repos/owner/repo/issues/7",
			"GET /repos/owner/repo/issues/7",
			"PATCH /repos/owner/repo/issues/7",
		]);
		assert.deepEqual(calls[2].body, { state: "closed", state_reason: "not_planned" });
		assert.match(result.content[0].text, /Close reason: not_planned/);
		assert.deepEqual(result.details.changedFields, ["state", "state_reason"]);
	});
});

test("issueme_close_issue rejects invalid close reasons before runtime resolution", async () => {
	const closeTool = await registerCloseTool();
	await assert.rejects(
		() => executeClose(closeTool, "unused", { number: 1, reason: "duplicate" }),
		(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === "reason",
	);
});

test("issueme_close_issue treats already-closed issues as no-op remote mutations and removes stale local cache", async () => {
	const calls = [];
	await withMockedCloseTool(async (input, init) => {
		const url = new URL(input.toString());
		calls.push({ path: url.pathname, method: init.method });
		if (url.pathname === "/repos/owner/repo/issues/5" && init.method === "GET") {
			return jsonResponse(githubIssue(5, "Close Target", { state: "closed", closed_at: "2026-06-27T00:01:00Z" }));
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, closeTool }) => {
		await writeIssueRecord(projectRoot, config, issueRecord(5, "Close Target"));
		const result = await executeClose(closeTool, projectRoot, { number: 5, reason: "not_planned" });

		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ["GET /repos/owner/repo/issues/5"]);
		assert.equal(calls.some((call) => call.method === "PATCH"), false);
		assert.match(result.content[0].text, /Issue was already closed #5: Close Target/);
		assert.equal(result.details.status, "already_closed");
		assert.equal(result.details.issue.state, "closed");
		assert.deepEqual(result.details.changedFields, []);
		assert.deepEqual(result.details.removedPaths, ["issues/5-close-target.json"]);
		assert.equal(result.details.cacheUpdated, true);
		assert.deepEqual(await readdir(join(projectRoot, "issues")), []);
	});
});

function restoreEnv(name, value) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}
