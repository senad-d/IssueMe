import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ClosedIssueMutationError, GitHubApiError, IssueMeError } from "../src/errors.ts";
import { writeIssueRecord } from "../src/issues/store.ts";
import { registerIssueMeTools } from "../src/tools/issueme-tools.ts";
import {
	githubComment,
	issueMeConfig,
	localIssueRecord,
	TEST_NOW,
	TEST_REPOSITORY,
	TEST_REPOSITORY_OBJECT,
	TEST_TOKEN,
} from "./helpers/issueme-test-helpers.mjs";

const CORE_TOOL_NAMES = [
	"issueme_sync_issues",
	"issueme_create_issue",
	"issueme_get_issue",
	"issueme_update_issue",
	"issueme_comment_issue",
	"issueme_update_comment",
	"issueme_delete_comment",
	"issueme_assign_issue",
	"issueme_label_issue",
	"issueme_reopen_issue",
	"issueme_close_issue",
	"issueme_delete_issue",
];

const MUTATION_METHODS = new Map([
	["issueme_create_issue", "createIssue"],
	["issueme_update_issue", "updateIssue"],
	["issueme_comment_issue", "addComment"],
	["issueme_update_comment", "updateComment"],
	["issueme_delete_comment", "deleteComment"],
	["issueme_assign_issue", "addAssignees"],
	["issueme_label_issue", "addLabels"],
	["issueme_close_issue", "closeIssue"],
	["issueme_reopen_issue", "reopenIssue"],
	["issueme_delete_issue", "deleteIssueByIssueResponse"],
]);

async function tempProject(prefix = "issueme-tool-matrix-core-") {
	return mkdtemp(join(tmpdir(), prefix));
}

async function tempProjectWithBlockedIssueDirectory() {
	const projectRoot = await tempProject("issueme-tool-matrix-core-blocked-");
	await writeFile(join(projectRoot, "issues"), "not a directory", "utf8");
	return projectRoot;
}

async function tempProjectWithIssueDirectory() {
	const projectRoot = await tempProject();
	await mkdir(join(projectRoot, "issues"), { recursive: true });
	return projectRoot;
}

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

function registerTools(projectRoot, client, configOverrides = {}) {
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
	return tool.execute("tool-matrix-call", params, options.signal, undefined, trustedContext(projectRoot, options.trusted ?? true));
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

function assertNoTokenLeak(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TEST_TOKEN));
}

function assertToolResult(result, expected = {}) {
	assert.equal(result.details.result, expected.result ?? "success", `${expected.name ?? "tool"} result`);
	assert.equal(result.details.needsSync, expected.needsSync ?? false, `${expected.name ?? "tool"} needsSync`);
	assert.equal(result.details.cacheUpdated, expected.cacheUpdated ?? false, `${expected.name ?? "tool"} cacheUpdated`);
	assert.ok(Array.isArray(result.details.paths));
	assert.ok(Array.isArray(result.details.removedPaths));
	assert.ok(Array.isArray(result.details.changedFields));
	if (expected.status !== undefined) assert.equal(result.details.status, expected.status);
	if (result.details.status !== undefined) assert.equal(typeof result.details.status, "string");
	assert.equal(result.content[0].type, "text");
	assert.equal(typeof result.content[0].text, "string");
	assertNoTokenLeak(result);
}

function assertPartialSuccess(result, status) {
	assertToolResult(result, { result: "partial_success", needsSync: true, cacheUpdated: false, status });
	assert.equal(result.details.error.details.partialSuccessCode, "partial_success_cache_sync_required");
}

function remoteIssue(number = 1, title = `Issue ${number}`, overrides = {}) {
	const labels = overrides.labels ?? [];
	const assignees = overrides.assignees ?? [];
	const state = overrides.state ?? "open";
	return {
		node_id: `I_${number}`,
		number,
		title,
		state,
		user: overrides.user ?? { login: "octocat" },
		body: overrides.body ?? `Body for ${title}`,
		labels: labels.map((label) => typeof label === "string" ? { name: label } : label),
		assignees: assignees.map((assignee) => typeof assignee === "string" ? { login: assignee } : assignee),
		milestone: Object.hasOwn(overrides, "milestone") ? overrides.milestone : null,
		comments: overrides.comments ?? 0,
		html_url: `https://github.com/${TEST_REPOSITORY}/issues/${number}`,
		created_at: TEST_NOW,
		updated_at: TEST_NOW,
		closed_at: state === "closed" ? TEST_NOW : null,
		...(overrides.pull_request ? { pull_request: overrides.pull_request } : {}),
	};
}

function localRecord(number = 1, title = `Issue ${number}`, overrides = {}) {
	return localIssueRecord({
		number,
		title,
		body: `Local body for ${title}`,
		labels: ["bug"],
		assignees: ["octocat"],
		html_url: `https://github.com/${TEST_REPOSITORY}/issues/${number}`,
		...overrides,
	});
}

function remoteError(method) {
	return new GitHubApiError(`mock ${method} failed`, { status: 503, path: `/mock/${method}` });
}

function createCoreClient(options = {}) {
	const state = createClientState(options);
	const client = {
		repository: TEST_REPOSITORY_OBJECT,
		calls: state.calls,
		payloads: state.payloads,
		async getAuthenticatedUserLogin() {
			recordCall(state, "getAuthenticatedUserLogin");
			return state.authenticatedUser;
		},
		async createIssue(payload) {
			recordCall(state, "createIssue", payload);
			const number = state.nextIssueNumber;
			state.nextIssueNumber += 1;
			const issue = remoteIssue(number, payload.title, {
				body: payload.body,
				labels: payload.labels,
				assignees: payload.assignees,
				user: { login: state.authenticatedUser },
			});
			state.issues.set(number, issue);
			return issue;
		},
		async listIssues(filters) {
			recordCall(state, "listIssues", filters);
			return { mode: "list", issues: [...state.listIssues], truncated: false };
		},
		async getIssue(number) {
			recordCall(state, "getIssue", { number });
			return getStoredIssue(state, number);
		},
		async ensureIssueOpen(number) {
			recordCall(state, "ensureIssueOpen", { number });
			if (state.closedGuard) throw new ClosedIssueMutationError(number, "closed", issueSummary(number));
			return getStoredIssue(state, number);
		},
		async listComments(number) {
			recordCall(state, "listComments", { number });
			return state.comments.get(number) ?? [];
		},
		async updateIssue(number, payload) {
			recordCall(state, "updateIssue", { number, payload });
			const updated = updateStoredIssue(state, number, payload);
			return updated;
		},
		async addComment(number, body) {
			recordCall(state, "addComment", { number, body });
			return appendStoredComment(state, number, body);
		},
		async updateComment(issueNumber, commentId, body) {
			recordCall(state, "updateComment", { issueNumber, commentId, body });
			return replaceStoredComment(state, issueNumber, commentId, body);
		},
		async deleteComment(issueNumber, commentId) {
			recordCall(state, "deleteComment", { issueNumber, commentId });
			return deleteStoredComment(state, issueNumber, commentId);
		},
		async addAssignees(number, assignees) {
			recordCall(state, "addAssignees", { number, assignees });
			return updateStoredIssue(state, number, { assignees: mergeUniqueLogins(getStoredIssue(state, number), assignees) });
		},
		async removeAssignees(number, assignees) {
			recordCall(state, "removeAssignees", { number, assignees });
			return updateStoredIssue(state, number, { assignees: removeLogins(getStoredIssue(state, number), assignees) });
		},
		async setAssignees(number, assignees) {
			recordCall(state, "setAssignees", { number, assignees });
			return updateStoredIssue(state, number, { assignees });
		},
		async addLabels(number, labels) {
			recordCall(state, "addLabels", { number, labels });
			updateStoredIssue(state, number, { labels: mergeUniqueLabels(getStoredIssue(state, number), labels) });
		},
		async setLabels(number, labels) {
			recordCall(state, "setLabels", { number, labels });
			updateStoredIssue(state, number, { labels });
		},
		async removeLabel(number, label) {
			recordCall(state, "removeLabel", { number, label });
			return updateStoredIssue(state, number, { labels: removeLabels(getStoredIssue(state, number), [label]) });
		},
		async closeIssue(number, payload) {
			recordCall(state, "closeIssue", { number, payload });
			return updateStoredIssue(state, number, { state: "closed", closed_at: TEST_NOW });
		},
		async reopenIssue(number) {
			recordCall(state, "reopenIssue", { number });
			return updateStoredIssue(state, number, { state: "open", closed_at: null });
		},
		async deleteIssueByIssueResponse(issue) {
			recordCall(state, "deleteIssueByIssueResponse", { number: issue.number });
			state.issues.delete(issue.number);
			state.comments.delete(issue.number);
		},
	};
	return client;
}

function createClientState(options) {
	const baseIssues = options.issues ?? [
		remoteIssue(1, "Matrix Target", { labels: ["bug"], assignees: ["octocat"], comments: 1 }),
		remoteIssue(2, "Closed Target", { state: "closed", comments: 0 }),
	];
	return {
		calls: [],
		payloads: [],
		failMethod: options.failMethod,
		closedGuard: options.closedGuard === true,
		authenticatedUser: options.authenticatedUser ?? "octocat",
		nextIssueNumber: options.nextIssueNumber ?? 50,
		issues: new Map(baseIssues.map((issue) => [issue.number, issue])),
		listIssues: options.listIssues ?? [baseIssues[0]],
		comments: createCommentMap(options.comments),
		omitCommentUrl: options.omitCommentUrl === true,
	};
}

function createCommentMap(comments = {}) {
	const map = new Map([[1, [githubComment({ id: 100, issueNumber: 1, body: "Existing comment" })]]]);
	for (const [issueNumber, issueComments] of Object.entries(comments)) map.set(Number(issueNumber), issueComments);
	return map;
}

function recordCall(state, method, payload = undefined) {
	state.calls.push(method);
	if (payload !== undefined) state.payloads.push({ method, payload });
	if (state.failMethod === method) throw remoteError(method);
}

function getStoredIssue(state, number) {
	const issue = state.issues.get(number);
	if (!issue) throw new IssueMeError("issue_not_found", `Issue #${number} not found.`, { issueNumber: number });
	return issue;
}

function updateStoredIssue(state, number, payload) {
	const current = getStoredIssue(state, number);
	const labels = Array.isArray(payload.labels) ? payload.labels.map((name) => ({ name })) : current.labels;
	const assignees = Array.isArray(payload.assignees) ? payload.assignees.map((login) => ({ login })) : current.assignees;
	const milestone = Object.hasOwn(payload, "milestone") ? milestoneFromPayload(payload.milestone) : current.milestone;
	const updated = {
		...current,
		...(payload.title !== undefined ? { title: payload.title } : {}),
		...(payload.body !== undefined ? { body: payload.body } : {}),
		...(payload.state !== undefined ? { state: payload.state } : {}),
		...(payload.closed_at !== undefined ? { closed_at: payload.closed_at } : {}),
		labels,
		assignees,
		milestone,
		updated_at: TEST_NOW,
	};
	state.issues.set(number, updated);
	return updated;
}

function milestoneFromPayload(value) {
	if (value === undefined) return undefined;
	if (value === null) return null;
	return { number: value, title: `Milestone ${value}` };
}

function appendStoredComment(state, number, body) {
	const id = 1000 + state.calls.length;
	const comment = toolComment(number, id, body, state.omitCommentUrl);
	const comments = state.comments.get(number) ?? [];
	state.comments.set(number, [...comments, comment]);
	updateStoredIssue(state, number, { comments: comments.length + 1 });
	return comment;
}

function replaceStoredComment(state, issueNumber, commentId, body) {
	const returnedComment = toolComment(issueNumber, commentId, body, state.omitCommentUrl);
	const cachedComment = toolComment(issueNumber, commentId, body, false);
	const comments = state.comments.get(issueNumber) ?? [];
	state.comments.set(issueNumber, comments.map((existing) => existing.id === commentId ? cachedComment : existing));
	return returnedComment;
}

function deleteStoredComment(state, issueNumber, commentId) {
	const comment = toolComment(issueNumber, commentId, "deleted", state.omitCommentUrl);
	const comments = state.comments.get(issueNumber) ?? [];
	state.comments.set(issueNumber, comments.filter((existing) => existing.id !== commentId));
	updateStoredIssue(state, issueNumber, { comments: Math.max(0, comments.length - 1) });
	return comment;
}

function toolComment(issueNumber, id, body, omitUrl) {
	const comment = githubComment({ id, issueNumber, body });
	if (omitUrl) delete comment.html_url;
	return comment;
}

function mergeUniqueLogins(issue, assignees) {
	return [...new Set([...issue.assignees.map((assignee) => assignee.login), ...assignees])];
}

function removeLogins(issue, assignees) {
	const remove = new Set(assignees);
	return issue.assignees.map((assignee) => assignee.login).filter((login) => !remove.has(login));
}

function mergeUniqueLabels(issue, labels) {
	return [...new Set([...issue.labels.map((label) => label.name), ...labels])];
}

function removeLabels(issue, labels) {
	const remove = new Set(labels);
	return issue.labels.map((label) => label.name).filter((name) => !remove.has(name));
}

function issueSummary(number) {
	return {
		repository: TEST_REPOSITORY,
		number,
		title: `Issue ${number}`,
		state: "closed",
		labels: [],
		assignees: [],
		html_url: `https://github.com/${TEST_REPOSITORY}/issues/${number}`,
	};
}

async function writeLocalIssue(projectRoot, number, title = `Issue ${number}`, overrides = {}) {
	return writeIssueRecord(projectRoot, issueMeConfig(), localRecord(number, title, overrides));
}

function successCases() {
	return [
		{
			name: "issueme_sync_issues",
			params: {},
			expected: { cacheUpdated: true },
			assertResult(result, client) {
				assert.equal(result.details.counts.created, 1);
				assert.deepEqual(client.calls, ["listIssues", "listComments"]);
			},
		},
		{
			name: "issueme_create_issue",
			params: { title: "Matrix Created", body: "Body" },
			config: { defaultLabels: ["triage"], defaultAssignees: ["octocat"] },
			expected: { cacheUpdated: true },
			assertResult(_result, client) {
				const createPayload = client.payloads.find((payload) => payload.method === "createIssue").payload;
				assert.deepEqual(createPayload.labels, ["triage"]);
				assert.deepEqual(createPayload.assignees, ["octocat"]);
			},
		},
		{
			name: "issueme_get_issue",
			params: { lookup: "cached-target" },
			async setup(projectRoot) { await writeLocalIssue(projectRoot, 1, "Cached Target"); },
			assertResult(result, client) {
				assert.equal(result.details.issue.localPath, "issues/1-cached-target.json");
				assert.deepEqual(client.calls, []);
			},
		},
		{
			name: "issueme_get_issue",
			params: { lookup: "1-matrix-target.json", refresh: true },
			async setup(projectRoot) { await writeLocalIssue(projectRoot, 1, "Matrix Target"); },
			expected: { cacheUpdated: true, status: "cache_updated" },
			assertResult(result) { assert.deepEqual(result.details.fileActions.map((action) => action.action), ["updated"]); },
		},
		{
			name: "issueme_update_issue",
			params: { number: 1, title: "Matrix Updated", body: "", labels: ["ready"], assignees: [], clearMilestone: true },
			expected: { cacheUpdated: true },
			assertResult(result) { assert.deepEqual(result.details.changedFields, ["title", "body", "labels", "assignees", "milestone"]); },
		},
		{
			name: "issueme_comment_issue",
			params: { number: 1, body: " Progress note " },
			expected: { cacheUpdated: true },
			assertResult(result) { assert.deepEqual(result.details.changedFields, ["comments"]); },
		},
		{
			name: "issueme_update_comment",
			params: { issueNumber: 1, commentId: 100, body: " Updated note " },
			clientOptions: { omitCommentUrl: true },
			expected: { cacheUpdated: true },
			assertResult(result) {
				assert.equal(result.details.comment.id, 100);
				assert.equal(result.details.comment.html_url, undefined);
			},
		},
		{
			name: "issueme_delete_comment",
			params: { issueNumber: 1, commentId: 100 },
			clientOptions: { omitCommentUrl: true },
			expected: { cacheUpdated: true, status: "comment_deleted" },
			assertResult(result) { assert.equal(result.details.comment.html_url, undefined); },
		},
		{
			name: "issueme_assign_issue",
			params: { number: 1, action: "add", assignees: ["hubot"] },
			expected: { cacheUpdated: true },
			assertResult(result) { assert.deepEqual(result.details.issue.assignees, ["octocat", "hubot"]); },
		},
		{
			name: "issueme_label_issue",
			params: { number: 1, action: "add", labels: ["ready"] },
			expected: { cacheUpdated: true },
			assertResult(result) { assert.deepEqual(result.details.issue.labels, ["bug", "ready"]); },
		},
		{
			name: "issueme_reopen_issue",
			params: { number: 2, comment: " Reopening " },
			expected: { cacheUpdated: true, status: "reopened" },
			assertResult(result) { assert.deepEqual(result.details.changedFields, ["state", "comments"]); },
		},
		{
			name: "issueme_close_issue",
			params: { number: 1, reason: "completed" },
			async setup(projectRoot) { await writeLocalIssue(projectRoot, 1, "Matrix Target"); },
			expected: { cacheUpdated: true, status: "closed_now" },
			assertResult(result) {
				assert.deepEqual(result.details.changedFields, ["state", "state_reason"]);
				assert.deepEqual(result.details.removedPaths, ["issues/1-matrix-target.json"]);
			},
		},
		{
			name: "issueme_delete_issue",
			params: { number: 1, confirmDelete: true },
			async setup(projectRoot) { await writeLocalIssue(projectRoot, 1, "Matrix Target"); },
			expected: { cacheUpdated: true, status: "issue_deleted" },
			assertResult(result) {
				assert.deepEqual(result.details.changedFields, ["deleted"]);
				assert.deepEqual(result.details.removedPaths, ["issues/1-matrix-target.json"]);
			},
		},
	];
}

test("core issue tool success matrix covers direct execution details for every core tool", async () => {
	const seenToolNames = new Set();
	for (const item of successCases()) {
		const projectRoot = await tempProjectWithIssueDirectory();
		const client = createCoreClient(item.clientOptions);
		if (item.setup) await item.setup(projectRoot, client);
		const tools = registerTools(projectRoot, client, item.config);
		const result = await executeTool(tools, item.name, projectRoot, item.params);
		assertToolResult(result, { ...item.expected, name: item.name });
		item.assertResult?.(result, client);
		seenToolNames.add(item.name);
	}
	assert.deepEqual([...seenToolNames].sort(), CORE_TOOL_NAMES.sort());
});

function assignAndLabelActionCases() {
	return [
		{ name: "issueme_assign_issue", params: { number: 1, action: "add", assignees: ["hubot"] }, method: "addAssignees", field: "assignees" },
		{ name: "issueme_assign_issue", params: { number: 1, action: "remove", assignees: ["octocat"] }, method: "removeAssignees", field: "assignees" },
		{ name: "issueme_assign_issue", params: { number: 1, action: "set", assignees: [] }, method: "setAssignees", field: "assignees" },
		{ name: "issueme_label_issue", params: { number: 1, action: "add", labels: ["ready"] }, method: "addLabels", field: "labels" },
		{ name: "issueme_label_issue", params: { number: 1, action: "remove", labels: ["bug"] }, method: "removeLabel", field: "labels" },
		{ name: "issueme_label_issue", params: { number: 1, action: "set", labels: [] }, method: "setLabels", field: "labels" },
	];
}

test("assign and label action matrices cover add, remove, set, and explicit empty-set semantics", async () => {
	for (const item of assignAndLabelActionCases()) {
		const projectRoot = await tempProjectWithIssueDirectory();
		const client = createCoreClient();
		const tools = registerTools(projectRoot, client);
		const result = await executeTool(tools, item.name, projectRoot, item.params);
		assertToolResult(result, { cacheUpdated: true });
		assert.ok(client.calls.includes(item.method), `${item.name} should call ${item.method}`);
		assert.deepEqual(result.details.changedFields, [item.field]);
	}
});

function validationCases() {
	return [
		{ name: "issueme_sync_issues", params: {}, options: { trusted: false }, code: "project_untrusted" },
		{ name: "issueme_create_issue", params: { title: " ", body: "Body" }, code: "invalid_tool_input" },
		{ name: "issueme_get_issue", params: {}, code: "invalid_tool_input" },
		{ name: "issueme_update_issue", params: { number: 1, milestoneNumber: 1, clearMilestone: true }, code: "invalid_tool_input" },
		{ name: "issueme_comment_issue", params: { number: 1, body: " " }, code: "invalid_tool_input" },
		{ name: "issueme_update_comment", params: { issueNumber: 1, commentId: 100, body: " " }, code: "invalid_tool_input" },
		{ name: "issueme_delete_comment", params: { issueNumber: 1, commentId: 100 }, options: { trusted: false }, code: "project_untrusted" },
		{ name: "issueme_assign_issue", params: { number: 1, action: "add", assignees: [] }, code: "invalid_tool_input" },
		{ name: "issueme_label_issue", params: { number: 1, action: "remove", labels: [] }, code: "invalid_tool_input" },
		{ name: "issueme_reopen_issue", params: { number: 2, comment: " " }, code: "invalid_tool_input" },
		{ name: "issueme_close_issue", params: { number: 1, reason: "duplicate" }, code: "invalid_tool_input" },
		{ name: "issueme_delete_issue", params: { number: 1, confirmDelete: false }, code: "invalid_tool_input" },
	];
}

test("core tool validation matrix rejects invalid inputs before client mutation", async () => {
	for (const item of validationCases()) {
		const projectRoot = await tempProjectWithIssueDirectory();
		const client = createCoreClient();
		const tools = registerTools(projectRoot, client);
		const error = await captureToolError(tools, item.name, projectRoot, item.params, item.options);
		assertIssueMeError(error, item.code);
		for (const method of MUTATION_METHODS.values()) assert.equal(client.calls.includes(method), false, `${item.name} should not call ${method}`);
		assertNoTokenLeak(error);
	}
});

function remoteFailureCases() {
	return [
		{ name: "issueme_sync_issues", params: {}, failMethod: "listIssues" },
		{ name: "issueme_create_issue", params: { title: "Remote fail", body: "Body", labels: [], assignees: [] }, failMethod: "createIssue" },
		{ name: "issueme_get_issue", params: { number: 1, refresh: true }, failMethod: "getIssue" },
		{ name: "issueme_update_issue", params: { number: 1, title: "Remote fail" }, failMethod: "updateIssue" },
		{ name: "issueme_comment_issue", params: { number: 1, body: "Remote fail" }, failMethod: "addComment" },
		{ name: "issueme_update_comment", params: { issueNumber: 1, commentId: 100, body: "Remote fail" }, failMethod: "updateComment" },
		{ name: "issueme_delete_comment", params: { issueNumber: 1, commentId: 100 }, failMethod: "deleteComment" },
		{ name: "issueme_assign_issue", params: { number: 1, action: "add", assignees: ["hubot"] }, failMethod: "addAssignees" },
		{ name: "issueme_label_issue", params: { number: 1, action: "add", labels: ["ready"] }, failMethod: "addLabels" },
		{ name: "issueme_reopen_issue", params: { number: 2 }, failMethod: "reopenIssue" },
		{ name: "issueme_close_issue", params: { number: 1 }, failMethod: "closeIssue" },
		{ name: "issueme_delete_issue", params: { number: 1, confirmDelete: true }, failMethod: "deleteIssueByIssueResponse" },
	];
}

test("core tool remote failure matrix surfaces safe GitHub errors without cache mutation", async () => {
	for (const item of remoteFailureCases()) {
		const projectRoot = await tempProjectWithIssueDirectory();
		const client = createCoreClient({ failMethod: item.failMethod });
		const tools = registerTools(projectRoot, client);
		const error = await captureToolError(tools, item.name, projectRoot, item.params);
		assert.ok(error instanceof GitHubApiError);
		assert.equal(error.code, "github_api_error");
		assert.equal(client.calls.includes(item.failMethod), true);
		assertNoTokenLeak({ message: error.message, safeDetails: error.safeDetails });
		assert.deepEqual(await readIssueDirectory(projectRoot), []);
	}
});

async function readIssueDirectory(projectRoot) {
	try {
		return await readdir(join(projectRoot, "issues"));
	} catch {
		return [];
	}
}

function cachePartialCases() {
	return [
		{ name: "issueme_create_issue", params: { title: "Cache blocked", body: "Body", labels: [], assignees: [] }, status: "partial_success" },
		{ name: "issueme_update_issue", params: { number: 1, title: "Cache blocked" }, status: "partial_success" },
		{ name: "issueme_comment_issue", params: { number: 1, body: "Cache blocked" }, status: "partial_success" },
		{ name: "issueme_update_comment", params: { issueNumber: 1, commentId: 100, body: "Cache blocked" }, status: "partial_success" },
		{ name: "issueme_delete_comment", params: { issueNumber: 1, commentId: 100 }, status: "partial_success" },
		{ name: "issueme_assign_issue", params: { number: 1, action: "add", assignees: ["hubot"] }, status: "partial_success" },
		{ name: "issueme_label_issue", params: { number: 1, action: "add", labels: ["ready"] }, status: "partial_success" },
		{ name: "issueme_reopen_issue", params: { number: 2 }, status: "reopened_partial_success" },
		{ name: "issueme_close_issue", params: { number: 1 }, status: "closed_now_partial_success" },
		{ name: "issueme_delete_issue", params: { number: 1, confirmDelete: true }, status: "issue_deleted_partial_success" },
	];
}

test("core tool cache partial-success matrix sets bounded needsSync details", async () => {
	for (const item of cachePartialCases()) {
		const projectRoot = await tempProjectWithBlockedIssueDirectory();
		const client = createCoreClient();
		const tools = registerTools(projectRoot, client);
		const result = await executeTool(tools, item.name, projectRoot, item.params);
		assertPartialSuccess(result, item.status);
		assert.match(result.content[0].text, /issueme_sync_issues|Local cache/);
	}
});

test("reopen comment partial success reports a safe result before cache refresh", async () => {
	const projectRoot = await tempProjectWithIssueDirectory();
	const client = createCoreClient({ failMethod: "addComment" });
	const tools = registerTools(projectRoot, client);
	const result = await executeTool(tools, "issueme_reopen_issue", projectRoot, { number: 2, comment: "please reopen" });
	assertPartialSuccess(result, "reopened_comment_partial_success");
	assert.equal(client.calls.includes("reopenIssue"), true);
	assert.equal(client.calls.includes("listComments"), false);
});

function creatorGuardCases() {
	return [
		{ name: "issueme_create_issue", params: { title: "Denied", body: "Body" }, expectedGate: "getAuthenticatedUserLogin" },
		{ name: "issueme_update_issue", params: { number: 1, title: "Denied" }, expectedGate: "ensureIssueOpen" },
		{ name: "issueme_comment_issue", params: { number: 1, body: "Denied" }, expectedGate: "ensureIssueOpen" },
		{ name: "issueme_update_comment", params: { issueNumber: 1, commentId: 100, body: "Denied" }, expectedGate: "ensureIssueOpen" },
		{ name: "issueme_delete_comment", params: { issueNumber: 1, commentId: 100 }, expectedGate: "ensureIssueOpen" },
		{ name: "issueme_assign_issue", params: { number: 1, action: "add", assignees: ["hubot"] }, expectedGate: "ensureIssueOpen" },
		{ name: "issueme_label_issue", params: { number: 1, action: "add", labels: ["ready"] }, expectedGate: "ensureIssueOpen" },
		{ name: "issueme_close_issue", params: { number: 1 }, expectedGate: "getIssue" },
		{ name: "issueme_delete_issue", params: { number: 1, confirmDelete: true }, expectedGate: "getIssue" },
		{ name: "issueme_reopen_issue", params: { number: 2 }, expectedGate: "getIssue" },
	];
}

test("creator-scope guard matrix rejects out-of-scope mutations before remote mutation methods", async () => {
	for (const item of creatorGuardCases()) {
		const projectRoot = await tempProjectWithIssueDirectory();
		const client = createCoreClient({ authenticatedUser: "hubot", issues: [remoteIssue(1, "Denied", { user: { login: "hubot" } }), remoteIssue(2, "Denied closed", { state: "closed", user: { login: "hubot" } })] });
		const tools = registerTools(projectRoot, client, { allowedIssueCreator: "octocat" });
		const error = await captureToolError(tools, item.name, projectRoot, item.params);
		assertIssueMeError(error, "issue_creator_not_allowed");
		assert.equal(client.calls.includes(item.expectedGate), true);
		const mutationMethod = MUTATION_METHODS.get(item.name);
		assert.equal(client.calls.includes(mutationMethod), false, `${item.name} should not call ${mutationMethod}`);
	}
});

function closedGuardCases() {
	return [
		{ name: "issueme_update_issue", params: { number: 1, title: "Closed" } },
		{ name: "issueme_comment_issue", params: { number: 1, body: "Closed" } },
		{ name: "issueme_update_comment", params: { issueNumber: 1, commentId: 100, body: "Closed" } },
		{ name: "issueme_delete_comment", params: { issueNumber: 1, commentId: 100 } },
		{ name: "issueme_assign_issue", params: { number: 1, action: "add", assignees: ["hubot"] } },
		{ name: "issueme_label_issue", params: { number: 1, action: "add", labels: ["ready"] } },
	];
}

test("open-state guard matrix refuses closed existing-issue mutations before mutation methods", async () => {
	for (const item of closedGuardCases()) {
		const projectRoot = await tempProjectWithIssueDirectory();
		const client = createCoreClient({ closedGuard: true });
		const tools = registerTools(projectRoot, client, { allowedIssueCreator: "octocat" });
		const error = await captureToolError(tools, item.name, projectRoot, item.params);
		assertIssueMeError(error, "closed_issue_mutation_refused");
		assert.equal(client.calls.includes("ensureIssueOpen"), true);
		const mutationMethod = MUTATION_METHODS.get(item.name);
		assert.equal(client.calls.includes(mutationMethod), false, `${item.name} should not call ${mutationMethod}`);
	}
});

test("sync matrix reports invalid write targets while filtering pull requests and creator scope", async () => {
	const projectRoot = await tempProjectWithIssueDirectory();
	await writeFile(join(projectRoot, "issues", "7-invalid-target.json"), "{not json", "utf8");
	const listIssues = [
		remoteIssue(7, "Invalid Target", { user: { login: "octocat" }, comments: 0 }),
		remoteIssue(8, "Pull request", { user: { login: "octocat" }, pull_request: {}, comments: 0 }),
		remoteIssue(9, "Other creator", { user: { login: "hubot" }, comments: 0 }),
	];
	const client = createCoreClient({ listIssues, issues: listIssues });
	const tools = registerTools(projectRoot, client, { allowedIssueCreator: "octocat" });
	const result = await executeTool(tools, "issueme_sync_issues", projectRoot, {});
	assertToolResult(result, { cacheUpdated: true });
	assert.equal(result.details.counts.invalid, 1);
	assert.equal(result.details.counts.created, 0);
	assert.deepEqual(result.details.issues.map((issue) => issue.number), [7]);
	assert.deepEqual(result.details.invalidFiles.map((file) => `${file.fileName}:${file.reason}`), ["7-invalid-target.json:issue_file_parse_failed"]);
	assert.deepEqual(result.details.fileActions.map((action) => action.action), ["unchanged"]);
});
