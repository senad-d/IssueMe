import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { registerCloseIssueTool } from "../src/tools/close-issue.ts";
import { registerCreateIssueTool } from "../src/tools/create-issue.ts";
import { registerListIssuesTool } from "../src/tools/list-issues.ts";
import { registerManageLabelTool } from "../src/tools/manage-label.ts";

const TOKEN = "ghp_failure_semantics_token";
const REPOSITORY = "owner/repo";
const config = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-failure-semantics-test-"));
}

function trustedContext(cwd) {
	return { cwd, isProjectTrusted: () => true };
}

function untrustedContext(cwd) {
	return { cwd, isProjectTrusted: () => false };
}

async function executeAsPiTool(tool, cwd, params, trusted = true) {
	try {
		const result = await tool.execute("tool-call", params, undefined, undefined, trusted ? trustedContext(cwd) : untrustedContext(cwd));
		return { isError: false, result };
	} catch (error) {
		return { isError: true, error };
	}
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json", ...(init.headers ?? {}) },
	});
}

function githubIssue(number, title, overrides = {}) {
	return {
		node_id: `I_${number}`,
		number,
		title,
		state: "open",
		body: `Body for ${title}`,
		labels: [],
		assignees: [],
		milestone: null,
		html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
		created_at: "2026-06-29T00:00:00Z",
		updated_at: "2026-06-29T00:00:00Z",
		closed_at: null,
		comments: 0,
		...overrides,
	};
}

function registerOne(register, options = {}) {
	const pi = fakePi();
	register(pi, options);
	return pi.tools.values().next().value;
}

function runtimeOptions(fetchFn) {
	return {
		runtime: {
			config,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	};
}

function assertNoToken(value) {
	assert.doesNotMatch(JSON.stringify(value), /ghp_failure_semantics_token/);
}

test("thrown IssueMe tool failures map to Pi isError=true", async () => {
	const projectRoot = await tempProject();
	const createTool = registerOne(registerCreateIssueTool);
	const invalidInput = await executeAsPiTool(createTool, projectRoot, { title: "   ", body: `private ${TOKEN}` });
	assert.equal(invalidInput.isError, true);
	assert.equal(invalidInput.error.code, "invalid_tool_input");
	assertNoToken({ message: invalidInput.error.message, safeDetails: invalidInput.error.safeDetails });

	const listTool = registerOne(registerListIssuesTool);
	const trustRefusal = await executeAsPiTool(listTool, projectRoot, { state: "open", limit: 1 }, false);
	assert.equal(trustRefusal.isError, true);
	assert.equal(trustRefusal.error.code, "project_untrusted");
});

test("handled domain failures return structured result:error with Pi isError=false", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const manageLabelTool = registerOne(registerManageLabelTool, runtimeOptions(async (input, init = {}) => {
		const url = new URL(input.toString());
		calls.push({ method: init.method, path: url.pathname, body: init.body, authorization: init.headers?.Authorization });
		if (url.pathname === "/repos/owner/repo/labels" && init.method === "POST") {
			return jsonResponse({ message: `already exists ${TOKEN}` }, { status: 422, statusText: "Unprocessable Entity" });
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.pathname}`);
	}));

	const result = await executeAsPiTool(manageLabelTool, projectRoot, { action: "create", name: "triage", color: "fbca04" });
	assert.equal(result.isError, false);
	assert.equal(result.result.details.result, "error");
	assert.equal(result.result.details.status, "label_create_conflict");
	assert.equal(result.result.details.cacheUpdated, false);
	assert.equal(result.result.details.needsSync, false);
	assert.equal(result.result.details.error.code, "github_api_error");
	assertNoToken(result);
	assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ["POST /repos/owner/repo/labels"]);
});

test("post-mutation cache failures return partial_success without Pi isError", async () => {
	const projectRoot = await tempProject();
	await mkdir(join(projectRoot, "issues", "1-partial-target.json"), { recursive: true });
	const createTool = registerOne(registerCreateIssueTool, runtimeOptions(async (input, init = {}) => {
		const url = new URL(input.toString());
		if (url.pathname === "/repos/owner/repo/issues" && init.method === "POST") {
			return jsonResponse(githubIssue(1, "Partial Target"), { status: 201, statusText: "Created" });
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.pathname}`);
	}));

	const result = await executeAsPiTool(createTool, projectRoot, { title: "Partial Target", body: "Body", labels: [], assignees: [] });
	assert.equal(result.isError, false);
	assert.equal(result.result.details.result, "partial_success");
	assert.equal(result.result.details.cacheUpdated, false);
	assert.equal(result.result.details.needsSync, true);
	assert.equal(result.result.details.error.details.partialSuccessCode, "partial_success_cache_sync_required");
	assertNoToken(result);
});

test("accepted create responses with malformed issue data return retry-safe partial success", async () => {
	const projectRoot = await tempProject();
	let createRequests = 0;
	const createTool = registerOne(registerCreateIssueTool, runtimeOptions(async (input, init = {}) => {
		const url = new URL(input.toString());
		if (url.pathname === "/repos/owner/repo/issues" && init.method === "POST") {
			createRequests += 1;
			return jsonResponse({}, { status: 201, statusText: "Created" });
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.pathname}`);
	}));

	const result = await executeAsPiTool(createTool, projectRoot, { title: "Malformed accepted create", body: "Body", labels: [], assignees: [] });
	assert.equal(result.isError, false);
	assert.equal(result.result.details.result, "partial_success");
	assert.equal(result.result.details.status, "create_issue_response_partial_success");
	assert.equal(result.result.details.needsSync, true);
	assert.equal(result.result.details.error.details.mutationSettlement, "remote_success_known");
	assert.match(result.result.content[0].text, /Do not repeat the mutation blindly/);
	assert.equal(createRequests, 1);
});

test("idempotent no-ops remain successful structured results", async () => {
	const projectRoot = await tempProject();
	const closeTool = registerOne(registerCloseIssueTool, runtimeOptions(async (input, init = {}) => {
		const url = new URL(input.toString());
		if (url.pathname === "/repos/owner/repo/issues/7" && init.method === "GET") {
			return jsonResponse(githubIssue(7, "Already Closed", { state: "closed", closed_at: "2026-06-29T00:01:00Z" }));
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.pathname}`);
	}));

	const result = await executeAsPiTool(closeTool, projectRoot, { number: 7 });
	assert.equal(result.isError, false);
	assert.equal(result.result.details.result, "success");
	assert.equal(result.result.details.status, "already_closed");
	assert.equal(result.result.details.cacheUpdated, true);
	assert.equal(result.result.details.needsSync, false);
	assert.deepEqual(result.result.details.changedFields, []);
});
