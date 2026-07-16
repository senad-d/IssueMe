import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeIssueRecord } from "../src/issues/store.ts";
import { registerIssueMeTools } from "../src/tools/issueme-tools.ts";

const TOKEN = "ghp_sub_issue_test_token";
const REPOSITORY = "owner/repo";
const config = { issueDirectory: "issues", defaultLabels: ["default-label"], defaultAssignees: ["octocat"], defaultSkillPath: null };
const restrictedConfig = { ...config, allowedIssueCreator: "hubot" };

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

async function execute(tool, cwd, params, signal) {
	return tool.execute("tool-call", params, signal, undefined, {
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
		...(issue.user?.login ? { author: { login: issue.user.login } } : {}),
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

		if (url.pathname === "/user" && method === "GET") {
			return jsonResponse({ login: options.authenticatedUser ?? "hubot" });
		}

		if (url.pathname === "/repos/owner/repo/issues" && method === "POST") {
			const number = nextIssueNumber++;
			const issue = githubIssue(number, body.title, {
				body: body.body,
				labels: body.labels ?? [],
				assignees: body.assignees ?? [],
				user: { login: options.createdIssueCreator ?? options.authenticatedUser ?? "hubot" },
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
						},
					},
				});
			}
			if (options.unsupported && body.operationName === "IssueMeAddSubIssue") {
				return jsonResponse({ data: null, errors: [{ type: "undefinedField", message: "Field 'addSubIssue' doesn't exist on type 'Mutation'" }] });
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

function registerInjectedTools(fetchFn, runtimeConfig = config) {
	const pi = fakePi();
	registerIssueMeTools(pi, {
		runtime: {
			config: runtimeConfig,
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

test("issueme_create_sub_issue rejects over-limit collections before runtime resolution", async () => {
	const projectRoot = await tempProject();
	let runtimeCalls = 0;
	const pi = fakePi();
	registerIssueMeTools(pi, {
		runtime: () => {
			runtimeCalls += 1;
			throw new Error("runtime resolution must not run for over-limit input");
		},
	});
	for (const [field, values] of [
		["labels", Array.from({ length: 26 }, (_, index) => `label-${index}`)],
		["assignees", Array.from({ length: 26 }, (_, index) => `user-${index}`)],
	]) {
		await assert.rejects(
			() => execute(pi.tools.get("issueme_create_sub_issue"), projectRoot, { parentNumber: 1, title: "Child", body: "Body", [field]: values }),
			(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === field && error.safeDetails?.max === 25,
		);
	}
	assert.equal(runtimeCalls, 0);
});

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

test("restricted issueme_create_sub_issue verifies parent creator and authenticated user before remote create", async () => {
	const projectRoot = await tempProject();
	const allowedParent = githubIssue(1, "Parent", { user: { login: "Hubot" } });
	const allowedExistingChild = githubIssue(2, "Existing Child", { user: { login: "hubot" } });
	const mock = makeSubIssueFetch({ issues: [allowedParent, allowedExistingChild], authenticatedUser: "hubot" });
	const tools = registerInjectedTools(mock.fetchFn, restrictedConfig);

	const result = await execute(tools.get("issueme_create_sub_issue"), projectRoot, {
		parentNumber: 1,
		title: "Allowed Native Child",
		body: "Child body",
	});

	const sequence = mock.calls.map((call) => `${call.method} ${call.path}`);
	assert.equal(sequence.indexOf("GET /repos/owner/repo/issues/1"), 0);
	assert.ok(sequence.indexOf("GET /user") > sequence.indexOf("GET /repos/owner/repo/issues/1"));
	assert.ok(sequence.indexOf("POST /repos/owner/repo/issues") > sequence.indexOf("GET /user"));
	assert.equal(result.details.result, "success");
	assert.equal(result.details.creatorScope, "hubot");
	assert.equal(result.details.issue.creator, "hubot");
	const child = await readJson(join(projectRoot, "issues", "3-allowed-native-child.json"));
	assert.equal(child.creator, "hubot");
});

test("restricted issueme_create_sub_issue refuses token-user mismatch before creating a remote issue", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch({
		issues: [githubIssue(1, "Parent", { user: { login: "hubot" } }), githubIssue(2, "Existing Child", { user: { login: "hubot" } })],
		authenticatedUser: "intruder",
	});
	const tools = registerInjectedTools(mock.fetchFn, restrictedConfig);

	await assert.rejects(
		() => execute(tools.get("issueme_create_sub_issue"), projectRoot, { parentNumber: 1, title: "Blocked Child", body: "Child body" }),
		(error) => error?.code === "issue_creator_not_allowed" && error.safeDetails?.authenticatedUser === "intruder",
	);
	assert.deepEqual(mock.calls.map((call) => `${call.method} ${call.path}`), [
		"GET /repos/owner/repo/issues/1",
		"GET /user",
	]);
	await assert.rejects(() => readdir(join(projectRoot, "issues")), { code: "ENOENT" });
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

test("issueme_add_sub_issue reports native attachment failures without body fallbacks", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch({ forbidden: true });
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_add_sub_issue"), projectRoot, { parentNumber: 1, childNumber: 2 });

	assert.equal(result.details.result, "error");
	assert.equal(result.details.status, "sub_issue_attach_failed");
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, false);
	assert.equal(result.details.error.code, "github_sub_issue_forbidden");
	assert.match(result.content[0].text, /did not fall back to body-only references/i);
	assert.equal(mock.calls.some((call) => call.path === "/graphql" && /addSubIssue/.test(call.body.query)), true);
	await assert.rejects(() => readdir(join(projectRoot, "issues")), { code: "ENOENT" });
});

test("restricted issueme_add_sub_issue refuses disallowed child before native GraphQL mutation", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch({
		issues: [
			githubIssue(1, "Parent", { user: { login: "hubot" } }),
			githubIssue(2, "Intruder Child", { user: { login: "intruder" } }),
		],
	});
	const tools = registerInjectedTools(mock.fetchFn, restrictedConfig);

	await assert.rejects(
		() => execute(tools.get("issueme_add_sub_issue"), projectRoot, { parentNumber: 1, childNumber: 2 }),
		(error) => error?.code === "issue_creator_not_allowed" && error.safeDetails?.issueNumber === 2,
	);
	assert.deepEqual(mock.calls.map((call) => `${call.method} ${call.path}`), [
		"GET /repos/owner/repo/issues/1",
		"GET /repos/owner/repo/issues/2",
	]);
	assert.equal(mock.calls.some((call) => call.path === "/graphql"), false);
	await assert.rejects(() => readdir(join(projectRoot, "issues")), { code: "ENOENT" });
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

test("restricted issueme_remove_sub_issue refuses disallowed parent before native GraphQL mutation", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch({
		issues: [
			githubIssue(1, "Intruder Parent", { user: { login: "intruder" } }),
			githubIssue(2, "Allowed Child", { user: { login: "hubot" } }),
		],
	});
	const tools = registerInjectedTools(mock.fetchFn, restrictedConfig);

	await assert.rejects(
		() => execute(tools.get("issueme_remove_sub_issue"), projectRoot, { parentNumber: 1, childNumber: 2 }),
		(error) => error?.code === "issue_creator_not_allowed" && error.safeDetails?.issueNumber === 1,
	);
	assert.deepEqual(mock.calls.map((call) => `${call.method} ${call.path}`), ["GET /repos/owner/repo/issues/1"]);
	assert.equal(mock.calls.some((call) => call.path === "/graphql"), false);
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
	assert.doesNotMatch(reorderCall.body.query, /\bsubIssue\s*\{/);
	assert.deepEqual(reorderCall.body.variables, { issueId: "I_1", subIssueId: "I_4", beforeId: "I_2" });
	assert.equal(mock.calls.filter((call) => call.path === "/graphql" && call.body.operationName === "IssueMeListSubIssues").length, 2);
	assert.equal(reorderCall.headers["GraphQL-Features"], "sub_issues");
});

test("restricted issueme_reorder_sub_issues refuses disallowed visible children before reprioritize", async () => {
	const projectRoot = await tempProject();
	const children = [
		githubIssue(2, "Allowed Child", { user: { login: "hubot" } }),
		githubIssue(3, "Intruder Child", { user: { login: "intruder" } }),
	];
	const mock = makeSubIssueFetch({
		issues: [githubIssue(1, "Parent", { user: { login: "hubot" } }), ...children],
		childrenByParent: [[1, [2, 3]]],
		parentByChild: children.map((issue) => [issue.number, 1]),
	});
	const tools = registerInjectedTools(mock.fetchFn, restrictedConfig);

	await assert.rejects(
		() => execute(tools.get("issueme_reorder_sub_issues"), projectRoot, { parentNumber: 1, orderedChildNumbers: [3, 2] }),
		(error) => error?.code === "issue_creator_not_allowed" && error.safeDetails?.issueNumber === 3,
	);

	assert.equal(mock.calls.some((call) => call.path === "/graphql" && call.body.operationName === "IssueMeReprioritizeSubIssue"), false);
	await assert.rejects(() => readdir(join(projectRoot, "issues")), { code: "ENOENT" });
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

	await assert.rejects(
		() => execute(tools.get("issueme_reorder_sub_issues"), projectRoot, { parentNumber: 1, orderedChildNumbers: [2, 999] }),
		(error) => error?.code === "invalid_tool_input" && /every current native sub-issue/i.test(error.message),
	);

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

test("native sub-issue mutations return retry-safe partial success for malformed accepted responses", async () => {
	for (const scenario of [
		{ toolName: "issueme_add_sub_issue", operationName: "IssueMeAddSubIssue", field: "addSubIssue", params: { parentNumber: 1, childNumber: 2 }, status: "sub_issue_attach_response_partial_success" },
		{ toolName: "issueme_remove_sub_issue", operationName: "IssueMeRemoveSubIssue", field: "removeSubIssue", params: { parentNumber: 1, childNumber: 2 }, status: "sub_issue_remove_response_partial_success" },
	]) {
		const projectRoot = await tempProject();
		const mock = makeSubIssueFetch();
		const tools = registerInjectedTools(async (input, init = {}) => {
			const body = init.body === undefined ? undefined : JSON.parse(init.body);
			if (body?.operationName === scenario.operationName) return jsonResponse({ data: { [scenario.field]: {} } });
			return mock.fetchFn(input, init);
		});
		const result = await execute(tools.get(scenario.toolName), projectRoot, scenario.params);
		assert.equal(result.details.result, "partial_success", scenario.toolName);
		assert.equal(result.details.status, scenario.status, scenario.toolName);
		assert.equal(result.details.error.details.mutationSettlement, "remote_success_known", scenario.toolName);
		assert.match(result.content[0].text, /Do not repeat the mutation blindly/, scenario.toolName);
	}

	const projectRoot = await tempProject();
	const children = [githubIssue(2, "First Child"), githubIssue(3, "Priority Child")];
	const mock = makeSubIssueFetch({
		issues: children,
		childrenByParent: [[1, [2, 3]]],
		parentByChild: children.map((issue) => [issue.number, 1]),
	});
	const tools = registerInjectedTools(async (input, init = {}) => {
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		if (body?.operationName === "IssueMeReprioritizeSubIssue") return jsonResponse({ data: { reprioritizeSubIssue: {} } });
		return mock.fetchFn(input, init);
	});
	const result = await execute(tools.get("issueme_reorder_sub_issues"), projectRoot, { parentNumber: 1, orderedChildNumbers: [3, 2] });
	assert.equal(result.details.result, "partial_success");
	assert.equal(result.details.status, "sub_issue_reorder_response_partial_success");
	assert.equal(result.details.error.details.mutationSettlement, "remote_success_known");
	assert.match(result.content[0].text, /Do not repeat the mutation blindly/);
});

test("native sub-issue aborts and 5xx failures before settlement use the error channel", async () => {
	for (const scenario of [
		{ toolName: "issueme_add_sub_issue", operationName: "IssueMeAddSubIssue", params: { parentNumber: 1, childNumber: 2 } },
		{ toolName: "issueme_remove_sub_issue", operationName: "IssueMeRemoveSubIssue", params: { parentNumber: 1, childNumber: 2 } },
	]) {
		const projectRoot = await tempProject();
		const mock = makeSubIssueFetch();
		const tools = registerInjectedTools(async (input, init = {}) => {
			const body = init.body === undefined ? undefined : JSON.parse(init.body);
			if (body?.operationName === scenario.operationName) return jsonResponse({ message: "server failed" }, { status: 503, statusText: "Service Unavailable" });
			return mock.fetchFn(input, init);
		});
		await assert.rejects(
			() => execute(tools.get(scenario.toolName), projectRoot, scenario.params),
			(error) => error?.code === "github_api_error" && error.status === 503 && error.safeDetails?.mutationSettlement === "no_remote_success_known",
		);
	}

	const projectRoot = await tempProject();
	const children = [githubIssue(2, "First Child"), githubIssue(3, "Priority Child")];
	const mock = makeSubIssueFetch({
		issues: children,
		childrenByParent: [[1, [2, 3]]],
		parentByChild: children.map((issue) => [issue.number, 1]),
	});
	const tools = registerInjectedTools(async (input, init = {}) => {
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		if (body?.operationName === "IssueMeReprioritizeSubIssue") return jsonResponse({ message: "server failed" }, { status: 503, statusText: "Service Unavailable" });
		return mock.fetchFn(input, init);
	});
	await assert.rejects(
		() => execute(tools.get("issueme_reorder_sub_issues"), projectRoot, { parentNumber: 1, orderedChildNumbers: [3, 2] }),
		(error) => error?.code === "github_api_error" && error.status === 503,
	);

	const controller = new AbortController();
	controller.abort();
	const abortedMock = makeSubIssueFetch();
	const abortedTools = registerInjectedTools(abortedMock.fetchFn);
	const abortedRoot = await tempProject();
	await assert.rejects(
		() => execute(abortedTools.get("issueme_add_sub_issue"), abortedRoot, { parentNumber: 1, childNumber: 2 }, controller.signal),
		(error) => error?.code === "github_request_aborted",
	);
	assert.equal(abortedMock.calls.length, 0);
});

test("restricted issueme_list_sub_issues refuses disallowed child details before returning output", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch({
		issues: [
			githubIssue(1, "Parent", { user: { login: "hubot" } }),
			githubIssue(2, "Intruder Child", { user: { login: "intruder" } }),
		],
	});
	const tools = registerInjectedTools(mock.fetchFn, restrictedConfig);

	await assert.rejects(
		() => execute(tools.get("issueme_list_sub_issues"), projectRoot, { issueNumber: 1 }),
		(error) => error?.code === "issue_creator_not_allowed" && error.safeDetails?.issueNumber === 2,
	);
	assert.deepEqual(mock.calls.map((call) => `${call.method} ${call.path}`), ["POST /graphql"]);
	await assert.rejects(() => readdir(join(projectRoot, "issues")), { code: "ENOENT" });
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
	await assert.rejects(() => readdir(join(projectRoot, "issues")), { code: "ENOENT" });
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

test("issueme_list_sub_issues refreshCache aborts before relationship cache writes", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch();
	const controller = new AbortController();
	const tools = registerInjectedTools(async (input, init) => {
		const response = await mock.fetchFn(input, init);
		const url = new URL(input.toString());
		if (url.pathname === "/repos/owner/repo/issues/2/comments") controller.abort();
		return response;
	});

	await assert.rejects(
		() => execute(tools.get("issueme_list_sub_issues"), projectRoot, { issueNumber: 2, refreshCache: true }, controller.signal),
		(error) => error?.code === "github_request_aborted",
	);
	assert.equal(mock.calls.some((call) => call.path === "/graphql" && call.body.operationName === "IssueMeListSubIssues"), true);
	await assert.rejects(() => readdir(join(projectRoot, "issues")), { code: "ENOENT" });
});

test("issueme_add_sub_issue reports partial success when aborted before relationship cache writes", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch();
	const controller = new AbortController();
	const tools = registerInjectedTools(async (input, init) => {
		const response = await mock.fetchFn(input, init);
		const url = new URL(input.toString());
		if (url.pathname === "/repos/owner/repo/issues/1/comments") controller.abort();
		return response;
	});

	const result = await execute(tools.get("issueme_add_sub_issue"), projectRoot, { parentNumber: 1, childNumber: 2 }, controller.signal);

	assert.equal(result.details.result, "partial_success");
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, true);
	assert.equal(result.details.error.code, "github_request_aborted");
	assert.equal(result.details.error.details.partialSuccessStatus, "sub_issue_cache_refresh_failed");
	assert.match(result.content[0].text, /relationship changed on GitHub, but local cache refresh failed/i);
	assert.equal(mock.calls.some((call) => call.path === "/graphql" && /addSubIssue/.test(call.body.query)), true);
	await assert.rejects(() => readdir(join(projectRoot, "issues")), { code: "ENOENT" });
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

test("issueme_create_sub_issue reports forbidden native attachment as retry-safe partial success", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch({ forbidden: true });
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_create_sub_issue"), projectRoot, {
		parentNumber: 1,
		title: "Permission Child",
		body: "Child body",
	});

	assert.equal(result.details.result, "partial_success");
	assert.equal(result.details.status, "sub_issue_attach_partial_success");
	assert.equal(result.details.error.code, "github_sub_issue_forbidden");
	assert.match(result.details.error.message, /lacks permission for native sub-issues/i);
	assert.match(result.content[0].text, /did not fall back to body-only references/i);
	assert.match(result.content[0].text, /Retry-safe guidance: Do not rerun issueme_create_sub_issue blindly/i);
	assert.match(result.details.error.recoveryHint, /issueme_add_sub_issue/);
	assert.equal(result.details.error.details.parentNumber, 1);
	assert.deepEqual(result.details.error.details.createdIssue, {
		number: 3,
		title: "Permission Child",
		html_url: "https://github.com/owner/repo/issues/3",
	});
	assert.match(result.details.error.details.retrySafeGuidance, /childNumber 3/);
	assert.equal(result.details.cacheUpdated, true);
	assert.equal(result.details.needsSync, false);
	const child = await readJson(join(projectRoot, "issues", "3-permission-child.json"));
	assert.equal(child.title, "Permission Child");
	assert.equal(child.parent_issue, undefined);
	assert.equal(mock.calls.some((call) => call.path === "/graphql" && /addSubIssue/.test(call.body.query)), true);
});

test("issueme_create_sub_issue reports unsupported native attachment as retry-safe partial success", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch({ unsupported: true });
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_create_sub_issue"), projectRoot, {
		parentNumber: 1,
		title: "Unsupported Child",
		body: "Child body",
	});

	assert.equal(result.details.result, "partial_success");
	assert.equal(result.details.status, "sub_issue_attach_partial_success");
	assert.equal(result.details.error.code, "github_sub_issue_unsupported");
	assert.match(result.content[0].text, /reuse the already-created issue with issueme_add_sub_issue/i);
	assert.match(result.details.error.recoveryHint, /childNumber 3/);
	assert.equal(result.details.error.details.createdIssue.number, 3);
	assert.equal(result.details.cacheUpdated, true);
	assert.equal(result.details.needsSync, false);
	const child = await readJson(join(projectRoot, "issues", "3-unsupported-child.json"));
	assert.equal(child.title, "Unsupported Child");
	assert.equal(child.parent_issue, undefined);
});

test("issueme_reorder_sub_issues reports an already-in-order native child list as a no-op", async () => {
	const projectRoot = await tempProject();
	const children = [githubIssue(2, "First Child"), githubIssue(3, "Second Child")];
	const mock = makeSubIssueFetch({
		issues: children,
		childrenByParent: [[1, [2, 3]]],
		parentByChild: children.map((issue) => [issue.number, 1]),
	});
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_reorder_sub_issues"), projectRoot, { parentNumber: 1, orderedChildNumbers: [2, 3] });

	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "reorder_sub_issues_noop");
	assert.deepEqual(result.details.issue.subIssues.map((issue) => issue.number), [2, 3]);
	assert.equal(result.details.counts.mutations, 0);
	assert.deepEqual(result.details.changedFields, []);
	assert.equal(mock.calls.some((call) => call.path === "/graphql" && call.body.operationName === "IssueMeReprioritizeSubIssue"), false);
	assert.match(result.content[0].text, /already matched the requested order/i);
});

test("issueme_remove_sub_issue handles an already-detached child without inventing body references", async () => {
	const projectRoot = await tempProject();
	const mock = makeSubIssueFetch({
		parentByChild: [],
		childrenByParent: [],
	});
	const tools = registerInjectedTools(mock.fetchFn);

	const result = await execute(tools.get("issueme_remove_sub_issue"), projectRoot, { parentNumber: 1, childNumber: 2 });

	assert.equal(result.details.result, "success");
	assert.equal(result.details.cacheUpdated, true);
	assert.deepEqual(result.details.changedFields, ["sub_issues"]);
	assert.equal(mock.childrenByParent.get(1)?.length ?? 0, 0);
	const child = await readJson(join(projectRoot, "issues", "2-existing-child.json"));
	assert.equal(child.parent_issue, null);
	assert.doesNotMatch(child.body, /#1|Parent/);
	assert.equal(mock.calls.some((call) => call.path === "/graphql" && /removeSubIssue/.test(call.body.query)), true);
});
