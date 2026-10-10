import assert from "node:assert/strict";
import test from "node:test";

import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../src/errors.ts";
import { normalizeTimelineEventSummary, normalizeTimelineEventTypes } from "../src/github/issue-timeline-client.ts";
import { registerListIssueTimelineTool } from "../src/tools/issue-timeline.ts";
import {
	createFakePi,
	createFetchRecorder,
	createNoNetworkFetch,
	executeRegisteredTool,
	githubIssue,
	jsonResponse,
	runtimeOptions,
	tempProject,
	TEST_TOKEN,
} from "./helpers/issueme-test-helpers.mjs";

const SECRET_BODY = `private comment body ${TEST_TOKEN}`;

function events() {
	return [
		{ event: "labeled", id: 1, actor: { login: "octocat" }, created_at: "2026-06-01T00:00:00Z", label: { name: "bug", color: "d73a4a" } },
		{ event: "assigned", id: 2, actor: { login: "octocat" }, created_at: "2026-06-02T00:00:00Z", assignee: { login: "hubot" } },
		{ event: "milestoned", id: 3, actor: { login: "octocat" }, created_at: "2026-06-03T00:00:00Z", milestone: { title: "v1.0" } },
		{ event: "renamed", id: 4, actor: null, created_at: "2026-06-04T00:00:00Z", rename: { from: "Old title", to: "New title" } },
		{ event: "commented", id: 500, user: { login: "hubot" }, created_at: "2026-06-05T00:00:00Z", body: SECRET_BODY, html_url: "https://github.com/owner/repo/issues/1#issuecomment-500" },
		{ event: "closed", id: 6, actor: { login: "octocat" }, created_at: "2026-06-06T00:00:00Z", state_reason: "completed" },
		{ event: "reopened", id: 7, actor: { login: "octocat" }, created_at: "2026-06-07T00:00:00Z" },
		{ event: "cross-referenced", actor: { login: "hubot" }, created_at: "2026-06-08T00:00:00Z", source: { type: "issue", issue: { number: 42, repository: { full_name: "owner/repo" }, pull_request: {} } } },
		{ event: "issue_type_changed", id: 9, actor: { login: "octocat" }, created_at: "2026-06-09T00:00:00Z", issue_type: { name: "Bug" }, prev_issue_type: { name: "Task" } },
		{ event: "blocked_by_added", id: 10, actor: { login: "octocat" }, created_at: "2026-06-10T00:00:00Z", blocked_by: { number: 7 } },
		{ event: "committed", sha: "abc123", author: { name: "octocat" }, message: "Fix the thing\n\nLong body", created_at: "2026-06-11T00:00:00Z" },
		{ event: "quantum_entangled", id: 12, actor: { login: "octocat" }, created_at: "2026-06-12T00:00:00Z", payload: { secret: SECRET_BODY } },
		// Shapes observed live on 2026-10-10: relates_to events carry no related-issue reference.
		{ event: "relates_to_added", id: 13, actor: { login: "octocat" }, created_at: "2026-06-13T00:00:00Z" },
		{ event: "relates_to_removed", id: 14, actor: { login: "octocat" }, created_at: "2026-06-14T00:00:00Z" },
	];
}

function timelineServer(options = {}) {
	const items = options.events ?? events();
	return (call) => {
		const path = call.url.pathname;
		if (path === "/repos/owner/repo/issues/1") return jsonResponse(options.issue ?? githubIssue({ number: 1, state: "closed" }));
		if (path === "/repos/owner/repo/issues/5") return jsonResponse(githubIssue({ number: 5, pull_request: {} }));
		if (path === "/repos/owner/repo/issues/1/timeline") {
			if (options.status) return jsonResponse({ message: "Forbidden" }, { status: options.status, statusText: "Forbidden" });
			const perPage = Number(call.url.searchParams.get("per_page") ?? "30");
			const page = Number(call.url.searchParams.get("page") ?? "1");
			const start = (page - 1) * perPage;
			const slice = items.slice(start, start + perPage);
			const headers = start + perPage < items.length ? { link: `<https://api.github.com/repos/owner/repo/issues/1/timeline?per_page=${perPage}&page=${page + 1}>; rel="next"` } : {};
			return jsonResponse(slice, { headers });
		}
		throw new Error(`Unexpected request ${call.method} ${path}`);
	};
}

async function timelineTools(handler, configOverrides = {}) {
	const recorder = createFetchRecorder(handler);
	const pi = createFakePi();
	registerListIssueTimelineTool(pi, { runtime: runtimeOptions({ fetchFn: recorder.fetchFn, config: configOverrides }) });
	return { pi, recorder, cwd: await tempProject() };
}

test("timeline normalizers produce bounded typed metadata, flag unfamiliar events, and never carry raw payloads", () => {
	const summaries = events().map(normalizeTimelineEventSummary);
	assert.deepEqual(summaries[0], { event: "labeled", id: 1, actor: "octocat", createdAt: "2026-06-01T00:00:00Z", metadata: { label: "bug" } });
	assert.deepEqual(summaries[1].metadata, { assignee: "hubot" });
	assert.deepEqual(summaries[2].metadata, { milestone: "v1.0" });
	assert.deepEqual(summaries[3], { event: "renamed", id: 4, actorDeleted: true, createdAt: "2026-06-04T00:00:00Z", metadata: { from: "Old title", to: "New title" } });
	assert.deepEqual(summaries[4], { event: "commented", id: 500, actor: "hubot", createdAt: "2026-06-05T00:00:00Z", metadata: { commentId: 500, commentUrl: "https://github.com/owner/repo/issues/1#issuecomment-500" } });
	assert.deepEqual(summaries[5].metadata, { stateReason: "completed", commitId: null });
	assert.deepEqual(summaries[6].metadata, { stateReason: null, commitId: null });
	assert.deepEqual(summaries[7].metadata, { sourceType: "issue", sourceNumber: 42, sourceRepository: "owner/repo", sourceIsPullRequest: true });
	assert.deepEqual(summaries[8].metadata, { issueType: "Bug", previousIssueType: "Task" });
	assert.deepEqual(summaries[9].metadata, { blockedBy: 7 });
	assert.deepEqual(summaries[10].metadata, { sha: "abc123", message: "Fix the thing" });
	assert.deepEqual(summaries[11], { event: "quantum_entangled", id: 12, actor: "octocat", createdAt: "2026-06-12T00:00:00Z", unfamiliar: true });
	assert.deepEqual(summaries[12], { event: "relates_to_added", id: 13, actor: "octocat", createdAt: "2026-06-13T00:00:00Z" }, "relates_to events are known and carry no metadata");
	assert.equal(summaries[13].unfamiliar, undefined);
	assert.doesNotMatch(JSON.stringify(summaries), new RegExp(TEST_TOKEN));
	assert.doesNotMatch(JSON.stringify(summaries), /private comment body/);

	const long = normalizeTimelineEventSummary({ event: "renamed", rename: { from: "x".repeat(300), to: "y" } });
	assert.equal(long.metadata.from.length, 200);
	assert.deepEqual(normalizeTimelineEventTypes([" Labeled ", "closed", "labeled"]), ["closed", "labeled"]);
	assert.deepEqual(normalizeTimelineEventTypes(["SUB_ISSUE_REMOVED", "sub_issue_added", "closed", "sub_issue_added"]), ["closed", "sub_issue_added", "sub_issue_removed"]);
	assert.equal(normalizeTimelineEventTypes(undefined), undefined);
	assert.equal(normalizeTimelineEventTypes([" "]), undefined);
	assert.throws(() => normalizeTimelineEventTypes(["not a name"]), (error) => error instanceof IssueMeError && error.safeDetails.field === "eventTypes");
	assert.throws(() => normalizeTimelineEventSummary({ id: 1 }), (error) => error instanceof GitHubApiError && error.code === ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID);
});

test("issueme_list_issue_timeline reads closed-issue history with actors, counts, filters, and continuation", async () => {
	const { pi, recorder, cwd } = await timelineTools(timelineServer());
	const result = await executeRegisteredTool(pi.tools, "issueme_list_issue_timeline", { issueNumber: 1, limit: 5 }, { cwd });
	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "list_issue_timeline");
	assert.equal(result.details.issue.state, "closed");
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, false);
	assert.deepEqual(result.details.timeline.map((event) => event.event), ["labeled", "assigned", "milestoned", "renamed", "commented"]);
	assert.deepEqual(result.details.counts, { returned: 5, unfamiliar: 0, deletedActors: 1, limit: 5, labeled: 1, assigned: 1, milestoned: 1, renamed: 1, commented: 1 });
	assert.equal(result.details.truncated, true);
	assert.equal(result.details.continuation.collection, "issue_timeline");
	assert.match(result.content[0].text, /- 2026-06-01T00:00:00Z labeled by octocat: label=bug/);
	assert.match(result.content[0].text, /renamed by deleted user: from=Old title, to=New title/);
	assert.match(result.content[0].text, /commented by hubot: commentId=500/);
	assert.doesNotMatch(JSON.stringify(result), /private comment body/);
	assert.doesNotMatch(JSON.stringify(result), new RegExp(TEST_TOKEN));

	const pages = [result];
	while (pages.at(-1).details.continuation.nextToken) {
		pages.push(await executeRegisteredTool(pi.tools, "issueme_list_issue_timeline", { issueNumber: 1, limit: 5, after: pages.at(-1).details.continuation.nextToken }, { cwd }));
	}
	assert.equal(pages.length, 3);
	assert.deepEqual(pages.flatMap((page) => page.details.timeline.map((event) => event.event)), events().map((event) => event.event));
	assert.equal(pages.at(-1).details.counts.unfamiliar, 1);
	assert.match(pages.at(-1).content[0].text, /quantum_entangled by octocat \[unfamiliar event type; details omitted\]/);
	assert.ok(recorder.calls.every((call) => call.method === "GET"));

	const filtered = await executeRegisteredTool(pi.tools, "issueme_list_issue_timeline", { issueNumber: 1, eventTypes: ["closed", "reopened"], limit: 10 }, { cwd });
	assert.deepEqual(filtered.details.timeline.map((event) => event.event), ["closed", "reopened"]);
	assert.equal(filtered.details.continuation.complete, true);
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_list_issue_timeline", { issueNumber: 1, limit: 5, after: filtered.details.continuation.nextToken ?? result.details.continuation.nextToken, eventTypes: ["closed"] }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.CONTINUATION_TOKEN_INVALID);
});

test("issueme_list_issue_timeline handles empty histories, pull requests, scope, malformed events, and permission failures", async () => {
	const empty = await timelineTools(timelineServer({ events: [] }));
	const none = await executeRegisteredTool(empty.pi.tools, "issueme_list_issue_timeline", { issueNumber: 1 }, { cwd: empty.cwd });
	assert.deepEqual(none.details.timeline, []);
	assert.equal(none.details.continuation.complete, true);
	assert.match(none.content[0].text, /No timeline events were returned/);

	const pullRequest = await timelineTools(timelineServer());
	await assert.rejects(() => executeRegisteredTool(pullRequest.pi.tools, "issueme_list_issue_timeline", { issueNumber: 5 }, { cwd: pullRequest.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /pull request/.test(error.message));
	assert.equal(pullRequest.recorder.calls.length, 1);

	const scoped = await timelineTools(timelineServer({ issue: githubIssue({ number: 1, user: { login: "someone-else" } }) }), { allowedIssueCreator: "octocat" });
	await assert.rejects(() => executeRegisteredTool(scoped.pi.tools, "issueme_list_issue_timeline", { issueNumber: 1 }, { cwd: scoped.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.ISSUE_CREATOR_NOT_ALLOWED);
	assert.equal(scoped.recorder.calls.length, 1);

	const malformed = await timelineTools(timelineServer({ events: [{ id: 1, actor: { login: "octocat" } }] }));
	await assert.rejects(() => executeRegisteredTool(malformed.pi.tools, "issueme_list_issue_timeline", { issueNumber: 1 }, { cwd: malformed.cwd }), (error) => error instanceof GitHubApiError && error.code === ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID);

	const forbidden = await timelineTools(timelineServer({ status: 403 }));
	await assert.rejects(() => executeRegisteredTool(forbidden.pi.tools, "issueme_list_issue_timeline", { issueNumber: 1 }, { cwd: forbidden.cwd }), (error) => error instanceof GitHubApiError && error.status === 403);

	const noNetwork = createFakePi();
	registerListIssueTimelineTool(noNetwork, { runtime: runtimeOptions({ fetchFn: createNoNetworkFetch() }) });
	await assert.rejects(() => executeRegisteredTool(noNetwork.tools, "issueme_list_issue_timeline", { issueNumber: 1, eventTypes: ["bad name"] }, { cwd: empty.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT);
});
