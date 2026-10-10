import assert from "node:assert/strict";
import test from "node:test";

import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../src/errors.ts";
import { classifyProjectV2ItemContent, normalizeProjectV2ItemDetail } from "../src/github/projects-client.ts";
import { registerProjectItemTools } from "../src/tools/project-items.ts";
import {
	createFakePi,
	createFetchRecorder,
	createNoNetworkFetch,
	executeRegisteredTool,
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
const OTHER_PROJECT = projectV2Node({ id: "PVT_2", number: 2, title: "Other" });

function fieldRef(id, name, dataType) {
	return { id, name, dataType };
}

function statusValue(name = "Todo", optionId = "opt_todo") {
	return { __typename: "ProjectV2ItemFieldSingleSelectValue", name, optionId, field: fieldRef("PVTSSF_status", "Status", "SINGLE_SELECT") };
}

function allValueKinds() {
	return [
		{ __typename: "ProjectV2ItemFieldTextValue", text: "Needs design", field: fieldRef("PVTF_notes", "Notes", "TEXT") },
		{ __typename: "ProjectV2ItemFieldNumberValue", number: 3, field: fieldRef("PVTF_priority", "Priority", "NUMBER") },
		{ __typename: "ProjectV2ItemFieldDateValue", date: "2026-07-01", field: fieldRef("PVTF_due", "Due", "DATE") },
		statusValue(),
		{ __typename: "ProjectV2ItemFieldIterationValue", title: "Sprint 1", iterationId: "iter_1", startDate: "2026-06-29", duration: 14, field: fieldRef("PVTIF_sprint", "Sprint", "ITERATION") },
		{ __typename: "ProjectV2ItemFieldLabelValue", field: fieldRef("PVTF_labels", "Labels", "LABELS") },
	];
}

function issueContent(number, overrides = {}) {
	return {
		__typename: "Issue",
		id: `I_${number}`,
		number,
		title: `Issue ${number}`,
		state: "OPEN",
		url: `https://github.com/${TEST_REPOSITORY}/issues/${number}`,
		author: { login: "octocat" },
		repository: { nameWithOwner: TEST_REPOSITORY },
		...overrides,
	};
}

function itemNode(id, content, overrides = {}) {
	const values = overrides.fieldValues ?? [statusValue()];
	return {
		id,
		type: overrides.type ?? (content?.__typename === "PullRequest" ? "PULL_REQUEST" : content?.__typename === "DraftIssue" ? "DRAFT_ISSUE" : "ISSUE"),
		isArchived: overrides.isArchived ?? false,
		createdAt: "2026-06-27T00:00:00Z",
		updatedAt: "2026-06-27T00:01:00Z",
		project: overrides.project ?? PROJECT,
		content,
		fieldValues: { ...graphQLConnection(values, { hasNextPage: overrides.valuesHasNextPage ?? false, endCursor: overrides.valuesHasNextPage ? "v2" : null }), totalCount: overrides.valuesTotal ?? values.length },
	};
}

function itemsResponse(items, pageInfo = {}) {
	return graphQLResponse({ node: { ...PROJECT, items: { ...graphQLConnection(items, pageInfo), totalCount: items.length } } });
}

async function projectItemTools(handler, configOverrides = {}) {
	const recorder = createFetchRecorder(handler);
	const pi = createFakePi();
	registerProjectItemTools(pi, { runtime: runtimeOptions({ fetchFn: recorder.fetchFn, config: configOverrides }) });
	return { pi, recorder, cwd: await tempProject() };
}

function assertNoToken(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TEST_TOKEN));
}

test("project item normalizers classify content and parse typed field values without guessing", () => {
	const detail = normalizeProjectV2ItemDetail(itemNode("PVTI_1", issueContent(7, { state: "CLOSED" }), { fieldValues: allValueKinds(), valuesHasNextPage: true, valuesTotal: 9, isArchived: true }), TEST_REPOSITORY);
	assert.equal(detail.item.id, "PVTI_1");
	assert.equal(detail.item.isArchived, true);
	assert.deepEqual(detail.item.issue, { number: 7, title: "Issue 7", state: "closed", html_url: `https://github.com/${TEST_REPOSITORY}/issues/7` });
	assert.deepEqual(detail.content, { kind: "issue", repository: TEST_REPOSITORY, creator: "octocat", issueNumber: 7, state: "closed" });
	assert.deepEqual(detail.item.fieldValues.map((value) => [value.kind, value.name]), [["text", "Notes"], ["number", "Priority"], ["date", "Due"], ["single_select", "Status"], ["iteration", "Sprint"], ["unsupported", "Labels"]]);
	assert.equal(detail.item.fieldValues[5].valueType, "ProjectV2ItemFieldLabelValue");
	assert.deepEqual(detail.item.fieldValues[4], { fieldId: "PVTIF_sprint", name: "Sprint", kind: "iteration", dataType: "ITERATION", iterationId: "iter_1", iterationTitle: "Sprint 1", startDate: "2026-06-29", duration: 14 });
	assert.equal(detail.item.fieldValuesTruncated, true);
	assert.equal(detail.item.fieldValuesCount, 9);
	assert.equal(detail.valuesEndCursor, "v2");

	assert.deepEqual(classifyProjectV2ItemContent(null, "REDACTED"), { kind: "redacted" });
	assert.deepEqual(classifyProjectV2ItemContent(null, "ISSUE"), { kind: "redacted" });
	assert.deepEqual(classifyProjectV2ItemContent({ __typename: "DraftIssue", id: "DI_1" }, "DRAFT_ISSUE"), { kind: "draft_issue" });
	assert.deepEqual(classifyProjectV2ItemContent({ __typename: "PullRequest", number: 3, repository: { nameWithOwner: "x/y" } }, "PULL_REQUEST"), { kind: "pull_request", repository: "x/y" });
	assert.equal(normalizeProjectV2ItemDetail({ type: "ISSUE" }, TEST_REPOSITORY), undefined);
	const cleared = normalizeProjectV2ItemDetail(itemNode("PVTI_2", issueContent(8), { fieldValues: [] }), TEST_REPOSITORY);
	assert.deepEqual(cleared.item.fieldValues, []);
	assert.equal(cleared.item.fieldValuesTruncated, undefined);
});

test("issueme_list_project_items returns current-repository issue items with values and omits other content honestly", async () => {
	const items = [
		itemNode("PVTI_1", issueContent(1), { fieldValues: allValueKinds(), valuesHasNextPage: true, valuesTotal: 8 }),
		itemNode("PVTI_2", { __typename: "PullRequest", number: 2, repository: { nameWithOwner: TEST_REPOSITORY } }),
		itemNode("PVTI_3", { __typename: "DraftIssue", id: "DI_3" }),
		itemNode("PVTI_4", issueContent(4, { repository: { nameWithOwner: "other/place" }, url: "https://github.com/other/place/issues/4" })),
		itemNode("PVTI_5", issueContent(5, { author: { login: "someone-else" } })),
		itemNode("PVTI_6", null, { type: "REDACTED" }),
		itemNode("PVTI_7", issueContent(7, { state: "CLOSED" }), { isArchived: true, fieldValues: [] }),
	];
	const { pi, recorder, cwd } = await projectItemTools((call) => {
		assert.equal(call.json.operationName, "IssueMeListProjectV2Items");
		assert.deepEqual(call.json.variables, { projectId: "PVT_1", first: 25, valuesFirst: 25 });
		assert.match(call.json.query, /fieldValues\(first: \$valuesFirst\)/);
		assert.match(call.json.query, /isArchived/);
		return itemsResponse(items);
	}, { allowedIssueCreator: "octocat" });
	const result = await executeRegisteredTool(pi.tools, "issueme_list_project_items", { projectId: "PVT_1" }, { cwd });
	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "list_project_items");
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, false);
	assert.equal(result.details.project.id, "PVT_1");
	assert.deepEqual(result.details.projectItems.map((item) => [item.id, item.issue.number, item.isArchived]), [["PVTI_1", 1, false], ["PVTI_7", 7, true]]);
	assert.deepEqual(result.details.counts, { returned: 2, total: 7, archived: 1, omittedPullRequests: 1, omittedDraftIssues: 1, omittedForeignRepository: 1, omittedOutOfScope: 1, omittedInaccessible: 1, limit: 25, valueLimit: 25 });
	assert.equal(result.details.projectItems[0].fieldValuesTruncated, true);
	assert.deepEqual(result.details.projectItems[1].fieldValues, []);
	assert.equal(result.details.truncated, true);
	assert.deepEqual(result.details.truncation, { fieldValues: { affectedItems: 1, maxPerItem: 25 } });
	assert.equal(result.details.continuation.complete, true);
	assert.match(result.content[0].text, /Listed 2 issue item\(s\)/);
	assert.match(result.content[0].text, /omitted: 1 pull request\(s\), 1 draft\(s\), 1 foreign-repository, 1 out-of-scope, 1 inaccessible/);
	assert.match(result.content[0].text, /PVTI_1: issue #1 \[open\] Issue 1 — Notes: Needs design; Priority: 3; Due: 2026-07-01; Status: Todo \[optionId opt_todo\]; Sprint: Sprint 1 2026-06-29\/14d \[iterationId iter_1\]; Labels: set \(ProjectV2ItemFieldLabelValue/);
	assert.match(result.content[0].text, /PVTI_7: issue #7 \[closed\] Issue 7 \(archived\) — no field values/);
	assert.match(result.content[0].text, /read-only/);
	assert.equal(recorder.calls.length, 1);
	assertNoToken(result);
});

test("issueme_list_project_items resolves boards by scope/number, continues by cursor, and binds tokens to the project", async () => {
	const pages = [[itemNode("PVTI_1", issueContent(1))], [itemNode("PVTI_2", issueContent(2))]];
	const { pi, recorder, cwd } = await projectItemTools((call) => {
		const after = call.json.variables.after;
		const page = after === "c1" ? pages[1] : pages[0];
		const payload = { ...PROJECT, items: { ...graphQLConnection(page, { hasNextPage: after === undefined, endCursor: after === undefined ? "c1" : null }), totalCount: 2 } };
		if (call.json.variables.projectId) return graphQLResponse({ node: payload });
		if (call.json.variables.repo) return graphQLResponse({ repository: { projectV2: payload } });
		return graphQLResponse({ organization: { projectV2: payload } });
	});
	const first = await executeRegisteredTool(pi.tools, "issueme_list_project_items", { projectNumber: 1, limit: 1 }, { cwd });
	assert.deepEqual(recorder.calls[0].json.variables, { owner: "owner", repo: "repo", projectNumber: 1, first: 1, valuesFirst: 25 });
	assert.deepEqual(first.details.projectItems.map((item) => item.id), ["PVTI_1"]);
	assert.equal(first.details.truncated, true);
	assert.equal(first.details.continuation.collection, "project_items");
	assert.ok(first.details.continuation.nextToken);
	const second = await executeRegisteredTool(pi.tools, "issueme_list_project_items", { projectNumber: 1, limit: 1, after: first.details.continuation.nextToken }, { cwd });
	assert.equal(recorder.calls[1].json.variables.after, "c1");
	assert.deepEqual(second.details.projectItems.map((item) => item.id), ["PVTI_2"]);
	assert.equal(second.details.continuation.complete, true);
	assert.equal(second.details.continuation.resumed, true);

	const organization = await executeRegisteredTool(pi.tools, "issueme_list_project_items", { scope: "organization", owner: "acme", projectNumber: 1 }, { cwd });
	assert.deepEqual(recorder.calls[2].json.variables, { owner: "acme", projectNumber: 1, first: 25, valuesFirst: 25 });
	assert.equal(organization.details.projectItems.length, 1);

	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_list_project_items", { projectId: "PVT_1", after: first.details.continuation.nextToken }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.CONTINUATION_TOKEN_INVALID);
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_list_project_items", { owner: "acme" }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT);
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_list_project_items", {}, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /projectNumber/.test(error.message));
});

test("issueme_list_project_items fails safely on inaccessible projects, malformed items, and permission refusals", async () => {
	const inaccessible = await projectItemTools(() => graphQLResponse({ node: null }));
	await assert.rejects(() => executeRegisteredTool(inaccessible.pi.tools, "issueme_list_project_items", { projectId: "PVT_1" }, { cwd: inaccessible.cwd }), (error) => error instanceof GitHubApiError && error.code === ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID);

	const malformed = await projectItemTools(() => itemsResponse([{ type: "ISSUE", content: issueContent(1) }]));
	await assert.rejects(() => executeRegisteredTool(malformed.pi.tools, "issueme_list_project_items", { projectId: "PVT_1" }, { cwd: malformed.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID && /malformed project item/.test(error.message));

	const forbidden = await projectItemTools(() => jsonResponse({ data: null, errors: [{ type: "FORBIDDEN", message: `Resource not accessible ${TEST_TOKEN}` }] }));
	await assert.rejects(() => executeRegisteredTool(forbidden.pi.tools, "issueme_list_project_items", { projectId: "PVT_1" }, { cwd: forbidden.cwd }), (error) => {
		assert.equal(error.code, ISSUEME_ERROR_CODES.GITHUB_PROJECTS_V2_FORBIDDEN);
		assert.match(error.message, /project item discovery/);
		assertNoToken(error);
		return true;
	});
});

test("issueme_get_project_item reads an item by ID with field-value continuation and refuses foreign or non-issue items", async () => {
	const nodes = new Map([
		["PVTI_1", itemNode("PVTI_1", issueContent(1), { fieldValues: allValueKinds(), valuesHasNextPage: true, valuesTotal: 8 })],
		["PVTI_other", itemNode("PVTI_other", issueContent(1), { project: OTHER_PROJECT })],
		["PVTI_pr", itemNode("PVTI_pr", { __typename: "PullRequest", number: 9, repository: { nameWithOwner: TEST_REPOSITORY } })],
		["PVTI_foreign", itemNode("PVTI_foreign", issueContent(4, { repository: { nameWithOwner: "other/place" } }))],
		["PVTI_scope", itemNode("PVTI_scope", issueContent(5, { author: { login: "someone-else" } }))],
		["PVTI_redacted", itemNode("PVTI_redacted", null, { type: "REDACTED" })],
	]);
	const { pi, recorder, cwd } = await projectItemTools((call) => {
		assert.equal(call.json.operationName, "IssueMeGetProjectV2Item");
		const node = nodes.get(call.json.variables.itemId) ?? null;
		if (node && call.json.variables.valuesAfter === "v2") {
			return graphQLResponse({ node: { ...node, fieldValues: { ...graphQLConnection([statusValue("Done", "opt_done")]), totalCount: 8 } } });
		}
		return graphQLResponse({ node });
	}, { allowedIssueCreator: "octocat" });

	const result = await executeRegisteredTool(pi.tools, "issueme_get_project_item", { projectId: "PVT_1", itemId: "PVTI_1" }, { cwd });
	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "get_project_item");
	assert.equal(result.details.projectItem.id, "PVTI_1");
	assert.equal(result.details.projectItem.issue.number, 1);
	assert.equal(result.details.projectItem.fieldValues.length, 6);
	assert.deepEqual(result.details.counts, { fieldValues: 6, fieldValuesTotal: 8, valueLimit: 25 });
	assert.equal(result.details.truncated, true);
	assert.equal(result.details.continuation.collection, "project_item_field_values");
	assert.ok(result.details.continuation.nextToken);
	assert.match(result.content[0].text, /Project item PVTI_1 on GitHub Projects v2 board #1 Roadmap/);
	assert.match(result.content[0].text, /- Status \(SINGLE_SELECT\) id PVTSSF_status: Todo \[optionId opt_todo\]/);
	assert.match(result.content[0].text, /More field values exist/);
	assert.deepEqual(recorder.calls[0].json.variables, { itemId: "PVTI_1", valuesFirst: 25 });

	const resumed = await executeRegisteredTool(pi.tools, "issueme_get_project_item", { projectId: "PVT_1", itemId: "PVTI_1", after: result.details.continuation.nextToken }, { cwd });
	assert.equal(recorder.calls[1].json.variables.valuesAfter, "v2");
	assert.deepEqual(resumed.details.projectItem.fieldValues.map((value) => value.optionName), ["Done"]);
	assert.equal(resumed.details.continuation.complete, true);
	assert.equal(resumed.details.continuation.resumed, true);

	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_get_project_item", { projectId: "PVT_1", itemId: "PVTI_other" }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.actualProjectId === "PVT_2");
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_get_project_item", { projectId: "PVT_1", itemId: "PVTI_missing" }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /accessible/.test(error.message));
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_get_project_item", { projectId: "PVT_1", itemId: "PVTI_pr" }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.reason === "pull_request");
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_get_project_item", { projectId: "PVT_1", itemId: "PVTI_foreign" }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.actualRepository === "other/place");
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_get_project_item", { projectId: "PVT_1", itemId: "PVTI_scope" }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.ISSUE_CREATOR_NOT_ALLOWED);
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_get_project_item", { projectId: "PVT_1", itemId: "PVTI_redacted" }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.reason === "inaccessible");
});

test("issueme_get_project_item locates an issue's item on the selected project and reports a missing item as a valid empty result", async () => {
	const issueItems = [itemNode("PVTI_other", issueContent(7), { project: OTHER_PROJECT }), itemNode("PVTI_7", issueContent(7, { state: "CLOSED" }), { valuesHasNextPage: true, valuesTotal: 3 })];
	const { pi, recorder, cwd } = await projectItemTools((call) => {
		if (call.json.operationName === "IssueMeGetProjectV2ItemByIssue") {
			assert.equal(call.json.variables.itemsFirst, 50);
			const found = call.json.variables.issueNumber === 7 ? issueItems : [];
			return graphQLResponse({ repository: { issue: { id: "I_7", number: call.json.variables.issueNumber, projectItems: { ...graphQLConnection(found, { hasNextPage: call.json.variables.issueNumber === 8 }), totalCount: found.length } } } });
		}
		assert.equal(call.json.operationName, "IssueMeGetProjectV2Item");
		assert.equal(call.json.variables.valuesAfter, "v2");
		return graphQLResponse({ node: { ...issueItems[1], fieldValues: { ...graphQLConnection([statusValue("Done", "opt_done")]), totalCount: 3 } } });
	});

	const found = await executeRegisteredTool(pi.tools, "issueme_get_project_item", { projectId: "PVT_1", issueNumber: 7 }, { cwd });
	assert.equal(found.details.status, "get_project_item");
	assert.equal(found.details.projectItem.id, "PVTI_7");
	assert.equal(found.details.projectItem.issue.state, "closed", "closed issues remain readable");
	assert.equal(found.details.counts.searchedItems, 2);
	assert.ok(found.details.continuation.nextToken);
	assert.equal(recorder.calls.length, 1);

	const resumed = await executeRegisteredTool(pi.tools, "issueme_get_project_item", { projectId: "PVT_1", issueNumber: 7, after: found.details.continuation.nextToken }, { cwd });
	assert.equal(recorder.calls.length, 3, "a resumed issue lookup resolves the item first, then reads its values by ID");
	assert.equal(recorder.calls[1].json.variables.valuesFirst, 1);
	assert.deepEqual(resumed.details.projectItem.fieldValues.map((value) => value.optionName), ["Done"]);

	const missing = await executeRegisteredTool(pi.tools, "issueme_get_project_item", { projectId: "PVT_1", issueNumber: 8 }, { cwd });
	assert.equal(missing.details.result, "success");
	assert.equal(missing.details.status, "project_item_not_found");
	assert.equal(missing.details.projectItem, undefined);
	assert.equal(missing.details.truncated, true);
	assert.match(missing.content[0].text, /Issue #8 has no item on project PVT_1 among the first project items inspected/);

	const noNetwork = createFakePi();
	registerProjectItemTools(noNetwork, { runtime: runtimeOptions({ fetchFn: createNoNetworkFetch() }) });
	await assert.rejects(() => executeRegisteredTool(noNetwork.tools, "issueme_get_project_item", { projectId: "PVT_1" }, { cwd }), (error) => error instanceof IssueMeError && /exactly one of itemId or issueNumber/.test(error.message));
	await assert.rejects(() => executeRegisteredTool(noNetwork.tools, "issueme_get_project_item", { projectId: "PVT_1", itemId: "PVTI_1", issueNumber: 1 }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT);
});

test("issueme_get_project_item treats GitHub's NOT_FOUND answer for a deleted item id as an inaccessible item", async () => {
	// Live shape (2026-10-10): node(id:) for a deleted item returns a GraphQL NOT_FOUND error with a null node.
	const { pi, cwd } = await projectItemTools(() => graphQLResponse({ node: null }, { errors: [{ type: "NOT_FOUND", path: ["node"], message: "Could not resolve to a node with the global id of 'PVTI_gone'." }] }));
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_get_project_item", { projectId: "PVT_1", itemId: "PVTI_gone" }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /accessible/.test(error.message));
	const forbidden = await projectItemTools(() => graphQLResponse({ node: null }, { errors: [{ type: "FORBIDDEN", path: ["node"], message: "Resource not accessible by personal access token" }] }));
	await assert.rejects(() => executeRegisteredTool(forbidden.pi.tools, "issueme_get_project_item", { projectId: "PVT_1", itemId: "PVTI_gone" }, { cwd: forbidden.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.GITHUB_PROJECTS_V2_FORBIDDEN);
});
