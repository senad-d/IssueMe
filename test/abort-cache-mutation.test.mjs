import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import { writeIssueRecord } from "../src/issues/store.ts";
import { registerIssueMeTools } from "../src/tools/issueme-tools.ts";

const CONFIG = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };

function githubIssue(number, title, overrides = {}) {
	return {
		node_id: `ISSUE_${number}`,
		number,
		title,
		state: "open",
		body: "Body",
		labels: [],
		assignees: [],
		milestone: null,
		html_url: `https://github.com/owner/repo/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		...overrides,
	};
}

function issueRecord(number, title, overrides = {}) {
	return {
		schemaVersion: 1,
		repository: "owner/repo",
		number,
		title,
		state: "open",
		body: "Cached body",
		labels: [],
		assignees: [],
		milestone: null,
		comments: [],
		html_url: `https://github.com/owner/repo/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		synced_at: "2026-06-27T00:00:01Z",
		...overrides,
	};
}

function githubComment(id, issueNumber) {
	return {
		id,
		user: { login: "octocat" },
		body: "Comment body",
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		html_url: `https://github.com/owner/repo/issues/${issueNumber}#issuecomment-${id}`,
	};
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json" },
	});
}

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

function registerTools(fetchFn) {
	const pi = fakePi();
	registerIssueMeTools(pi, {
		runtime: {
			config: CONFIG,
			repository: "owner/repo",
			token: "ghp_test_token",
			fetchFn,
		},
	});
	return pi.tools;
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-abort-cache-test-"));
}

async function execute(tool, cwd, params, signal) {
	return tool.execute("tool-call", params, signal, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

async function assertNoIssueDirectory(projectRoot) {
	await assert.rejects(() => readdir(join(projectRoot, "issues")), { code: "ENOENT" });
}

const abortScenarios = [
	{
		name: "create issue",
		tool: "issueme_create_issue",
		params: { title: "Abort Create", body: "Body" },
		mutation: { method: "POST", path: "/repos/owner/repo/issues" },
		mutationResponse: (body) => githubIssue(101, body.title, { body: body.body, html_url: "https://github.com/owner/repo/issues/101" }),
	},
	{
		name: "update issue",
		tool: "issueme_update_issue",
		params: { number: 2, title: "Remote Updated" },
		initialRecord: issueRecord(2, "Cached Update"),
		mutation: { method: "PATCH", path: "/repos/owner/repo/issues/2" },
		mutationResponse: (body) => githubIssue(2, body.title, { updated_at: "2026-06-27T00:02:00Z" }),
	},
	{
		name: "comment issue",
		tool: "issueme_comment_issue",
		params: { number: 3, body: "New comment" },
		initialRecord: issueRecord(3, "Cached Comment"),
		mutation: { method: "POST", path: "/repos/owner/repo/issues/3/comments" },
		mutationResponse: () => githubComment(303, 3),
	},
	{
		name: "assign issue",
		tool: "issueme_assign_issue",
		params: { number: 4, action: "add", assignees: ["octocat"] },
		initialRecord: issueRecord(4, "Cached Assign"),
		mutation: { method: "POST", path: "/repos/owner/repo/issues/4/assignees" },
		mutationResponse: () => githubIssue(4, "Cached Assign", { assignees: [{ login: "octocat" }] }),
	},
	{
		name: "label issue",
		tool: "issueme_label_issue",
		params: { number: 5, action: "add", labels: ["bug"] },
		initialRecord: issueRecord(5, "Cached Label"),
		mutation: { method: "POST", path: "/repos/owner/repo/issues/5/labels" },
		mutationResponse: () => [{ name: "bug" }],
	},
	{
		name: "reopen issue",
		tool: "issueme_reopen_issue",
		params: { number: 6 },
		getIssueState: "closed",
		mutation: { method: "PATCH", path: "/repos/owner/repo/issues/6" },
		mutationResponse: () => githubIssue(6, "Reopened Remote", { state: "open" }),
	},
	{
		name: "close issue",
		tool: "issueme_close_issue",
		params: { number: 7 },
		initialRecord: issueRecord(7, "Cached Close"),
		mutation: { method: "PATCH", path: "/repos/owner/repo/issues/7" },
		mutationResponse: () => githubIssue(7, "Cached Close", { state: "closed", closed_at: "2026-06-27T00:03:00Z" }),
	},
];

for (const scenario of abortScenarios) {
	test(`issueme_${scenario.name.replaceAll(" ", "_")} reports partial success without cache mutation after abort`, async () => {
		const projectRoot = await tempProject();
		let initialPath;
		let initialText;
		if (scenario.initialRecord) {
			const written = await writeIssueRecord(projectRoot, CONFIG, scenario.initialRecord);
			initialPath = written.path;
			initialText = await readFile(initialPath, "utf8");
		}

		const controller = new AbortController();
		const calls = [];
		const fetchFn = async (input, init = {}) => {
			const url = new URL(input.toString());
			const method = init.method ?? "GET";
			const body = init.body === undefined ? undefined : JSON.parse(init.body);
			calls.push({ method, path: url.pathname, body });

			if (method === scenario.mutation.method && url.pathname === scenario.mutation.path) {
				controller.abort();
				return jsonResponse(scenario.mutationResponse(body ?? {}));
			}
			const issueMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)$/);
			if (method === "GET" && issueMatch) {
				const number = Number(issueMatch[1]);
				const cachedTitle = scenario.initialRecord?.number === number ? scenario.initialRecord.title : `Issue ${number}`;
				const state = scenario.getIssueState ?? "open";
				return jsonResponse(githubIssue(number, cachedTitle, {
					state,
					closed_at: state === "closed" ? "2026-06-27T00:01:00Z" : null,
				}));
			}
			throw new Error(`Unexpected GitHub mock request: ${method} ${url.pathname}`);
		};
		const tools = registerTools(fetchFn);

		const result = await execute(tools.get(scenario.tool), projectRoot, scenario.params, controller.signal);

		assert.equal(result.details.result, "partial_success");
		assert.equal(result.details.cacheUpdated, false);
		assert.equal(result.details.needsSync, true);
		assert.equal(result.details.error.code, "github_request_aborted");
		assert.match(result.content[0].text, /issueme_sync_issues|Local cache/);
		assert.equal(calls.some((call) => call.method === scenario.mutation.method && call.path === scenario.mutation.path), true);
		assert.equal(calls.some((call) => call.method === "GET" && /\/comments$/.test(call.path)), false);

		if (initialPath) {
			assert.equal(await readFile(initialPath, "utf8"), initialText);
			assert.deepEqual((await readdir(join(projectRoot, "issues"))).sort(), [basename(initialPath)]);
		} else {
			await assertNoIssueDirectory(projectRoot);
		}
	});
}

test("issueme_create_sub_issue does not cache the created issue when aborted after attach failure", async () => {
	const projectRoot = await tempProject();
	const controller = new AbortController();
	const calls = [];
	const fetchFn = async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method, path: url.pathname, body });
		if (method === "GET" && url.pathname === "/repos/owner/repo/issues/1") {
			return jsonResponse(githubIssue(1, "Parent", { node_id: "PARENT_NODE" }));
		}
		if (method === "POST" && url.pathname === "/repos/owner/repo/issues") {
			return jsonResponse(githubIssue(8, body.title, { node_id: "CHILD_NODE", body: body.body, html_url: "https://github.com/owner/repo/issues/8" }));
		}
		if (method === "POST" && url.pathname === "/graphql") {
			controller.abort();
			return jsonResponse({ data: {}, errors: [{ type: "FORBIDDEN", message: "forbidden" }] });
		}
		throw new Error(`Unexpected GitHub mock request: ${method} ${url.pathname}`);
	};
	const tools = registerTools(fetchFn);

	const result = await execute(tools.get("issueme_create_sub_issue"), projectRoot, {
		parentNumber: 1,
		title: "Abort Child",
		body: "Child body",
	}, controller.signal);

	assert.equal(result.details.result, "partial_success");
	assert.equal(result.details.status, "sub_issue_attach_partial_success_cache_failed");
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, true);
	assert.equal(result.details.error.code, "github_sub_issue_forbidden");
	assert.equal(result.details.error.details.cacheError.code, "github_request_aborted");
	assert.match(result.details.error.details.cacheError.details.partialSuccessStatus, /sub_issue_attach_partial_success_cache_failed/);
	assert.equal(calls.some((call) => call.method === "POST" && call.path === "/repos/owner/repo/issues"), true);
	assert.equal(calls.some((call) => call.method === "POST" && call.path === "/graphql"), true);
	await assertNoIssueDirectory(projectRoot);
});
