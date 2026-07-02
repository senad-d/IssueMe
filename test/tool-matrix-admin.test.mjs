import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { ClosedIssueMutationError, GitHubApiError, IssueMeError } from "../src/errors.ts";
import { registerIssueMeTools } from "../src/tools/issueme-tools.ts";
import {
	githubIssue,
	githubLabel,
	githubMilestone,
	githubUser,
	issueMeConfig,
	localIssueRecord,
	tempProject,
	TEST_NOW,
	TEST_REPOSITORY,
	TEST_REPOSITORY_OBJECT,
	TEST_TOKEN,
} from "./helpers/issueme-test-helpers.mjs";
import { writeIssueRecord } from "../src/issues/store.ts";

const ADMIN_TOOL_NAMES = [
	"issueme_list_issues",
	"issueme_list_labels",
	"issueme_list_milestones",
	"issueme_list_assignees",
	"issueme_list_projects",
	"issueme_get_project_fields",
	"issueme_add_issue_to_project",
	"issueme_update_project_item",
	"issueme_manage_label",
	"issueme_manage_milestone",
	"issueme_bulk_update_issues",
];

const PROJECT_STATUS_FIELD_ID = "PVTSSF_status";
const PROJECT_ITEM_ID = "PVTI_7";
const PROJECT_ID = "PVT_repo_1";

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

function trustedContext(cwd, trusted = true) {
	return { cwd, isProjectTrusted: () => trusted };
}

function registerAdminTools(projectRoot, client, configOverrides = {}) {
	const pi = fakePi();
	registerIssueMeTools(pi, {
		runtime: {
			projectRoot,
			config: issueMeConfig(configOverrides),
			repository: TEST_REPOSITORY,
			token: TEST_TOKEN,
			client,
		},
	});
	return pi.tools;
}

async function executeTool(tools, name, projectRoot, params = {}, options = {}) {
	const tool = tools.get(name);
	assert.ok(tool, `expected registered tool ${name}`);
	return tool.execute("tool-matrix-admin-call", params, options.signal, undefined, trustedContext(projectRoot, options.trusted ?? true));
}

async function captureToolError(tools, name, projectRoot, params = {}, options = {}) {
	try {
		await executeTool(tools, name, projectRoot, params, options);
	} catch (error) {
		return error;
	}
	assert.fail(`Expected ${name} to fail.`);
}

function assertIssueMeError(error, code) {
	assert.ok(error instanceof IssueMeError);
	assert.equal(error.code, code);
}

function assertGitHubApiError(error) {
	assert.ok(error instanceof GitHubApiError);
	assert.equal(error.code, "github_api_error");
	assertNoSecretLeak(error);
}

function assertNoSecretLeak(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TEST_TOKEN));
}

function assertToolSuccess(result, status, options = {}) {
	assert.equal(result.details.result, "success");
	assert.equal(result.details.needsSync, false);
	assert.equal(result.details.cacheUpdated, options.cacheUpdated ?? false);
	if (status) assert.equal(result.details.status, status);
	assert.ok(Array.isArray(result.details.paths));
	assert.ok(Array.isArray(result.details.removedPaths));
	assert.ok(Array.isArray(result.details.changedFields));
	assert.equal(result.content[0].type, "text");
	assert.equal(typeof result.content[0].text, "string");
	assertNoSecretLeak(result);
}

function assertStructuredErrorResult(result, status) {
	assert.equal(result.details.result, "error");
	assert.equal(result.details.status, status);
	assert.equal(result.details.needsSync, false);
	assert.equal(result.details.cacheUpdated, false);
	assert.ok(result.details.error);
	assertNoSecretLeak(result);
}

function assertRemoteCall(client, method) {
	assert.equal(client.calls.includes(method), true, `expected ${method} to be called`);
}

function assertNoRemoteCalls(client) {
	assert.deepEqual(client.calls, []);
}

async function tempProjectWithBlockedIssueDirectory() {
	const projectRoot = await tempProject("issueme-tool-matrix-admin-blocked-");
	await writeFile(join(projectRoot, "issues"), "not a directory", "utf8");
	return projectRoot;
}

async function writeLocalIssue(projectRoot, number = 1, title = `Issue ${number}`) {
	return writeIssueRecord(projectRoot, issueMeConfig(), localIssueRecord({ number, title }));
}

function remoteIssue(number = 1, title = `Issue ${number}`, overrides = {}) {
	return githubIssue({
		number,
		title,
		body: `Private body ${TEST_TOKEN}`,
		user: { login: overrides.creator ?? "octocat" },
		comments: 0,
		...withoutFixtureOnlyKeys(overrides, ["creator"]),
	});
}

function issueSummary(number = 1, title = `Issue ${number}`, overrides = {}) {
	return {
		repository: TEST_REPOSITORY,
		number,
		title,
		state: overrides.state ?? "open",
		creator: overrides.creator ?? "octocat",
		labels: overrides.labels ?? [],
		assignees: overrides.assignees ?? [],
		html_url: `https://github.com/${TEST_REPOSITORY}/issues/${number}`,
	};
}

function projectSummary(overrides = {}) {
	return {
		id: overrides.id ?? PROJECT_ID,
		title: overrides.title ?? "Roadmap",
		number: overrides.number ?? 1,
		owner: overrides.owner ?? "owner/repo",
		ownerType: overrides.ownerType ?? "repository",
		url: overrides.url ?? `https://github.com/${TEST_REPOSITORY}/projects/1`,
		shortDescription: overrides.shortDescription ?? "Release roadmap",
		closed: overrides.closed ?? false,
		public: overrides.public ?? false,
	};
}

function projectFieldSummary(overrides = {}) {
	return {
		id: overrides.id ?? PROJECT_STATUS_FIELD_ID,
		name: overrides.name ?? "Status",
		dataType: overrides.dataType ?? "SINGLE_SELECT",
		type: overrides.type ?? "single_select",
		options: overrides.options ?? [{ id: "opt_todo", name: "Todo", color: "GRAY" }],
		iterations: overrides.iterations ?? [{ id: "iter_1", title: "Sprint 1", startDate: "2026-07-01", duration: 14 }],
		completedIterations: overrides.completedIterations ?? [],
	};
}

function projectItemSummary(issueNumber = 7, overrides = {}) {
	return {
		id: overrides.id ?? `PVTI_${issueNumber}`,
		type: overrides.type ?? "ISSUE",
		project: overrides.project ?? projectSummary({ id: overrides.projectId ?? PROJECT_ID }),
		issue: overrides.issue ?? issueSummary(issueNumber, `Project Issue ${issueNumber}`),
	};
}

function createAdminClient(options = {}) {
	const state = createAdminClientState(options);
	return {
		repository: TEST_REPOSITORY_OBJECT,
		calls: state.calls,
		payloads: state.payloads,
		async listIssues(params) {
			recordCall(state, "listIssues", params);
			return state.listResult;
		},
		async searchIssues(params) {
			recordCall(state, "searchIssues", params);
			return state.searchResult;
		},
		async listLabels(params) {
			recordCall(state, "listLabels", params);
			return state.labelsResult;
		},
		async listMilestones(params) {
			recordCall(state, "listMilestones", params);
			return state.milestonesResult;
		},
		async listAssignees(params) {
			recordCall(state, "listAssignees", params);
			return state.assigneesResult;
		},
		async createRepositoryLabel(payload) {
			recordCall(state, "createRepositoryLabel", payload);
			return githubLabel({ name: payload.name, color: payload.color, description: payload.description });
		},
		async updateRepositoryLabel(name, payload) {
			recordCall(state, "updateRepositoryLabel", { name, payload });
			return githubLabel({ name: payload.new_name ?? name, color: payload.color ?? "d73a4a", description: payload.description });
		},
		async deleteRepositoryLabel(name) {
			recordCall(state, "deleteRepositoryLabel", { name });
		},
		async createRepositoryMilestone(payload) {
			recordCall(state, "createRepositoryMilestone", payload);
			return githubMilestone({ number: 42, title: payload.title, description: payload.description, due_on: payload.due_on, state: "open" });
		},
		async updateRepositoryMilestone(number, payload) {
			recordCall(state, "updateRepositoryMilestone", { number, payload });
			return githubMilestone({ number, title: payload.title ?? `Milestone ${number}`, description: payload.description, due_on: payload.due_on, state: payload.state ?? "open" });
		},
		async deleteRepositoryMilestone(number) {
			recordCall(state, "deleteRepositoryMilestone", { number });
		},
		async listProjectsV2(params) {
			recordCall(state, "listProjectsV2", params);
			return state.projectsResult;
		},
		async getProjectV2Fields(params) {
			recordCall(state, "getProjectV2Fields", params);
			return state.projectFieldsResult;
		},
		async addIssueToProjectV2(payload) {
			recordCall(state, "addIssueToProjectV2", payload);
			return { item: projectItemSummary(payload.issueNumber, { projectId: payload.projectId }) };
		},
		async updateProjectV2ItemField(payload) {
			recordCall(state, "updateProjectV2ItemField", payload);
			return { item: projectItemSummary(payload.issueNumber, { id: payload.itemId, projectId: payload.projectId }) };
		},
		async ensureIssueOpen(number) {
			recordCall(state, "ensureIssueOpen", { number });
			const issue = getStoredIssue(state, number);
			if (issue.state === "closed") throw new ClosedIssueMutationError(number, "closed", issueSummary(number, issue.title, { state: "closed" }));
			return issue;
		},
		async getIssue(number) {
			recordCall(state, "getIssue", { number });
			return getStoredIssue(state, number);
		},
		async listComments(number) {
			recordCall(state, "listComments", { number });
			return state.comments.get(number) ?? [];
		},
		async addLabels(number, labels) {
			recordCall(state, "addLabels", { number, labels });
			updateStoredIssue(state, number, { labels: mergeLabels(getStoredIssue(state, number), labels) });
		},
		async addAssignees(number, assignees) {
			recordCall(state, "addAssignees", { number, assignees });
			return updateStoredIssue(state, number, { assignees: mergeAssignees(getStoredIssue(state, number), assignees) });
		},
		async updateIssue(number, payload) {
			recordCall(state, "updateIssue", { number, payload });
			return updateStoredIssue(state, number, payload);
		},
		async closeIssue(number, payload) {
			recordCall(state, "closeIssue", { number, payload });
			return updateStoredIssue(state, number, { state: "closed", closed_at: TEST_NOW });
		},
	};
}

function createAdminClientState(options) {
	const issues = options.issues ?? [
		remoteIssue(1, "Matrix One", { labels: ["bug"], assignees: ["octocat"] }),
		remoteIssue(2, "Matrix Two", { labels: ["triage"] }),
		remoteIssue(3, "Matrix Three"),
		remoteIssue(7, "Project Issue 7"),
	];
	return {
		calls: [],
		payloads: [],
		failMethod: options.failMethod,
		failStatuses: new Map(options.failStatuses ?? []),
		failIssueMethods: new Map(options.failIssueMethods ?? []),
		issues: new Map(issues.map((issue) => [issue.number, issue])),
		comments: new Map(),
		listResult: options.listResult ?? { mode: "list", issues: [issues[0]], truncated: false },
		searchResult: options.searchResult ?? { mode: "search", issues: [issues[0]], totalCount: 3, incompleteResults: false, truncated: true },
		labelsResult: options.labelsResult ?? { labels: [githubLabel({ name: "bug" })], truncated: false },
		milestonesResult: options.milestonesResult ?? { milestones: [githubMilestone({ number: 1, title: "v1.0" })], truncated: false },
		assigneesResult: options.assigneesResult ?? { assignees: [githubUser({ login: "octocat" })], truncated: false },
		projectsResult: options.projectsResult ?? { owner: TEST_REPOSITORY, projects: [projectSummary()], truncated: false },
		projectFieldsResult: options.projectFieldsResult ?? { project: projectSummary(), fields: [projectFieldSummary()], truncated: false },
	};
}

function recordCall(state, method, payload = undefined) {
	state.calls.push(method);
	if (payload !== undefined) state.payloads.push({ method, payload });
	const issueNumber = issueNumberFromPayload(payload);
	const issueFailures = state.failIssueMethods.get(method);
	if (issueFailures?.has(issueNumber)) throw remoteError(method, 503);
	if (state.failMethod === method) throw remoteError(method, 503);
	if (state.failStatuses.has(method)) throw remoteError(method, state.failStatuses.get(method));
}

function issueNumberFromPayload(payload) {
	if (typeof payload === "number") return payload;
	if (payload && typeof payload.number === "number") return payload.number;
	if (payload && typeof payload.issueNumber === "number") return payload.issueNumber;
	return undefined;
}

function remoteError(method, status = 503) {
	return new GitHubApiError(`mock ${method} failed`, { status, path: `/mock/${method}` });
}

function getStoredIssue(state, number) {
	const issue = state.issues.get(number);
	if (issue) return issue;
	throw new IssueMeError("issue_not_found", `Issue #${number} not found.`, { issueNumber: number });
}

function updateStoredIssue(state, number, payload) {
	const current = getStoredIssue(state, number);
	const updated = {
		...current,
		...(payload.title !== undefined ? { title: payload.title } : {}),
		...(payload.state !== undefined ? { state: payload.state } : {}),
		...(payload.closed_at !== undefined ? { closed_at: payload.closed_at } : {}),
		...(payload.labels !== undefined ? { labels: payload.labels.map((name) => githubLabel({ name })) } : {}),
		...(payload.assignees !== undefined ? { assignees: payload.assignees.map((login) => githubUser({ login })) } : {}),
		...(Object.hasOwn(payload, "milestone") ? { milestone: payload.milestone === null ? null : githubMilestone({ number: payload.milestone, title: `Milestone ${payload.milestone}` }) } : {}),
		updated_at: TEST_NOW,
	};
	state.issues.set(number, updated);
	return updated;
}

function mergeLabels(issue, labels) {
	return [...new Set([...issue.labels.map((label) => label.name), ...labels])];
}

function mergeAssignees(issue, assignees) {
	return [...new Set([...issue.assignees.map((assignee) => assignee.login), ...assignees])];
}

function withoutFixtureOnlyKeys(input, keys) {
	const output = { ...input };
	for (const key of keys) delete output[key];
	return output;
}

function discoverySuccessCases() {
	return [
		{
			name: "issueme_list_issues",
			params: { query: "crash", state: "all", labels: [" bug ", "bug"], sort: "updated", direction: "desc", limit: 1 },
			status: "search",
			assertResult(result, client) {
				assert.equal(result.details.truncated, true);
				assert.equal(result.details.counts.total, 3);
				assert.deepEqual(client.payloads[0].payload.labels, ["bug"]);
				assert.match(result.content[0].text, /Mode: search/);
			},
		},
		{
			name: "issueme_list_labels",
			params: { name: "bug", query: "triage", limit: 1 },
			status: "list_labels",
			clientOptions: { labelsResult: { labels: [githubLabel({ name: "bug" })], truncated: true } },
			assertResult(result) {
				assert.equal(result.details.truncated, true);
				assert.deepEqual(result.details.labels.map((label) => label.name), ["bug"]);
			},
		},
		{
			name: "issueme_list_milestones",
			params: { state: "all", sort: "completeness", direction: "asc", limit: 3 },
			status: "list_milestones",
			clientOptions: { milestonesResult: { milestones: [], truncated: false } },
			assertResult(result) {
				assert.deepEqual(result.details.milestones, []);
				assert.match(result.content[0].text, /No repository milestones matched/);
			},
		},
		{
			name: "issueme_list_assignees",
			params: { login: "octo", query: "user", limit: 1 },
			status: "list_assignees",
			clientOptions: { assigneesResult: { assignees: [githubUser({ login: "octocat" })], truncated: true } },
			assertResult(result) {
				assert.equal(result.details.truncated, true);
				assert.deepEqual(result.details.assignees.map((assignee) => assignee.login), ["octocat"]);
			},
		},
	];
}

test("discovery tool matrix normalizes filters, bounds output, and handles empty/truncated results", async () => {
	for (const item of discoverySuccessCases()) {
		const projectRoot = await tempProject("issueme-tool-matrix-admin-");
		const client = createAdminClient(item.clientOptions);
		const tools = registerAdminTools(projectRoot, client);
		const result = await executeTool(tools, item.name, projectRoot, item.params);
		assertToolSuccess(result, item.status);
		assert.equal(result.details.repository, TEST_REPOSITORY);
		assert.equal(result.details.counts.limit, item.params.limit);
		item.assertResult(result, client);
	}
});

function directSuccessCases() {
	return [
		{ name: "issueme_manage_label", params: { action: "create", name: "triage", color: "#ABCDEF", description: " Needs triage " }, status: "label_created", method: "createRepositoryLabel" },
		{ name: "issueme_manage_milestone", params: { action: "create", title: " v2.0 ", dueOn: "2026-07-01" }, status: "milestone_created", method: "createRepositoryMilestone" },
		{ name: "issueme_list_projects", params: { scope: "organization", owner: "octo-org", query: "road", includeClosed: true, limit: 1 }, status: "list_projects", method: "listProjectsV2" },
		{ name: "issueme_get_project_fields", params: { projectId: PROJECT_ID, fieldLimit: 1, optionLimit: 1, iterationLimit: 1 }, status: "get_project_fields", method: "getProjectV2Fields" },
		{ name: "issueme_add_issue_to_project", params: { issueNumber: 7, projectId: PROJECT_ID }, status: "add_issue_to_project", method: "addIssueToProjectV2" },
		{ name: "issueme_update_project_item", params: { projectId: PROJECT_ID, itemId: PROJECT_ITEM_ID, issueNumber: 7, fieldId: PROJECT_STATUS_FIELD_ID, valueType: "single_select", singleSelectOptionId: "opt_todo" }, status: "update_project_item", method: "updateProjectV2ItemField" },
		{ name: "issueme_bulk_update_issues", params: { issueNumbers: [1], action: "add_labels", labels: ["triage"] }, status: "bulk_success", method: "addLabels", cacheUpdated: true },
	];
}

test("non-core tool success matrix directly executes every admin, project, and bulk tool", async () => {
	const seenToolNames = new Set(discoverySuccessCases().map((item) => item.name));
	for (const item of directSuccessCases()) {
		const projectRoot = await tempProject("issueme-tool-matrix-admin-");
		const client = createAdminClient();
		const tools = registerAdminTools(projectRoot, client);
		const result = await executeTool(tools, item.name, projectRoot, item.params);
		assertToolSuccess(result, item.status, { cacheUpdated: item.cacheUpdated ?? false });
		assertRemoteCall(client, item.method);
		seenToolNames.add(item.name);
	}
	assert.deepEqual([...seenToolNames].sort(), [...ADMIN_TOOL_NAMES].sort());
});

function validationCases() {
	return [
		{ name: "issueme_list_issues", params: { query: "repo:evil/repo is:pr" } },
		{ name: "issueme_list_labels", params: { limit: 0 } },
		{ name: "issueme_list_milestones", params: { state: "ancient" } },
		{ name: "issueme_list_assignees", params: { query: "bad\0query" } },
		{ name: "issueme_manage_label", params: { action: "delete", name: "triage" } },
		{ name: "issueme_manage_milestone", params: { action: "create", title: " " } },
		{ name: "issueme_list_projects", params: { owner: "octocat" } },
		{ name: "issueme_get_project_fields", params: {} },
		{ name: "issueme_add_issue_to_project", params: { issueNumber: 0, projectId: PROJECT_ID } },
		{ name: "issueme_update_project_item", params: { projectId: PROJECT_ID, itemId: PROJECT_ITEM_ID, issueNumber: 7, fieldId: PROJECT_STATUS_FIELD_ID, valueType: "single_select" } },
		{ name: "issueme_bulk_update_issues", params: { issueNumbers: [1, 1], action: "add_labels", labels: ["bug"] } },
	];
}

test("non-core tool validation matrix rejects unsafe inputs before remote calls", async () => {
	for (const item of validationCases()) {
		const projectRoot = await tempProject("issueme-tool-matrix-admin-");
		const client = createAdminClient();
		const tools = registerAdminTools(projectRoot, client);
		const error = await captureToolError(tools, item.name, projectRoot, item.params);
		assertIssueMeError(error, "invalid_tool_input");
		assertNoRemoteCalls(client);
		assertNoSecretLeak(error);
	}
});

function discoveryRemoteFailureCases() {
	return [
		{ name: "issueme_list_issues", params: { query: "crash" }, failMethod: "searchIssues" },
		{ name: "issueme_list_labels", params: { query: "bug" }, failMethod: "listLabels" },
		{ name: "issueme_list_milestones", params: { state: "all" }, failMethod: "listMilestones" },
		{ name: "issueme_list_assignees", params: { login: "octo" }, failMethod: "listAssignees" },
	];
}

test("discovery remote failure matrix surfaces safe GitHub errors", async () => {
	for (const item of discoveryRemoteFailureCases()) {
		const projectRoot = await tempProject("issueme-tool-matrix-admin-");
		const client = createAdminClient({ failMethod: item.failMethod });
		const tools = registerAdminTools(projectRoot, client);
		const error = await captureToolError(tools, item.name, projectRoot, item.params);
		assertGitHubApiError(error);
		assertRemoteCall(client, item.failMethod);
	}
});

function labelActionCases() {
	return [
		{ params: { action: "create", name: "kind/bug", color: "#D73A4A", description: " Bug label " }, method: "createRepositoryLabel", status: "label_created", changedFields: ["name", "color", "description"] },
		{ params: { action: "update", name: "kind/bug", newName: "kind/fix", color: "#00AAFF", description: "" }, method: "updateRepositoryLabel", status: "label_updated", changedFields: ["name", "color", "description"] },
		{ params: { action: "delete", name: "kind/fix", confirmDelete: true }, method: "deleteRepositoryLabel", status: "label_deleted", changedFields: ["deleted"] },
	];
}

test("manage label action matrix covers create, update, delete, color normalization, rename, and clearing", async () => {
	for (const item of labelActionCases()) {
		const projectRoot = await tempProject("issueme-tool-matrix-admin-");
		const client = createAdminClient();
		const tools = registerAdminTools(projectRoot, client);
		const result = await executeTool(tools, "issueme_manage_label", projectRoot, item.params);
		assertToolSuccess(result, item.status);
		assertRemoteCall(client, item.method);
		assert.deepEqual(result.details.changedFields, item.changedFields);
	}
});

function milestoneActionCases() {
	return [
		{ params: { action: "create", title: " v1.0 ", description: " Release ", dueOn: "2026-07-01" }, method: "createRepositoryMilestone", status: "milestone_created", changedFields: ["title", "description", "due_on"] },
		{ params: { action: "update", number: 1, title: "v1.1", description: "", clearDueOn: true }, method: "updateRepositoryMilestone", status: "milestone_updated", changedFields: ["title", "description", "due_on"] },
		{ params: { action: "close", number: 1 }, method: "updateRepositoryMilestone", status: "milestone_closed", changedFields: ["state"] },
		{ params: { action: "reopen", number: 1 }, method: "updateRepositoryMilestone", status: "milestone_reopened", changedFields: ["state"] },
		{ params: { action: "delete", number: 1, confirmDelete: true }, method: "deleteRepositoryMilestone", status: "milestone_deleted", changedFields: ["deleted"] },
	];
}

test("manage milestone action matrix covers create, update, close, reopen, delete, due dates, and clearing", async () => {
	for (const item of milestoneActionCases()) {
		const projectRoot = await tempProject("issueme-tool-matrix-admin-");
		const client = createAdminClient();
		const tools = registerAdminTools(projectRoot, client);
		const result = await executeTool(tools, "issueme_manage_milestone", projectRoot, item.params);
		assertToolSuccess(result, item.status);
		assertRemoteCall(client, item.method);
		assert.deepEqual(result.details.changedFields, item.changedFields);
	}
});

test("manage taxonomy tools return bounded known-conflict error results", async () => {
	const labelRoot = await tempProject("issueme-tool-matrix-admin-");
	const labelClient = createAdminClient({ failStatuses: [["createRepositoryLabel", 422]] });
	const labelTools = registerAdminTools(labelRoot, labelClient);
	const labelResult = await executeTool(labelTools, "issueme_manage_label", labelRoot, { action: "create", name: "triage", color: "fbca04" });
	assertStructuredErrorResult(labelResult, "label_create_conflict");

	const milestoneRoot = await tempProject("issueme-tool-matrix-admin-");
	const milestoneClient = createAdminClient({ failStatuses: [["updateRepositoryMilestone", 422]] });
	const milestoneTools = registerAdminTools(milestoneRoot, milestoneClient);
	const milestoneResult = await executeTool(milestoneTools, "issueme_manage_milestone", milestoneRoot, { action: "close", number: 1 });
	assertStructuredErrorResult(milestoneResult, "milestone_update_conflict");
});

function projectValueCases() {
	return [
		{ valueType: "single_select", value: { singleSelectOptionId: "opt_todo" } },
		{ valueType: "iteration", value: { iterationId: "iter_1" } },
		{ valueType: "date", value: { date: "2026-07-01" } },
		{ valueType: "text", value: { text: "Ready for review" } },
		{ valueType: "number", value: { numberValue: 3.5 } },
	];
}

test("Projects v2 matrix covers all update value variants and creator guard failures before mutation", async () => {
	for (const item of projectValueCases()) {
		const projectRoot = await tempProject("issueme-tool-matrix-admin-");
		const client = createAdminClient();
		const tools = registerAdminTools(projectRoot, client);
		const params = { projectId: PROJECT_ID, itemId: PROJECT_ITEM_ID, issueNumber: 7, fieldId: `${PROJECT_STATUS_FIELD_ID}_${item.valueType}`, valueType: item.valueType, ...item.value };
		const result = await executeTool(tools, "issueme_update_project_item", projectRoot, params);
		assertToolSuccess(result, "update_project_item");
		assert.equal(result.details.changedFields[0], params.fieldId);
	}

	const guardedRoot = await tempProject("issueme-tool-matrix-admin-");
	const guardedClient = createAdminClient({ issues: [remoteIssue(7, "Guarded", { creator: "intruder" })] });
	const guardedTools = registerAdminTools(guardedRoot, guardedClient, { allowedIssueCreator: "octocat" });
	const error = await captureToolError(guardedTools, "issueme_add_issue_to_project", guardedRoot, { issueNumber: 7, projectId: PROJECT_ID });
	assertIssueMeError(error, "issue_creator_not_allowed");
	assertRemoteCall(guardedClient, "ensureIssueOpen");
	assert.equal(guardedClient.calls.includes("addIssueToProjectV2"), false);
});

function bulkSuccessCases() {
	return [
		{ action: "add_labels", params: { labels: ["triage"] }, method: "addLabels", changedFields: ["labels"] },
		{ action: "assign", params: { assignees: ["hubot"] }, method: "addAssignees", changedFields: ["assignees"] },
		{ action: "set_milestone", params: { milestoneNumber: 1 }, method: "updateIssue", changedFields: ["milestone"] },
		{ action: "add_to_project", params: { projectId: PROJECT_ID }, method: "addIssueToProjectV2", changedFields: ["project_item"], cacheUpdated: false },
		{ action: "close", params: { reason: "completed" }, method: "closeIssue", changedFields: ["state", "state_reason"] },
	];
}

test("bulk update matrix covers all action success paths with bounded per-issue summaries", async () => {
	for (const item of bulkSuccessCases()) {
		const projectRoot = await tempProject("issueme-tool-matrix-admin-");
		await writeLocalIssue(projectRoot, 1, "Matrix One");
		const client = createAdminClient();
		const tools = registerAdminTools(projectRoot, client);
		const params = { issueNumbers: [1], action: item.action, ...item.params };
		const result = await executeTool(tools, "issueme_bulk_update_issues", projectRoot, params);
		assertToolSuccess(result, "bulk_success", { cacheUpdated: item.cacheUpdated ?? true });
		assertRemoteCall(client, item.method);
		assert.deepEqual(result.details.bulkResults.map((entry) => entry.status), ["success"]);
		assert.deepEqual(result.details.changedFields, item.changedFields);
		assert.equal(result.details.bulkResults[0].needsSync, false);
		assert.equal(result.details.bulkResults[0].cacheUpdated, item.cacheUpdated ?? true);
	}
});

test("bulk update matrix makes continueOnError partial failure semantics explicit and bounded", async () => {
	const stoppedRoot = await tempProject("issueme-tool-matrix-admin-");
	const stoppedClient = createAdminClient({ failIssueMethods: [["addLabels", new Set([2])]] });
	const stoppedTools = registerAdminTools(stoppedRoot, stoppedClient);
	const stopped = await executeTool(stoppedTools, "issueme_bulk_update_issues", stoppedRoot, { issueNumbers: [1, 2, 3], action: "add_labels", labels: ["triage"] });
	assert.equal(stopped.details.result, "partial_success");
	assert.equal(stopped.details.status, "bulk_partial_success");
	assert.equal(stopped.details.needsSync, true);
	assert.deepEqual(stopped.details.bulkResults.map((entry) => entry.status), ["success", "failed", "skipped"]);
	assert.deepEqual(stopped.details.counts, { requested: 3, succeeded: 1, partial: 0, failed: 1, skipped: 1 });
	assert.match(stopped.content[0].text, /Do not blindly rerun/);

	const continuedRoot = await tempProject("issueme-tool-matrix-admin-");
	const continuedClient = createAdminClient({ failIssueMethods: [["addLabels", new Set([2])]] });
	const continuedTools = registerAdminTools(continuedRoot, continuedClient);
	const continued = await executeTool(continuedTools, "issueme_bulk_update_issues", continuedRoot, { issueNumbers: [1, 2, 3], action: "add_labels", labels: ["triage"], continueOnError: true });
	assert.equal(continued.details.status, "bulk_partial_success");
	assert.deepEqual(continued.details.bulkResults.map((entry) => entry.status), ["success", "failed", "success"]);
	assert.deepEqual(continued.details.counts, { requested: 3, succeeded: 2, partial: 0, failed: 1, skipped: 0 });
	assertNoSecretLeak(continued);
});

test("bulk update matrix reports aborts and partial cache sync without unsafe retries", async () => {
	const controller = new AbortController();
	controller.abort();
	const abortedRoot = await tempProject("issueme-tool-matrix-admin-");
	const abortedClient = createAdminClient();
	const abortedTools = registerAdminTools(abortedRoot, abortedClient);
	const aborted = await executeTool(abortedTools, "issueme_bulk_update_issues", abortedRoot, { issueNumbers: [1, 2], action: "add_labels", labels: ["triage"] }, { signal: controller.signal });
	assert.equal(aborted.details.status, "bulk_failed");
	assert.deepEqual(aborted.details.bulkResults.map((entry) => entry.status), ["failed", "skipped"]);
	assert.equal(aborted.details.bulkResults[0].error.code, "github_request_aborted");
	assert.equal(abortedClient.calls.length, 0);

	const blockedRoot = await tempProjectWithBlockedIssueDirectory();
	const blockedClient = createAdminClient();
	const blockedTools = registerAdminTools(blockedRoot, blockedClient);
	const partial = await executeTool(blockedTools, "issueme_bulk_update_issues", blockedRoot, { issueNumbers: [1], action: "add_labels", labels: ["triage"] });
	assert.equal(partial.details.result, "partial_success");
	assert.equal(partial.details.status, "bulk_partial_success");
	assert.deepEqual(partial.details.bulkResults.map((entry) => entry.status), ["partial_success"]);
	assert.equal(partial.details.bulkResults[0].error.details.partialSuccessCode, "partial_success_cache_sync_required");
	assert.equal(partial.details.needsSync, true);
	assert.match(partial.content[0].text, /issueme_sync_issues|cache state/);
});
