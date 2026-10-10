import assert from "node:assert/strict";
import test from "node:test";

import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../src/errors.ts";
import { registerIssueCommentReadTools } from "../src/tools/issue-comments.ts";
import {
	createFakePi,
	createFetchRecorder,
	createNoNetworkFetch,
	executeRegisteredTool,
	githubComment,
	githubIssue,
	jsonResponse,
	runtimeOptions,
	tempProject,
	TEST_TOKEN,
} from "./helpers/issueme-test-helpers.mjs";

function commentServer(options = {}) {
	const issues = new Map((options.issues ?? [githubIssue({ number: 1, comments: (options.comments ?? []).length })]).map((issue) => [issue.number, issue]));
	const comments = options.comments ?? [];
	return (call) => {
		const path = call.url.pathname;
		const single = path.match(/^\/repos\/owner\/repo\/issues\/(\d+)$/);
		if (single) {
			const issue = issues.get(Number(single[1]));
			return issue ? jsonResponse(issue) : jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
		}
		const byId = path.match(/^\/repos\/owner\/repo\/issues\/comments\/(\d+)$/);
		if (byId) {
			const comment = comments.find((candidate) => candidate.id === Number(byId[1]));
			return comment ? jsonResponse(comment) : jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
		}
		const list = path.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/comments$/);
		if (list) {
			const since = call.url.searchParams.get("since");
			const owned = comments.filter((comment) => typeof comment.issue_url !== "string" || comment.issue_url.endsWith(`/issues/${list[1]}`));
			const filtered = since ? owned.filter((comment) => comment.updated_at >= since) : owned;
			const perPage = Number(call.url.searchParams.get("per_page") ?? "30");
			const page = Number(call.url.searchParams.get("page") ?? "1");
			const start = (page - 1) * perPage;
			const slice = filtered.slice(start, start + perPage);
			const headers = start + perPage < filtered.length ? { link: `<https://api.github.com/repos/owner/repo/issues/${list[1]}/comments?per_page=${perPage}&page=${page + 1}>; rel="next"` } : {};
			return jsonResponse(slice, { headers });
		}
		throw new Error(`Unexpected request ${call.method} ${path}`);
	};
}

async function commentTools(handler, configOverrides = {}) {
	const recorder = createFetchRecorder(handler);
	const pi = createFakePi();
	registerIssueCommentReadTools(pi, { runtime: runtimeOptions({ fetchFn: recorder.fetchFn, config: configOverrides }) });
	return { pi, recorder, cwd: await tempProject() };
}

function thread(count, options = {}) {
	return Array.from({ length: count }, (_, index) => githubComment({ id: 100 + index, issueNumber: 1, body: options.body?.(index) ?? `Comment ${index}`, updated_at: `2026-06-${String(10 + (index % 20)).padStart(2, "0")}T00:00:00Z`, created_at: "2026-06-01T00:00:00Z" }));
}

function assertNoToken(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TEST_TOKEN));
}

test("issueme_list_issue_comments reaches comments beyond the cache cap with stable IDs, bounded bodies, and continuation", async () => {
	const comments = thread(130, { body: (index) => (index === 3 ? "x".repeat(900) : `Comment ${index}`) });
	const { pi, recorder, cwd } = await commentTools(commentServer({ comments }));
	const first = await executeRegisteredTool(pi.tools, "issueme_list_issue_comments", { issueNumber: 1, limit: 50 }, { cwd });
	assert.equal(first.details.result, "success");
	assert.equal(first.details.status, "list_issue_comments");
	assert.equal(first.details.cacheUpdated, false);
	assert.equal(first.details.needsSync, false);
	assert.equal(first.details.comments.length, 50);
	assert.deepEqual(first.details.comments[0], { id: 100, author: "octocat", createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-10T00:00:00Z", html_url: "https://github.com/owner/repo/issues/1#issuecomment-100", body: "Comment 0", bodyLength: 9, bodyTruncated: false });
	assert.equal(first.details.comments[3].bodyTruncated, true);
	assert.equal(first.details.comments[3].body.length, 400);
	assert.equal(first.details.comments[3].bodyLength, 900);
	assert.deepEqual(first.details.counts, { returned: 50, bodyTruncated: 1, limit: 50, bodyLimit: 400, total: 130 });
	assert.equal(first.details.truncated, true);
	assert.deepEqual(first.details.truncation.comments, { shown: 50, max: 50 });
	assert.deepEqual(first.details.truncation.bodies, { affectedComments: 1, maxChars: 400 });
	assert.equal(first.details.truncation.content.maxChars, 8000, "a 50-comment page is also bounded by the tool text cap");
	assert.equal(first.details.continuation.collection, "issue_comments");
	assert.match(first.content[0].text, /\[body truncated: 400 of 900 chars; use issueme_get_comment with commentId 103\]/);
	assert.match(first.content[0].text, /read-only/);
	assertNoToken(first);

	const pages = [first];
	while (pages.at(-1).details.continuation.nextToken) {
		pages.push(await executeRegisteredTool(pi.tools, "issueme_list_issue_comments", { issueNumber: 1, limit: 50, after: pages.at(-1).details.continuation.nextToken }, { cwd }));
	}
	assert.equal(pages.length, 3);
	assert.deepEqual(pages.flatMap((page) => page.details.comments.map((comment) => comment.id)), comments.map((comment) => comment.id));
	assert.equal(pages.at(-1).details.continuation.complete, true);
	assert.ok(recorder.calls.every((call) => call.url.pathname.startsWith("/repos/owner/repo/")));
	assert.equal(recorder.calls.some((call) => call.method !== "GET"), false, "no writes of any kind");
});

test("issueme_list_issue_comments supports since filters, empty threads, closed issues, and binds tokens to filters", async () => {
	const comments = thread(4);
	const { pi, recorder, cwd } = await commentTools(commentServer({ comments, issues: [githubIssue({ number: 1, state: "closed", comments: 4 }), githubIssue({ number: 2, comments: 0 })] }));
	const since = await executeRegisteredTool(pi.tools, "issueme_list_issue_comments", { issueNumber: 1, since: "2026-06-12T00:00:00Z", limit: 1 }, { cwd });
	assert.equal(recorder.calls.at(-1).url.searchParams.get("since"), "2026-06-12T00:00:00Z");
	assert.deepEqual(since.details.comments.map((comment) => comment.id), [102]);
	assert.equal(since.details.issue.state, "closed", "closed issues are readable");
	assert.match(since.content[0].text, /updated since 2026-06-12T00:00:00Z/);
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_list_issue_comments", { issueNumber: 1, limit: 1, after: since.details.continuation.nextToken }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.CONTINUATION_TOKEN_INVALID && error.safeDetails.reason === "filter_mismatch");

	const empty = await executeRegisteredTool(pi.tools, "issueme_list_issue_comments", { issueNumber: 2 }, { cwd });
	assert.deepEqual(empty.details.comments, []);
	assert.equal(empty.details.truncated, false);
	assert.equal(empty.details.continuation.complete, true);
	assert.match(empty.content[0].text, /No comments were returned/);

	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_list_issue_comments", { issueNumber: 1, since: "yesterday" }, { cwd }), (error) => error instanceof IssueMeError && error.safeDetails.field === "since");
});

test("comment read tools refuse pull requests, out-of-scope issues, malformed members, and surface GitHub failures", async () => {
	const pullRequest = await commentTools(commentServer({ issues: [githubIssue({ number: 5, pull_request: {} })] }));
	await assert.rejects(() => executeRegisteredTool(pullRequest.pi.tools, "issueme_list_issue_comments", { issueNumber: 5 }, { cwd: pullRequest.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /pull request/.test(error.message));
	assert.equal(pullRequest.recorder.calls.length, 1);

	const scoped = await commentTools(commentServer({ issues: [githubIssue({ number: 1, user: { login: "someone-else" } })], comments: thread(1) }), { allowedIssueCreator: "octocat" });
	await assert.rejects(() => executeRegisteredTool(scoped.pi.tools, "issueme_list_issue_comments", { issueNumber: 1 }, { cwd: scoped.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.ISSUE_CREATOR_NOT_ALLOWED);
	await assert.rejects(() => executeRegisteredTool(scoped.pi.tools, "issueme_get_comment", { issueNumber: 1, commentId: 100 }, { cwd: scoped.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.ISSUE_CREATOR_NOT_ALLOWED);

	const malformed = await commentTools(commentServer({ comments: [{ body: "no id" }] }));
	await assert.rejects(() => executeRegisteredTool(malformed.pi.tools, "issueme_list_issue_comments", { issueNumber: 1 }, { cwd: malformed.cwd }), (error) => error instanceof GitHubApiError && error.code === ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID);

	const missing = await commentTools(commentServer({ comments: thread(1) }));
	await assert.rejects(() => executeRegisteredTool(missing.pi.tools, "issueme_get_comment", { issueNumber: 1, commentId: 999 }, { cwd: missing.cwd }), (error) => error instanceof GitHubApiError && error.status === 404);

	const noNetwork = createFakePi();
	registerIssueCommentReadTools(noNetwork, { runtime: runtimeOptions({ fetchFn: createNoNetworkFetch() }) });
	await assert.rejects(() => executeRegisteredTool(noNetwork.tools, "issueme_get_comment", { issueNumber: 1, commentId: 100, bodyLimit: 0 }, { cwd: missing.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.field === "bodyLimit");
});

test("issueme_get_comment verifies ownership and continues long bodies through version-bound tokens", async () => {
	const long = "0123456789".repeat(1000);
	const comments = [
		githubComment({ id: 100, issueNumber: 1, body: long, updated_at: "2026-06-10T00:00:00Z" }),
		githubComment({ id: 200, issueNumber: 2, body: "Other issue" }),
	];
	const { pi, recorder, cwd } = await commentTools(commentServer({ comments, issues: [githubIssue({ number: 1, state: "closed" })] }));
	const first = await executeRegisteredTool(pi.tools, "issueme_get_comment", { issueNumber: 1, commentId: 100 }, { cwd });
	assert.equal(first.details.result, "success");
	assert.equal(first.details.status, "get_comment");
	assert.deepEqual(first.details.comment, { id: 100, html_url: "https://github.com/owner/repo/issues/1#issuecomment-100" });
	assert.equal(first.details.comments[0].body.length, 4000);
	assert.equal(first.details.comments[0].bodyLength, 10000);
	assert.equal(first.details.comments[0].bodyTruncated, true);
	assert.equal(first.details.comments[0].bodyOffset, undefined);
	assert.deepEqual(first.details.counts, { bodyLength: 10000, bodyShown: 4000, bodyOffset: 0, bodyLimit: 4000 });
	assert.equal(first.details.continuation.collection, "comment_body");
	assert.match(first.content[0].text, /Body chars 0-4000 of 10000/);
	assert.deepEqual(recorder.calls.map((call) => call.url.pathname), ["/repos/owner/repo/issues/1", "/repos/owner/repo/issues/comments/100"]);

	const second = await executeRegisteredTool(pi.tools, "issueme_get_comment", { issueNumber: 1, commentId: 100, after: first.details.continuation.nextToken }, { cwd });
	assert.equal(second.details.comments[0].bodyOffset, 4000);
	assert.equal(second.details.comments[0].body, long.slice(4000, 8000));
	assert.equal(second.details.continuation.resumed, true);
	const third = await executeRegisteredTool(pi.tools, "issueme_get_comment", { issueNumber: 1, commentId: 100, bodyLimit: 3000, after: second.details.continuation.nextToken }, { cwd });
	assert.equal(third.details.comments[0].body, long.slice(8000));
	assert.equal(third.details.continuation.complete, true);
	assert.equal(third.details.truncated, false);
	assert.equal([first, second, third].map((page) => page.details.comments[0].body).join(""), long);

	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_get_comment", { issueNumber: 1, commentId: 200 }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.COMMENT_ISSUE_MISMATCH);

	comments[0].updated_at = "2026-06-11T00:00:00Z";
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_get_comment", { issueNumber: 1, commentId: 100, after: first.details.continuation.nextToken }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.CONTINUATION_TOKEN_INVALID && error.safeDetails.reason === "filter_mismatch");
	assertNoToken(first);
});
