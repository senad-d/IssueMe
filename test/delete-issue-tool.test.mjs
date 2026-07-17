import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import { writeIssueRecord } from "../src/issues/store.ts";
import { registerDeleteIssueTool } from "../src/tools/delete-issue.ts";

const REPOSITORY = "owner/repo";
const TOKEN = "ghp_delete_issue_test_token";
const CONFIG = { issueDirectory: "issues", allowedIssueCreator: "all", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };

function githubIssue(number, title, overrides = {}) {
	const state = overrides.state ?? "open";
	return {
		node_id: `I_${number}`,
		number,
		title,
		state,
		user: overrides.user ?? { login: "octocat" },
		body: "Body",
		labels: [],
		assignees: [],
		milestone: null,
		comments: 0,
		html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
		created_at: "2026-07-17T00:00:00Z",
		updated_at: "2026-07-17T00:00:00Z",
		closed_at: state === "closed" ? "2026-07-17T00:01:00Z" : null,
		...(overrides.pull_request ? { pull_request: overrides.pull_request } : {}),
	};
}

function issueRecord(number, title) {
	return {
		schemaVersion: 1,
		repository: REPOSITORY,
		number,
		title,
		state: "open",
		creator: "octocat",
		body: "Cached body",
		labels: [],
		assignees: [],
		milestone: null,
		comments: [],
		html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
		created_at: "2026-07-17T00:00:00Z",
		updated_at: "2026-07-17T00:00:00Z",
		closed_at: null,
		synced_at: "2026-07-17T00:00:01Z",
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
	let tool;
	return {
		get tool() { return tool; },
		registerTool(value) { tool = value; },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-delete-issue-test-"));
}

function registerDeleteTool(fetchFn, config = CONFIG) {
	const pi = fakePi();
	registerDeleteIssueTool(pi, {
		runtime: {
			config,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	});
	return pi.tool;
}

async function execute(tool, projectRoot, params, signal) {
	return tool.execute("delete-issue-call", params, signal, undefined, {
		cwd: projectRoot,
		isProjectTrusted: () => true,
	});
}

function deleteFetch(issue, calls, graphQlResponse = { data: { deleteIssue: { clientMutationId: null } } }) {
	return async (input, init = {}) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method: init.method, path: url.pathname, body, headers: init.headers });
		if (url.pathname === `/repos/owner/repo/issues/${issue.number}` && init.method === "GET") return jsonResponse(issue);
		if (url.pathname === "/graphql" && init.method === "POST") return jsonResponse(graphQlResponse);
		throw new Error(`Unexpected GitHub request: ${init.method} ${url.pathname}`);
	};
}

test("issueme_delete_issue permanently deletes a confirmed issue and removes its local cache", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const issue = githubIssue(21, "Accidental issue");
	const written = await writeIssueRecord(projectRoot, CONFIG, issueRecord(21, "Accidental issue"));
	const tool = registerDeleteTool(deleteFetch(issue, calls));

	const result = await execute(tool, projectRoot, { number: 21, confirmDelete: true });

	assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
		"GET /repos/owner/repo/issues/21",
		"POST /graphql",
	]);
	assert.equal(calls[1].body.operationName, "IssueMeDeleteIssue");
	assert.deepEqual(calls[1].body.variables, { issueId: "I_21" });
	assert.match(calls[1].body.query, /deleteIssue\(input: \{issueId: \$issueId\}\)/);
	assert.equal(calls[1].headers.Authorization, `Bearer ${TOKEN}`);
	assert.match(result.content[0].text, /Permanently deleted GitHub issue #21: Accidental issue/);
	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "issue_deleted");
	assert.deepEqual(result.details.changedFields, ["deleted"]);
	assert.deepEqual(result.details.removedPaths, [`issues/${basename(written.path)}`]);
	assert.equal(result.details.cacheUpdated, true);
	assert.deepEqual(await readdir(join(projectRoot, "issues")), []);
	assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));
});

test("issueme_delete_issue permits explicit deletion of a closed issue", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const issue = githubIssue(22, "Closed mistake", { state: "closed" });
	const tool = registerDeleteTool(deleteFetch(issue, calls));

	const result = await execute(tool, projectRoot, { number: 22, confirmDelete: true });

	assert.equal(result.details.status, "issue_deleted");
	assert.equal(result.details.issue.state, "closed");
	assert.equal(calls.some((call) => call.path === "/graphql"), true);
});

test("issueme_delete_issue requires confirmation and a safe issue number before runtime resolution", async () => {
	const tool = registerDeleteTool(async () => {
		throw new Error("fetch should not run");
	});
	for (const params of [{ number: 1 }, { number: 1, confirmDelete: false }]) {
		await assert.rejects(
			() => execute(tool, "unused", params),
			(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === "confirmDelete",
		);
	}
	await assert.rejects(
		() => execute(tool, "unused", { number: Number.MAX_SAFE_INTEGER + 1, confirmDelete: true }),
		(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === "issueNumber",
	);
});

test("issueme_delete_issue refuses pull requests and out-of-scope issues before GraphQL deletion", async () => {
	for (const scenario of [
		{ issue: githubIssue(23, "Pull request", { pull_request: {} }), config: CONFIG, code: "invalid_tool_input" },
		{ issue: githubIssue(24, "Other creator", { user: { login: "hubot" } }), config: { ...CONFIG, allowedIssueCreator: "octocat" }, code: "issue_creator_not_allowed" },
	]) {
		const projectRoot = await tempProject();
		const calls = [];
		const tool = registerDeleteTool(deleteFetch(scenario.issue, calls), scenario.config);
		await assert.rejects(
			() => execute(tool, projectRoot, { number: scenario.issue.number, confirmDelete: true }),
			(error) => error?.code === scenario.code,
		);
		assert.equal(calls.some((call) => call.path === "/graphql"), false);
	}
});

test("issueme_delete_issue returns retry-safe partial success for malformed accepted GraphQL data", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const issue = githubIssue(25, "Uncertain response");
	const written = await writeIssueRecord(projectRoot, CONFIG, issueRecord(25, "Uncertain response"));
	const initialText = await readFile(written.path, "utf8");
	const tool = registerDeleteTool(deleteFetch(issue, calls, { data: {} }));

	const result = await execute(tool, projectRoot, { number: 25, confirmDelete: true });

	assert.equal(result.details.result, "partial_success");
	assert.equal(result.details.status, "delete_issue_response_partial_success");
	assert.equal(result.details.needsSync, true);
	assert.equal(result.details.error.details.mutationSettlement, "remote_success_known");
	assert.match(result.content[0].text, /Do not repeat the mutation blindly/);
	assert.equal(await readFile(written.path, "utf8"), initialText);
});

test("issueme_delete_issue reports partial success when cache removal fails after remote deletion", async () => {
	const projectRoot = await tempProject();
	await writeFile(join(projectRoot, "issues"), "not a directory", "utf8");
	const calls = [];
	const issue = githubIssue(26, "Cache cleanup failure");
	const tool = registerDeleteTool(deleteFetch(issue, calls));

	const result = await execute(tool, projectRoot, { number: 26, confirmDelete: true });

	assert.equal(result.details.result, "partial_success");
	assert.equal(result.details.status, "issue_deleted_partial_success");
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, true);
	assert.match(result.content[0].text, /permanently deleted.*local cache removal failed/i);
});

test("issueme_delete_issue maps GraphQL permission and unsupported-feature failures safely", async () => {
	for (const scenario of [
		{ error: { type: "FORBIDDEN", message: "Resource not accessible by integration" }, code: "github_issue_delete_forbidden" },
		{ error: { type: "undefinedField", message: "Field 'deleteIssue' doesn't exist on type 'Mutation'" }, code: "github_issue_delete_unsupported" },
	]) {
		const projectRoot = await tempProject();
		const issue = githubIssue(27, "Permission target");
		const tool = registerDeleteTool(deleteFetch(issue, [], { data: null, errors: [scenario.error] }));
		await assert.rejects(
			() => execute(tool, projectRoot, { number: 27, confirmDelete: true }),
			(error) => error?.code === scenario.code && !JSON.stringify(error).includes(TOKEN),
		);
	}
});
