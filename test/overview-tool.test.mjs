import assert from "node:assert/strict";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { MAX_TOOL_TEXT_CHARS } from "../src/constants.ts";
import { GitHubApiError } from "../src/errors.ts";
import { registerGetOverviewTool } from "../src/tools/overview.ts";
import { OVERVIEW_SECTIONS } from "../src/types.ts";
import { createFakePi, createFakeToolContext, createFetchRecorder, executeRegisteredTool, githubIssue, githubLabel, githubMilestone, githubUser, graphQLConnection, graphQLResponse, jsonResponse, projectV2Node, runtimeOptions, tempProject, TEST_TOKEN } from "./helpers/issueme-test-helpers.mjs";

async function setup(t, handler = defaultResponse, overrides = {}) {
	const root = await tempProject("issueme-overview-");
	t.after(() => rm(root, { recursive: true, force: true }));
	const recorder = createFetchRecorder(handler);
	const pi = createFakePi();
	registerGetOverviewTool(pi, { runtime: runtimeOptions({ projectRoot: root, fetchFn: recorder.fetchFn, ...overrides }) });
	return { root, pi, ...recorder };
}

function execute(harness, params = {}, options = {}) {
	return executeRegisteredTool(harness.pi.tools, "issueme_get_overview", params, { cwd: harness.root, ...options });
}

function defaultResponse(call) {
	if (call.url.pathname === "/graphql") {
		assert.equal(call.json.operationName, "IssueMeListProjectsV2");
		assert.doesNotMatch(call.json.query, /mutation|timelineItems|comments\(|fields\(/);
		return graphQLResponse({ repository: { projectsV2: graphQLConnection([projectV2Node()]) } });
	}
	assert.equal(call.method, "GET");
	switch (call.url.pathname) {
		case "/repos/owner/repo/issues": return jsonResponse([
			githubIssue({ body: "PRIVATE BODY", comments: 500, milestone: { number: 2, title: "Release" }, labels: [{ name: "bug" }], assignees: [{ login: "octocat" }] }),
			githubIssue({ number: 2, pull_request: {} }),
		]);
		case "/repos/owner/repo/labels": return jsonResponse([githubLabel()]);
		case "/repos/owner/repo/milestones": return jsonResponse([githubMilestone()]);
		case "/repos/owner/repo/assignees": return jsonResponse([githubUser()]);
		default: throw new Error(`Unexpected request ${call.url.pathname}`);
	}
}

function assertReadOnly(result) {
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, false);
	assert.deepEqual(result.details.paths, []);
	assert.deepEqual(result.details.removedPaths, []);
	assert.deepEqual(result.details.changedFields, []);
	assert.doesNotMatch(JSON.stringify(result), /PRIVATE BODY|ghp_issueme_test_token/);
}

test("overview returns five compact sections with issue milestone/update metadata and no cache writes", async (t) => {
	const harness = await setup(t);
	await writeFile(join(harness.root, "keep.txt"), "unchanged");
	const result = await execute(harness);
	assert.equal(harness.calls.length, 5);
	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "overview");
	assert.equal(result.details.creatorScope, "all");
	assert.equal(result.details.overview.maxRequests, 5);
	assert.ok(Date.parse(result.details.overview.startedAt) <= Date.parse(result.details.overview.fetchedAt));
	for (const name of OVERVIEW_SECTIONS) {
		assert.equal(result.details.overview.sections[name].status, "complete");
		assert.equal(result.details.overview.sections[name].returned, 1);
		assert.equal(result.details.overview.sections[name].limit, 10);
		assert.match(result.content[0].text, new RegExp(`${name}: 1 returned`));
	}
	assert.deepEqual(result.details.issues[0].milestone, { number: 2, title: "Release" });
	assert.equal(result.details.issues[0].updatedAt, "2026-06-27T00:00:00Z");
	assert.equal(result.details.issues[0].commentsCount, 500);
	assert.equal(result.details.issues[0].commentsTruncated, undefined);
	assert.equal(result.details.projects[0].id, "PVT_1");
	assert.equal(harness.calls[0].url.searchParams.get("sort"), "updated");
	assert.equal(harness.calls[0].url.searchParams.get("state"), "open");
	assert.match(result.content[0].text, /not repository totals/);
	assert.match(result.content[0].text, /not an atomic snapshot/);
	assert.match(result.content[0].text, /issueme_get_project_fields/);
	assertReadOnly(result);
	assert.deepEqual(await readdir(harness.root), ["keep.txt"]);
	assert.equal(await readFile(join(harness.root, "keep.txt"), "utf8"), "unchanged");
});

test("overview text preserves milestone states and optional label descriptions", async (t) => {
	const harness = await setup(t, (call) => {
		if (call.url.pathname.endsWith("/issues")) return jsonResponse([
			githubIssue({ number: 1, milestone: { number: 2, title: "Release" } }),
			githubIssue({ number: 2, milestone: null }),
			githubIssue({ number: 3, milestone: undefined }),
		]);
		return jsonResponse([
			githubLabel({ name: "bug", description: "Needs a fix" }),
			githubLabel({ name: "ready", description: "" }),
		]);
	});
	const result = await execute(harness, { sections: ["issues", "labels"] });
	const text = result.content[0].text;
	assert.match(text, /#1 Test Issue;.*milestone: #2 Release;/);
	assert.match(text, /#2 Test Issue;.*milestone: none;/);
	assert.match(text, /#3 Test Issue;.*milestone: unknown;/);
	assert.match(text, /^- bug — Needs a fix$/m);
	assert.match(text, /^- ready$/m);
	assertReadOnly(result);
});

test("overview resolves its runtime once and executes the five single-page reads concurrently", async (t) => {
	const root = await tempProject();
	t.after(() => rm(root, { recursive: true, force: true }));
	let runtimeCalls = 0;
	let active = 0;
	let maximum = 0;
	const recorder = createFetchRecorder(async (call) => {
		active += 1;
		maximum = Math.max(maximum, active);
		await new Promise((resolve) => setImmediate(resolve));
		active -= 1;
		return defaultResponse(call);
	});
	const pi = createFakePi();
	registerGetOverviewTool(pi, { runtime: () => {
		runtimeCalls += 1;
		return runtimeOptions({ projectRoot: root, fetchFn: recorder.fetchFn });
	} });
	await execute({ root, pi });
	assert.equal(runtimeCalls, 1);
	assert.equal(maximum, 5);
	assert.equal(active, 0);
	assert.equal(recorder.calls.length, 5);
});

test("overview reads only selected sections and reports omitted sections explicitly", async (t) => {
	const harness = await setup(t);
	const result = await execute(harness, { sections: ["projects", "issues"], limit: 2 });
	assert.equal(harness.calls.length, 2);
	assert.equal(harness.calls[0].url.searchParams.get("per_page"), "2");
	assert.equal(harness.calls[1].json.variables.first, 2);
	assert.equal(result.details.overview.maxRequests, 2);
	assert.equal(result.details.overview.sections.labels.status, "omitted");
	assert.equal(result.details.labels, undefined);
	assertReadOnly(result);
});

test("overview applies creator scope to issues only and labels metadata counts repository-wide", async (t) => {
	const harness = await setup(t, (call) => {
		if (call.url.pathname.endsWith("/issues")) return jsonResponse([
			githubIssue({ user: { login: "Hubot" } }),
			githubIssue({ number: 2, title: "OUT OF SCOPE", user: { login: "outsider" } }),
		]);
		return defaultResponse(call);
	}, { config: { allowedIssueCreator: "hubot" } });
	const result = await execute(harness);
	assert.equal(harness.calls[0].url.searchParams.get("creator"), "hubot");
	assert.deepEqual(result.details.issues.map((issue) => issue.number), [1]);
	assert.equal(result.details.creatorScope, "hubot");
	assert.doesNotMatch(JSON.stringify(result), /OUT OF SCOPE|outsider/);
	assert.match(result.content[0].text, /milestone counts are repository-wide/);
});

test("overview distinguishes valid empty collections from failed sections", async (t) => {
	const harness = await setup(t, (call) => call.url.pathname === "/graphql"
		? graphQLResponse({ repository: { projectsV2: graphQLConnection([]) } })
		: jsonResponse([]));
	const result = await execute(harness);
	assert.equal(result.details.result, "success");
	for (const name of OVERVIEW_SECTIONS) {
		assert.equal(result.details.overview.sections[name].status, "complete");
		assert.equal(result.details.overview.sections[name].returned, 0);
	}
});

test("overview preserves successful sections when Projects permissions and another reader fail", async (t) => {
	const harness = await setup(t, (call) => {
		if (call.url.pathname === "/graphql") return graphQLResponse({}, { errors: [{ type: "FORBIDDEN", message: `Denied ${TEST_TOKEN}` }] });
		if (call.url.pathname.endsWith("/labels")) return jsonResponse({ message: `Unavailable ${TEST_TOKEN}` }, { status: 503 });
		return defaultResponse(call);
	});
	const result = await execute(harness);
	assert.equal(result.details.result, "partial_success");
	assert.equal(result.details.status, "overview_partial");
	assert.equal(result.details.overview.sections.projects.status, "unavailable");
	assert.equal(result.details.overview.sections.labels.status, "unavailable");
	assert.equal(result.details.overview.sections.projects.returned, undefined);
	assert.equal(result.details.overview.sections.issues.status, "complete");
	assert.equal(result.details.issues.length, 1);
	assert.equal(result.details.projects, undefined);
	assertReadOnly(result);
});

test("overview reports all requested sections unavailable without prescribing cache repair", async (t) => {
	const harness = await setup(t, () => jsonResponse({ message: "Unavailable" }, { status: 503 }));
	const result = await execute(harness, { sections: ["issues", "labels"] });
	assert.equal(result.details.result, "error");
	assert.equal(result.details.status, "overview_unavailable");
	assertReadOnly(result);
});

test("overview isolates malformed collection responses and invalid JSON", async (t) => {
	const harness = await setup(t, (call) => {
		if (call.url.pathname.endsWith("/labels")) return jsonResponse([{ name: "" }]);
		if (call.url.pathname.endsWith("/issues")) return jsonResponse([githubIssue({ milestone: { number: 0 } })]);
		if (call.url.pathname.endsWith("/assignees")) return new Response("not json");
		return defaultResponse(call);
	});
	const result = await execute(harness);
	assert.equal(result.details.result, "partial_success");
	for (const name of ["issues", "labels", "assignees"]) assert.equal(result.details.overview.sections[name].status, "unavailable");
	assert.equal(result.details.overview.sections.milestones.status, "complete");
	assertReadOnly(result);
});

test("overview keeps authentication and HTTP rate limits fatal", async (t) => {
	for (const failure of [
		{ response: () => jsonResponse({ message: "Bad credentials" }, { status: 401 }), code: "github_api_error" },
		{ response: () => jsonResponse({}, { status: 403, headers: { "x-ratelimit-remaining": "0" } }), code: "github_rate_limit" },
		{ response: () => jsonResponse({}, { status: 429, headers: { "retry-after": "30" } }), code: "github_rate_limit" },
		{ response: () => jsonResponse({}, { status: 429 }), code: "github_api_error" },
	]) {
		const harness = await setup(t, failure.response);
		await assert.rejects(() => execute(harness), { code: failure.code });
		assert.equal(harness.calls.length, 5);
	}
});

test("overview keeps GraphQL rate-limit envelopes fatal even with partial data", async (t) => {
	for (const error of [{ type: "RATE_LIMITED" }, { extensions: { code: "RATE_LIMITED" } }]) {
		const harness = await setup(t, (call) => call.url.pathname === "/graphql"
			? graphQLResponse({ repository: { projectsV2: graphQLConnection([]) } }, { errors: [{ ...error, message: TEST_TOKEN }] })
			: defaultResponse(call));
		await assert.rejects(() => execute(harness), (failure) => {
			assert.equal(failure.code, "github_rate_limit");
			assert.doesNotMatch(failure.message, /ghp_issueme_test_token/);
			return true;
		});
	}
});

test("overview preserves fatal boundary errors instead of treating them as unavailable data", async (t) => {
	const harness = await setup(t, defaultResponse, { client: {
		repository: { owner: "owner", repo: "repo", fullName: "owner/repo" },
		listIssues() { throw new GitHubApiError("Refused boundary", { code: "github_boundary_violation" }); },
	} });
	await assert.rejects(() => execute(harness, { sections: ["issues"] }), { code: "github_boundary_violation" });
});

test("overview fails missing-token and invalid-repository setup before reads", async (t) => {
	const missingToken = await setup(t, defaultResponse, { token: undefined, env: {} });
	await assert.rejects(() => execute(missingToken), { code: "missing_github_token" });
	assert.equal(missingToken.calls.length, 0);
	const invalidRepository = await setup(t, defaultResponse, { repository: "invalid" });
	await assert.rejects(() => execute(invalidRepository), { code: "invalid_github_repository" });
	assert.equal(invalidRepository.calls.length, 0);
});

test("overview validates sections and limits before runtime resolution or requests", async () => {
	const pi = createFakePi();
	registerGetOverviewTool(pi, { runtime: () => { throw new Error("Runtime must not be read"); } });
	for (const params of [
		{ sections: [] }, { sections: ["issues", "issues"] }, { sections: ["unknown"] },
		{ sections: "issues" }, { sections: null }, { limit: 0 }, { limit: 26 }, { limit: 1.5 }, { limit: "10" }, { refresh: true },
	]) {
		await assert.rejects(() => execute({ pi, root: "/unused" }, params), { code: "invalid_tool_input" });
	}
});

test("overview refuses untrusted projects and cancellation without cache effects", async (t) => {
	const harness = await setup(t);
	await assert.rejects(() => execute(harness, {}, { context: createFakeToolContext(harness.root, { trusted: false }) }), { code: "project_untrusted" });
	const controller = new AbortController();
	controller.abort();
	await assert.rejects(() => execute(harness, {}, { signal: controller.signal }), { code: "github_request_aborted" });
	assert.equal(harness.calls.length, 0);
	const during = new AbortController();
	const inFlight = await setup(t, async (call) => {
		await new Promise((resolve) => setImmediate(resolve));
		during.abort();
		return defaultResponse(call);
	});
	await assert.rejects(() => execute(inFlight, {}, { signal: during.signal }), { code: "github_request_aborted" });
	assert.equal(inFlight.calls.length, 5);
	assert.deepEqual(await readdir(inFlight.root), []);
});

test("overview does not hide unexpected client errors as partial success", async (t) => {
	const harness = await setup(t, defaultResponse, { client: {
		repository: { owner: "owner", repo: "repo", fullName: "owner/repo" },
		listIssues() { throw new TypeError("Programming failure"); },
	} });
	await assert.rejects(() => execute(harness, { sections: ["issues"] }), /Programming failure/);
});

test("overview bounds issue collection values and redacts sensitive metadata before rendering", async (t) => {
	const harness = await setup(t, () => jsonResponse([githubIssue({
		title: `Title ${TEST_TOKEN}`,
		labels: [{ name: "x".repeat(10000) }, { name: TEST_TOKEN }],
		assignees: [{ login: "x".repeat(10000) }],
		milestone: undefined,
	})]));
	const result = await execute(harness, { sections: ["issues"] });
	assert.ok(result.details.issues[0].labels.every((label) => label.length <= 500));
	assert.ok(result.details.issues[0].assignees.every((login) => login.length <= 500));
	assert.equal(result.details.overview.sections.issues.status, "truncated");
	assertReadOnly(result);
});

test("overview bounds huge output while retaining every section and drill-down identities", async (t) => {
	const huge = "Long text ".repeat(500);
	const harness = await setup(t, (call) => {
		if (call.url.pathname === "/graphql") return graphQLResponse({ repository: { projectsV2: graphQLConnection(Array.from({ length: 25 }, (_, i) => projectV2Node({ number: i + 1, title: huge }))) } });
		if (call.url.pathname.endsWith("/issues")) return jsonResponse(Array.from({ length: 25 }, (_, i) => githubIssue({ number: i + 1, title: huge, milestone: { number: 7, title: huge } })));
		if (call.url.pathname.endsWith("/labels")) return jsonResponse(Array.from({ length: 25 }, (_, i) => githubLabel({ name: `label-${i}`, description: huge })));
		if (call.url.pathname.endsWith("/milestones")) return jsonResponse(Array.from({ length: 25 }, (_, i) => githubMilestone({ number: i + 1, title: huge })));
		return jsonResponse(Array.from({ length: 25 }, (_, i) => githubUser({ login: `user-${i}` })));
	});
	const result = await execute(harness, { limit: 25 });
	const text = result.content[0].text;
	assert.ok(text.length <= MAX_TOOL_TEXT_CHARS);
	assert.equal(result.details.truncated, true);
	for (const name of OVERVIEW_SECTIONS) assert.match(text, new RegExp(`${name}: 25 returned`));
	assert.equal(result.details.issues.length, 25);
	assert.ok(result.details.issues[0].title.length <= 500);
	assert.ok(result.details.issues[0].milestone.title.length <= 500);
	assert.equal(result.details.projects[24].id, "PVT_25");
	assert.equal(result.details.overview.sections.issues.displayTruncated, true);
	assert.match(text, /Display shortened/);
	assert.match(text, /Recheck targets before mutations/);
	assertReadOnly(result);
});
