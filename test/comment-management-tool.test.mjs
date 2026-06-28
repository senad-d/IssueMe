import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ClosedIssueMutationError, GitHubApiError } from "../src/errors.ts";
import { registerDeleteCommentTool, registerUpdateCommentTool } from "../src/tools/comment-issue.ts";

const TOKEN = "ghp_comment_management_token";
const REPOSITORY = "owner/repo";
const config = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

function registerTools(fetchFn) {
	const pi = fakePi();
	const options = {
		runtime: {
			config,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	};
	registerUpdateCommentTool(pi, options);
	registerDeleteCommentTool(pi, options);
	return pi.tools;
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-comment-management-test-"));
}

async function execute(tool, cwd, params) {
	return tool.execute("tool-call", params, undefined, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

function githubIssue(number, title, overrides = {}) {
	return {
		number,
		title,
		state: "open",
		body: `Body for ${title}`,
		labels: [],
		assignees: [],
		milestone: null,
		html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		comments: 0,
		...overrides,
	};
}

function githubComment(issueNumber, id, body = "Original comment") {
	return {
		id,
		user: { login: "octocat" },
		body,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		html_url: `https://github.com/${REPOSITORY}/issues/${issueNumber}#issuecomment-${id}`,
		issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/${issueNumber}`,
	};
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json" },
	});
}

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

function assertNoSecret(value, ...secrets) {
	const serialized = JSON.stringify(value);
	for (const secret of secrets) assert.doesNotMatch(serialized, new RegExp(escapeRegExp(secret)));
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("issueme_update_comment and issueme_delete_comment verify the issue/comment context and refresh cache", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const comments = new Map([[1, [githubComment(1, 501)]]]);
	const tools = registerTools(async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method, path: url.pathname, body });

		if (url.pathname === "/repos/owner/repo/issues/1" && method === "GET") {
			return jsonResponse(githubIssue(1, "Comment Target", { comments: comments.get(1)?.length ?? 0 }));
		}
		if (url.pathname === "/repos/owner/repo/issues/1/comments" && method === "GET") return jsonResponse(comments.get(1) ?? []);
		if (url.pathname === "/repos/owner/repo/issues/comments/501" && method === "GET") return jsonResponse(comments.get(1)[0]);
		if (url.pathname === "/repos/owner/repo/issues/comments/501" && method === "PATCH") {
			const updated = { ...comments.get(1)[0], body: body.body, updated_at: "2026-06-27T00:10:00Z" };
			comments.set(1, [updated]);
			return jsonResponse(updated);
		}
		if (url.pathname === "/repos/owner/repo/issues/comments/501" && method === "DELETE") {
			comments.set(1, []);
			return new Response(null, { status: 204, statusText: "No Content" });
		}
		throw new Error(`Unexpected request: ${method} ${url.pathname}`);
	});

	const updateResult = await execute(tools.get("issueme_update_comment"), projectRoot, {
		issueNumber: 1,
		commentId: 501,
		body: "  Corrected comment  ",
	});
	let cached = await readJson(join(projectRoot, "issues", "1-comment-target.json"));
	assert.equal(cached.comments[0].body, "Corrected comment");
	assert.equal(updateResult.details.comment.id, 501);
	assert.deepEqual(updateResult.details.changedFields, ["comments"]);
	assert.equal(updateResult.details.cacheUpdated, true);

	const deleteResult = await execute(tools.get("issueme_delete_comment"), projectRoot, { issueNumber: 1, commentId: 501 });
	cached = await readJson(join(projectRoot, "issues", "1-comment-target.json"));
	assert.deepEqual(cached.comments, []);
	assert.equal(cached.comments_count, 0);
	assert.equal(deleteResult.details.status, "comment_deleted");
	assert.equal(deleteResult.details.cacheUpdated, true);

	assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
		"GET /repos/owner/repo/issues/1",
		"GET /repos/owner/repo/issues/comments/501",
		"PATCH /repos/owner/repo/issues/comments/501",
		"GET /repos/owner/repo/issues/1",
		"GET /repos/owner/repo/issues/1/comments",
		"GET /repos/owner/repo/issues/1",
		"GET /repos/owner/repo/issues/comments/501",
		"DELETE /repos/owner/repo/issues/comments/501",
		"GET /repos/owner/repo/issues/1",
		"GET /repos/owner/repo/issues/1/comments",
	]);
});

test("issueme_update_comment refuses a comment ID that belongs to another issue", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const tools = registerTools(async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		calls.push(`${method} ${url.pathname}`);
		if (url.pathname === "/repos/owner/repo/issues/1" && method === "GET") return jsonResponse(githubIssue(1, "Target"));
		if (url.pathname === "/repos/owner/repo/issues/comments/777" && method === "GET") return jsonResponse(githubComment(2, 777, "Wrong issue"));
		throw new Error(`Mismatch test must not mutate: ${method} ${url.pathname}`);
	});

	await assert.rejects(
		() => execute(tools.get("issueme_update_comment"), projectRoot, { issueNumber: 1, commentId: 777, body: "Correction" }),
		(error) => error?.code === "comment_issue_mismatch" && /does not belong/.test(error.message),
	);
	assert.deepEqual(calls, [
		"GET /repos/owner/repo/issues/1",
		"GET /repos/owner/repo/issues/comments/777",
	]);
});

test("issueme_delete_comment reports missing comments safely before delete mutation", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const tools = registerTools(async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		calls.push(`${method} ${url.pathname}`);
		if (url.pathname === "/repos/owner/repo/issues/1" && method === "GET") return jsonResponse(githubIssue(1, "Target"));
		if (url.pathname === "/repos/owner/repo/issues/comments/404" && method === "GET") {
			return jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
		}
		throw new Error(`Missing-comment test must not mutate: ${method} ${url.pathname}`);
	});

	await assert.rejects(
		() => execute(tools.get("issueme_delete_comment"), projectRoot, { issueNumber: 1, commentId: 404 }),
		(error) => error instanceof GitHubApiError && error.status === 404,
	);
	assert.deepEqual(calls, [
		"GET /repos/owner/repo/issues/1",
		"GET /repos/owner/repo/issues/comments/404",
	]);
});

test("comment edit and delete tools enforce the closed-issue policy before comment mutation", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const tools = registerTools(async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		calls.push(`${method} ${url.pathname}`);
		if (url.pathname === "/repos/owner/repo/issues/9" && method === "GET") {
			return jsonResponse(githubIssue(9, "Closed Target", {
				state: "closed",
				closed_at: "2026-06-27T00:05:00Z",
			}));
		}
		throw new Error(`Closed-policy test must not fetch or mutate comments: ${method} ${url.pathname}`);
	});

	for (const [name, params] of [
		["issueme_update_comment", { issueNumber: 9, commentId: 900, body: "Correction" }],
		["issueme_delete_comment", { issueNumber: 9, commentId: 900 }],
	]) {
		await assert.rejects(
			() => execute(tools.get(name), projectRoot, params),
			(error) => error instanceof ClosedIssueMutationError && error.safeDetails.status === "closed_issue_mutation_refused",
		);
	}
	assert.deepEqual(calls, [
		"GET /repos/owner/repo/issues/9",
		"GET /repos/owner/repo/issues/9",
	]);
});

test("issueme_update_comment safe errors redact tokens and comment body content", async () => {
	const projectRoot = await tempProject();
	const bodySecret = "comment-body-secret";
	const tools = registerTools(async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		if (url.pathname === "/repos/owner/repo/issues/1" && method === "GET") return jsonResponse(githubIssue(1, "Target"));
		if (url.pathname === "/repos/owner/repo/issues/comments/501" && method === "GET") return jsonResponse(githubComment(1, 501));
		if (url.pathname === "/repos/owner/repo/issues/comments/501" && method === "PATCH") {
			return jsonResponse(
				{ message: `Cannot write ${body.body} with ${TOKEN}` },
				{ status: 422, statusText: "Unprocessable Entity" },
			);
		}
		throw new Error(`Unexpected safe-error request: ${method} ${url.pathname}`);
	});

	await assert.rejects(
		() => execute(tools.get("issueme_update_comment"), projectRoot, { issueNumber: 1, commentId: 501, body: bodySecret }),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assertNoSecret(error, TOKEN, bodySecret);
			return true;
		},
	);
});
