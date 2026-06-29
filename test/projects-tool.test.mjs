import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { GitHubApiError } from "../src/errors.ts";
import { registerProjectTools } from "../src/tools/projects.ts";

const TOKEN = "ghp_projects_secret";
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
	return mkdtemp(join(tmpdir(), "issueme-projects-tool-"));
}

async function executeProjectTool(toolName, fetchFn, params, signal) {
	const pi = fakePi();
	registerProjectTools(pi, {
		runtime: {
			config,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	});
	return pi.tools.get(toolName).execute("call", params, signal, undefined, {
		cwd: await tempProject(),
		isProjectTrusted: () => true,
	});
}

function project(number, title, overrides = {}) {
	return {
		id: `PVT_${number}`,
		title,
		number,
		url: `https://github.com/users/owner/projects/${number}`,
		shortDescription: `${title} board`,
		closed: false,
		public: false,
		owner: { __typename: "User", login: "owner" },
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

function graphQLDataForScope(scope, projects, pageInfo = { hasNextPage: false }) {
	const connection = { projectsV2: { nodes: projects, pageInfo } };
	if (scope === "organization") return { data: { organization: connection } };
	if (scope === "user") return { data: { user: connection } };
	return { data: { repository: connection } };
}

function assertNoToken(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TOKEN));
}

test("issueme_list_projects discovers repository Projects v2 boards read-only", async () => {
	const calls = [];
	const result = await executeProjectTool("issueme_list_projects", async (url, init) => {
		const body = JSON.parse(init.body);
		calls.push({ url: new URL(url.toString()), method: init.method, headers: init.headers, body });
		return jsonResponse(graphQLDataForScope("repository", [project(1, "Roadmap"), project(2, "Closed", { closed: true })]));
	}, { query: "Roadmap", limit: 5 });

	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "list_projects");
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, false);
	assert.deepEqual(result.details.projects.map((item) => item.title), ["Roadmap"]);
	assert.equal(result.details.truncated, false);
	assert.equal(result.details.projects[0].id, "PVT_1");
	assert.equal(result.details.projects[0].owner, "owner");
	assert.equal(result.details.projects[0].ownerType, "user");
	assert.match(result.content[0].text, /read-only/);
	assert.match(result.content[0].text, /Roadmap/);
	assert.equal(calls[0].url.pathname, "/graphql");
	assert.equal(calls[0].method, "POST");
	assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
	assert.match(calls[0].body.query, /repository\(owner: \$owner, name: \$repo\)/);
	assert.match(calls[0].body.query, /projectsV2\(first: \$first, after: \$after, query: \$query\) \{\s*nodes \{ \.\.\.IssueMeProjectV2Summary \}\s*pageInfo \{ hasNextPage endCursor \}/s);
	assert.match(calls[0].body.query, /\.\.\. on Repository \{ nameWithOwner \}/);
	assert.deepEqual(calls[0].body.variables, { owner: "owner", repo: "repo", first: 5, query: "Roadmap" });
	assertNoToken(result);
});

test("issueme_list_projects paginates after filtering closed Projects v2 boards", async () => {
	const calls = [];
	const result = await executeProjectTool("issueme_list_projects", async (_url, init) => {
		const body = JSON.parse(init.body);
		calls.push(body.variables);
		if (calls.length === 1) {
			return jsonResponse(graphQLDataForScope("repository", [project(1, "Closed One", { closed: true }), project(2, "Closed Two", { closed: true })], { hasNextPage: true, endCursor: "cursor-1" }));
		}
		return jsonResponse(graphQLDataForScope("repository", [project(3, "Open One"), project(4, "Open Two")], { hasNextPage: false, endCursor: null }));
	}, { limit: 2 });

	assert.deepEqual(result.details.projects.map((item) => item.title), ["Open One", "Open Two"]);
	assert.equal(result.details.truncated, false);
	assert.equal(result.details.truncation, undefined);
	assert.deepEqual(calls, [
		{ owner: "owner", repo: "repo", first: 2 },
		{ owner: "owner", repo: "repo", first: 2, after: "cursor-1" },
	]);
	assertNoToken(result);
});

test("issueme_list_projects stops paginated GraphQL reads when the abort signal is cancelled", async () => {
	const controller = new AbortController();
	const calls = [];
	await assert.rejects(
		() => executeProjectTool("issueme_list_projects", async (_url, init) => {
			calls.push(init.signal);
			assert.equal(init.signal, controller.signal);
			controller.abort();
			return jsonResponse(graphQLDataForScope("repository", [project(1, "Closed", { closed: true })], { hasNextPage: true, endCursor: "cursor-1" }));
		}, { limit: 2 }, controller.signal),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assert.equal(error.code, "github_request_aborted");
			return true;
		},
	);
	assert.equal(calls.length, 1);
});

test("Projects v2 owner conflicts fail before runtime resolution", async () => {
	const pi = fakePi();
	let runtimeCalls = 0;
	registerProjectTools(pi, {
		runtime: () => {
			runtimeCalls += 1;
			throw new Error("runtime should not be resolved for invalid project owner scope");
		},
	});
	const ctx = { cwd: await tempProject(), isProjectTrusted: () => true };

	await assert.rejects(
		() => pi.tools.get("issueme_list_projects").execute("call", { owner: "octocat" }, undefined, undefined, ctx),
		(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === "owner" && /organization or user/.test(error.message),
	);
	await assert.rejects(
		() => pi.tools.get("issueme_get_project_fields").execute("call", { owner: "octocat", projectNumber: 1 }, undefined, undefined, ctx),
		(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === "owner" && /organization or user/.test(error.message),
	);
	assert.equal(runtimeCalls, 0);
});

test("issueme_list_projects supports organization and user owner scopes", async () => {
	const scopes = [];
	const organization = await executeProjectTool("issueme_list_projects", async (_url, init) => {
		const body = JSON.parse(init.body);
		scopes.push({ query: body.query, variables: body.variables });
		return jsonResponse(graphQLDataForScope("organization", [project(3, "Org Board", { owner: { __typename: "Organization", login: "acme" } })]));
	}, { scope: "organization", owner: "acme", limit: 2 });
	assert.deepEqual(organization.details.projects.map((item) => `${item.ownerType}:${item.owner}`), ["organization:acme"]);
	assert.match(scopes[0].query, /organization\(login: \$owner\)/);
	assert.deepEqual(scopes[0].variables, { owner: "acme", first: 2 });

	const user = await executeProjectTool("issueme_list_projects", async (_url, init) => {
		const body = JSON.parse(init.body);
		scopes.push({ query: body.query, variables: body.variables });
		return jsonResponse(graphQLDataForScope("user", [project(4, "User Board", { owner: { __typename: "User", login: "octocat" } })]));
	}, { scope: "user", owner: "octocat", limit: 2 });
	assert.deepEqual(user.details.projects.map((item) => `${item.ownerType}:${item.owner}`), ["user:octocat"]);
	assert.match(scopes[1].query, /user\(login: \$owner\)/);
	assert.deepEqual(scopes[1].variables, { owner: "octocat", first: 2 });
	assertNoToken({ organization, user });
});

test("issueme_get_project_fields parses field types, options, iterations, and truncation", async () => {
	const fields = [
		{
			__typename: "ProjectV2SingleSelectField",
			id: "PVTSSF_status",
			name: "Status",
			dataType: "SINGLE_SELECT",
			options: [
				{ id: "todo", name: "Todo", color: "GRAY", description: "Not started" },
				{ id: "progress", name: "In Progress", color: "YELLOW" },
				{ id: "done", name: "Done", color: "GREEN" },
			],
		},
		{
			__typename: "ProjectV2IterationField",
			id: "PVTF_iteration",
			name: "Iteration",
			dataType: "ITERATION",
			configuration: {
				iterations: [
					{ id: "iter_1", title: "Sprint 1", startDate: "2026-07-01", duration: 14 },
					{ id: "iter_2", title: "Sprint 2", startDate: "2026-07-15", duration: 14 },
					{ id: "iter_3", title: "Sprint 3", startDate: "2026-07-29", duration: 14 },
				],
				completedIterations: [{ id: "iter_0", title: "Sprint 0", startDate: "2026-06-17", duration: 14 }],
			},
		},
		{ __typename: "ProjectV2Field", id: "PVTF_text", name: "Notes", dataType: "TEXT" },
	];
	const calls = [];
	const result = await executeProjectTool("issueme_get_project_fields", async (url, init) => {
		const body = JSON.parse(init.body);
		calls.push({ url: new URL(url.toString()), method: init.method, body });
		return jsonResponse({
			data: {
				repository: {
					projectV2: {
						...project(1, "Roadmap"),
						fields: { nodes: fields, pageInfo: { hasNextPage: true } },
					},
				},
			},
		});
	}, { projectNumber: 1, fieldLimit: 2, optionLimit: 2, iterationLimit: 2 });

	assert.equal(result.details.status, "get_project_fields");
	assert.equal(result.details.project.title, "Roadmap");
	assert.deepEqual(result.details.projectFields.map((field) => field.name), ["Status", "Iteration"]);
	assert.deepEqual(result.details.projectFields[0].options.map((option) => option.name), ["Todo", "In Progress"]);
	assert.deepEqual(result.details.projectFields[1].iterations.map((iteration) => iteration.title), ["Sprint 1", "Sprint 2"]);
	assert.equal(result.details.projectFields[0].truncated, true);
	assert.equal(result.details.projectFields[1].truncated, true);
	assert.equal(result.details.truncated, true);
	assert.equal(result.details.truncation.projectFields.shown, 2);
	assert.match(result.content[0].text, /Status/);
	assert.match(result.content[0].text, /iterations/);
	assert.equal(calls[0].url.pathname, "/graphql");
	assert.equal(calls[0].body.operationName, "IssueMeGetProjectV2FieldsByNumber");
	assert.deepEqual(calls[0].body.variables, { owner: "owner", repo: "repo", projectNumber: 1, fieldsFirst: 2 });
	assertNoToken(result);
});

test("issueme_get_project_fields can inspect a project by GraphQL projectId", async () => {
	const result = await executeProjectTool("issueme_get_project_fields", async (_url, init) => {
		const body = JSON.parse(init.body);
		assert.equal(body.operationName, "IssueMeGetProjectV2FieldsById");
		assert.deepEqual(body.variables, { projectId: "PVT_1", fieldsFirst: 25 });
		return jsonResponse({ data: { node: { ...project(1, "Roadmap"), fields: { nodes: [], pageInfo: { hasNextPage: false } } } } });
	}, { projectId: "PVT_1", owner: "ignored-owner", projectNumber: 99 });
	assert.equal(result.details.project.id, "PVT_1");
	assert.deepEqual(result.details.projectFields, []);
	assertNoToken(result);
});

function openIssue(number = 7, title = "Project Candidate") {
	return {
		node_id: `I_${number}`,
		number,
		title,
		state: "open",
		body: "Body",
		labels: [],
		assignees: [],
		milestone: null,
		html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		comments: 0,
	};
}

function projectItem(overrides = {}) {
	return {
		id: "PVTI_7",
		type: "ISSUE",
		project: project(1, "Roadmap"),
		content: { __typename: "Issue", id: "I_7", number: 7, title: "Project Candidate", state: "OPEN", url: `https://github.com/${REPOSITORY}/issues/7`, repository: { nameWithOwner: REPOSITORY } },
		...overrides,
	};
}

test("issueme_add_issue_to_project adds or confirms an issue project item idempotently", async () => {
	const calls = [];
	const result = await executeProjectTool("issueme_add_issue_to_project", async (url, init) => {
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		const path = new URL(url.toString()).pathname;
		calls.push({ path, method: init.method, body });
		if (path === "/repos/owner/repo/issues/7") return jsonResponse(openIssue());
		if (path === "/graphql" && body.operationName === "IssueMeValidateProjectV2ForAdd") {
			assert.match(body.query, /node\(id: \$projectId\)/);
			assert.deepEqual(body.variables, { projectId: "PVT_1" });
			return jsonResponse({ data: { node: project(1, "Roadmap") } });
		}
		if (path === "/graphql" && body.operationName === "IssueMeAddIssueToProjectV2") {
			assert.match(body.query, /addProjectV2ItemById/);
			assert.deepEqual(body.variables, { projectId: "PVT_1", contentId: "I_7" });
			return jsonResponse({ data: { addProjectV2ItemById: { item: projectItem() } } });
		}
		throw new Error(`Unexpected request ${init.method} ${path} ${body?.operationName ?? ""}`);
	}, { issueNumber: 7, projectId: "PVT_1" });

	assert.equal(result.details.status, "add_issue_to_project");
	assert.equal(result.details.projectItem.id, "PVTI_7");
	assert.equal(result.details.projectItem.issue.number, 7);
	assert.equal(result.details.project.title, "Roadmap");
	assert.equal(result.details.cacheUpdated, false);
	assert.match(result.content[0].text, /already on the project/);
	assert.deepEqual(calls.map((call) => call.body?.operationName ?? call.path), ["/repos/owner/repo/issues/7", "IssueMeValidateProjectV2ForAdd", "IssueMeAddIssueToProjectV2"]);
	assertNoToken(result);
});

test("issueme_add_issue_to_project preflights repository, organization, and user project identity", async () => {
	const scenarios = [
		{
			name: "repository",
			params: { issueNumber: 7, projectId: "PVT_repo", scope: "repository" },
			board: project(11, "Repo Roadmap", { id: "PVT_repo", owner: { __typename: "Repository", nameWithOwner: REPOSITORY }, url: "https://github.com/owner/repo/projects/11" }),
			expectedOwner: "repository:owner/repo",
		},
		{
			name: "organization",
			params: { issueNumber: 7, projectId: "PVT_org", scope: "organization", owner: "acme" },
			board: project(12, "Org Roadmap", { id: "PVT_org", owner: { __typename: "Organization", login: "acme" }, url: "https://github.com/orgs/acme/projects/12" }),
			expectedOwner: "organization:acme",
		},
		{
			name: "user",
			params: { issueNumber: 7, projectId: "PVT_user", scope: "user", owner: "octocat" },
			board: project(13, "User Roadmap", { id: "PVT_user", owner: { __typename: "User", login: "octocat" }, url: "https://github.com/users/octocat/projects/13" }),
			expectedOwner: "user:octocat",
		},
	];

	for (const scenario of scenarios) {
		const calls = [];
		const result = await executeProjectTool("issueme_add_issue_to_project", async (url, init) => {
			const body = init.body === undefined ? undefined : JSON.parse(init.body);
			const path = new URL(url.toString()).pathname;
			calls.push({ path, operationName: body?.operationName });
			if (path === "/repos/owner/repo/issues/7") return jsonResponse(openIssue());
			if (path === "/graphql" && body.operationName === "IssueMeValidateProjectV2ForAdd") {
				assert.deepEqual(body.variables, { projectId: scenario.params.projectId });
				return jsonResponse({ data: { node: scenario.board } });
			}
			if (path === "/graphql" && body.operationName === "IssueMeAddIssueToProjectV2") {
				assert.deepEqual(body.variables, { projectId: scenario.params.projectId, contentId: "I_7" });
				return jsonResponse({ data: { addProjectV2ItemById: { item: projectItem({ project: scenario.board }) } } });
			}
			throw new Error(`Unexpected ${scenario.name} request ${init.method} ${path} ${body?.operationName ?? ""}`);
		}, scenario.params);

		assert.equal(`${result.details.project.ownerType}:${result.details.project.owner}`, scenario.expectedOwner);
		assert.deepEqual(calls.map((call) => call.operationName ?? call.path), ["/repos/owner/repo/issues/7", "IssueMeValidateProjectV2ForAdd", "IssueMeAddIssueToProjectV2"]);
		assertNoToken(result);
	}
});

test("issueme_add_issue_to_project refuses inaccessible, wrong-owner, and closed projects before mutation", async () => {
	const scenarios = [
		{
			name: "inaccessible",
			params: { issueNumber: 7, projectId: "PVT_missing" },
			node: null,
			message: /accessible GitHub Projects v2 board/,
		},
		{
			name: "default wrong owner",
			params: { issueNumber: 7, projectId: "PVT_intruder" },
			node: project(20, "Intruder Roadmap", { id: "PVT_intruder", owner: { __typename: "User", login: "intruder" } }),
			message: /current repository or the current repository owner/,
		},
		{
			name: "explicit wrong owner",
			params: { issueNumber: 7, projectId: "PVT_wrong_org", scope: "organization", owner: "acme" },
			node: project(21, "Other Org Roadmap", { id: "PVT_wrong_org", owner: { __typename: "Organization", login: "evil" } }),
			message: /owner\/scope/,
		},
		{
			name: "closed",
			params: { issueNumber: 7, projectId: "PVT_closed" },
			node: project(22, "Closed Roadmap", { id: "PVT_closed", closed: true }),
			message: /closed GitHub Projects v2 board/,
		},
	];

	for (const scenario of scenarios) {
		const calls = [];
		await assert.rejects(
			() => executeProjectTool("issueme_add_issue_to_project", async (url, init) => {
				const path = new URL(url.toString()).pathname;
				const body = init.body === undefined ? undefined : JSON.parse(init.body);
				calls.push({ path, operationName: body?.operationName });
				if (path === "/repos/owner/repo/issues/7") return jsonResponse(openIssue());
				if (path === "/graphql" && body.operationName === "IssueMeValidateProjectV2ForAdd") {
					return jsonResponse({ data: { node: scenario.node } });
				}
				throw new Error(`Unexpected ${scenario.name} request ${init.method} ${path} ${body?.operationName ?? ""}`);
			}, scenario.params),
			(error) => error?.code === "invalid_tool_input" && scenario.message.test(error.message),
		);
		assert.deepEqual(calls.map((call) => call.operationName ?? call.path), ["/repos/owner/repo/issues/7", "IssueMeValidateProjectV2ForAdd"], scenario.name);
		assert.equal(calls.some((call) => call.operationName === "IssueMeAddIssueToProjectV2"), false, scenario.name);
	}
});

test("issueme_update_project_item updates supported Projects v2 field value types", async () => {
	const cases = [
		["single_select", { singleSelectOptionId: "opt_todo" }, { singleSelectOptionId: "opt_todo" }],
		["iteration", { iterationId: "iter_1" }, { iterationId: "iter_1" }],
		["date", { date: "2026-07-01" }, { date: "2026-07-01" }],
		["text", { text: "Ready for review" }, { text: "Ready for review" }],
		["number", { numberValue: 13.5 }, { number: 13.5 }],
	];

	for (const [valueType, valueParams, expectedValue] of cases) {
		const result = await executeProjectTool("issueme_update_project_item", async (url, init) => {
			const path = new URL(url.toString()).pathname;
			if (path === "/repos/owner/repo/issues/7") return jsonResponse(openIssue());
			const body = JSON.parse(init.body);
			assert.equal(path, "/graphql");
			if (body.operationName === "IssueMeValidateProjectV2ItemForUpdate") {
				assert.match(body.query, /node\(id: \$itemId\)/);
				assert.deepEqual(body.variables, { itemId: "PVTI_7" });
				return jsonResponse({ data: { node: projectItem() } });
			}
			assert.equal(body.operationName, "IssueMeUpdateProjectV2ItemFieldValue");
			assert.match(body.query, /updateProjectV2ItemFieldValue/);
			assert.deepEqual(body.variables, { projectId: "PVT_1", itemId: "PVTI_7", fieldId: `field_${valueType}`, value: expectedValue });
			return jsonResponse({ data: { updateProjectV2ItemFieldValue: { projectV2Item: projectItem() } } });
		}, { projectId: "PVT_1", itemId: "PVTI_7", issueNumber: 7, fieldId: `field_${valueType}`, valueType, ...valueParams });

		assert.equal(result.details.status, "update_project_item");
		assert.deepEqual(result.details.changedFields, [`field_${valueType}`]);
		assert.equal(result.details.projectItem.id, "PVTI_7");
		assert.match(result.content[0].text, new RegExp(valueType));
		assertNoToken(result);
	}
});

test("issueme_update_project_item refuses mismatched item IDs before field mutation", async () => {
	const calls = [];
	await assert.rejects(
		() => executeProjectTool("issueme_update_project_item", async (url, init) => {
			const path = new URL(url.toString()).pathname;
			const body = init.body === undefined ? undefined : JSON.parse(init.body);
			calls.push({ path, method: init.method, operationName: body?.operationName });
			if (path === "/repos/owner/repo/issues/7") return jsonResponse(openIssue());
			if (path === "/graphql" && body.operationName === "IssueMeValidateProjectV2ItemForUpdate") {
				return jsonResponse({ data: { node: projectItem({ content: { ...projectItem().content, number: 8, title: "Different issue", url: `https://github.com/${REPOSITORY}/issues/8` } }) } });
			}
			throw new Error(`Unexpected request ${init.method} ${path} ${body?.operationName ?? ""}`);
		}, { projectId: "PVT_1", itemId: "PVTI_7", issueNumber: 7, fieldId: "field_status", valueType: "single_select", singleSelectOptionId: "opt_todo" }),
		(error) => error?.code === "invalid_tool_input" && /issueNumber/.test(error.message),
	);
	assert.deepEqual(calls.map((call) => call.operationName ?? call.path), ["/repos/owner/repo/issues/7", "IssueMeValidateProjectV2ItemForUpdate"]);
});

test("issueme_update_project_item refuses project and repository mismatches before field mutation", async () => {
	const scenarios = [
		{
			name: "project mismatch",
			validationNode: projectItem({ project: project(2, "Other Board") }),
			message: /projectId/,
		},
		{
			name: "repository mismatch",
			validationNode: projectItem({ content: { ...projectItem().content, repository: { nameWithOwner: "other/repo" } } }),
			message: /current repository/,
		},
	];

	for (const scenario of scenarios) {
		const calls = [];
		await assert.rejects(
			() => executeProjectTool("issueme_update_project_item", async (url, init) => {
				const path = new URL(url.toString()).pathname;
				const body = init.body === undefined ? undefined : JSON.parse(init.body);
				calls.push({ path, method: init.method, operationName: body?.operationName });
				if (path === "/repos/owner/repo/issues/7") return jsonResponse(openIssue());
				if (path === "/graphql" && body.operationName === "IssueMeValidateProjectV2ItemForUpdate") {
					return jsonResponse({ data: { node: scenario.validationNode } });
				}
				throw new Error(`Unexpected ${scenario.name} request ${init.method} ${path} ${body?.operationName ?? ""}`);
			}, { projectId: "PVT_1", itemId: "PVTI_7", issueNumber: 7, fieldId: "field_status", valueType: "single_select", singleSelectOptionId: "opt_todo" }),
			(error) => error?.code === "invalid_tool_input" && scenario.message.test(error.message),
		);
		assert.deepEqual(calls.map((call) => call.operationName ?? call.path), ["/repos/owner/repo/issues/7", "IssueMeValidateProjectV2ItemForUpdate"]);
	}
});

test("Projects v2 item tools reject invalid inputs before live mutations", async () => {
	let calls = 0;
	const failFetch = async () => {
		calls += 1;
		return jsonResponse({});
	};
	await assert.rejects(
		() => executeProjectTool("issueme_update_project_item", failFetch, { projectId: "PVT_1", itemId: "PVTI_1", issueNumber: 7, fieldId: "field_status", valueType: "single_select", iterationId: "iter_1" }),
		(error) => error?.code === "invalid_tool_input" && /singleSelectOptionId/.test(error.message),
	);
	for (const invalidDate of ["07/01/2026", "2026-02-30"]) {
		await assert.rejects(
			() => executeProjectTool("issueme_update_project_item", failFetch, { projectId: "PVT_1", itemId: "PVTI_1", issueNumber: 7, fieldId: "field_date", valueType: "date", date: invalidDate }),
			(error) => error?.code === "invalid_tool_input" && /valid YYYY-MM-DD/.test(error.message),
		);
	}
	for (const [toolName, params, fieldPattern] of [
		["issueme_get_project_fields", { projectId: "PVT_1\nPVT_2" }, /projectId/],
		["issueme_add_issue_to_project", { issueNumber: 7, projectId: "P".repeat(513) }, /projectId/],
		["issueme_add_issue_to_project", { issueNumber: 7, projectId: "PVT_1", owner: "acme" }, /scope/],
		["issueme_update_project_item", { projectId: "PVT_1", itemId: "PVTI_1", issueNumber: 7, fieldId: "field_status\nnext", valueType: "single_select", singleSelectOptionId: "opt_todo" }, /fieldId/],
		["issueme_update_project_item", { projectId: "PVT_1", itemId: "PVTI_1", issueNumber: 7, fieldId: "field_status", valueType: "single_select", singleSelectOptionId: "opt\nnext" }, /singleSelectOptionId/],
	]) {
		await assert.rejects(
			() => executeProjectTool(toolName, failFetch, params),
			(error) => error?.code === "invalid_tool_input" && fieldPattern.test(error.message),
		);
	}
	assert.equal(calls, 0);
});

test("Projects v2 item GraphQL failures are safe and actionable", async () => {
	await assert.rejects(
		() => executeProjectTool("issueme_update_project_item", async (url, init) => {
			const path = new URL(url.toString()).pathname;
			if (path === "/repos/owner/repo/issues/7") return jsonResponse(openIssue());
			const body = JSON.parse(init.body);
			if (body.operationName === "IssueMeValidateProjectV2ItemForUpdate") return jsonResponse({ data: { node: projectItem({ id: "PVTI_1" }) } });
			return jsonResponse({
				data: null,
				errors: [{ message: `Could not resolve single-select option ${TOKEN}` }],
			});
		}, { projectId: "PVT_1", itemId: "PVTI_1", issueNumber: 7, fieldId: "field_status", valueType: "single_select", singleSelectOptionId: "opt_missing" }),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assert.equal(error.code, "github_api_error");
			assert.match(error.message, /IssueMeUpdateProjectV2ItemFieldValue failed/);
			assert.doesNotMatch(error.message, new RegExp(TOKEN));
			assert.doesNotMatch(JSON.stringify(error.safeDetails), new RegExp(TOKEN));
			return true;
		},
	);
});

test("GitHub Projects v2 GraphQL permission failures are actionable and token-safe", async () => {
	await assert.rejects(
		() => executeProjectTool("issueme_list_projects", async () => jsonResponse({
			data: null,
			errors: [{ type: "FORBIDDEN", message: `Resource not accessible by integration ${TOKEN}` }],
		}), {}),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assert.equal(error.code, "github_projects_v2_forbidden");
			assert.equal(error.status, 403);
			assert.match(error.message, /Projects v2 project discovery was forbidden/);
			assert.match(error.message, /read permission/i);
			assert.doesNotMatch(error.message, new RegExp(TOKEN));
			assert.doesNotMatch(JSON.stringify(error.safeDetails), new RegExp(TOKEN));
			return true;
		},
	);

	await assert.rejects(
		() => executeProjectTool("issueme_update_project_item", async (url) => {
			const path = new URL(url.toString()).pathname;
			if (path === "/repos/owner/repo/issues/7") return jsonResponse(openIssue());
			return jsonResponse({
				data: null,
				errors: [{ type: "FORBIDDEN", message: `Resource not accessible by integration ${TOKEN}` }],
			});
		}, { projectId: "PVT_1", itemId: "PVTI_7", issueNumber: 7, fieldId: "field_status", valueType: "single_select", singleSelectOptionId: "opt_todo" }),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assert.equal(error.code, "github_projects_v2_forbidden");
			assert.equal(error.status, 403);
			assert.match(error.message, /Projects v2 project item management was forbidden/);
			assert.match(error.message, /read\/write permission/i);
			assert.doesNotMatch(error.message, new RegExp(TOKEN));
			assert.doesNotMatch(JSON.stringify(error.safeDetails), new RegExp(TOKEN));
			return true;
		},
	);
});
