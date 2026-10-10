import assert from "node:assert/strict";
import test from "node:test";

import { ClosedIssueMutationError, GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../src/errors.ts";
import { GitHubClient } from "../src/github/client.ts";
import { dependencyMemberRepository, normalizeIssueDependencySummary, requireIssueDatabaseId } from "../src/github/issue-dependencies-client.ts";
import { registerIssueDependencyTools } from "../src/tools/issue-dependencies.ts";
import {
	createFakePi,
	createFetchRecorder,
	createNoNetworkFetch,
	executeRegisteredTool,
	githubIssue,
	jsonResponse,
	noContentResponse,
	runtimeOptions,
	tempProject,
	TEST_REPOSITORY,
	TEST_REPOSITORY_OBJECT,
	TEST_TOKEN,
} from "./helpers/issueme-test-helpers.mjs";

const ISSUE_PATH = "/repos/owner/repo/issues";

function issueFixture(number, overrides = {}) {
	return githubIssue({ number, id: 1000 + number, title: `Issue ${number}`, repository_url: `https://api.github.com/repos/${TEST_REPOSITORY}`, ...overrides });
}

/** In-memory dependency server: issues by number, blocked_by edges by dependent number, with pagination and recorded mutations. */
function dependencyServer(options = {}) {
	const issues = new Map((options.issues ?? []).map((issue) => [issue.number, issue]));
	const blockedBy = new Map(Object.entries(options.blockedBy ?? {}).map(([number, blockers]) => [Number(number), [...blockers]]));
	const mutations = [];
	const handler = (call) => {
		const path = call.url.pathname;
		const single = path.match(/^\/repos\/owner\/repo\/issues\/(\d+)$/);
		if (single && call.method === "GET") {
			const issue = issues.get(Number(single[1]));
			return issue ? jsonResponse(issue) : jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
		}
		const list = path.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/dependencies\/(blocked_by|blocking)$/);
		if (list && call.method === "GET") {
			if (options.listStatus) return jsonResponse({ message: "Not Found" }, { status: options.listStatus, statusText: "Not Found" });
			const number = Number(list[1]);
			const members = list[2] === "blocked_by"
				? (blockedBy.get(number) ?? []).map((blocker) => issues.get(blocker) ?? blocker)
				: [...blockedBy.entries()].filter(([, blockers]) => blockers.includes(number)).map(([dependent]) => issues.get(dependent));
			const perPage = Number(call.url.searchParams.get("per_page") ?? "30");
			const page = Number(call.url.searchParams.get("page") ?? "1");
			const start = (page - 1) * perPage;
			const slice = members.slice(start, start + perPage);
			const headers = start + perPage < members.length ? { link: `<https://api.github.com/repos/owner/repo/issues/${number}/dependencies/${list[2]}?per_page=${perPage}&page=${page + 1}>; rel="next"` } : {};
			return jsonResponse(slice, { headers });
		}
		if (list && call.method === "POST") {
			mutations.push({ method: "POST", path, body: call.json });
			if (options.postStatus) return jsonResponse({ message: options.postMessage ?? "Validation Failed" }, { status: options.postStatus, statusText: "Unprocessable Entity" });
			if (options.postResponse) return jsonResponse(options.postResponse);
			const dependent = Number(list[1]);
			const blocker = [...issues.values()].find((issue) => issue.id === call.json.issue_id);
			blockedBy.set(dependent, [...(blockedBy.get(dependent) ?? []), blocker.number]);
			return jsonResponse(blocker, { status: 201, statusText: "Created" });
		}
		const removal = path.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/dependencies\/blocked_by\/(\d+)$/);
		if (removal && call.method === "DELETE") {
			mutations.push({ method: "DELETE", path });
			if (options.deleteStatus) return jsonResponse({ message: "Not Found" }, { status: options.deleteStatus, statusText: "Error" });
			const dependent = Number(removal[1]);
			const blocker = [...issues.values()].find((issue) => issue.id === Number(removal[2]));
			blockedBy.set(dependent, (blockedBy.get(dependent) ?? []).filter((number) => number !== blocker?.number));
			return options.deleteNoContent ? noContentResponse() : jsonResponse(blocker);
		}
		throw new Error(`Unexpected request ${call.method} ${path}`);
	};
	return { handler, mutations, blockedBy };
}

async function dependencyTools(server, configOverrides = {}) {
	const recorder = createFetchRecorder(server.handler);
	const pi = createFakePi();
	registerIssueDependencyTools(pi, { runtime: runtimeOptions({ fetchFn: recorder.fetchFn, config: configOverrides }) });
	return { pi, recorder, cwd: await tempProject() };
}

function clientFor(handler) {
	const recorder = createFetchRecorder(handler);
	return { ...recorder, client: new GitHubClient({ repository: TEST_REPOSITORY_OBJECT, token: TEST_TOKEN, fetchFn: recorder.fetchFn }) };
}

function assertNoToken(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TEST_TOKEN));
}

test("dependency client helpers resolve database ids and member repositories without confusing numbers or node ids", () => {
	assert.equal(requireIssueDatabaseId(issueFixture(7), "blocking issue"), 1007);
	assert.throws(() => requireIssueDatabaseId(githubIssue({ number: 7, id: undefined }), "blocking issue"), (error) => error instanceof GitHubApiError && error.code === ISSUEME_ERROR_CODES.GITHUB_ISSUE_SHAPE_INVALID);
	assert.throws(() => requireIssueDatabaseId(githubIssue({ number: 7, id: "I_7" }), "blocking issue"), (error) => error.code === ISSUEME_ERROR_CODES.GITHUB_ISSUE_SHAPE_INVALID);
	assert.equal(dependencyMemberRepository(issueFixture(1)), TEST_REPOSITORY);
	assert.equal(dependencyMemberRepository(githubIssue({ number: 1, repository_url: "https://api.github.com/repos/other/place" })), "other/place");
	assert.equal(dependencyMemberRepository(githubIssue({ number: 1, repository_url: "not a url", html_url: "https://github.com/some/where/issues/1" })), "some/where");
	assert.equal(dependencyMemberRepository(githubIssue({ number: 1, repository_url: undefined, html_url: "https://evil.example/owner/repo/issues/1" })), undefined);
	const summary = normalizeIssueDependencySummary(issueFixture(9, { state: "closed", user: { login: "hubot" } }), "blocking", TEST_REPOSITORY_OBJECT);
	assert.deepEqual(summary, { direction: "blocking", number: 9, title: "Issue 9", html_url: `https://github.com/${TEST_REPOSITORY}/issues/9`, repository: TEST_REPOSITORY, state: "closed", creator: "hubot", id: 1009 });
	assert.throws(() => normalizeIssueDependencySummary({ title: "no number" }, "blocked_by", TEST_REPOSITORY_OBJECT), (error) => error.code === ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID);
});

test("issueme_list_issue_dependencies reads both directions, marks foreign repositories, omits out-of-scope members, and stays read-only", async () => {
	const server = dependencyServer({
		issues: [issueFixture(1), issueFixture(2), issueFixture(3, { user: { login: "someone-else" } }), issueFixture(4, { state: "closed" }), issueFixture(8, { repository_url: "https://api.github.com/repos/other/place", html_url: "https://github.com/other/place/issues/8" })],
		blockedBy: { 1: [2, 3, 8], 4: [1] },
	});
	const { pi, recorder, cwd } = await dependencyTools(server, { allowedIssueCreator: "octocat" });
	const result = await executeRegisteredTool(pi.tools, "issueme_list_issue_dependencies", { issueNumber: 1 }, { cwd });
	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "list_issue_dependencies");
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, false);
	assert.equal(result.details.issue.number, 1);
	assert.deepEqual(result.details.dependencies.map((dependency) => [dependency.direction, dependency.number, dependency.repository]), [["blocked_by", 2, TEST_REPOSITORY], ["blocked_by", 8, "other/place"], ["blocking", 4, TEST_REPOSITORY]]);
	assert.equal(result.details.dependencies[0].id, 1002);
	assert.deepEqual(result.details.counts, { blockedBy: 2, blocking: 1, omittedOutOfScope: 1, limit: 25 });
	assert.equal(result.details.continuation, undefined);
	assert.match(result.content[0].text, /Blocked by \(2\):/);
	assert.match(result.content[0].text, /#8 \[open\] Issue 8 \(other\/place\)/);
	assert.match(result.content[0].text, /Blocking \(1\):/);
	assert.match(result.content[0].text, /1 dependency\(ies\) omitted/);
	assert.match(result.content[0].text, /read-only/);
	assert.deepEqual(recorder.calls.map((call) => `${call.method} ${call.url.pathname}`), [`GET ${ISSUE_PATH}/1`, `GET ${ISSUE_PATH}/1/dependencies/blocked_by`, `GET ${ISSUE_PATH}/1/dependencies/blocking`]);
	assertNoToken(result);

	const empty = await executeRegisteredTool(pi.tools, "issueme_list_issue_dependencies", { issueNumber: 2, direction: "blocked_by" }, { cwd });
	assert.deepEqual(empty.details.dependencies, []);
	assert.equal(empty.details.continuation.complete, true);
	assert.match(empty.content[0].text, /Blocked by \(0\):\n- none/);
});

test("issueme_list_issue_dependencies supports single-direction continuation and refuses tokens with both directions", async () => {
	const server = dependencyServer({ issues: [issueFixture(1), issueFixture(2), issueFixture(3), issueFixture(5), issueFixture(6)], blockedBy: { 1: [2, 3, 5, 6] } });
	const { pi, cwd } = await dependencyTools(server);
	const first = await executeRegisteredTool(pi.tools, "issueme_list_issue_dependencies", { issueNumber: 1, direction: "blocked_by", limit: 3 }, { cwd });
	assert.deepEqual(first.details.dependencies.map((dependency) => dependency.number), [2, 3, 5]);
	assert.equal(first.details.truncated, true);
	assert.equal(first.details.continuation.collection, "dependencies_blocked_by");
	assert.ok(first.details.continuation.nextToken);
	const second = await executeRegisteredTool(pi.tools, "issueme_list_issue_dependencies", { issueNumber: 1, direction: "blocked_by", limit: 3, after: first.details.continuation.nextToken }, { cwd });
	assert.deepEqual(second.details.dependencies.map((dependency) => dependency.number), [6]);
	assert.equal(second.details.continuation.complete, true);

	const both = await executeRegisteredTool(pi.tools, "issueme_list_issue_dependencies", { issueNumber: 1, limit: 3 }, { cwd });
	assert.equal(both.details.truncated, true);
	assert.deepEqual(both.details.truncation, { blocked_by: { shown: 3, max: 3 } });
	assert.match(both.content[0].text, /rerun with direction blocked_by/);
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_list_issue_dependencies", { issueNumber: 1, after: first.details.continuation.nextToken }, { cwd }), (error) => error instanceof IssueMeError && error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /single|one dependency collection/.test(error.message));
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_list_issue_dependencies", { issueNumber: 1, direction: "blocking", after: first.details.continuation.nextToken }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.CONTINUATION_TOKEN_INVALID);
});

test("issueme_list_issue_dependencies distinguishes unavailable features, malformed members, pull requests, and out-of-scope issues", async () => {
	const unavailable = await dependencyTools(dependencyServer({ issues: [issueFixture(1)], listStatus: 404 }));
	await assert.rejects(() => executeRegisteredTool(unavailable.pi.tools, "issueme_list_issue_dependencies", { issueNumber: 1 }, { cwd: unavailable.cwd }), (error) => {
		assert.ok(error instanceof GitHubApiError);
		assert.equal(error.code, ISSUEME_ERROR_CODES.GITHUB_ISSUE_DEPENDENCIES_UNSUPPORTED);
		assert.match(error.message, /did not fall back to body-text/);
		return true;
	});

	const malformed = await dependencyTools(dependencyServer({ issues: [issueFixture(1)], blockedBy: { 1: [99] } }));
	await assert.rejects(() => executeRegisteredTool(malformed.pi.tools, "issueme_list_issue_dependencies", { issueNumber: 1 }, { cwd: malformed.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID);

	const pullRequest = await dependencyTools(dependencyServer({ issues: [issueFixture(5, { pull_request: {} })] }));
	await assert.rejects(() => executeRegisteredTool(pullRequest.pi.tools, "issueme_list_issue_dependencies", { issueNumber: 5 }, { cwd: pullRequest.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /pull request/.test(error.message));
	assert.equal(pullRequest.recorder.calls.length, 1);

	const scoped = await dependencyTools(dependencyServer({ issues: [issueFixture(1, { user: { login: "someone-else" } })] }), { allowedIssueCreator: "octocat" });
	await assert.rejects(() => executeRegisteredTool(scoped.pi.tools, "issueme_list_issue_dependencies", { issueNumber: 1 }, { cwd: scoped.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.ISSUE_CREATOR_NOT_ALLOWED);
	assert.equal(scoped.recorder.calls.length, 1, "no dependency collection is read for an out-of-scope issue");
});

test("issueme_add_issue_dependency posts the blocking issue database id after open, scope, and preflight checks", async () => {
	const server = dependencyServer({ issues: [issueFixture(1), issueFixture(2)] });
	const { pi, recorder, cwd } = await dependencyTools(server);
	const result = await executeRegisteredTool(pi.tools, "issueme_add_issue_dependency", { issueNumber: 1, blockingIssueNumber: 2 }, { cwd });
	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "dependency_added");
	assert.equal(result.details.issue.number, 1);
	assert.deepEqual(result.details.dependency, { direction: "blocked_by", number: 2, title: "Issue 2", html_url: `https://github.com/${TEST_REPOSITORY}/issues/2`, repository: TEST_REPOSITORY, state: "open", creator: "octocat", id: 1002 });
	assert.deepEqual(result.details.changedFields, ["blocked_by"]);
	assert.deepEqual(result.details.counts, { changed: 1 });
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, false);
	assert.deepEqual(server.mutations, [{ method: "POST", path: `${ISSUE_PATH}/1/dependencies/blocked_by`, body: { issue_id: 1002 } }]);
	assert.deepEqual(recorder.calls.map((call) => `${call.method} ${call.url.pathname}`), [
		`GET ${ISSUE_PATH}/1`,
		`GET ${ISSUE_PATH}/2`,
		`GET ${ISSUE_PATH}/1/dependencies/blocked_by`,
		`POST ${ISSUE_PATH}/1/dependencies/blocked_by`,
	]);
	assert.match(result.content[0].text, /Added native dependency: #1 blocked by #2/);
	assert.match(result.content[0].text, /database id: 1002/);
	assertNoToken(result);

	const again = await executeRegisteredTool(pi.tools, "issueme_add_issue_dependency", { issueNumber: 1, blockingIssueNumber: 2 }, { cwd });
	assert.equal(again.details.status, "dependency_already_present");
	assert.deepEqual(again.details.changedFields, []);
	assert.deepEqual(again.details.counts, { changed: 0 });
	assert.equal(server.mutations.length, 1, "an existing edge is never re-posted");
});

test("issueme_add_issue_dependency refuses self, closed, pull-request, and out-of-scope endpoints before mutating", async () => {
	const noNetwork = createFakePi();
	registerIssueDependencyTools(noNetwork, { runtime: runtimeOptions({ fetchFn: createNoNetworkFetch() }) });
	const cwd = await tempProject();
	await assert.rejects(() => executeRegisteredTool(noNetwork.tools, "issueme_add_issue_dependency", { issueNumber: 3, blockingIssueNumber: 3 }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /cannot block itself/.test(error.message));

	const server = dependencyServer({
		issues: [issueFixture(1), issueFixture(2), issueFixture(4, { state: "closed" }), issueFixture(5, { pull_request: {} }), issueFixture(6, { user: { login: "someone-else" } })],
	});
	const { pi, cwd: root } = await dependencyTools(server, { allowedIssueCreator: "octocat" });
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_add_issue_dependency", { issueNumber: 4, blockingIssueNumber: 2 }, { cwd: root }), (error) => error instanceof ClosedIssueMutationError && error.issueNumber === 4);
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_add_issue_dependency", { issueNumber: 1, blockingIssueNumber: 4 }, { cwd: root }), (error) => error instanceof ClosedIssueMutationError && error.issueNumber === 4);
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_add_issue_dependency", { issueNumber: 1, blockingIssueNumber: 5 }, { cwd: root }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /blockingIssueNumber identifies a pull request/.test(error.message));
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_add_issue_dependency", { issueNumber: 1, blockingIssueNumber: 6 }, { cwd: root }), (error) => error.code === ISSUEME_ERROR_CODES.ISSUE_CREATOR_NOT_ALLOWED);
	assert.deepEqual(server.mutations, []);

	const controller = new AbortController();
	controller.abort();
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_add_issue_dependency", { issueNumber: 1, blockingIssueNumber: 2 }, { cwd: root, signal: controller.signal }), (error) => error.code === ISSUEME_ERROR_CODES.GITHUB_REQUEST_ABORTED);
	assert.deepEqual(server.mutations, []);
});

test("issueme_add_issue_dependency reports GitHub refusals and unavailable features as structured errors and malformed acceptance as partial success", async () => {
	const refused = await dependencyTools(dependencyServer({ issues: [issueFixture(1), issueFixture(2)], postStatus: 422, postMessage: "Validation Failed: dependency would create a cycle" }));
	const refusal = await executeRegisteredTool(refused.pi.tools, "issueme_add_issue_dependency", { issueNumber: 1, blockingIssueNumber: 2 }, { cwd: refused.cwd });
	assert.equal(refusal.details.result, "error");
	assert.equal(refusal.details.status, "dependency_refused");
	assert.equal(refusal.details.error.code, ISSUEME_ERROR_CODES.GITHUB_ISSUE_DEPENDENCY_REFUSED);
	assert.equal(refusal.details.error.details.mutationSettlement, "no_remote_success_known");
	assert.deepEqual(refusal.details.changedFields, []);
	assert.match(refusal.content[0].text, /cycle/);
	assert.match(refusal.details.error.recoveryHint, /issueme_list_issue_dependencies/);

	const unavailable = await dependencyTools(dependencyServer({ issues: [issueFixture(1), issueFixture(2)], postStatus: 404 }));
	const unsupported = await executeRegisteredTool(unavailable.pi.tools, "issueme_add_issue_dependency", { issueNumber: 1, blockingIssueNumber: 2 }, { cwd: unavailable.cwd });
	assert.equal(unsupported.details.result, "error");
	assert.equal(unsupported.details.status, "dependencies_unsupported");
	assert.equal(unsupported.details.error.code, ISSUEME_ERROR_CODES.GITHUB_ISSUE_DEPENDENCIES_UNSUPPORTED);

	const forbidden = await dependencyTools(dependencyServer({ issues: [issueFixture(1), issueFixture(2)], postStatus: 403, postMessage: "Resource not accessible by integration" }));
	await assert.rejects(() => executeRegisteredTool(forbidden.pi.tools, "issueme_add_issue_dependency", { issueNumber: 1, blockingIssueNumber: 2 }, { cwd: forbidden.cwd }), (error) => error instanceof GitHubApiError && error.status === 403);

	const malformed = await dependencyTools(dependencyServer({ issues: [issueFixture(1), issueFixture(2)], postResponse: { ok: true } }));
	const partial = await executeRegisteredTool(malformed.pi.tools, "issueme_add_issue_dependency", { issueNumber: 1, blockingIssueNumber: 2 }, { cwd: malformed.cwd });
	assert.equal(partial.details.result, "partial_success");
	assert.equal(partial.details.status, "add_issue_dependency_response_partial_success");
	assert.equal(partial.details.needsSync, true);
	assert.equal(partial.details.error.details.mutationSettlement, "remote_success_known");
	assert.match(partial.content[0].text, /Retry-safe guidance/);
});

test("issueme_remove_issue_dependency deletes by database id, treats verified or reported absence as a no-op, and keeps refusals structured", async () => {
	const server = dependencyServer({ issues: [issueFixture(1), issueFixture(2), issueFixture(3)], blockedBy: { 1: [2] } });
	const { pi, cwd } = await dependencyTools(server);
	const removed = await executeRegisteredTool(pi.tools, "issueme_remove_issue_dependency", { issueNumber: 1, blockingIssueNumber: 2 }, { cwd });
	assert.equal(removed.details.result, "success");
	assert.equal(removed.details.status, "dependency_removed");
	assert.deepEqual(removed.details.changedFields, ["blocked_by"]);
	assert.equal(removed.details.dependency.number, 2);
	assert.deepEqual(server.mutations, [{ method: "DELETE", path: `${ISSUE_PATH}/1/dependencies/blocked_by/1002` }]);
	assert.deepEqual(server.blockedBy.get(1), []);
	assert.match(removed.content[0].text, /Removed native dependency: #1 blocked by #2/);

	const absent = await executeRegisteredTool(pi.tools, "issueme_remove_issue_dependency", { issueNumber: 1, blockingIssueNumber: 3 }, { cwd });
	assert.equal(absent.details.status, "dependency_already_absent");
	assert.deepEqual(absent.details.changedFields, []);
	assert.equal(server.mutations.length, 1, "a verified absent edge sends no DELETE");

	const reported = await dependencyTools(dependencyServer({ issues: [issueFixture(1), issueFixture(2)], blockedBy: { 1: [2] }, deleteStatus: 404 }));
	const inferred = await executeRegisteredTool(reported.pi.tools, "issueme_remove_issue_dependency", { issueNumber: 1, blockingIssueNumber: 2 }, { cwd: reported.cwd });
	assert.equal(inferred.details.status, "dependency_already_absent");
	assert.match(inferred.content[0].text, /GitHub reported the dependency as not found/);

	const noContent = await dependencyTools(dependencyServer({ issues: [issueFixture(1), issueFixture(2)], blockedBy: { 1: [2] }, deleteNoContent: true }));
	const removedNoContent = await executeRegisteredTool(noContent.pi.tools, "issueme_remove_issue_dependency", { issueNumber: 1, blockingIssueNumber: 2 }, { cwd: noContent.cwd });
	assert.equal(removedNoContent.details.status, "dependency_removed");

	const refused = await dependencyTools(dependencyServer({ issues: [issueFixture(1), issueFixture(2)], blockedBy: { 1: [2] }, deleteStatus: 422 }));
	const refusal = await executeRegisteredTool(refused.pi.tools, "issueme_remove_issue_dependency", { issueNumber: 1, blockingIssueNumber: 2 }, { cwd: refused.cwd });
	assert.equal(refusal.details.result, "error");
	assert.equal(refusal.details.status, "dependency_refused");

	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_remove_issue_dependency", { issueNumber: 2, blockingIssueNumber: 2 }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT);
});

test("GitHubClient dependency helpers scan a bounded preflight and expose convenience add/remove that recheck both issues", async () => {
	const members = Array.from({ length: 7 }, (_, index) => issueFixture(20 + index));
	const harness = clientFor(dependencyServer({ issues: [issueFixture(1), issueFixture(2), ...members], blockedBy: { 1: members.map((issue) => issue.number) } }).handler);
	const found = await harness.client.findIssueDependency(1, "blocked_by", 1026);
	assert.equal(found.issue.number, 26);
	assert.equal(found.complete, true);
	const missing = await harness.client.findIssueDependency(1, "blocked_by", 9999);
	assert.equal(missing.issue, undefined);
	assert.equal(missing.complete, true);
	assert.ok(harness.calls.every((call) => call.url.searchParams.get("per_page") === "1"), "preflight scans use single-member pages with a filter");

	const added = await harness.client.addIssueDependency(1, 2);
	assert.equal(added.status, "added");
	assert.equal(added.blockingIssueId, 1002);
	assert.deepEqual(harness.calls.slice(-1)[0].json, { issue_id: 1002 });
	const removed = await harness.client.removeIssueDependency(1, 2);
	assert.equal(removed.status, "removed");
	await assert.rejects(() => harness.client.addIssueDependency(1, 1), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT);
	await assert.rejects(() => harness.client.listIssueDependencies(1, "sideways"), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT);
});
