import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import test from "node:test";

import { GitHubClient } from "../src/github/client.ts";
import { registerGetOverviewTool } from "../src/tools/overview.ts";
import { createFakePi, createFetchRecorder, executeRegisteredTool, githubIssue, githubLabel, graphQLConnection, graphQLResponse, jsonResponse, projectV2Node, runtimeOptions, tempProject, TEST_REPOSITORY_OBJECT, TEST_TOKEN } from "./helpers/issueme-test-helpers.mjs";

function clientFor(handler) {
	const recorder = createFetchRecorder(handler);
	return { ...recorder, client: new GitHubClient({ repository: TEST_REPOSITORY_OBJECT, token: TEST_TOKEN, fetchFn: recorder.fetchFn }) };
}

function nextPage(path) {
	return { link: `<https://api.github.com/repos/owner/repo/${path}?page=2>; rel="next"` };
}

test("overview never follows second pages, even when all first-page issues are PRs or projects are closed", async (t) => {
	const root = await tempProject();
	t.after(() => rm(root, { recursive: true, force: true }));
	const recorder = createFetchRecorder((call) => {
		assert.equal(call.url.searchParams.has("page"), false);
		if (call.url.pathname === "/graphql") {
			assert.equal(call.json.variables.after, undefined);
			return graphQLResponse({ repository: { projectsV2: graphQLConnection([projectV2Node({ closed: true })], { hasNextPage: true, endCursor: "next" }) } });
		}
		return jsonResponse([githubIssue({ pull_request: {} })], { headers: nextPage("issues") });
	});
	const pi = createFakePi();
	registerGetOverviewTool(pi, { runtime: runtimeOptions({ projectRoot: root, fetchFn: recorder.fetchFn }) });
	const result = await executeRegisteredTool(pi.tools, "issueme_get_overview", { sections: ["issues", "projects"] }, { cwd: root });
	assert.equal(recorder.calls.length, 2);
	assert.equal(result.details.result, "success");
	assert.equal(result.details.truncated, true);
	assert.deepEqual(result.details.issues, []);
	assert.deepEqual(result.details.projects, []);
	assert.equal(result.details.overview.sections.issues.status, "truncated");
	assert.equal(result.details.overview.sections.projects.status, "truncated");
	assert.match(result.content[0].text, /do not infer absence/);
});

test("REST maxPages caps filtered scans while omitted budgets preserve pagination", async () => {
	const bounded = clientFor(() => jsonResponse([githubLabel({ name: "unmatched" })], { headers: nextPage("labels") }));
	const result = await bounded.client.listLabels({ name: "wanted", limit: 10, maxPages: 2 });
	assert.equal(bounded.calls.length, 2);
	assert.deepEqual(result.labels, []);
	assert.equal(result.truncated, true);
	const unlimited = clientFor((call) => call.url.searchParams.get("page") === "2"
		? jsonResponse([githubLabel({ name: "wanted" })])
		: jsonResponse([githubLabel({ name: "unmatched" })], { headers: nextPage("labels") }));
	const full = await unlimited.client.listLabels({ name: "wanted", limit: 10 });
	assert.equal(unlimited.calls.length, 2);
	assert.equal(full.labels[0].name, "wanted");
	assert.equal(full.truncated, false);
});

test("Projects maxPages caps closed-board filtering without changing default pagination", async () => {
	const harness = clientFor((call) => {
		const after = call.json.variables.after;
		const projects = after ? [projectV2Node()] : [projectV2Node({ closed: true })];
		return graphQLResponse({ repository: { projectsV2: graphQLConnection(projects, { hasNextPage: !after, endCursor: "next" }) } });
	});
	const capped = await harness.client.listProjectsV2({ limit: 5, maxPages: 1 });
	assert.equal(capped.truncated, true);
	assert.equal(capped.projects.length, 0);
	assert.equal(harness.calls.length, 1);
	const full = await harness.client.listProjectsV2({ limit: 5 });
	assert.equal(full.truncated, false);
	assert.equal(full.projects.length, 1);
	assert.equal(harness.calls.length, 3);
});

test("internal pagination budgets validate before network access", async () => {
	const harness = clientFor(() => { throw new Error("Must not fetch"); });
	for (const maxPages of [0, -1, 1.5, NaN, Infinity, "1"]) {
		await assert.rejects(() => harness.client.listIssues({ maxPages }), { code: "invalid_tool_input" });
		await assert.rejects(() => harness.client.listProjectsV2({ maxPages }), { code: "invalid_tool_input" });
		await assert.rejects(() => harness.client.searchIssues({ query: "bug", maxPages }), { code: "invalid_tool_input" });
	}
	assert.equal(harness.calls.length, 0);
});

test("search honors internal page budgets and retains remote total metadata", async () => {
	const harness = clientFor(() => jsonResponse({ total_count: 100, incomplete_results: false, items: [githubIssue()] }, {
		headers: { link: '<https://api.github.com/search/issues?q=repo%3Aowner%2Frepo%20is%3Aissue&page=2>; rel="next"' },
	}));
	const result = await harness.client.searchIssues({ query: "bug", maxPages: 1, limit: 10 });
	assert.equal(harness.calls.length, 1);
	assert.equal(result.truncated, true);
	assert.equal(result.totalCount, 100);
});
