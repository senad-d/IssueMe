import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { registerListIssuesTool } from "../src/tools/list-issues.ts";

const TOKEN = "ghp_list_tool_secret";
const REPOSITORY = "owner/repo";
const config = { issueDirectory: "issues", allowedIssueCreator: "all", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-list-tool-"));
}

async function executeListTool(fetchFn, params, runtimeConfig = config) {
	const pi = fakePi();
	registerListIssuesTool(pi, {
		runtime: {
			config: runtimeConfig,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	});
	return pi.tools.get("issueme_list_issues").execute("call", params, undefined, undefined, {
		cwd: await tempProject(),
		isProjectTrusted: () => true,
	});
}

function issue(number, overrides = {}) {
	return {
		number,
		title: `Issue ${number}`,
		state: "open",
		body: `Private body ${TOKEN}`,
		user: { login: "octocat" },
		labels: [{ name: "bug" }],
		assignees: [{ login: "octocat" }],
		milestone: null,
		html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		comments: 0,
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

function assertNoPrivateBodyOrToken(result) {
	const serialized = JSON.stringify(result);
	assert.doesNotMatch(serialized, new RegExp(TOKEN));
	assert.doesNotMatch(serialized, /Private body/);
}

test("issueme_list_issues lists current-repository issues read-only and excludes pull requests", async () => {
	const calls = [];
	const result = await executeListTool(async (url, init) => {
		calls.push({ url: new URL(url.toString()), init });
		return jsonResponse([issue(1), issue(2, { pull_request: {} })]);
	}, { state: "all", labels: ["bug"], limit: 10 });

	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "list");
	assert.equal(result.details.cacheUpdated, false);
	assert.deepEqual(result.details.issues.map((item) => item.number), [1]);
	assert.match(result.content[0].text, /read-only/);
	assert.equal(calls[0].url.pathname, "/repos/owner/repo/issues");
	assert.equal(calls[0].url.searchParams.get("state"), "all");
	assert.equal(calls[0].url.searchParams.get("labels"), "bug");
	assertNoPrivateBodyOrToken(result);
});

test("issueme_list_issues uses safe GitHub search mode and reports truncation", async () => {
	const calls = [];
	const result = await executeListTool(async (url, init) => {
		calls.push({ url: new URL(url.toString()), init });
		return jsonResponse({
			total_count: 3,
			incomplete_results: false,
			items: [issue(3), issue(4)],
		});
	}, { query: "crash", state: "open", author: "octocat", limit: 1 });

	assert.equal(result.details.status, "search");
	assert.equal(result.details.truncated, true);
	assert.deepEqual(result.details.issues.map((item) => item.number), [3]);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].url.pathname, "/search/issues");
	const q = calls[0].url.searchParams.get("q");
	assert.match(q, /repo:owner\/repo/);
	assert.match(q, /is:issue/);
	assert.match(q, /crash/);
	assert.match(q, /author:octocat/);
	assertNoPrivateBodyOrToken(result);
});

test("restricted issueme_list_issues applies creator scope to list and search", async () => {
	const restricted = { ...config, allowedIssueCreator: "hubot" };
	const listCalls = [];
	const listResult = await executeListTool(async (url, init) => {
		listCalls.push({ url: new URL(url.toString()), init });
		return jsonResponse([
			issue(10, { title: "Allowed", user: { login: "Hubot" } }),
			issue(11, { title: "Disallowed", user: { login: "intruder" } }),
		]);
	}, { state: "open", limit: 10 }, restricted);

	assert.equal(listCalls[0].url.searchParams.get("creator"), "hubot");
	assert.deepEqual(listResult.details.issues.map((item) => item.number), [10]);
	assert.equal(listResult.details.creatorScope, "hubot");
	assert.match(listResult.content[0].text, /creator scope: hubot/);
	assert.match(listResult.content[0].text, /by Hubot/);
	assert.doesNotMatch(listResult.content[0].text, /Disallowed|intruder/);

	const searchCalls = [];
	await executeListTool(async (url, init) => {
		searchCalls.push({ url: new URL(url.toString()), init });
		return jsonResponse({ total_count: 1, incomplete_results: false, items: [issue(12, { user: { login: "hubot" } })] });
	}, { query: "crash", state: "open", limit: 5 }, restricted);
	const q = searchCalls[0].url.searchParams.get("q");
	assert.match(q, /author:hubot/);
});

test("restricted issueme_list_issues rejects conflicting creator filters", async () => {
	const restricted = { ...config, allowedIssueCreator: "hubot" };
	let calls = 0;
	await assert.rejects(
		() => executeListTool(async () => {
			calls += 1;
			return jsonResponse([]);
		}, { creator: "intruder" }, restricted),
		(error) => error?.code === "invalid_tool_input" && error.safeDetails?.allowedIssueCreator === "hubot",
	);
	await assert.rejects(
		() => executeListTool(async () => {
			calls += 1;
			return jsonResponse({ total_count: 0, incomplete_results: false, items: [] });
		}, { query: "author:intruder crash" }, restricted),
		(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === "query",
	);
	assert.equal(calls, 0);
});

test("invalid configured allowedIssueCreator fails closed before list fetch", async () => {
	let calls = 0;
	await assert.rejects(
		() => executeListTool(async () => {
			calls += 1;
			return jsonResponse([issue(99, { user: { login: "intruder" } })]);
		}, { state: "open" }, { ...config, allowedIssueCreator: "bad login" }),
		(error) => {
			assert.equal(error?.code, "config_tui_invalid_setting");
			assert.equal(error.safeDetails?.field, "allowedIssueCreator");
			assert.match(error.message, /Allowed issue creator/);
			return true;
		},
	);
	assert.equal(calls, 0);
});

test("issueme_list_issues validates updated-since as an explicit ISO date or timestamp", async () => {
	let calls = 0;
	const valid = await executeListTool(async (url) => {
		calls += 1;
		assert.equal(new URL(url.toString()).searchParams.get("since"), "2026-06-27T00:00:00Z");
		return jsonResponse([]);
	}, { since: "2026-06-27T00:00:00Z" });
	assert.equal(valid.details.status, "list");
	assert.equal(calls, 1);

	await assert.rejects(
		() => executeListTool(async () => {
			calls += 1;
			return jsonResponse([]);
		}, { since: "June 27, 2026" }),
		(error) => error?.code === "invalid_tool_input" && /ISO/.test(error.message),
	);
	assert.equal(calls, 1);
});

test("issueme_list_issues rejects unsafe search boundary qualifiers before fetch", async () => {
	let calls = 0;
	await assert.rejects(
		() => executeListTool(async () => {
			calls += 1;
			return jsonResponse({ total_count: 0, incomplete_results: false, items: [] });
		}, { query: "repo:evil/repo is:pr" }),
		(error) => error?.code === "invalid_tool_input" && /repo/.test(error.message),
	);
	assert.equal(calls, 0);
});
