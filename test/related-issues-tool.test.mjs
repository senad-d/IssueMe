import assert from "node:assert/strict";
import test from "node:test";

import { ClosedIssueMutationError, GitHubApiError, ISSUEME_ERROR_CODES } from "../src/errors.ts";
import { GitHubClient } from "../src/github/client.ts";
import { registerRelatedIssueTools } from "../src/tools/related-issues.ts";
import {
	createFakePi,
	createFetchRecorder,
	createNoNetworkFetch,
	executeRegisteredTool,
	githubIssue,
	jsonResponse,
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

function relatedServer(options = {}) {
	const issues = new Map((options.issues ?? []).map((issue) => [issue.number, issue]));
	const related = new Map(Object.entries(options.related ?? {}).map(([number, links]) => [Number(number), [...links]]));
	const mutations = [];
	const handler = (call) => {
		const path = call.url.pathname;
		const single = path.match(/^\/repos\/owner\/repo\/issues\/(\d+)$/);
		if (single && call.method === "GET") {
			const issue = issues.get(Number(single[1]));
			return issue ? jsonResponse(issue) : jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
		}
		const list = path.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/relates_to$/);
		if (list && call.method === "GET") {
			if (options.listStatus) return jsonResponse({ message: "Not Found" }, { status: options.listStatus, statusText: "Not Found" });
			const members = (related.get(Number(list[1])) ?? []).map((number) => issues.get(number) ?? number);
			const perPage = Number(call.url.searchParams.get("per_page") ?? "30");
			const page = Number(call.url.searchParams.get("page") ?? "1");
			const start = (page - 1) * perPage;
			const slice = members.slice(start, start + perPage);
			const headers = start + perPage < members.length ? { link: `<https://api.github.com/repos/owner/repo/issues/${list[1]}/relates_to?per_page=${perPage}&page=${page + 1}>; rel="next"` } : {};
			return jsonResponse(slice, { headers });
		}
		if (list && call.method === "POST") {
			mutations.push({ method: "POST", path, body: call.json });
			if (options.postStatus) return jsonResponse({ message: "Validation Failed" }, { status: options.postStatus, statusText: "Error" });
			if (options.postResponse) return jsonResponse(options.postResponse);
			const target = [...issues.values()].find((issue) => issue.id === call.json.issue_id);
			related.set(Number(list[1]), [...(related.get(Number(list[1])) ?? []), target.number]);
			return jsonResponse(target, { status: 201, statusText: "Created" });
		}
		const removal = path.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/relates_to\/(\d+)$/);
		if (removal && call.method === "DELETE") {
			mutations.push({ method: "DELETE", path });
			if (options.deleteStatus) return jsonResponse({ message: "Not Found" }, { status: options.deleteStatus, statusText: "Error" });
			const target = [...issues.values()].find((issue) => issue.id === Number(removal[2]));
			related.set(Number(removal[1]), (related.get(Number(removal[1])) ?? []).filter((number) => number !== target?.number));
			return jsonResponse(target);
		}
		throw new Error(`Unexpected request ${call.method} ${path}`);
	};
	return { handler, mutations, related };
}

async function relatedTools(server, configOverrides = {}) {
	const recorder = createFetchRecorder(server.handler);
	const pi = createFakePi();
	registerRelatedIssueTools(pi, { runtime: runtimeOptions({ fetchFn: recorder.fetchFn, config: configOverrides }) });
	return { pi, recorder, cwd: await tempProject() };
}

test("issueme_list_related_issues reads the native relates_to collection with scope omission, continuation, and explicit unavailability", async () => {
	const server = relatedServer({
		issues: [issueFixture(1, { state: "closed" }), issueFixture(2), issueFixture(3, { user: { login: "someone-else" } }), issueFixture(4), issueFixture(8, { repository_url: "https://api.github.com/repos/other/place" })],
		related: { 1: [2, 3, 4, 8] },
	});
	const { pi, recorder, cwd } = await relatedTools(server, { allowedIssueCreator: "octocat" });
	const first = await executeRegisteredTool(pi.tools, "issueme_list_related_issues", { issueNumber: 1, limit: 2 }, { cwd });
	assert.equal(first.details.result, "success");
	assert.equal(first.details.status, "list_related_issues");
	assert.equal(first.details.issue.state, "closed", "closed issues are readable");
	assert.deepEqual(first.details.relatedIssues.map((related) => related.number), [2]);
	assert.deepEqual(first.details.counts, { returned: 1, omittedOutOfScope: 1, limit: 2 });
	assert.equal(first.details.cacheUpdated, false);
	assert.ok(first.details.continuation.nextToken);
	const second = await executeRegisteredTool(pi.tools, "issueme_list_related_issues", { issueNumber: 1, limit: 2, after: first.details.continuation.nextToken }, { cwd });
	assert.deepEqual(second.details.relatedIssues.map((related) => [related.number, related.repository]), [[4, TEST_REPOSITORY], [8, "other/place"]]);
	assert.equal(second.details.continuation.complete, true);
	assert.match(second.content[0].text, /#8 \[open\] Issue 8 \(other\/place\)/);
	assert.match(second.content[0].text, /does not assume the reverse link/);
	assert.ok(recorder.calls.every((call) => call.method === "GET"));
	assert.doesNotMatch(JSON.stringify([first, second]), new RegExp(TEST_TOKEN));

	const unavailable = await relatedTools(relatedServer({ issues: [issueFixture(1)], listStatus: 404 }));
	await assert.rejects(() => executeRegisteredTool(unavailable.pi.tools, "issueme_list_related_issues", { issueNumber: 1 }, { cwd: unavailable.cwd }), (error) => error instanceof GitHubApiError && error.code === ISSUEME_ERROR_CODES.GITHUB_RELATED_ISSUES_UNSUPPORTED);
	const malformed = await relatedTools(relatedServer({ issues: [issueFixture(1)], related: { 1: [99] } }));
	await assert.rejects(() => executeRegisteredTool(malformed.pi.tools, "issueme_list_related_issues", { issueNumber: 1 }, { cwd: malformed.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID);
	const pullRequest = await relatedTools(relatedServer({ issues: [issueFixture(5, { pull_request: {} })] }));
	await assert.rejects(() => executeRegisteredTool(pullRequest.pi.tools, "issueme_list_related_issues", { issueNumber: 5 }, { cwd: pullRequest.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /pull request/.test(error.message));
});

test("issueme_add_related_issue and issueme_remove_related_issue mutate by database id with preflight, guards, and structured refusals", async () => {
	const server = relatedServer({ issues: [issueFixture(1), issueFixture(2), issueFixture(3)] });
	const { pi, recorder, cwd } = await relatedTools(server);
	const added = await executeRegisteredTool(pi.tools, "issueme_add_related_issue", { issueNumber: 1, relatedIssueNumber: 2 }, { cwd });
	assert.equal(added.details.result, "success");
	assert.equal(added.details.status, "related_issue_added");
	assert.deepEqual(added.details.changedFields, ["relates_to"]);
	assert.equal(added.details.relatedIssue.number, 2);
	assert.equal(added.details.relatedIssue.id, 1002);
	assert.deepEqual(server.mutations, [{ method: "POST", path: `${ISSUE_PATH}/1/relates_to`, body: { issue_id: 1002 } }]);
	assert.deepEqual(recorder.calls.map((call) => `${call.method} ${call.url.pathname}`), [`GET ${ISSUE_PATH}/1`, `GET ${ISSUE_PATH}/2`, `GET ${ISSUE_PATH}/1/relates_to`, `POST ${ISSUE_PATH}/1/relates_to`]);
	assert.match(added.content[0].text, /Added native related-issue link: #1 relates to #2/);
	assert.equal(added.details.cacheUpdated, false);

	const again = await executeRegisteredTool(pi.tools, "issueme_add_related_issue", { issueNumber: 1, relatedIssueNumber: 2 }, { cwd });
	assert.equal(again.details.status, "related_issue_already_present");
	assert.equal(server.mutations.length, 1);

	const removed = await executeRegisteredTool(pi.tools, "issueme_remove_related_issue", { issueNumber: 1, relatedIssueNumber: 2 }, { cwd });
	assert.equal(removed.details.status, "related_issue_removed");
	assert.deepEqual(server.mutations.at(-1), { method: "DELETE", path: `${ISSUE_PATH}/1/relates_to/1002` });
	assert.deepEqual(server.related.get(1), []);
	const absent = await executeRegisteredTool(pi.tools, "issueme_remove_related_issue", { issueNumber: 1, relatedIssueNumber: 3 }, { cwd });
	assert.equal(absent.details.status, "related_issue_already_absent");
	assert.equal(server.mutations.length, 2, "a verified absent link sends no DELETE");

	const noNetwork = createFakePi();
	registerRelatedIssueTools(noNetwork, { runtime: runtimeOptions({ fetchFn: createNoNetworkFetch() }) });
	await assert.rejects(() => executeRegisteredTool(noNetwork.tools, "issueme_add_related_issue", { issueNumber: 2, relatedIssueNumber: 2 }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /cannot relate to itself/.test(error.message));

	const guarded = await relatedTools(relatedServer({ issues: [issueFixture(1), issueFixture(4, { state: "closed" }), issueFixture(5, { pull_request: {} }), issueFixture(6, { user: { login: "someone-else" } })] }), { allowedIssueCreator: "octocat" });
	await assert.rejects(() => executeRegisteredTool(guarded.pi.tools, "issueme_add_related_issue", { issueNumber: 1, relatedIssueNumber: 4 }, { cwd: guarded.cwd }), (error) => error instanceof ClosedIssueMutationError && error.issueNumber === 4);
	await assert.rejects(() => executeRegisteredTool(guarded.pi.tools, "issueme_add_related_issue", { issueNumber: 1, relatedIssueNumber: 5 }, { cwd: guarded.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /relatedIssueNumber identifies a pull request/.test(error.message));
	await assert.rejects(() => executeRegisteredTool(guarded.pi.tools, "issueme_remove_related_issue", { issueNumber: 1, relatedIssueNumber: 6 }, { cwd: guarded.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.ISSUE_CREATOR_NOT_ALLOWED);

	const refused = await relatedTools(relatedServer({ issues: [issueFixture(1), issueFixture(2)], postStatus: 422 }));
	const refusal = await executeRegisteredTool(refused.pi.tools, "issueme_add_related_issue", { issueNumber: 1, relatedIssueNumber: 2 }, { cwd: refused.cwd });
	assert.equal(refusal.details.result, "error");
	assert.equal(refusal.details.status, "related_issue_refused");
	assert.equal(refusal.details.error.code, ISSUEME_ERROR_CODES.GITHUB_RELATED_ISSUE_REFUSED);
	const unsupported = await relatedTools(relatedServer({ issues: [issueFixture(1), issueFixture(2)], postStatus: 404 }));
	const unavailable = await executeRegisteredTool(unsupported.pi.tools, "issueme_add_related_issue", { issueNumber: 1, relatedIssueNumber: 2 }, { cwd: unsupported.cwd });
	assert.equal(unavailable.details.status, "related_issues_unsupported");
	const malformed = await relatedTools(relatedServer({ issues: [issueFixture(1), issueFixture(2)], postResponse: { ok: true } }));
	const partial = await executeRegisteredTool(malformed.pi.tools, "issueme_add_related_issue", { issueNumber: 1, relatedIssueNumber: 2 }, { cwd: malformed.cwd });
	assert.equal(partial.details.result, "partial_success");
	assert.equal(partial.details.status, "add_related_issue_response_partial_success");
	const reported = await relatedTools(relatedServer({ issues: [issueFixture(1), issueFixture(2)], related: { 1: [2] }, deleteStatus: 404 }));
	const inferred = await executeRegisteredTool(reported.pi.tools, "issueme_remove_related_issue", { issueNumber: 1, relatedIssueNumber: 2 }, { cwd: reported.cwd });
	assert.equal(inferred.details.status, "related_issue_already_absent");
	assert.match(inferred.content[0].text, /GitHub reported the link as not found/);
});

test("GitHubClient related-issue helpers keep dependency and sub-issue relationships untouched", async () => {
	const server = relatedServer({ issues: [issueFixture(1), issueFixture(2)] });
	const recorder = createFetchRecorder(server.handler);
	const client = new GitHubClient({ repository: TEST_REPOSITORY_OBJECT, token: TEST_TOKEN, fetchFn: recorder.fetchFn });
	const added = await client.addRelatedIssue(1, 2);
	assert.equal(added.status, "added");
	assert.equal(added.relatedIssueId, 1002);
	const removed = await client.removeRelatedIssue(1, 2);
	assert.equal(removed.status, "removed");
	assert.ok(recorder.calls.every((call) => !call.url.pathname.includes("/dependencies/") && call.url.pathname !== "/graphql"), "related-issue calls never touch dependency or sub-issue endpoints");
	await assert.rejects(() => client.addRelatedIssue(1, 1), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT);
});
