import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeIssueRecord } from "../src/issues/store.ts";
import { registerIssueMeTools } from "../src/tools/issueme-tools.ts";

const TOKEN = "ghp_sub_issue_test_token";
const REPOSITORY = "owner/repo";
const config = { issueDirectory: "issues", defaultLabels: ["default-label"], defaultAssignees: ["octocat"], defaultSkillPath: null };

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-sub-issue-tool-test-"));
}

async function execute(tool, cwd, params) {
	return tool.execute("tool-call", params, undefined, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

function githubIssue(number, title, overrides = {}) {
	const { labels = [], assignees = [], ...rest } = overrides;
	return {
		node_id: `I_${number}`,
		number,
		title,
		state: "open",
		body: `Body for ${title}`,
		labels: labels.map((name) => ({ name })),
		assignees: assignees.map((login) => ({ login })),
		milestone: null,
		html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		comments: 0,
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
		body: "stale local body",
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

function graphQLIssue(issue) {
	return {
		id: issue.node_id,
		number: issue.number,
		title: issue.title,
		state: issue.state.toUpperCase(),
		url: issue.html_url,
	};
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json", ...(init.headers ?? {}) },
	});
}

function makeSubIssueFetch(options = {}) {
	const calls = [];
	const issues = new Map([
		[1, githubIssue(1, "Parent")],
		[2, githubIssue(2, "Existing Child", { labels: ["ready"], assignees: ["hubot"] })],
	]);
	for (const issue of options.issues ?? []) issues.set(issue.number, issue);
	const parentByChild = new Map(options.parentByChild ?? [[2, 1]]);
	const childrenByParent = new Map(options.childrenByParent ?? [[1, [2]]]);
	let nextIssueNumber = 3;

	const fetchFn = async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method, path: url.pathname, body, headers: init.headers });

		if (url.pathname === "/repos/owner/repo/issues" && method === "POST") {
			const number = nextIssueNumber++;
			const issue = githubIssue(number, body.title, {
				body: body.body,
				labels: body.labels ?? [],
				assignees: body.assignees ?? [],
			});
			issues.set(number, issue);
			return jsonResponse(issue);
		}

		const issueMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)$/);
		if (issueMatch && method === "GET") {
			const number = Number(issueMatch[1]);
			const issue = issues.get(number);
			if (!issue) return jsonResponse({ message: "not found" }, { status: 404, statusText: "Not Found" });
			return jsonResponse(issue);
		}

		const commentsMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/comments$/);
		if (commentsMatch && method === "GET") {
			const number = Number(commentsMatch[1]);
			if (options.failCommentsFor === number) return jsonResponse({ message: "comment fetch failed" }, { status: 500, statusText: "Server Error" });
			return jsonResponse([]);
		}

		if (url.pathname === "/graphql" && method === "POST") {
			if (options.forbidden) {
				return jsonResponse({ data: null, errors: [{ type: "FORBIDDEN", message: "Resource not accessible by integration" }] });
			}
			if (body.operationName === "IssueMeListSubIssues") {
				if (options.unsupported) {
					return jsonResponse({ data: null, errors: [{ type: "undefinedField", message: "Field 'subIssues' doesn't exist on type 'Issue'" }] });
				}
				const issue = issues.get(body.variables.issueNumber);
				assert.ok(issue, "GraphQL issue number should resolve in mock");
				const parent = issues.get(parentByChild.get(issue.number));
				const childNumbers = childrenByParent.get(issue.number) ?? [];
				const first = body.variables.first;
				const children = childNumbers.map((number) => issues.get(number)).filter(Boolean);
				const shownChildren = children.slice(0, first);
				return jsonResponse({
					data: {
						repository: {
							issue: {
								...graphQLIssue(issue),
								parent: parent ? graphQLIssue(parent) : null,
								subIssues: {
									totalCount: children.length,
									nodes: shownChildren.map(graphQLIssue),
									pageInfo: { hasNextPage: children.length > shownChildren.length },
								},
							},
						},
					},
				});
			}
			if (body.operationName === "IssueMeReprioritizeSubIssue") {
				if (options.unsupported) {
					return jsonResponse({ data: null, errors: [{ type: "undefinedField", message: "Field 'reprioritizeSubIssue' doesn't exist on type 'Mutation'" }] });
				}
				const parent = [...issues.values()].find((issue) => issue.node_id === body.variables.issueId);
				const child = [...issues.values()].find((issue) => issue.node_id === body.variables.subIssueId);
				assert.ok(parent, "GraphQL parent issue id should resolve in reorder mock");
				assert.ok(child, "GraphQL child issue id should resolve in reorder mock");
				const current = (childrenByParent.get(parent.number) ?? []).filter((number) => number !== child.number);
				const before = [...issues.values()].find((issue) => issue.node_id === body.variables.beforeId);
				const after = [...issues.values()].find((issue) => issue.node_id === body.variables.afterId);
				if (before) {
					const index = current.indexOf(before.number);
					current.splice(index < 0 ? 0 : index, 0, child.number);
				} else if (after) {
					const index = current.indexOf(after.number);
					current.splice(index < 0 ? current.length : index + 1, 0, child.number);
				} else {
					current.push(child.number);
				}
				childrenByParent.set(parent.number, current);
				parentByChild.set(child.number, parent.number);
				return jsonResponse({
					data: {
						reprioritizeSubIssue: {
							issue: graphQLIssue(parent),
							subIssue: graphQLIssue(child),
						},
					},
				});
			}
			const parent = [...issues.values()].find((issue) => issue.node_id === body.variables.issueId);
			const child = [...issues.values()].find((issue) => issue.node_id === body.variables.subIssueId);
			assert.ok(parent, "GraphQL parent issue id should resolve in mock");
			assert.ok(child, "GraphQL child issue id should resolve in mock");
			const field = body.query.includes("removeSubIssue") ? "removeSubIssue" : "addSubIssue";
			if (field === "addSubIssue") {
				parentByChild.set(child.number, parent.number);
				childrenByParent.set(parent.number, [...new Set([...(childrenByParent.get(parent.number) ?? []), child.number])]);
			} else {
				parentByChild.delete(child.number);
				childrenByParent.set(parent.number, (childrenByParent.get(parent.number) ?? []).filter((number) => number !== child.number));
			}
			return jsonResponse({
				data: {
					[field]: {
						issue: graphQLIssue(parent),
						subIssue: graphQLIssue(child),
					},
				},
			});
		}

		throw new Error(`Unexpected GitHub mock request: ${method} ${url.pathname}`);
	};

	return { calls, fetchFn, issues, parentByChild, childrenByParent };
}

function registerInjectedTools(fetchFn) {
	const pi = fakePi();
	registerIssueMeTools(pi, {
		runtime: {
			config,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	});
	return pi.tools;
}

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

test("issueme_create_sub_issue creates an issue, links it natively, and caches relationship metadata", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch();
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_create_sub_issue"), projectRoot, {
		parentNumber: 1,
		title: "Created Native Child",
		body: "Child body",
		labels: ["bug"],
		assignees: ["hubot"],
	});

	assert.equal(result.details.result, "success");
	assert.equal(result.details.issue.number, 3);
	assert.deepEqual(result.details.paths.sort(), ["issues/1-parent.json", "issues/3-created-native-child.json"]);
	const child = await readJson(join(projectRoot, "issues", "3-created-native-child.json"));
	const parent = await readJson(join(projectRoot, "issues", "1-parent.json"));
	assert.deepEqual(child.labels, ["bug"]);
	assert.deepEqual(child.assignees, ["hubot"]);
	assert.equal(child.parent_issue.number, 1);
	assert.deepEqual(parent.sub_issues.map((issue) => issue.number), [2, 3]);
	const graphQlCall = mock.calls.find((call) => call.path === "/graphql" && /addSubIssue/.test(call.body.query));
	assert.equal(graphQlCall.body.variables.issueId, "I_1");
	assert.equal(graphQlCall.body.variables.subIssueId, "I_3");
	assert.match(graphQlCall.body.query, /addSubIssue/);
	assert.equal(graphQlCall.headers["GraphQL-Features"], "sub_issues");
});

test("issueme_add_sub_issue attaches an existing issue and refreshes stale local cache files", async () => {
	const projectRoot = await tempProject();
	await writeIssueRecord(projectRoot, config, issueRecord(1, "Old Parent"));
	await writeIssueRecord(projectRoot, config, issueRecord(2, "Old Child"));
	const mock = makeSubIssueFetch();
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_add_sub_issue"), projectRoot, { parentNumber: 1, childNumber: 2 });

	assert.equal(result.details.result, "success");
	assert.deepEqual(result.details.paths.sort(), ["issues/1-parent.json", "issues/2-existing-child.json"]);
	assert.deepEqual(result.details.removedPaths.sort(), ["issues/1-old-parent.json", "issues/2-old-child.json"]);
	const parent = await readJson(join(projectRoot, "issues", "1-parent.json"));
	const child = await readJson(join(projectRoot, "issues", "2-existing-child.json"));
	assert.equal(parent.title, "Parent");
	assert.equal(parent.sub_issues[0].number, 2);
	assert.equal(child.title, "Existing Child");
	assert.equal(child.parent_issue.number, 1);
	assert.equal(mock.calls.some((call) => call.path === "/graphql" && /addSubIssue/.test(call.body.query)), true);
});

test("issueme_remove_sub_issue preserves remaining parent children in local cache", async () => {
	const projectRoot = await tempProject();
	await writeIssueRecord(projectRoot, config, issueRecord(1, "Old Parent"));
	await writeIssueRecord(projectRoot, config, issueRecord(2, "Old Child"));
	const sibling = githubIssue(3, "Remaining Child");
	const mock = makeSubIssueFetch({
		issues: [sibling],
		childrenByParent: [[1, [2, 3]]],
		parentByChild: [[2, 1], [3, 1]],
	});
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_remove_sub_issue"), projectRoot, { parentNumber: 1, childNumber: 2 });

	assert.equal(result.details.result, "success");
	assert.deepEqual(result.details.paths.sort(), ["issues/1-parent.json", "issues/2-existing-child.json"]);
	assert.deepEqual(result.details.removedPaths.sort(), ["issues/1-old-parent.json", "issues/2-old-child.json"]);
	assert.deepEqual(mock.childrenByParent.get(1), [3]);
	const parent = await readJson(join(projectRoot, "issues", "1-parent.json"));
	const removedChild = await readJson(join(projectRoot, "issues", "2-existing-child.json"));
	assert.deepEqual(parent.sub_issues.map((issue) => issue.number), [3]);
	assert.equal(parent.sub_issues_count, 1);
	assert.equal(removedChild.parent_issue, null);
	assert.equal(mock.calls.some((call) => call.path === "/graphql" && /removeSubIssue/.test(call.body.query)), true);
});

test("issueme_reorder_sub_issues reorders native children and refreshes relationship metadata", async () => {
	const projectRoot = await tempProject();
	await writeIssueRecord(projectRoot, config, issueRecord(1, "Old Parent"));
	const children = [
		githubIssue(2, "First Child"),
		githubIssue(3, "Second Child"),
		githubIssue(4, "Priority Child"),
	];
	const mock = makeSubIssueFetch({
		issues: children,
		childrenByParent: [[1, [2, 3, 4]]],
		parentByChild: children.map((issue) => [issue.number, 1]),
	});
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_reorder_sub_issues"), projectRoot, { parentNumber: 1, orderedChildNumbers: [4, 2, 3] });

	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "reorder_sub_issues");
	assert.deepEqual(result.details.issue.subIssues.map((issue) => issue.number), [4, 2, 3]);
	assert.deepEqual(mock.childrenByParent.get(1), [4, 2, 3]);
	assert.equal(result.details.counts.mutations, 1);
	assert.deepEqual(result.details.changedFields, ["sub_issues"]);
	assert.deepEqual(result.details.paths.sort(), ["issues/1-parent.json", "issues/2-first-child.json", "issues/3-second-child.json", "issues/4-priority-child.json"]);
	const parent = await readJson(join(projectRoot, "issues", "1-parent.json"));
	assert.deepEqual(parent.sub_issues.map((issue) => issue.number), [4, 2, 3]);
	const priorityChild = await readJson(join(projectRoot, "issues", "4-priority-child.json"));
	assert.equal(priorityChild.parent_issue.number, 1);
	const reorderCall = mock.calls.find((call) => call.path === "/graphql" && call.body.operationName === "IssueMeReprioritizeSubIssue");
	assert.ok(reorderCall);
	assert.match(reorderCall.body.query, /reprioritizeSubIssue/);
	assert.deepEqual(reorderCall.body.variables, { issueId: "I_1", subIssueId: "I_4", beforeId: "I_2" });
	assert.equal(reorderCall.headers["GraphQL-Features"], "sub_issues");
});

test("issueme_reorder_sub_issues rejects incomplete or invalid child lists before mutation", async () => {
	const projectRoot = await tempProject();
	const children = [githubIssue(2, "First Child"), githubIssue(3, "Second Child")];
	const mock = makeSubIssueFetch({
		issues: children,
		childrenByParent: [[1, [2, 3]]],
		parentByChild: children.map((issue) => [issue.number, 1]),
	});
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_reorder_sub_issues"), projectRoot, { parentNumber: 1, orderedChildNumbers: [2, 999] });

	assert.equal(result.details.result, "error");
	assert.equal(result.details.error.code, "invalid_tool_input");
	assert.match(result.content[0].text, /every current native sub-issue/i);
	assert.equal(mock.calls.some((call) => call.path === "/graphql" && call.body.operationName === "IssueMeReprioritizeSubIssue"), false);
});

test("issueme_reorder_sub_issues reports permission and cache-refresh failures safely", async () => {
	const projectRoot = await tempProject();
	const children = [githubIssue(2, "First Child"), githubIssue(3, "Priority Child")];
	const forbiddenTools = registerInjectedTools(makeSubIssueFetch({
		forbidden: true,
		issues: children,
		childrenByParent: [[1, [2, 3]]],
		parentByChild: children.map((issue) => [issue.number, 1]),
	}).fetchFn);
	const forbiddenResult = await execute(forbiddenTools.get("issueme_reorder_sub_issues"), projectRoot, { parentNumber: 1, orderedChildNumbers: [3, 2] });
	assert.equal(forbiddenResult.details.result, "error");
	assert.equal(forbiddenResult.details.error.code, "github_sub_issue_forbidden");
	assert.match(forbiddenResult.content[0].text, /did not fall back to body-only ordering/i);

	const partialMock = makeSubIssueFetch({
		failCommentsFor: 3,
		issues: children,
		childrenByParent: [[1, [2, 3]]],
		parentByChild: children.map((issue) => [issue.number, 1]),
	});
	const partialTools = registerInjectedTools(partialMock.fetchFn);
	const partialResult = await execute(partialTools.get("issueme_reorder_sub_issues"), projectRoot, { parentNumber: 1, orderedChildNumbers: [3, 2] });
	assert.equal(partialResult.details.result, "partial_success");
	assert.equal(partialResult.details.cacheUpdated, false);
	assert.equal(partialResult.details.needsSync, true);
	assert.equal(partialResult.details.error.details.partialSuccessStatus, "sub_issue_cache_refresh_failed");
	assert.match(partialResult.content[0].text, /order changed on GitHub, but local cache refresh failed/i);
});

test("issueme_list_sub_issues inspects parent and child relationship shapes without refreshing cache", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch();
	const tools = registerInjectedTools(mock.fetchFn);

	const parentResult = await execute(tools.get("issueme_list_sub_issues"), projectRoot, { issueNumber: 1, limit: 10 });
	assert.equal(parentResult.details.result, "success");
	assert.equal(parentResult.details.cacheUpdated, false);
	assert.equal(parentResult.details.issue.number, 1);
	assert.equal(parentResult.details.issue.parentIssue, null);
	assert.deepEqual(parentResult.details.issue.subIssues.map((issue) => issue.number), [2]);
	assert.equal(parentResult.details.counts.subIssuesTotal, 1);
	assert.match(parentResult.content[0].text, /Local cache was not refreshed/);

	const childResult = await execute(tools.get("issueme_list_sub_issues"), projectRoot, { issueNumber: 2 });
	assert.equal(childResult.details.issue.parentIssue.number, 1);
	assert.deepEqual(childResult.details.issue.subIssues, []);
	assert.equal(mock.calls.filter((call) => call.path === "/graphql" && call.body.operationName === "IssueMeListSubIssues").length, 2);
});

test("issueme_list_sub_issues reports no native relationships clearly", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch({
		issues: [githubIssue(50, "Lonely")],
		parentByChild: [],
		childrenByParent: [],
	});
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_list_sub_issues"), projectRoot, { issueNumber: 50 });

	assert.equal(result.details.issue.parentIssue, null);
	assert.deepEqual(result.details.issue.subIssues, []);
	assert.equal(result.details.counts.subIssuesTotal, 0);
	assert.match(result.content[0].text, /Parent: none/);
	assert.match(result.content[0].text, /Sub-issues: none/);
});

test("issueme_list_sub_issues bounds large native sub-issue lists with truncation metadata", async () => {
	const projectRoot = await tempProject();
	const manyChildren = Array.from({ length: 12 }, (_, index) => githubIssue(index + 10, `Child ${index + 10}`));
	const mock = makeSubIssueFetch({
		issues: manyChildren,
		childrenByParent: [[1, manyChildren.map((issue) => issue.number)]],
		parentByChild: manyChildren.map((issue) => [issue.number, 1]),
	});
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_list_sub_issues"), projectRoot, { issueNumber: 1, limit: 5 });

	assert.equal(result.details.truncated, true);
	assert.equal(result.details.issue.subIssues.length, 5);
	assert.equal(result.details.counts.subIssuesTotal, 12);
	assert.deepEqual(result.details.truncation.subIssues, { shown: 5, total: 12, max: 5 });
	assert.match(result.content[0].text, /5 shown of 12/);
});

test("issueme_list_sub_issues intentionally refreshes local relationship metadata", async () => {
	const projectRoot = await tempProject();
	await writeIssueRecord(projectRoot, config, issueRecord(1, "Old Parent"));
	await writeIssueRecord(projectRoot, config, issueRecord(2, "Old Child"));
	const mock = makeSubIssueFetch();
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_list_sub_issues"), projectRoot, { issueNumber: 2, refreshCache: true });

	assert.equal(result.details.result, "success");
	assert.equal(result.details.cacheUpdated, true);
	assert.deepEqual(result.details.paths.sort(), ["issues/1-parent.json", "issues/2-existing-child.json"]);
	assert.deepEqual(result.details.removedPaths.sort(), ["issues/1-old-parent.json", "issues/2-old-child.json"]);
	assert.deepEqual(result.details.fileActions.map((action) => action.issue.number).sort((a, b) => a - b), [1, 2]);
	const parent = await readJson(join(projectRoot, "issues", "1-parent.json"));
	const child = await readJson(join(projectRoot, "issues", "2-existing-child.json"));
	assert.equal(parent.sub_issues[0].number, 2);
	assert.equal(parent.sub_issues_count, 1);
	assert.equal(child.parent_issue.number, 1);
	assert.equal(mock.calls.filter((call) => call.path === "/graphql" && call.body.operationName === "IssueMeListSubIssues").length, 2);
});

test("issueme_list_sub_issues reports forbidden or unsupported native sub-issue GraphQL clearly", async () => {
	const projectRoot = await tempProject();
	const forbiddenTools = registerInjectedTools(makeSubIssueFetch({ forbidden: true }).fetchFn);
	await assert.rejects(
		() => execute(forbiddenTools.get("issueme_list_sub_issues"), projectRoot, { issueNumber: 1 }),
		(error) => error?.code === "github_sub_issue_forbidden" && /did not fall back/i.test(error.message),
	);

	const unsupportedTools = registerInjectedTools(makeSubIssueFetch({ unsupported: true }).fetchFn);
	await assert.rejects(
		() => execute(unsupportedTools.get("issueme_list_sub_issues"), projectRoot, { issueNumber: 1 }),
		(error) => error?.code === "github_sub_issue_unsupported" && /unsupported|unavailable/i.test(error.message),
	);
});

test("issueme_create_sub_issue reports forbidden native sub-issue permissions without body-only fallback", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch({ forbidden: true });
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_create_sub_issue"), projectRoot, {
		parentNumber: 1,
		title: "Permission Child",
		body: "Child body",
	});

	assert.equal(result.details.result, "error");
	assert.equal(result.details.error.code, "github_sub_issue_forbidden");
	assert.match(result.details.error.message, /lacks permission for native sub-issues/i);
	assert.match(result.content[0].text, /did not fall back to body-only references/i);
	assert.equal(result.details.cacheUpdated, true);
	assert.equal(result.details.needsSync, false);
	const child = await readJson(join(projectRoot, "issues", "3-permission-child.json"));
	assert.equal(child.title, "Permission Child");
	assert.equal(child.parent_issue, undefined);
	assert.equal(mock.calls.some((call) => call.path === "/graphql" && /addSubIssue/.test(call.body.query)), true);
});
