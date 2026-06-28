import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { GitHubApiError } from "../src/errors.ts";
import { registerListAssigneesTool } from "../src/tools/list-assignees.ts";

const TOKEN = "ghp_list_assignees_secret";
const REPOSITORY = "owner/repo";
const config = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-list-assignees-tool-"));
}

async function executeListAssigneesTool(fetchFn, params) {
	const pi = fakePi();
	registerListAssigneesTool(pi, {
		runtime: {
			config,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	});
	return pi.tools.get("issueme_list_assignees").execute("call", params, undefined, undefined, {
		cwd: await tempProject(),
		isProjectTrusted: () => true,
	});
}

function assignee(login, overrides = {}) {
	return {
		login,
		id: login.length * 100,
		type: "User",
		html_url: `https://github.com/${login}`,
		url: `https://api.github.com/users/${login}`,
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

function assertNoToken(result) {
	assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));
}

test("issueme_list_assignees lists assignable user metadata read-only", async () => {
	const calls = [];
	const result = await executeListAssigneesTool(async (url, init) => {
		calls.push({ url: new URL(url.toString()), init });
		return jsonResponse([
			assignee("octocat", { id: 1 }),
			assignee("hubot", { id: 2, type: "Bot" }),
		]);
	}, {});

	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "list_assignees");
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, false);
	assert.deepEqual(result.details.assignees.map((item) => item.login), ["octocat", "hubot"]);
	assert.equal(result.details.assignees[0].id, 1);
	assert.equal(result.details.assignees[1].type, "Bot");
	assert.equal(result.details.assignees[0].html_url, "https://github.com/octocat");
	assert.match(result.content[0].text, /read-only/);
	assert.match(result.content[0].text, /octocat/);
	assert.equal(calls[0].url.pathname, "/repos/owner/repo/assignees");
	assert.equal(calls[0].url.searchParams.get("per_page"), "25");
	assertNoToken(result);
});

test("issueme_list_assignees paginates, filters, and reports truncation", async () => {
	const calls = [];
	const result = await executeListAssigneesTool(async (url, init) => {
		calls.push({ url: new URL(url.toString()), init });
		if (calls.length === 1) {
			return jsonResponse([assignee("octocat"), assignee("mona")], {
				headers: { link: '<https://api.github.com/repos/owner/repo/assignees?page=2>; rel="next"' },
			});
		}
		return jsonResponse([assignee("octo-bot", { type: "Bot" }), assignee("hubot", { type: "Bot" }), assignee("dependabot", { type: "Bot" })]);
	}, { query: "bot", limit: 2 });

	assert.deepEqual(result.details.assignees.map((item) => item.login), ["octo-bot", "hubot"]);
	assert.equal(result.details.truncated, true);
	assert.deepEqual(result.details.truncation.assignees, { shown: 2, max: 2 });
	assert.equal(calls.length, 2);
	assert.equal(calls[0].url.searchParams.get("per_page"), "2");
	assertNoToken(result);
});

test("issueme_list_assignees supports login filtering and empty assignable-user sets", async () => {
	const filtered = await executeListAssigneesTool(async () => jsonResponse([assignee("octocat"), assignee("hubot")]), { login: "hub", limit: 5 });
	assert.deepEqual(filtered.details.assignees.map((item) => item.login), ["hubot"]);

	const empty = await executeListAssigneesTool(async () => jsonResponse([]), { query: "missing" });
	assert.equal(empty.details.counts.returned, 0);
	assert.deepEqual(empty.details.assignees, []);
	assert.match(empty.content[0].text, /No assignable users matched/);
	assert.equal(empty.details.truncated, false);
	assertNoToken(empty);
});

test("issueme_list_assignees surfaces permission failures safely", async () => {
	await assert.rejects(
		() => executeListAssigneesTool(async () => jsonResponse({ message: `server saw ${TOKEN}` }, { status: 403, statusText: "Forbidden" }), {}),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assert.match(error.message, /403 Forbidden/);
			assert.doesNotMatch(error.message, new RegExp(TOKEN));
			return true;
		},
	);
});
