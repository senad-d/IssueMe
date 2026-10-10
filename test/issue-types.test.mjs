import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../src/errors.ts";
import { buildIssueListQuery, buildIssueSearchRequestQuery } from "../src/github/issues-client.ts";
import { GitHubTransport } from "../src/github/transport.ts";
import { formatIssueSummary, githubIssueToRecord, issueRecordToToolSummary } from "../src/issues/format.ts";
import { readIssueFile, writeIssueRecord } from "../src/issues/store.ts";
import { registerCreateIssueTool } from "../src/tools/create-issue.ts";
import { registerListIssueTypesTool } from "../src/tools/issue-types.ts";
import { registerListIssuesTool } from "../src/tools/list-issues.ts";
import { registerUpdateIssueTool } from "../src/tools/update-issue.ts";
import {
	createFakePi,
	createFetchRecorder,
	createNoNetworkFetch,
	executeRegisteredTool,
	githubIssue,
	issueMeConfig,
	jsonResponse,
	localIssueRecord,
	runtimeOptions,
	tempProject,
	TEST_REPOSITORY_OBJECT,
	TEST_TOKEN,
} from "./helpers/issueme-test-helpers.mjs";

const BUG = { id: 1, node_id: "IT_1", name: "Bug", description: "Something is broken", color: "red", is_enabled: true };
const TASK = { id: 2, node_id: "IT_2", name: "Task", description: null, color: "blue", is_enabled: false };

function typeServer(options = {}) {
	return (call) => {
		const path = call.url.pathname;
		if (path === "/repos/owner/repo") return jsonResponse({ full_name: "owner/repo", owner: options.owner ?? { login: "owner", type: "Organization" } });
		if (path === "/orgs/owner/issue-types") {
			if (options.orgStatus) return jsonResponse({ message: "Not Found" }, { status: options.orgStatus, statusText: "Error" });
			return jsonResponse(options.types ?? [BUG, TASK]);
		}
		throw new Error(`Unexpected request ${call.method} ${path}`);
	};
}

async function tools(handler, register, configOverrides = {}) {
	const recorder = createFetchRecorder(handler);
	const pi = createFakePi();
	register(pi, { runtime: runtimeOptions({ fetchFn: recorder.fetchFn, config: configOverrides }) });
	return { pi, recorder, cwd: await tempProject() };
}

test("transport allows only the resolved owner's issue-types organization endpoint and the repository root", async () => {
	const transport = new GitHubTransport({ repository: TEST_REPOSITORY_OBJECT, token: TEST_TOKEN, fetchFn: async () => jsonResponse([]) });
	await transport.request("GET", "/orgs/owner/issue-types", { validate: Array.isArray });
	await transport.request("GET", "/repos/owner/repo", { validate: Array.isArray });
	for (const path of ["/orgs/other/issue-types", "/orgs/owner/issue-types/1", "/orgs/owner/repos", "/orgs/owner", "/repos/owner/repository", "/repos/owner/repo-other"]) {
		await assert.rejects(() => transport.request("GET", path), (error) => error instanceof GitHubApiError && error.code === ISSUEME_ERROR_CODES.GITHUB_BOUNDARY_VIOLATION, path);
	}
});

test("issueme_list_issue_types lists organization types, reports user-owned repositories as unavailable, and distinguishes failures", async () => {
	const organization = await tools(typeServer(), registerListIssueTypesTool);
	const result = await executeRegisteredTool(organization.pi.tools, "issueme_list_issue_types", {}, { cwd: organization.cwd });
	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "list_issue_types");
	assert.deepEqual(result.details.issueTypes, [
		{ id: 1, name: "Bug", description: "Something is broken", color: "red", isEnabled: true },
		{ id: 2, name: "Task", color: "blue", isEnabled: false },
	]);
	assert.deepEqual(result.details.counts, { returned: 2, enabled: 1, disabled: 1, limit: 50 });
	assert.equal(result.details.cacheUpdated, false);
	assert.match(result.content[0].text, /- Bug \(enabled, red\) id: 1 — Something is broken/);
	assert.match(result.content[0].text, /- Task \(disabled, blue\) id: 2/);
	assert.deepEqual(organization.recorder.calls.map((call) => call.url.pathname), ["/repos/owner/repo", "/orgs/owner/issue-types"]);
	assert.doesNotMatch(JSON.stringify(result), new RegExp(TEST_TOKEN));

	const user = await tools(typeServer({ owner: { login: "owner", type: "User" } }), registerListIssueTypesTool);
	const unavailable = await executeRegisteredTool(user.pi.tools, "issueme_list_issue_types", {}, { cwd: user.cwd });
	assert.equal(unavailable.details.result, "success");
	assert.equal(unavailable.details.status, "issue_types_unavailable");
	assert.deepEqual(unavailable.details.issueTypes, []);
	assert.match(unavailable.content[0].text, /owner is a user account/);
	assert.equal(user.recorder.calls.length, 1, "no organization request for a user-owned repository");

	const empty = await tools(typeServer({ types: [] }), registerListIssueTypesTool);
	const none = await executeRegisteredTool(empty.pi.tools, "issueme_list_issue_types", {}, { cwd: empty.cwd });
	assert.equal(none.details.status, "list_issue_types");
	assert.match(none.content[0].text, /has not defined any issue types/);

	const missing = await tools(typeServer({ orgStatus: 404 }), registerListIssueTypesTool);
	await assert.rejects(() => executeRegisteredTool(missing.pi.tools, "issueme_list_issue_types", {}, { cwd: missing.cwd }), (error) => error instanceof GitHubApiError && error.code === ISSUEME_ERROR_CODES.GITHUB_ISSUE_TYPES_UNSUPPORTED);
	const forbidden = await tools(typeServer({ orgStatus: 403 }), registerListIssueTypesTool);
	await assert.rejects(() => executeRegisteredTool(forbidden.pi.tools, "issueme_list_issue_types", {}, { cwd: forbidden.cwd }), (error) => error instanceof GitHubApiError && error.status === 403 && error.code === ISSUEME_ERROR_CODES.GITHUB_API_ERROR);
	const malformed = await tools(typeServer({ types: [{ name: "No id" }] }), registerListIssueTypesTool);
	await assert.rejects(() => executeRegisteredTool(malformed.pi.tools, "issueme_list_issue_types", {}, { cwd: malformed.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID);
	const noOwner = await tools(typeServer({ owner: { login: "owner" } }), registerListIssueTypesTool);
	await assert.rejects(() => executeRegisteredTool(noOwner.pi.tools, "issueme_list_issue_types", {}, { cwd: noOwner.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID);
});

test("issueme_create_issue sends the type, verifies the persisted type, and reports a silently dropped type as partial success", async () => {
	const createServer = (persistedType) => (call) => {
		assert.equal(call.url.pathname, "/repos/owner/repo/issues");
		assert.equal(call.method, "POST");
		return jsonResponse(githubIssue({ number: 9, title: call.json.title, type: persistedType }), { status: 201, statusText: "Created" });
	};
	const applied = await tools(createServer(BUG), registerCreateIssueTool);
	const result = await executeRegisteredTool(applied.pi.tools, "issueme_create_issue", { title: "Typed issue", body: "Body", type: "Bug" }, { cwd: applied.cwd });
	assert.equal(result.details.result, "success");
	assert.equal(applied.recorder.calls[0].json.type, "Bug");
	assert.equal(result.details.issue.issueType, "Bug");
	const record = await readIssueFile(join(applied.cwd, result.details.paths[0]));
	assert.equal(record.issue_type, "Bug");

	const dropped = await tools(createServer(null), registerCreateIssueTool);
	const partial = await executeRegisteredTool(dropped.pi.tools, "issueme_create_issue", { title: "Typed issue", body: "Body", type: "Bug" }, { cwd: dropped.cwd });
	assert.equal(partial.details.result, "partial_success");
	assert.equal(partial.details.status, "create_issue_type_not_applied");
	assert.equal(partial.details.cacheUpdated, true);
	assert.equal(partial.details.needsSync, false);
	assert.equal(partial.details.error.code, ISSUEME_ERROR_CODES.ISSUE_TYPE_NOT_APPLIED);
	assert.equal(partial.details.issue.issueType, null);
	assert.match(partial.content[0].text, /persisted no type instead of the requested type "Bug"/);

	const untyped = await tools(createServer(undefined), registerCreateIssueTool);
	const plain = await executeRegisteredTool(untyped.pi.tools, "issueme_create_issue", { title: "Plain issue", body: "Body" }, { cwd: untyped.cwd });
	assert.equal(plain.details.result, "success");
	assert.equal(untyped.recorder.calls[0].json.type, undefined);
	assert.equal(plain.details.issue.issueType, undefined);

	const noNetwork = createFakePi();
	registerCreateIssueTool(noNetwork, { runtime: runtimeOptions({ fetchFn: createNoNetworkFetch() }) });
	await assert.rejects(() => executeRegisteredTool(noNetwork.tools, "issueme_create_issue", { title: "x", body: "y", type: "two\nlines" }, { cwd: untyped.cwd }), (error) => error instanceof IssueMeError && error.safeDetails.field === "type");
});

test("issueme_update_issue sets or clears the type with verification and rejects ambiguous type inputs", async () => {
	const updateServer = (persistedType, bodies) => {
		let current = BUG;
		return (call) => {
			const path = call.url.pathname;
			if (path === "/repos/owner/repo/issues/7" && call.method === "GET") return jsonResponse(githubIssue({ number: 7, type: current }));
			if (path === "/repos/owner/repo/issues/7" && call.method === "PATCH") {
				bodies.push(call.json);
				current = persistedType;
				return jsonResponse(githubIssue({ number: 7, type: persistedType }));
			}
			if (path === "/repos/owner/repo/issues/7/comments") return jsonResponse([]);
			throw new Error(`Unexpected request ${call.method} ${path}`);
		};
	};
	const setBodies = [];
	const set = await tools(updateServer(BUG, setBodies), registerUpdateIssueTool);
	const applied = await executeRegisteredTool(set.pi.tools, "issueme_update_issue", { number: 7, type: "Bug" }, { cwd: set.cwd });
	assert.equal(applied.details.result, "success");
	assert.deepEqual(applied.details.changedFields, ["type"]);
	assert.deepEqual(setBodies, [{ type: "Bug" }]);

	const clearBodies = [];
	const clear = await tools(updateServer(null, clearBodies), registerUpdateIssueTool);
	const cleared = await executeRegisteredTool(clear.pi.tools, "issueme_update_issue", { number: 7, clearType: true }, { cwd: clear.cwd });
	assert.equal(cleared.details.result, "success");
	assert.deepEqual(clearBodies, [{ type: null }]);
	assert.equal(cleared.details.issue.issueType, null);

	const droppedBodies = [];
	const dropped = await tools(updateServer(null, droppedBodies), registerUpdateIssueTool);
	const partial = await executeRegisteredTool(dropped.pi.tools, "issueme_update_issue", { number: 7, type: "Task" }, { cwd: dropped.cwd });
	assert.equal(partial.details.result, "partial_success");
	assert.equal(partial.details.status, "update_issue_type_not_applied");
	assert.equal(partial.details.cacheUpdated, true);
	assert.equal(partial.details.error.code, ISSUEME_ERROR_CODES.ISSUE_TYPE_NOT_APPLIED);

	const noNetwork = createFakePi();
	registerUpdateIssueTool(noNetwork, { runtime: runtimeOptions({ fetchFn: createNoNetworkFetch() }) });
	await assert.rejects(() => executeRegisteredTool(noNetwork.tools, "issueme_update_issue", { number: 7, type: "Bug", clearType: true }, { cwd: dropped.cwd }), (error) => error instanceof IssueMeError && /type or clearType/.test(error.message));
});

test("issue type filters apply to list and search modes with explicit wildcard rules", async () => {
	assert.equal(buildIssueListQuery({ type: " Bug " }, 10).type, "Bug");
	assert.equal(buildIssueListQuery({ type: "none" }, 10).type, "none");
	assert.equal(buildIssueListQuery({ type: "*" }, 10).type, "*");
	assert.equal(buildIssueListQuery({}, 10).type, undefined);
	assert.match(buildIssueSearchRequestQuery("owner/repo", { query: "crash", type: "Needs Review" }, 10).q, /type:"Needs Review"/);
	assert.throws(() => buildIssueSearchRequestQuery("owner/repo", { query: "crash", type: "*" }, 10), (error) => error instanceof IssueMeError && error.safeDetails.field === "type");
	assert.throws(() => buildIssueListQuery({ type: "a\nb" }, 10), (error) => error.safeDetails.field === "type");

	const { pi, recorder, cwd } = await tools((call) => {
		assert.equal(call.url.searchParams.get("type"), "Bug");
		return jsonResponse([githubIssue({ number: 1, type: BUG }), githubIssue({ number: 2, type: null })]);
	}, registerListIssuesTool);
	const result = await executeRegisteredTool(pi.tools, "issueme_list_issues", { type: "Bug" }, { cwd });
	assert.equal(recorder.calls.length, 1);
	assert.deepEqual(result.details.issues.map((issue) => issue.issueType), ["Bug", null]);
	assert.match(result.content[0].text, /#1 \[open\] Test Issue — no labels; unassigned; by octocat; type Bug;/);
});

test("issue records keep the native type with backward-compatible validation and summaries", async () => {
	const typed = githubIssueToRecord(TEST_REPOSITORY_OBJECT, githubIssue({ number: 3, type: BUG }));
	assert.equal(typed.issue_type, "Bug");
	assert.equal(issueRecordToToolSummary(typed).issueType, "Bug");
	assert.match(formatIssueSummary(typed).text, /^Type: Bug$/m);
	const untyped = githubIssueToRecord(TEST_REPOSITORY_OBJECT, githubIssue({ number: 4, type: null }));
	assert.equal(untyped.issue_type, null);
	assert.match(formatIssueSummary(untyped).text, /^Type: none$/m);
	const legacy = githubIssueToRecord(TEST_REPOSITORY_OBJECT, githubIssue({ number: 5 }));
	assert.equal(Object.hasOwn(legacy, "issue_type"), false);
	assert.doesNotMatch(formatIssueSummary(legacy).text, /^Type:/m);
	assert.equal(issueRecordToToolSummary(legacy).issueType, undefined);
	assert.equal(githubIssueToRecord(TEST_REPOSITORY_OBJECT, githubIssue({ number: 6, type: { id: 1 } })).issue_type, undefined, "a type object without a name is not invented");

	const root = await tempProject();
	const config = issueMeConfig();
	const written = await writeIssueRecord(root, config, localIssueRecord({ number: 10, issue_type: "Bug" }));
	assert.equal((await readIssueFile(written.path)).issue_type, "Bug");
	const legacyWritten = await writeIssueRecord(root, config, localIssueRecord({ number: 11 }));
	assert.equal((await readIssueFile(legacyWritten.path)).issue_type, undefined);
	const invalidPath = join(dirname(written.path), "12-invalid-type.json");
	await writeFile(invalidPath, JSON.stringify({ ...localIssueRecord({ number: 12 }), issue_type: 5 }), "utf8");
	await assert.rejects(() => readIssueFile(invalidPath), (error) => error instanceof IssueMeError && error.code === ISSUEME_ERROR_CODES.ISSUE_FILE_INVALID);
});
