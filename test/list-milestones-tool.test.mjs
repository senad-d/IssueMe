import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { GitHubApiError } from "../src/errors.ts";
import { registerListMilestonesTool } from "../src/tools/list-milestones.ts";

const TOKEN = "ghp_list_milestones_secret";
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
	return mkdtemp(join(tmpdir(), "issueme-list-milestones-tool-"));
}

async function executeListMilestonesTool(fetchFn, params) {
	const pi = fakePi();
	registerListMilestonesTool(pi, {
		runtime: {
			config,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	});
	return pi.tools.get("issueme_list_milestones").execute("call", params, undefined, undefined, {
		cwd: await tempProject(),
		isProjectTrusted: () => true,
	});
}

function milestone(number, title, overrides = {}) {
	return {
		number,
		title,
		state: "open",
		description: `${title} milestone`,
		due_on: "2026-07-01T00:00:00Z",
		open_issues: 3,
		closed_issues: 2,
		html_url: `https://github.com/${REPOSITORY}/milestone/${number}`,
		url: `https://api.github.com/repos/${REPOSITORY}/milestones/${number}`,
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

test("issueme_list_milestones lists repository milestone metadata read-only", async () => {
	const calls = [];
	const result = await executeListMilestonesTool(async (url, init) => {
		calls.push({ url: new URL(url.toString()), init });
		return jsonResponse([
			milestone(1, "v1.0", { description: "First release" }),
			milestone(2, "Sprint 2", { due_on: null, open_issues: 0, closed_issues: 5 }),
		]);
	}, {});

	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "list_milestones");
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, false);
	assert.deepEqual(result.details.milestones.map((item) => item.number), [1, 2]);
	assert.equal(result.details.milestones[0].title, "v1.0");
	assert.equal(result.details.milestones[0].description, "First release");
	assert.equal(result.details.milestones[0].due_on, "2026-07-01T00:00:00Z");
	assert.equal(result.details.milestones[1].due_on, undefined);
	assert.match(result.content[0].text, /read-only/);
	assert.match(result.content[0].text, /v1\.0/);
	assert.equal(calls[0].url.pathname, "/repos/owner/repo/milestones");
	assert.equal(calls[0].url.searchParams.get("state"), "open");
	assert.equal(calls[0].url.searchParams.get("per_page"), "25");
	assertNoToken(result);
});

test("issueme_list_milestones paginates, supports filters, and reports truncation", async () => {
	const calls = [];
	const result = await executeListMilestonesTool(async (url, init) => {
		calls.push({ url: new URL(url.toString()), init });
		if (calls.length === 1) {
			return jsonResponse([milestone(1, "v1.0", { state: "closed" })], {
				headers: { link: '<https://api.github.com/repos/owner/repo/milestones?page=2>; rel="next"' },
			});
		}
		return jsonResponse([milestone(2, "v2.0"), milestone(3, "v3.0")]);
	}, { state: "all", sort: "completeness", direction: "desc", limit: 2 });

	assert.deepEqual(result.details.milestones.map((item) => item.number), [1, 2]);
	assert.equal(result.details.truncated, true);
	assert.deepEqual(result.details.truncation.milestones, { shown: 2, max: 2 });
	assert.equal(calls.length, 2);
	assert.equal(calls[0].url.searchParams.get("state"), "all");
	assert.equal(calls[0].url.searchParams.get("sort"), "completeness");
	assert.equal(calls[0].url.searchParams.get("direction"), "desc");
	assert.equal(calls[0].url.searchParams.get("per_page"), "2");
	assertNoToken(result);
});

test("issueme_list_milestones supports empty repository milestone sets", async () => {
	const empty = await executeListMilestonesTool(async () => jsonResponse([]), { state: "closed" });
	assert.equal(empty.details.counts.returned, 0);
	assert.deepEqual(empty.details.milestones, []);
	assert.match(empty.content[0].text, /No repository milestones matched/);
	assert.equal(empty.details.truncated, false);
	assertNoToken(empty);
});

test("issueme_list_milestones surfaces API failures safely", async () => {
	await assert.rejects(
		() => executeListMilestonesTool(async () => jsonResponse({ message: `server saw ${TOKEN}` }, { status: 500, statusText: "Server Error" }), {}),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assert.match(error.message, /500 Server Error/);
			assert.doesNotMatch(error.message, new RegExp(TOKEN));
			return true;
		},
	);
});
