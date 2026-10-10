import assert from "node:assert/strict";
import test from "node:test";

import { ISSUEME_ERROR_CODES, IssueMeError } from "../src/errors.ts";
import { registerProjectItemMaintenanceTools } from "../src/tools/project-item-maintenance.ts";
import {
	createFakePi,
	createFetchRecorder,
	createNoNetworkFetch,
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

const PROJECT = projectV2Node({ id: "PVT_1", number: 1, title: "Roadmap" });

function validationNode(overrides = {}) {
	return {
		id: "PVTI_7",
		type: "ISSUE",
		isArchived: false,
		project: { id: "PVT_1" },
		content: { __typename: "Issue", number: 7, title: "Board candidate", state: "OPEN", url: `https://github.com/${TEST_REPOSITORY}/issues/7`, repository: { nameWithOwner: TEST_REPOSITORY } },
		...overrides,
	};
}

function fieldNode(overrides = {}) {
	return { id: "PVTSSF_status", name: "Status", dataType: "SINGLE_SELECT", project: { id: "PVT_1" }, ...overrides };
}

/** GraphQL/REST handler keyed by operation name; `responses` may override any operation. */
function maintenanceServer(options = {}) {
	const calls = [];
	const handler = (call) => {
		const path = call.url.pathname;
		if (path.startsWith("/repos/owner/repo/issues/")) {
			const number = Number(path.split("/").pop());
			calls.push(`GET issue ${number}`);
			return jsonResponse(options.issues?.[number] ?? githubIssue({ number, id: 1000 + number }));
		}
		assert.equal(path, "/graphql");
		const operation = call.json.operationName;
		calls.push(operation);
		const override = options.responses?.[operation];
		if (typeof override === "function") return override(call);
		if (override) return override;
		if (operation === "IssueMeValidateProjectV2ItemForUpdate") return graphQLResponse({ node: options.validationNode === undefined ? validationNode() : options.validationNode });
		if (operation === "IssueMeGetProjectV2ItemByIssue") {
			const items = options.issueProjectItems ?? [];
			return graphQLResponse({ repository: { issue: { id: "I_7", number: call.json.variables.issueNumber, projectItems: { ...graphQLConnection(items, { hasNextPage: options.issueProjectItemsTruncated === true }), totalCount: items.length } } } });
		}
		if (operation === "IssueMeDeleteProjectV2Item") return graphQLResponse({ deleteProjectV2Item: { deletedItemId: call.json.variables.itemId } });
		if (operation === "IssueMeValidateProjectV2Field") return graphQLResponse({ node: options.fieldNode === undefined ? fieldNode() : options.fieldNode });
		if (operation === "IssueMeValidateProjectV2ItemField") return graphQLResponse({ node: { ...validationNode(), fieldValueByName: options.fieldValuePresent === false ? null : { __typename: "ProjectV2ItemFieldSingleSelectValue" } } });
		if (operation === "IssueMeClearProjectV2ItemFieldValue") return graphQLResponse({ clearProjectV2ItemFieldValue: { projectV2Item: { id: call.json.variables.itemId, fieldValueByName: options.readbackStillSet ? { __typename: "ProjectV2ItemFieldSingleSelectValue" } : null } } });
		if (operation === "IssueMeArchiveProjectV2Item") return graphQLResponse({ archiveProjectV2Item: { item: { id: call.json.variables.itemId, isArchived: options.archiveResult ?? true } } });
		if (operation === "IssueMeUnarchiveProjectV2Item") return graphQLResponse({ unarchiveProjectV2Item: { item: { id: call.json.variables.itemId, isArchived: options.unarchiveResult ?? false } } });
		throw new Error(`Unexpected GraphQL operation ${operation}`);
	};
	return { handler, calls };
}

async function maintenanceTools(server, configOverrides = {}) {
	const recorder = createFetchRecorder(server.handler);
	const pi = createFakePi();
	registerProjectItemMaintenanceTools(pi, { runtime: runtimeOptions({ fetchFn: recorder.fetchFn, config: configOverrides }) });
	return { pi, recorder, cwd: await tempProject() };
}

const TARGET = { projectId: "PVT_1", itemId: "PVTI_7", issueNumber: 7 };

function assertNoToken(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TEST_TOKEN));
}

test("issueme_remove_issue_from_project deletes only the validated board item and leaves the issue untouched", async () => {
	const server = maintenanceServer();
	const { pi, recorder, cwd } = await maintenanceTools(server);
	const result = await executeRegisteredTool(pi.tools, "issueme_remove_issue_from_project", { ...TARGET, confirmRemove: true }, { cwd });
	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "project_item_removed");
	assert.deepEqual(result.details.changedFields, ["project_item"]);
	assert.equal(result.details.projectItem.id, "PVTI_7");
	assert.equal(result.details.projectItem.issue.number, 7);
	assert.equal(result.details.issue.state, "open");
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, false);
	assert.deepEqual(server.calls, ["GET issue 7", "IssueMeValidateProjectV2ItemForUpdate", "IssueMeDeleteProjectV2Item"]);
	const mutation = recorder.calls.find((call) => call.json?.operationName === "IssueMeDeleteProjectV2Item");
	assert.deepEqual(mutation.json.variables, { projectId: "PVT_1", itemId: "PVTI_7" });
	assert.match(mutation.json.query, /deleteProjectV2Item/);
	assert.ok(recorder.calls.every((call) => call.method !== "DELETE" && call.method !== "PATCH"), "the issue is never deleted or edited");
	assert.match(result.content[0].text, /Removed project item PVTI_7 \(issue #7\)/);
	assert.match(result.content[0].text, /not changed; no local cache file was removed/);
	assertNoToken(result);
});

test("issueme_remove_issue_from_project verifies absence through the issue's project items and refuses stale or unverifiable IDs", async () => {
	const absent = await maintenanceTools(maintenanceServer({ validationNode: null, issueProjectItems: [] }));
	const result = await executeRegisteredTool(absent.pi.tools, "issueme_remove_issue_from_project", { ...TARGET, confirmRemove: true }, { cwd: absent.cwd });
	assert.equal(result.details.status, "project_item_already_absent");
	assert.deepEqual(result.details.changedFields, []);
	assert.equal(absent.recorder.calls.some((call) => call.json?.operationName === "IssueMeDeleteProjectV2Item"), false);
	assert.match(result.content[0].text, /already absent/);

	const stale = await maintenanceTools(maintenanceServer({ validationNode: null, issueProjectItems: [{ id: "PVTI_new", type: "ISSUE", isArchived: false, project: PROJECT, content: validationNode().content, fieldValues: graphQLConnection([]) }] }));
	await assert.rejects(() => executeRegisteredTool(stale.pi.tools, "issueme_remove_issue_from_project", { ...TARGET, confirmRemove: true }, { cwd: stale.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.actualItemId === "PVTI_new");

	const unverifiable = await maintenanceTools(maintenanceServer({ validationNode: null, issueProjectItems: [], issueProjectItemsTruncated: true }));
	await assert.rejects(() => executeRegisteredTool(unverifiable.pi.tools, "issueme_remove_issue_from_project", { ...TARGET, confirmRemove: true }, { cwd: unverifiable.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /could not be verified/.test(error.message));

	// Live shape (2026-10-10): a deleted item id comes back as a GraphQL NOT_FOUND error with a null node, not a plain null.
	const notFoundEnvelope = graphQLResponse({ node: null }, { errors: [{ type: "NOT_FOUND", path: ["node"], message: "Could not resolve to a node with the global id of 'PVTI_7'." }] });
	const deleted = await maintenanceTools(maintenanceServer({ responses: { IssueMeValidateProjectV2ItemForUpdate: notFoundEnvelope }, issueProjectItems: [] }));
	const gone = await executeRegisteredTool(deleted.pi.tools, "issueme_remove_issue_from_project", { ...TARGET, confirmRemove: true }, { cwd: deleted.cwd });
	assert.equal(gone.details.status, "project_item_already_absent");
	const otherError = graphQLResponse({ node: null }, { errors: [{ type: "FORBIDDEN", path: ["node"], message: "Resource not accessible by personal access token" }] });
	const forbidden = await maintenanceTools(maintenanceServer({ responses: { IssueMeValidateProjectV2ItemForUpdate: otherError } }));
	await assert.rejects(() => executeRegisteredTool(forbidden.pi.tools, "issueme_remove_issue_from_project", { ...TARGET, confirmRemove: true }, { cwd: forbidden.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.GITHUB_PROJECTS_V2_FORBIDDEN, "only NOT_FOUND on the node is tolerated");
});

test("project item maintenance tools enforce confirmation, open-issue, scope, identity, and settlement rules", async () => {
	const noNetwork = createFakePi();
	registerProjectItemMaintenanceTools(noNetwork, { runtime: runtimeOptions({ fetchFn: createNoNetworkFetch() }) });
	const cwd = await tempProject();
	await assert.rejects(() => executeRegisteredTool(noNetwork.tools, "issueme_remove_issue_from_project", { ...TARGET, confirmRemove: false }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /confirmRemove/.test(error.message));
	await assert.rejects(() => executeRegisteredTool(noNetwork.tools, "issueme_archive_project_item", { ...TARGET, action: "delete" }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.field === "action");

	// Approved project-only metadata exception (gap spec Task 5): closed backing issues are accepted; the issue itself is never mutated.
	const closedNode = validationNode({ content: { ...validationNode().content, state: "CLOSED" } });
	const closed = await maintenanceTools(maintenanceServer({ issues: { 7: githubIssue({ number: 7, state: "closed" }) }, validationNode: closedNode, responses: { IssueMeValidateProjectV2ItemField: graphQLResponse({ node: { ...closedNode, fieldValueByName: { __typename: "ProjectV2ItemFieldSingleSelectValue" } } }) } }));
	for (const [name, params, status] of [
		["issueme_clear_project_item_field", { ...TARGET, fieldId: "PVTSSF_status" }, "project_item_field_cleared"],
		["issueme_archive_project_item", { ...TARGET, action: "archive" }, "project_item_archived"],
		["issueme_remove_issue_from_project", { ...TARGET, confirmRemove: true }, "project_item_removed"],
	]) {
		const result = await executeRegisteredTool(closed.pi.tools, name, params, { cwd: closed.cwd });
		assert.equal(result.details.status, status, name);
		assert.equal(result.details.issue.state, "closed", name);
	}
	assert.ok(closed.recorder.calls.every((call) => call.method === "GET" || call.url.pathname === "/graphql"), "the closed issue itself is never edited");
	assert.equal(closed.recorder.calls[0].url.pathname, "/repos/owner/repo/issues/7", "the issue identity and scope preflight still runs first");

	const scoped = await maintenanceTools(maintenanceServer({ issues: { 7: githubIssue({ number: 7, user: { login: "someone-else" } }) } }), { allowedIssueCreator: "octocat" });
	await assert.rejects(() => executeRegisteredTool(scoped.pi.tools, "issueme_archive_project_item", { ...TARGET, action: "archive" }, { cwd: scoped.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.ISSUE_CREATOR_NOT_ALLOWED);

	const mismatch = await maintenanceTools(maintenanceServer({ validationNode: validationNode({ project: { id: "PVT_2" } }) }));
	await assert.rejects(() => executeRegisteredTool(mismatch.pi.tools, "issueme_remove_issue_from_project", { ...TARGET, confirmRemove: true }, { cwd: mismatch.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.actualProjectId === "PVT_2");
	assert.equal(mismatch.recorder.calls.some((call) => call.json?.operationName === "IssueMeDeleteProjectV2Item"), false);

	const wrongIssue = await maintenanceTools(maintenanceServer({ validationNode: validationNode({ content: { ...validationNode().content, number: 8 } }) }));
	await assert.rejects(() => executeRegisteredTool(wrongIssue.pi.tools, "issueme_archive_project_item", { ...TARGET, action: "archive" }, { cwd: wrongIssue.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.actualIssueNumber === 8);

	const badDeletion = await maintenanceTools(maintenanceServer({ responses: { IssueMeDeleteProjectV2Item: graphQLResponse({ deleteProjectV2Item: { deletedItemId: "PVTI_other" } }) } }));
	const partial = await executeRegisteredTool(badDeletion.pi.tools, "issueme_remove_issue_from_project", { ...TARGET, confirmRemove: true }, { cwd: badDeletion.cwd });
	assert.equal(partial.details.result, "partial_success");
	assert.equal(partial.details.status, "remove_issue_from_project_response_partial_success");
	assert.equal(partial.details.error.details.mutationSettlement, "remote_success_known");

	const forbidden = await maintenanceTools(maintenanceServer({ responses: { IssueMeDeleteProjectV2Item: jsonResponse({ data: null, errors: [{ type: "FORBIDDEN", message: `no access ${TEST_TOKEN}` }] }) } }));
	await assert.rejects(() => executeRegisteredTool(forbidden.pi.tools, "issueme_remove_issue_from_project", { ...TARGET, confirmRemove: true }, { cwd: forbidden.cwd }), (error) => {
		assert.equal(error.code, ISSUEME_ERROR_CODES.GITHUB_PROJECTS_V2_FORBIDDEN);
		assert.match(error.message, /project item management/);
		assertNoToken(error);
		return true;
	});
});

test("issueme_clear_project_item_field validates the field, preflights presence, and reads the cleared value back", async () => {
	const server = maintenanceServer();
	const { pi, recorder, cwd } = await maintenanceTools(server);
	const result = await executeRegisteredTool(pi.tools, "issueme_clear_project_item_field", { ...TARGET, fieldId: "PVTSSF_status" }, { cwd });
	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "project_item_field_cleared");
	assert.deepEqual(result.details.changedFields, ["PVTSSF_status"]);
	assert.deepEqual(server.calls, ["GET issue 7", "IssueMeValidateProjectV2Field", "IssueMeValidateProjectV2ItemField", "IssueMeClearProjectV2ItemFieldValue"]);
	const mutation = recorder.calls.find((call) => call.json?.operationName === "IssueMeClearProjectV2ItemFieldValue");
	assert.deepEqual(mutation.json.variables, { projectId: "PVT_1", itemId: "PVTI_7", fieldId: "PVTSSF_status", fieldName: "Status" });
	assert.match(mutation.json.query, /clearProjectV2ItemFieldValue/);
	assert.match(mutation.json.query, /fieldValueByName\(name: \$fieldName\)/);
	assert.match(result.content[0].text, /Cleared field Status \(SINGLE_SELECT, PVTSSF_status\)/);
	assert.match(result.content[0].text, /labels, assignees, and milestone were not changed/);

	const alreadyClear = await maintenanceTools(maintenanceServer({ fieldValuePresent: false }));
	const noop = await executeRegisteredTool(alreadyClear.pi.tools, "issueme_clear_project_item_field", { ...TARGET, fieldId: "PVTSSF_status" }, { cwd: alreadyClear.cwd });
	assert.equal(noop.details.status, "project_item_field_already_clear");
	assert.deepEqual(noop.details.changedFields, []);
	assert.equal(alreadyClear.recorder.calls.some((call) => call.json?.operationName === "IssueMeClearProjectV2ItemFieldValue"), false);

	for (const [label, node, pattern] of [
		["issue-owned field", fieldNode({ id: "PVTF_assignees", name: "Assignees", dataType: "ASSIGNEES" }), /does not clear/],
		["foreign field", fieldNode({ project: { id: "PVT_2" } }), /must belong to projectId/],
		["inaccessible field", null, /accessible GitHub Projects v2 field/],
	]) {
		const harness = await maintenanceTools(maintenanceServer({ fieldNode: node }));
		await assert.rejects(() => executeRegisteredTool(harness.pi.tools, "issueme_clear_project_item_field", { ...TARGET, fieldId: "PVTF_assignees" }, { cwd: harness.cwd }), (error) => error instanceof IssueMeError && error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && pattern.test(error.message), label);
		assert.equal(harness.recorder.calls.some((call) => call.json?.operationName === "IssueMeClearProjectV2ItemFieldValue"), false, label);
	}

	const unverified = await maintenanceTools(maintenanceServer({ readbackStillSet: true }));
	const partial = await executeRegisteredTool(unverified.pi.tools, "issueme_clear_project_item_field", { ...TARGET, fieldId: "PVTSSF_status" }, { cwd: unverified.cwd });
	assert.equal(partial.details.result, "partial_success");
	assert.equal(partial.details.status, "clear_project_item_field_response_partial_success");
	assert.match(partial.content[0].text, /could not verify the cleared value/);
	assert.match(partial.content[0].text, /Retry-safe guidance/);
});

test("issueme_archive_project_item archives and restores with state preflight, no-ops, and verified results", async () => {
	const archive = await maintenanceTools(maintenanceServer());
	const archived = await executeRegisteredTool(archive.pi.tools, "issueme_archive_project_item", { ...TARGET, action: "archive" }, { cwd: archive.cwd });
	assert.equal(archived.details.status, "project_item_archived");
	assert.deepEqual(archived.details.changedFields, ["archived"]);
	assert.equal(archived.details.projectItem.isArchived, true);
	const mutation = archive.recorder.calls.find((call) => call.json?.operationName === "IssueMeArchiveProjectV2Item");
	assert.deepEqual(mutation.json.variables, { projectId: "PVT_1", itemId: "PVTI_7" });
	assert.match(mutation.json.query, /archiveProjectV2Item\(input/);
	assert.match(archived.content[0].text, /field values are preserved/);

	const restore = await maintenanceTools(maintenanceServer({ validationNode: validationNode({ isArchived: true }) }));
	const unarchived = await executeRegisteredTool(restore.pi.tools, "issueme_archive_project_item", { ...TARGET, action: "unarchive" }, { cwd: restore.cwd });
	assert.equal(unarchived.details.status, "project_item_unarchived");
	assert.equal(unarchived.details.projectItem.isArchived, false);
	assert.match(restore.recorder.calls.at(-1).json.query, /unarchiveProjectV2Item\(input/);

	const alreadyArchived = await maintenanceTools(maintenanceServer({ validationNode: validationNode({ isArchived: true }) }));
	const noopArchive = await executeRegisteredTool(alreadyArchived.pi.tools, "issueme_archive_project_item", { ...TARGET, action: "archive" }, { cwd: alreadyArchived.cwd });
	assert.equal(noopArchive.details.status, "project_item_already_archived");
	assert.deepEqual(noopArchive.details.changedFields, []);
	assert.equal(alreadyArchived.recorder.calls.some((call) => /Archive/.test(call.json?.operationName ?? "")), false);

	const alreadyActive = await maintenanceTools(maintenanceServer());
	const noopActive = await executeRegisteredTool(alreadyActive.pi.tools, "issueme_archive_project_item", { ...TARGET, action: "unarchive" }, { cwd: alreadyActive.cwd });
	assert.equal(noopActive.details.status, "project_item_already_active");

	const mismatched = await maintenanceTools(maintenanceServer({ archiveResult: false }));
	const partial = await executeRegisteredTool(mismatched.pi.tools, "issueme_archive_project_item", { ...TARGET, action: "archive" }, { cwd: mismatched.cwd });
	assert.equal(partial.details.result, "partial_success");
	assert.equal(partial.details.status, "archive_project_item_response_partial_success");
	assert.equal(partial.details.error.details.mutationSettlement, "remote_success_known");
});
