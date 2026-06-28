import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { registerLabelIssueTool } from "../src/tools/label-issue.ts";

function githubIssue(overrides = {}) {
	return {
		number: 1,
		title: "Label Target",
		state: "open",
		body: "Body",
		labels: [],
		assignees: [],
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

function fakePi() {
	let labelTool;
	return {
		get labelTool() { return labelTool; },
		registerTool(tool) { labelTool = tool; },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-label-tool-test-"));
}

async function registerLabelTool() {
	const pi = fakePi();
	registerLabelIssueTool(pi);
	return pi.labelTool;
}

async function executeLabel(tool, cwd, params) {
	return tool.execute("label-call", params, undefined, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

async function withMockedLabelTool(fetchFn, callback) {
	const projectRoot = await tempProject();
	const labelTool = await registerLabelTool();
	const originalFetch = globalThis.fetch;
	const originalGhToken = process.env.GH_TOKEN;
	const originalGithubToken = process.env.GITHUB_TOKEN;
	const originalGithubRepository = process.env.GITHUB_REPOSITORY;
	globalThis.fetch = fetchFn;
	process.env.GH_TOKEN = "ghp_test_token";
	delete process.env.GITHUB_TOKEN;
	process.env.GITHUB_REPOSITORY = "owner/repo";
	try {
		return await callback({ projectRoot, labelTool });
	} finally {
		globalThis.fetch = originalFetch;
		restoreEnv("GH_TOKEN", originalGhToken);
		restoreEnv("GITHUB_TOKEN", originalGithubToken);
		restoreEnv("GITHUB_REPOSITORY", originalGithubRepository);
	}
}

test("issueme_label_issue refreshes the issue and returns final labels instead of label-endpoint response labels", async () => {
	const calls = [];
	await withMockedLabelTool(async (input, init) => {
		const url = new URL(input.toString());
		calls.push({ path: url.pathname, method: init.method, body: init.body });
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET" && calls.length === 1) {
			return jsonResponse(githubIssue({ labels: [{ name: "old" }] }));
		}
		if (url.pathname === "/repos/owner/repo/issues/1/labels" && init.method === "POST") {
			return jsonResponse([{ name: "endpoint-only" }]);
		}
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") {
			return jsonResponse(githubIssue({ labels: [{ name: "final" }, { name: "triaged" }] }));
		}
		if (url.pathname === "/repos/owner/repo/issues/1/comments") return jsonResponse([]);
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, labelTool }) => {
		const result = await executeLabel(labelTool, projectRoot, { number: 1, action: "add", labels: ["new"] });
		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
			"GET /repos/owner/repo/issues/1",
			"POST /repos/owner/repo/issues/1/labels",
			"GET /repos/owner/repo/issues/1",
			"GET /repos/owner/repo/issues/1/comments",
		]);
		assert.equal(JSON.parse(calls[1].body).labels[0], "new");
		assert.match(result.content[0].text, /Labels for issue #1: final, triaged/);
		assert.deepEqual(result.details.issue.labels, ["final", "triaged"]);
		assert.deepEqual(result.details.paths, ["issues/1-label-target.json"]);
		assert.equal(result.details.cacheUpdated, true);
		const cached = JSON.parse(await readFile(join(projectRoot, "issues", "1-label-target.json"), "utf8"));
		assert.deepEqual(cached.labels, ["final", "triaged"]);
	});
});

test("issueme_label_issue treats missing label removal as idempotent and still returns refreshed labels", async () => {
	const calls = [];
	await withMockedLabelTool(async (input, init) => {
		const url = new URL(input.toString());
		calls.push({ path: url.pathname, method: init.method });
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET" && calls.length === 1) {
			return jsonResponse(githubIssue({ labels: [{ name: "bug" }] }));
		}
		if (url.pathname === "/repos/owner/repo/issues/1/labels/missing" && init.method === "DELETE") {
			return jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
		}
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") {
			return jsonResponse(githubIssue({ labels: [{ name: "bug" }] }));
		}
		if (url.pathname === "/repos/owner/repo/issues/1/comments") return jsonResponse([]);
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, labelTool }) => {
		const result = await executeLabel(labelTool, projectRoot, { number: 1, action: "remove", labels: ["missing"] });
		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
			"GET /repos/owner/repo/issues/1",
			"DELETE /repos/owner/repo/issues/1/labels/missing",
			"GET /repos/owner/repo/issues/1",
			"GET /repos/owner/repo/issues/1/comments",
		]);
		assert.match(result.content[0].text, /Labels for issue #1: bug/);
		assert.deepEqual(result.details.issue.labels, ["bug"]);
		assert.equal(result.details.cacheUpdated, true);
		const cached = JSON.parse(await readFile(join(projectRoot, "issues", "1-label-target.json"), "utf8"));
		assert.deepEqual(cached.labels, ["bug"]);
	});
});

test("issueme_label_issue reports partial success when multi-label removal fails after a mutation", async () => {
	const calls = [];
	await withMockedLabelTool(async (input, init) => {
		const url = new URL(input.toString());
		calls.push({ path: url.pathname, method: init.method });
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") {
			return jsonResponse(githubIssue({ labels: [{ name: "one" }, { name: "two" }] }));
		}
		if (url.pathname === "/repos/owner/repo/issues/1/labels/one" && init.method === "DELETE") {
			return jsonResponse([{ name: "two" }]);
		}
		if (url.pathname === "/repos/owner/repo/issues/1/labels/two" && init.method === "DELETE") {
			return jsonResponse({ message: "temporary unavailable" }, { status: 503, statusText: "Service Unavailable" });
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, labelTool }) => {
		const result = await executeLabel(labelTool, projectRoot, { number: 1, action: "remove", labels: ["one", "two"] });
		assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
			"GET /repos/owner/repo/issues/1",
			"DELETE /repos/owner/repo/issues/1/labels/one",
			"GET /repos/owner/repo/issues/1",
			"DELETE /repos/owner/repo/issues/1/labels/two",
		]);
		assert.match(result.content[0].text, /Removed 1 label\(s\)/);
		assert.equal(result.details.result, "partial_success");
		assert.equal(result.details.status, "remote_partial_success");
		assert.equal(result.details.cacheUpdated, false);
		assert.equal(result.details.needsSync, true);
		assert.equal(result.details.error.code, "github_api_error");
	});
});

function restoreEnv(name, value) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}
