import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { registerAssignIssueTool } from "../src/tools/assign-issue.ts";

function githubIssue(overrides = {}) {
	return {
		number: 1,
		title: "Assign Target",
		state: "open",
		body: "Body",
		labels: [],
		assignees: [{ login: "octocat" }],
		milestone: null,
		html_url: "https://github.com/owner/repo/issues/1",
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		...overrides,
	};
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json" },
	});
}

function noContentResponse() {
	return new Response(null, { status: 204, statusText: "No Content" });
}

function fakePi() {
	let assignTool;
	return {
		get assignTool() { return assignTool; },
		registerTool(tool) { assignTool = tool; },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-assign-tool-test-"));
}

async function registerAssignTool() {
	const pi = fakePi();
	registerAssignIssueTool(pi);
	return pi.assignTool;
}

async function executeAssign(tool, cwd, params) {
	return tool.execute("assign-call", params, undefined, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

async function withMockedAssignTool(fetchFn, callback) {
	const projectRoot = await tempProject();
	const assignTool = await registerAssignTool();
	const originalFetch = globalThis.fetch;
	const originalGhToken = process.env.GH_TOKEN;
	const originalGithubToken = process.env.GITHUB_TOKEN;
	const originalGithubRepository = process.env.GITHUB_REPOSITORY;
	globalThis.fetch = fetchFn;
	process.env.GH_TOKEN = "ghp_test_token";
	delete process.env.GITHUB_TOKEN;
	process.env.GITHUB_REPOSITORY = "owner/repo";
	try {
		return await callback({ projectRoot, assignTool });
	} finally {
		globalThis.fetch = originalFetch;
		restoreEnv("GH_TOKEN", originalGhToken);
		restoreEnv("GITHUB_TOKEN", originalGithubToken);
		restoreEnv("GITHUB_REPOSITORY", originalGithubRepository);
	}
}

test("issueme_assign_issue rejects unassignable users before GitHub can silently ignore them", async () => {
	const calls = [];
	await withMockedAssignTool(async (input, init) => {
		const url = new URL(input.toString());
		calls.push({ path: url.pathname, method: init.method });
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") {
			return jsonResponse(githubIssue());
		}
		if (url.pathname === "/repos/owner/repo/assignees/ghost-user" && init.method === "GET") {
			return jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, assignTool }) => {
		await assert.rejects(
			() => executeAssign(assignTool, projectRoot, { number: 1, action: "add", assignees: ["ghost-user"] }),
			(error) => error?.code === "invalid_tool_input"
				&& error.safeDetails?.field === "assignees"
				&& error.safeDetails?.invalidAssignees?.[0] === "ghost-user"
				&& /assignable users/.test(error.message),
		);
		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
			"GET /repos/owner/repo/issues/1",
			"GET /repos/owner/repo/assignees/ghost-user",
		]);
	});
});

test("issueme_assign_issue validates assignability before a successful add", async () => {
	const calls = [];
	await withMockedAssignTool(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ path: url.pathname, method: init.method, body });
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET" && calls.length === 1) {
			return jsonResponse(githubIssue({ assignees: [] }));
		}
		if (url.pathname === "/repos/owner/repo/assignees/octocat" && init.method === "GET") {
			return noContentResponse();
		}
		if (url.pathname === "/repos/owner/repo/issues/1/assignees" && init.method === "POST") {
			return jsonResponse(githubIssue({ assignees: body.assignees.map((login) => ({ login })) }));
		}
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") {
			return jsonResponse(githubIssue({ assignees: [{ login: "octocat" }] }));
		}
		if (url.pathname === "/repos/owner/repo/issues/1/comments" && init.method === "GET") return jsonResponse([]);
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, assignTool }) => {
		const result = await executeAssign(assignTool, projectRoot, { number: 1, action: "add", assignees: ["octocat"] });
		assert.match(result.content[0].text, /Assignees for issue #1: octocat/);
		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
			"GET /repos/owner/repo/issues/1",
			"GET /repos/owner/repo/assignees/octocat",
			"POST /repos/owner/repo/issues/1/assignees",
			"GET /repos/owner/repo/issues/1",
			"GET /repos/owner/repo/issues/1/comments",
		]);
	});
});

function restoreEnv(name, value) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}
