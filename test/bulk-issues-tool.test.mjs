import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeIssueRecord } from "../src/issues/store.ts";
import { registerBulkIssueOperationsTool } from "../src/tools/bulk-issues.ts";

const TOKEN = "ghp_bulk_secret";
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
	return mkdtemp(join(tmpdir(), "issueme-bulk-tool-test-"));
}

function registerBulkTool(fetchFn) {
	const pi = fakePi();
	registerBulkIssueOperationsTool(pi, {
		runtime: {
			config,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	});
	return pi.tools.get("issueme_bulk_update_issues");
}

async function executeBulk(tool, cwd, params) {
	return tool.execute("bulk-call", params, undefined, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

function githubIssue(number, title, overrides = {}) {
	const { labels = [], assignees = [], milestone = null, commentsCount = 0, ...rest } = overrides;
	return {
		node_id: `I_${number}`,
		number,
		title,
		state: "open",
		body: `Body for ${title}`,
		labels: labels.map((name) => ({ name })),
		assignees: assignees.map((login) => ({ login })),
		milestone,
		html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		comments: commentsCount,
		...rest,
	};
}

function issueRecord(number, title, overrides = {}) {
	return {
		schemaVersion: 1,
		repository: REPOSITORY,
		number,
		title,
		state: "open",
		body: "Local body",
		labels: [],
		assignees: [],
		milestone: null,
		comments: [],
		html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		synced_at: "2026-06-27T00:00:01Z",
		...overrides,
	};
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json", ...(init.headers ?? {}) },
	});
}

function noContentResponse() {
	return new Response(null, { status: 204, statusText: "No Content" });
}

function assertNoToken(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TOKEN));
}

test("issueme_bulk_update_issues adds labels to explicit issue numbers sequentially", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const issues = new Map([
		[1, githubIssue(1, "First Target")],
		[2, githubIssue(2, "Second Target")],
	]);
	const tool = registerBulkTool(async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method, path: url.pathname, body, authorization: init.headers?.Authorization });

		const issueMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)$/);
		if (issueMatch && method === "GET") return jsonResponse(issues.get(Number(issueMatch[1])));

		const labelMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/labels$/);
		if (labelMatch && method === "POST") {
			const number = Number(labelMatch[1]);
			const issue = issues.get(number);
			const current = issue.labels.map((label) => label.name);
			const labels = [...new Set([...current, ...body.labels])];
			issues.set(number, githubIssue(number, issue.title, { labels }));
			return jsonResponse(labels.map((name) => ({ name })));
		}

		const commentsMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/comments$/);
		if (commentsMatch && method === "GET") return jsonResponse([]);

		throw new Error(`Unexpected bulk label request: ${method} ${url.pathname}`);
	});

	const result = await executeBulk(tool, projectRoot, { issueNumbers: [1, 2], action: "add_labels", labels: ["triage"] });

	assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
		"GET /repos/owner/repo/issues/1",
		"POST /repos/owner/repo/issues/1/labels",
		"GET /repos/owner/repo/issues/1",
		"GET /repos/owner/repo/issues/1/comments",
		"GET /repos/owner/repo/issues/2",
		"POST /repos/owner/repo/issues/2/labels",
		"GET /repos/owner/repo/issues/2",
		"GET /repos/owner/repo/issues/2/comments",
	]);
	assert.ok(calls.every((call) => call.authorization === `Bearer ${TOKEN}`));
	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "bulk_success");
	assert.deepEqual(result.details.counts, { requested: 2, succeeded: 2, partial: 0, failed: 0, skipped: 0 });
	assert.deepEqual(result.details.bulkResults.map((item) => item.status), ["success", "success"]);
	assert.deepEqual(result.details.bulkResults.map((item) => item.number), [1, 2]);
	assert.deepEqual(result.details.issues.map((item) => item.labels), [["triage"], ["triage"]]);
	assert.deepEqual(result.details.paths, ["issues/1-first-target.json", "issues/2-second-target.json"]);
	assert.match(result.content[0].text, /explicit issueNumbers only/);
	assertNoToken(result);
});

test("issueme_bulk_update_issues adds explicitly listed issues to a project and returns item details", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const issue = githubIssue(7, "Project Target");
	const tool = registerBulkTool(async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method, path: url.pathname, body });

		if (url.pathname === "/repos/owner/repo/issues/7" && method === "GET") return jsonResponse(issue);
		if (url.pathname === "/graphql" && method === "POST" && body.operationName === "IssueMeAddIssueToProjectV2") {
			return jsonResponse({
				data: {
					addProjectV2ItemById: {
						item: {
							id: "PVTI_existing_7",
							type: "ISSUE",
							project: {
								id: "PVT_roadmap",
								title: "Roadmap",
								number: 1,
								url: "https://github.com/users/owner/projects/1",
								closed: false,
								public: false,
								owner: { __typename: "User", login: "owner" },
							},
							content: { __typename: "Issue", id: "I_7", number: 7, title: "Project Target", state: "OPEN", url: `https://github.com/${REPOSITORY}/issues/7` },
						},
					},
				},
			});
		}

		throw new Error(`Unexpected bulk project request: ${method} ${url.pathname}`);
	});

	const result = await executeBulk(tool, projectRoot, { issueNumbers: [7], action: "add_to_project", projectId: "PVT_roadmap" });

	assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
		"GET /repos/owner/repo/issues/7",
		"POST /graphql",
	]);
	assert.equal(calls[1].body.variables.projectId, "PVT_roadmap");
	assert.equal(calls[1].body.variables.contentId, "I_7");
	assert.equal(result.details.result, "success");
	assert.equal(result.details.cacheUpdated, false);
	assert.deepEqual(result.details.paths, []);
	assert.equal(result.details.bulkResults[0].projectItem.id, "PVTI_existing_7");
	assert.match(result.content[0].text, /Added or confirmed issue #7/);
	assertNoToken(result);
});

test("issueme_bulk_update_issues reports per-issue closed failures and continues only when requested", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const issues = new Map([
		[1, githubIssue(1, "Open One")],
		[2, githubIssue(2, "Closed Two", { state: "closed", closed_at: "2026-06-27T01:00:00Z" })],
		[3, githubIssue(3, "Open Three")],
	]);
	const tool = registerBulkTool(async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method, path: url.pathname, body });

		const issueMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)$/);
		if (issueMatch && method === "GET") return jsonResponse(issues.get(Number(issueMatch[1])));

		const assigneeMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/assignees$/);
		if (assigneeMatch && method === "POST") {
			const number = Number(assigneeMatch[1]);
			const issue = issues.get(number);
			const current = issue.assignees.map((assignee) => assignee.login);
			const assignees = [...new Set([...current, ...body.assignees])];
			const updated = githubIssue(number, issue.title, { assignees });
			issues.set(number, updated);
			return jsonResponse(updated);
		}

		const commentsMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/comments$/);
		if (commentsMatch && method === "GET") return jsonResponse([]);

		throw new Error(`Unexpected bulk assign request: ${method} ${url.pathname}`);
	});

	const result = await executeBulk(tool, projectRoot, {
		issueNumbers: [1, 2, 3],
		action: "assign",
		assignees: ["octocat"],
		continueOnError: true,
	});

	assert.equal(result.details.result, "partial_success");
	assert.equal(result.details.status, "bulk_partial_success");
	assert.deepEqual(result.details.counts, { requested: 3, succeeded: 2, partial: 0, failed: 1, skipped: 0 });
	assert.deepEqual(result.details.bulkResults.map((item) => item.status), ["success", "failed", "success"]);
	assert.equal(result.details.bulkResults[1].error.code, "closed_issue_mutation_refused");
	assert.match(result.details.bulkResults[1].message, /refuses this closed-issue mutation/);
	assert.deepEqual(calls.filter((call) => call.path.includes("/issues/2/")).map((call) => call.method), []);
	assert.equal(calls.some((call) => call.path === "/repos/owner/repo/issues/2/assignees"), false);
	assert.equal(calls.some((call) => call.path === "/repos/owner/repo/issues/3/assignees"), true);
	assertNoToken(result);
});

test("issueme_bulk_update_issues stops by default after a failed issue and marks later issues skipped", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const issues = new Map([
		[1, githubIssue(1, "Milestone One")],
		[2, githubIssue(2, "Milestone Two")],
		[3, githubIssue(3, "Milestone Three")],
	]);
	const tool = registerBulkTool(async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method, path: url.pathname, body });

		const issueMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)$/);
		if (issueMatch) {
			const number = Number(issueMatch[1]);
			const issue = issues.get(number);
			if (method === "GET") return jsonResponse(issue);
			if (method === "PATCH" && number === 1) {
				const updated = githubIssue(number, issue.title, { milestone: { number: body.milestone, title: "v1.0" } });
				issues.set(number, updated);
				return jsonResponse(updated);
			}
			if (method === "PATCH" && number === 2) return jsonResponse({ message: `validation failed ${TOKEN}` }, { status: 422, statusText: "Unprocessable Entity" });
		}

		const commentsMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/comments$/);
		if (commentsMatch && method === "GET") return jsonResponse([]);

		throw new Error(`Unexpected bulk milestone request: ${method} ${url.pathname}`);
	});

	const result = await executeBulk(tool, projectRoot, { issueNumbers: [1, 2, 3], action: "set_milestone", milestoneNumber: 1 });

	assert.equal(result.details.result, "partial_success");
	assert.deepEqual(result.details.counts, { requested: 3, succeeded: 1, partial: 0, failed: 1, skipped: 1 });
	assert.deepEqual(result.details.bulkResults.map((item) => item.status), ["success", "failed", "skipped"]);
	assert.equal(result.details.bulkResults[1].error.code, "github_api_error");
	assert.doesNotMatch(result.details.bulkResults[1].error.message, new RegExp(TOKEN));
	assert.equal(calls.some((call) => call.path === "/repos/owner/repo/issues/3"), false);
	assert.match(result.content[0].text, /Do not blindly rerun/);
	assertNoToken(result);
});

test("issueme_bulk_update_issues treats already closed close actions as idempotent local cleanup", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const tool = registerBulkTool(async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		calls.push({ method, path: url.pathname });
		if (url.pathname === "/repos/owner/repo/issues/5" && method === "GET") {
			return jsonResponse(githubIssue(5, "Already Closed", { state: "closed", closed_at: "2026-06-27T01:00:00Z" }));
		}
		throw new Error(`Unexpected bulk close request: ${method} ${url.pathname}`);
	});

	await writeIssueRecord(projectRoot, config, issueRecord(5, "Already Closed"));
	const result = await executeBulk(tool, projectRoot, { issueNumbers: [5], action: "close", reason: "not_planned" });

	assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), ["GET /repos/owner/repo/issues/5"]);
	assert.equal(result.details.result, "success");
	assert.deepEqual(result.details.bulkResults[0].changedFields, []);
	assert.deepEqual(result.details.removedPaths, ["issues/5-already-closed.json"]);
	assert.match(result.details.bulkResults[0].message, /already closed/);
	assert.deepEqual(await readdir(join(projectRoot, "issues")), []);
	assertNoToken(result);
});

test("issueme_bulk_update_issues rejects unsafe bulk shapes before runtime resolution", async () => {
	const tool = registerBulkTool(async () => {
		throw new Error("fetch should not be reached for invalid bulk input");
	});
	const projectRoot = await tempProject();

	await assert.rejects(
		() => executeBulk(tool, projectRoot, { issueNumbers: Array.from({ length: 51 }, (_, index) => index + 1), action: "add_labels", labels: ["bug"] }),
		(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === "issueNumbers",
	);
	await assert.rejects(
		() => executeBulk(tool, projectRoot, { issueNumbers: [1, 1], action: "add_labels", labels: ["bug"] }),
		(error) => error?.code === "invalid_tool_input" && /duplicates/.test(error.message),
	);
	await assert.rejects(
		() => executeBulk(tool, projectRoot, { issueNumbers: [1], action: "close", labels: ["bug"] }),
		(error) => error?.code === "invalid_tool_input" && /do not apply/.test(error.message),
	);
});
