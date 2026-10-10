import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { ClosedIssueMutationError, ISSUEME_ERROR_CODES } from "../src/errors.ts";
import { assertProjectV2ItemTargetsIssue, PROJECT_V2_ITEM_ISSUE_STATE_POLICY } from "../src/github/projects-client.ts";
import { registerIssueMeTools } from "../src/tools/issueme-tools.ts";
import {
	createFakePi,
	createFetchRecorder,
	executeRegisteredTool,
	githubIssue,
	graphQLConnection,
	graphQLResponse,
	jsonResponse,
	projectV2Node,
	runtimeOptions,
	tempProject,
	TEST_REPOSITORY,
	TEST_TOKEN,
} from "./helpers/issueme-test-helpers.mjs";

/**
 * Regression matrix for the maintainer-approved project-only closed-issue exception (gap spec Task 5, 2026-10-10):
 * field update/clear, item removal, and archive/unarchive accept closed issues; adding to a board, bulk add_to_project,
 * and every issue-content tool still refuse them; creator-scope and repository checks are unchanged.
 */

const PROJECT = projectV2Node({ id: "PVT_1", number: 1, title: "Roadmap" });
const TARGET = { projectId: "PVT_1", itemId: "PVTI_7", issueNumber: 7 };
const STATUS_FIELD = { id: "PVTSSF_status", name: "Status", dataType: "SINGLE_SELECT", project: { id: "PVT_1" } };

function closedContent(overrides = {}) {
	return { __typename: "Issue", id: "I_7", number: 7, title: "Done work", state: "CLOSED", url: `https://github.com/${TEST_REPOSITORY}/issues/7`, author: { login: "octocat" }, repository: { nameWithOwner: TEST_REPOSITORY }, ...overrides };
}

function itemNode(options = {}) {
	return {
		id: "PVTI_7",
		type: "ISSUE",
		isArchived: options.isArchived ?? false,
		project: PROJECT,
		content: closedContent(options.content),
		fieldValues: { ...graphQLConnection([]), totalCount: 0 },
	};
}

/** Closed issue #7 on REST and on the board; records every GraphQL operation and refuses REST mutations. */
function closedIssueServer(options = {}) {
	const operations = [];
	const issue = githubIssue({ number: 7, title: "Done work", state: "closed", closed_at: "2026-10-01T00:00:00Z", state_reason: "completed", user: { login: options.creator ?? "octocat" } });
	const handler = (call) => {
		const path = call.url.pathname;
		if (path === "/repos/owner/repo/issues/7") {
			assert.equal(call.method, "GET", "the closed issue is never edited");
			return jsonResponse(issue);
		}
		if (path === "/repos/owner/repo/issues/7/comments") return jsonResponse([]);
		assert.equal(path, "/graphql");
		const { operationName, variables } = call.json;
		operations.push(operationName);
		const node = itemNode(options.node);
		switch (operationName) {
			case "IssueMeValidateProjectV2ForAdd": return graphQLResponse({ node: PROJECT });
			case "IssueMeValidateProjectV2ItemForUpdate": return graphQLResponse({ node });
			case "IssueMeUpdateProjectV2ItemFieldValue": return graphQLResponse({ updateProjectV2ItemFieldValue: { projectV2Item: node } });
			case "IssueMeValidateProjectV2Field": return graphQLResponse({ node: STATUS_FIELD });
			case "IssueMeValidateProjectV2ItemField": return graphQLResponse({ node: { ...node, fieldValueByName: { __typename: "ProjectV2ItemFieldSingleSelectValue" } } });
			case "IssueMeClearProjectV2ItemFieldValue": return graphQLResponse({ clearProjectV2ItemFieldValue: { projectV2Item: { id: variables.itemId, fieldValueByName: null } } });
			case "IssueMeArchiveProjectV2Item": return graphQLResponse({ archiveProjectV2Item: { item: { id: variables.itemId, isArchived: true } } });
			case "IssueMeDeleteProjectV2Item": return graphQLResponse({ deleteProjectV2Item: { deletedItemId: variables.itemId } });
			default: throw new Error(`Unexpected GraphQL operation ${operationName}`);
		}
	};
	return { handler, operations };
}

async function allTools(server, configOverrides = {}) {
	const recorder = createFetchRecorder(server.handler);
	const pi = createFakePi();
	registerIssueMeTools(pi, { runtime: runtimeOptions({ fetchFn: recorder.fetchFn, config: configOverrides }) });
	const cwd = await tempProject();
	return { pi, recorder, cwd, run: (name, params) => executeRegisteredTool(pi.tools, name, params, { cwd }) };
}

function assertNoToken(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TEST_TOKEN));
}

test("the per-action issue-state policy is explicit and the shared item assertion enforces it", () => {
	assert.deepEqual(PROJECT_V2_ITEM_ISSUE_STATE_POLICY, { add_to_project: "open_only", update_field: "open_or_closed", clear_field: "open_or_closed", remove_item: "open_or_closed", archive_item: "open_or_closed", move_item: "open_only" });
	const data = { node: itemNode() };
	assert.throws(() => assertProjectV2ItemTargetsIssue(data, TARGET, TEST_REPOSITORY), (error) => error instanceof ClosedIssueMutationError && error.issueNumber === 7, "default policy stays open-only");
	assert.throws(() => assertProjectV2ItemTargetsIssue(data, TARGET, TEST_REPOSITORY, "open_only"), ClosedIssueMutationError);
	assert.doesNotThrow(() => assertProjectV2ItemTargetsIssue(data, TARGET, TEST_REPOSITORY, "open_or_closed"));
	assert.throws(() => assertProjectV2ItemTargetsIssue({ node: itemNode({ content: { repository: { nameWithOwner: "other/place" } } }) }, TARGET, TEST_REPOSITORY, "open_or_closed"), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.actualRepository === "other/place", "repository identity is still enforced for closed issues");
	assert.throws(() => assertProjectV2ItemTargetsIssue({ node: itemNode({ content: { number: 8 } }) }, TARGET, TEST_REPOSITORY, "open_or_closed"), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.actualIssueNumber === 8, "issue identity is still enforced for closed issues");
});

test("field update, clear, archive, and remove accept a closed issue and never edit, close, or uncache it", async () => {
	const server = closedIssueServer();
	const { run, recorder, cwd } = await allTools(server);
	const updated = await run("issueme_update_project_item", { ...TARGET, fieldId: "PVTSSF_status", valueType: "single_select", singleSelectOptionId: "opt_done" });
	assert.equal(updated.details.status, "update_project_item");
	assert.equal(updated.details.projectItem.issue.state, "closed");
	const cleared = await run("issueme_clear_project_item_field", { ...TARGET, fieldId: "PVTSSF_status" });
	assert.equal(cleared.details.status, "project_item_field_cleared");
	assert.equal(cleared.details.issue.state, "closed");
	const archived = await run("issueme_archive_project_item", { ...TARGET, action: "archive" });
	assert.equal(archived.details.status, "project_item_archived");
	assert.equal(archived.details.issue.stateReason, "completed");
	const removed = await run("issueme_remove_issue_from_project", { ...TARGET, confirmRemove: true });
	assert.equal(removed.details.status, "project_item_removed");
	assert.equal(removed.details.issue.state, "closed");

	assert.deepEqual(server.operations, [
		"IssueMeValidateProjectV2ItemForUpdate",
		"IssueMeUpdateProjectV2ItemFieldValue",
		"IssueMeValidateProjectV2Field",
		"IssueMeValidateProjectV2ItemField",
		"IssueMeClearProjectV2ItemFieldValue",
		"IssueMeValidateProjectV2ItemForUpdate",
		"IssueMeArchiveProjectV2Item",
		"IssueMeValidateProjectV2ItemForUpdate",
		"IssueMeDeleteProjectV2Item",
	]);
	assert.ok(recorder.calls.every((call) => call.method === "GET" || call.url.pathname === "/graphql"), "no REST mutation reached the closed issue");
	for (const result of [updated, cleared, archived, removed]) {
		assert.equal(result.details.cacheUpdated, false);
		assert.equal(result.details.needsSync, false);
	}
	assert.deepEqual(await readdir(join(cwd, "issues")).catch(() => []), [], "project-only tools write no cache files");
	assertNoToken({ updated, cleared, archived, removed });
});

test("adding a closed issue to a board is still refused directly and through bulk add_to_project", async () => {
	const server = closedIssueServer();
	const { run } = await allTools(server);
	await assert.rejects(() => run("issueme_add_issue_to_project", { issueNumber: 7, projectId: "PVT_1" }), (error) => error instanceof ClosedIssueMutationError && error.safeDetails.status === "closed_issue_mutation_refused");
	await assert.rejects(() => run("issueme_move_project_item", { ...TARGET }), (error) => error instanceof ClosedIssueMutationError, "ordering stays open-only under the approved policy");
	const bulk = await run("issueme_bulk_update_issues", { issueNumbers: [7], action: "add_to_project", projectId: "PVT_1" });
	assert.equal(bulk.details.result, "error");
	assert.deepEqual(bulk.details.bulkResults.map((entry) => [entry.status, entry.error.code]), [["failed", ISSUEME_ERROR_CODES.CLOSED_ISSUE_MUTATION_REFUSED]]);
	assert.deepEqual(server.operations, [], "closed issues are refused before any GraphQL call");
	assertNoToken(bulk);
});

test("creator scope still refuses out-of-scope closed issues before any board mutation", async () => {
	const server = closedIssueServer({ creator: "someone-else" });
	const { run } = await allTools(server, { allowedIssueCreator: "octocat" });
	for (const [name, params] of [
		["issueme_update_project_item", { ...TARGET, fieldId: "PVTSSF_status", valueType: "single_select", singleSelectOptionId: "opt_done" }],
		["issueme_clear_project_item_field", { ...TARGET, fieldId: "PVTSSF_status" }],
		["issueme_archive_project_item", { ...TARGET, action: "archive" }],
		["issueme_remove_issue_from_project", { ...TARGET, confirmRemove: true }],
	]) {
		await assert.rejects(() => run(name, params), (error) => error.code === ISSUEME_ERROR_CODES.ISSUE_CREATOR_NOT_ALLOWED, name);
	}
	assert.deepEqual(server.operations, []);
});

test("issue-content tools still refuse the same closed issue", async () => {
	const server = closedIssueServer();
	const { run } = await allTools(server);
	for (const [name, params] of [
		["issueme_update_issue", { number: 7, title: "Renamed" }],
		["issueme_comment_issue", { number: 7, body: "Nope" }],
		["issueme_assign_issue", { number: 7, action: "add", assignees: ["octocat"] }],
	]) {
		await assert.rejects(() => run(name, params), (error) => error instanceof ClosedIssueMutationError, name);
	}
	assert.deepEqual(server.operations, []);
});
