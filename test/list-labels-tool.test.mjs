import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { GitHubApiError } from "../src/errors.ts";
import { registerListLabelsTool } from "../src/tools/list-labels.ts";

const TOKEN = "ghp_list_labels_secret";
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
	return mkdtemp(join(tmpdir(), "issueme-list-labels-tool-"));
}

async function executeListLabelsTool(fetchFn, params, signal) {
	const pi = fakePi();
	registerListLabelsTool(pi, {
		runtime: {
			config,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	});
	return pi.tools.get("issueme_list_labels").execute("call", params, signal, undefined, {
		cwd: await tempProject(),
		isProjectTrusted: () => true,
	});
}

function label(name, overrides = {}) {
	return {
		name,
		description: `${name} label`,
		color: "d73a4a",
		default: false,
		url: `https://api.github.com/repos/${REPOSITORY}/labels/${encodeURIComponent(name)}`,
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

test("issueme_list_labels lists repository label metadata read-only", async () => {
	const calls = [];
	const result = await executeListLabelsTool(async (url, init) => {
		calls.push({ url: new URL(url.toString()), init });
		return jsonResponse([
			label("bug", { description: "Something is broken", default: true }),
			label("documentation", { color: "0075ca" }),
		]);
	}, {});

	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "list_labels");
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, false);
	assert.deepEqual(result.details.labels.map((item) => item.name), ["bug", "documentation"]);
	assert.equal(result.details.labels[0].description, "Something is broken");
	assert.equal(result.details.labels[0].color, "d73a4a");
	assert.equal(result.details.labels[0].default, true);
	assert.match(result.content[0].text, /read-only/);
	assert.match(result.content[0].text, /bug/);
	assert.equal(calls[0].url.pathname, "/repos/owner/repo/labels");
	assert.equal(calls[0].url.searchParams.get("per_page"), "25");
	assertNoToken(result);
});

test("issueme_list_labels paginates, filters, and reports truncation", async () => {
	const calls = [];
	const result = await executeListLabelsTool(async (url, init) => {
		calls.push({ url: new URL(url.toString()), init });
		if (calls.length === 1) {
			return jsonResponse([label("bug"), label("feature")], {
				headers: { link: '<https://api.github.com/repos/owner/repo/labels?page=2>; rel="next"' },
			});
		}
		return jsonResponse([label("bug-ui"), label("bug-api")]);
	}, { query: "bug", limit: 2 });

	assert.deepEqual(result.details.labels.map((item) => item.name), ["bug", "bug-ui"]);
	assert.equal(result.details.truncated, true);
	assert.deepEqual(result.details.truncation.labels, { shown: 2, max: 2 });
	assert.equal(calls.length, 2);
	assert.equal(calls[0].url.searchParams.get("per_page"), "2");
	assertNoToken(result);
});

test("issueme_list_labels stops paginated reads when the abort signal is cancelled", async () => {
	const controller = new AbortController();
	const calls = [];
	await assert.rejects(
		() => executeListLabelsTool(async (url, init) => {
			calls.push({ url: new URL(url.toString()), signal: init.signal });
			assert.equal(init.signal, controller.signal);
			controller.abort();
			return jsonResponse([label("bug")], {
				headers: { link: '<https://api.github.com/repos/owner/repo/labels?page=2>; rel="next"' },
			});
		}, { query: "bug", limit: 5 }, controller.signal),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assert.equal(error.code, "github_request_aborted");
			return true;
		},
	);
	assert.equal(calls.length, 1);
});

test("issueme_list_labels supports name filtering and empty repository label sets", async () => {
	const filtered = await executeListLabelsTool(async () => jsonResponse([label("bug"), label("help wanted")]), { name: "help", limit: 5 });
	assert.deepEqual(filtered.details.labels.map((item) => item.name), ["help wanted"]);

	const empty = await executeListLabelsTool(async () => jsonResponse([]), { query: "missing" });
	assert.equal(empty.details.counts.returned, 0);
	assert.deepEqual(empty.details.labels, []);
	assert.match(empty.content[0].text, /No repository labels matched/);
	assert.equal(empty.details.truncated, false);
	assertNoToken(empty);
});

test("issueme_list_labels validates shared filter and limit inputs before fetching", async () => {
	let calls = 0;
	await assert.rejects(
		() => executeListLabelsTool(async () => {
			calls += 1;
			return jsonResponse([]);
		}, { query: "bug\0secret" }),
		(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === "query" && /null bytes/.test(error.message),
	);
	await assert.rejects(
		() => executeListLabelsTool(async () => {
			calls += 1;
			return jsonResponse([]);
		}, { limit: 0 }),
		(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === "limit" && /between 1/.test(error.message),
	);
	assert.equal(calls, 0);
});

test("issueme_list_labels surfaces API failures safely", async () => {
	await assert.rejects(
		() => executeListLabelsTool(async () => jsonResponse({ message: `server saw ${TOKEN}` }, { status: 500, statusText: "Server Error" }), {}),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assert.match(error.message, /500 Server Error/);
			assert.doesNotMatch(error.message, new RegExp(TOKEN));
			return true;
		},
	);
});
