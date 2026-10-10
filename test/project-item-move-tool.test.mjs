import assert from "node:assert/strict";
import test from "node:test";

import { ClosedIssueMutationError, ISSUEME_ERROR_CODES, IssueMeError } from "../src/errors.ts";
import { buildMoveProjectV2ItemMutation, normalizeMoveProjectV2ItemResult } from "../src/github/projects-client.ts";
import { registerProjectItemMaintenanceTools } from "../src/tools/project-item-maintenance.ts";
import {
	createFakePi,
	createFetchRecorder,
	createNoNetworkFetch,
	executeRegisteredTool,
	githubIssue,
	graphQLResponse,
	jsonResponse,
	runtimeOptions,
	tempProject,
	TEST_REPOSITORY,
	TEST_TOKEN,
} from "./helpers/issueme-test-helpers.mjs";

const TARGET = { projectId: "PVT_1", itemId: "PVTI_7", issueNumber: 7 };

function itemNode(id, overrides = {}) {
	return {
		id,
		type: "ISSUE",
		isArchived: false,
		project: { id: "PVT_1" },
		content: { __typename: "Issue", number: 7, title: "Board candidate", state: "OPEN", url: `https://github.com/${TEST_REPOSITORY}/issues/7`, repository: { nameWithOwner: TEST_REPOSITORY } },
		...overrides,
	};
}

/** Board order after the mutation is configurable so verification paths can be exercised. */
function moveServer(options = {}) {
	const calls = [];
	const nodes = (options.nodes ?? { PVTI_7: itemNode("PVTI_7"), PVTI_anchor: itemNode("PVTI_anchor", { content: { __typename: "PullRequest", number: 9, repository: { nameWithOwner: TEST_REPOSITORY } } }) });
	const handler = (call) => {
		const path = call.url.pathname;
		if (path.startsWith("/repos/owner/repo/issues/")) {
			calls.push(`GET issue ${path.split("/").pop()}`);
			return jsonResponse(options.issue ?? githubIssue({ number: 7, id: 1007 }));
		}
		assert.equal(path, "/graphql");
		const { operationName, variables } = call.json;
		calls.push(`${operationName}${variables.itemId ? ` ${variables.itemId}` : ""}`);
		if (operationName === "IssueMeValidateProjectV2ItemForUpdate") {
			const node = nodes[variables.itemId];
			return node === undefined
				? graphQLResponse({ node: null }, { errors: [{ type: "NOT_FOUND", path: ["node"], message: `Could not resolve to a node with the global id of '${variables.itemId}'.` }] })
				: graphQLResponse({ node });
		}
		if (operationName === "IssueMeMoveProjectV2Item") {
			if (options.mutationResponse) return options.mutationResponse(variables);
			const order = options.order ?? (variables.afterId ? ["PVTI_other", variables.afterId, variables.itemId, "PVTI_last"] : [variables.itemId, "PVTI_other", "PVTI_last"]);
			return graphQLResponse({ updateProjectV2ItemPosition: { items: { nodes: order.map((id) => ({ id })) } } });
		}
		throw new Error(`Unexpected GraphQL operation ${operationName}`);
	};
	return { handler, calls };
}

async function moveTools(server, configOverrides = {}) {
	const recorder = createFetchRecorder(server.handler);
	const pi = createFakePi();
	registerProjectItemMaintenanceTools(pi, { runtime: runtimeOptions({ fetchFn: recorder.fetchFn, config: configOverrides }) });
	return { pi, recorder, cwd: await tempProject() };
}

function assertNoToken(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TEST_TOKEN));
}

test("the move mutation uses the documented afterId semantics and the verifier checks the returned order", () => {
	assert.match(buildMoveProjectV2ItemMutation(), /updateProjectV2ItemPosition\(input: \{projectId: \$projectId, itemId: \$itemId, afterId: \$afterId\}\)/);
	assert.match(buildMoveProjectV2ItemMutation(), /items\(first: \$verifyFirst\)/);
	const payload = (ids) => ({ updateProjectV2ItemPosition: { items: { nodes: ids.map((id) => ({ id })) } } });
	assert.deepEqual(normalizeMoveProjectV2ItemResult(payload(["a", "b", "c"]), "a", undefined), { position: 0, inspected: 3 });
	assert.deepEqual(normalizeMoveProjectV2ItemResult(payload(["x", "b", "a"]), "a", "b"), { position: 2, inspected: 3 });
	for (const [ids, item, anchor] of [[["b", "a"], "a", undefined], [["a", "b"], "a", "b"], [["b", "x", "a"], "a", "b"], [["b"], "a", "b"], [["a", "b"], "a", "missing"]]) {
		assert.throws(() => normalizeMoveProjectV2ItemResult(payload(ids), item, anchor), (error) => error.code === ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID && error.mutationSettlement === "remote_success_known", JSON.stringify([ids, item, anchor]));
	}
	assert.throws(() => normalizeMoveProjectV2ItemResult({ updateProjectV2ItemPosition: {} }, "a", undefined), (error) => error.mutationSettlement === "remote_success_known");
});

test("issueme_move_project_item moves an item to the top or after an anchor and changes nothing else", async () => {
	const top = moveServer();
	const topTools = await moveTools(top);
	const movedTop = await executeRegisteredTool(topTools.pi.tools, "issueme_move_project_item", { ...TARGET }, { cwd: topTools.cwd });
	assert.equal(movedTop.details.result, "success");
	assert.equal(movedTop.details.status, "project_item_moved");
	assert.deepEqual(movedTop.details.changedFields, ["position"]);
	assert.deepEqual(movedTop.details.counts, { changed: 1, position: 0, inspected: 3 });
	assert.equal(movedTop.details.cacheUpdated, false);
	assert.equal(movedTop.details.projectItem.issue.number, 7);
	assert.deepEqual(top.calls, ["GET issue 7", "IssueMeValidateProjectV2ItemForUpdate PVTI_7", "IssueMeMoveProjectV2Item PVTI_7"]);
	const mutation = topTools.recorder.calls.find((call) => call.json?.operationName === "IssueMeMoveProjectV2Item");
	assert.deepEqual(mutation.json.variables, { projectId: "PVT_1", itemId: "PVTI_7", afterId: null, verifyFirst: 50 });
	assert.match(movedTop.content[0].text, /Moved project item PVTI_7 \(issue #7\) to the top of project PVT_1/);
	assert.match(movedTop.content[0].text, /board edits made after this response are not tracked/);

	const anchored = moveServer();
	const anchoredTools = await moveTools(anchored);
	const movedAfter = await executeRegisteredTool(anchoredTools.pi.tools, "issueme_move_project_item", { ...TARGET, afterItemId: "PVTI_anchor" }, { cwd: anchoredTools.cwd });
	assert.equal(movedAfter.details.status, "project_item_moved");
	assert.deepEqual(movedAfter.details.counts, { changed: 1, position: 2, inspected: 4 });
	assert.deepEqual(anchored.calls, ["GET issue 7", "IssueMeValidateProjectV2ItemForUpdate PVTI_7", "IssueMeValidateProjectV2ItemForUpdate PVTI_anchor", "IssueMeMoveProjectV2Item PVTI_7"]);
	const anchoredMutation = anchoredTools.recorder.calls.find((call) => call.json?.operationName === "IssueMeMoveProjectV2Item");
	assert.equal(anchoredMutation.json.variables.afterId, "PVTI_anchor");
	assert.match(movedAfter.content[0].text, /directly after item PVTI_anchor/);
	assert.ok(anchoredTools.recorder.calls.every((call) => !/updateProjectV2ItemFieldValue|archiveProjectV2Item|deleteProjectV2Item|addSubIssue|dependencies/.test(call.json?.query ?? call.url.pathname)), "no field, archive, removal, or relationship mutation is sent");
	assertNoToken({ movedTop, movedAfter });
});

test("issueme_move_project_item refuses self, foreign, and inaccessible anchors before mutating", async () => {
	const noNetwork = createFakePi();
	registerProjectItemMaintenanceTools(noNetwork, { runtime: runtimeOptions({ fetchFn: createNoNetworkFetch() }) });
	const cwd = await tempProject();
	await assert.rejects(() => executeRegisteredTool(noNetwork.tools, "issueme_move_project_item", { ...TARGET, afterItemId: "PVTI_7" }, { cwd }), (error) => error instanceof IssueMeError && error.safeDetails.field === "afterItemId");
	await assert.rejects(() => executeRegisteredTool(noNetwork.tools, "issueme_move_project_item", { ...TARGET, afterItemId: "   " }, { cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT);

	const foreign = moveServer({ nodes: { PVTI_7: itemNode("PVTI_7"), PVTI_anchor: itemNode("PVTI_anchor", { project: { id: "PVT_2" } }) } });
	const foreignTools = await moveTools(foreign);
	await assert.rejects(() => executeRegisteredTool(foreignTools.pi.tools, "issueme_move_project_item", { ...TARGET, afterItemId: "PVTI_anchor" }, { cwd: foreignTools.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.actualProjectId === "PVT_2");
	assert.equal(foreign.calls.some((call) => call.startsWith("IssueMeMoveProjectV2Item")), false);

	const missing = moveServer({ nodes: { PVTI_7: itemNode("PVTI_7") } });
	const missingTools = await moveTools(missing);
	await assert.rejects(() => executeRegisteredTool(missingTools.pi.tools, "issueme_move_project_item", { ...TARGET, afterItemId: "PVTI_gone" }, { cwd: missingTools.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /accessible/.test(error.message));

	const redacted = moveServer({ nodes: { PVTI_7: itemNode("PVTI_7"), PVTI_anchor: itemNode("PVTI_anchor", { type: "REDACTED", content: null }) } });
	const redactedTools = await moveTools(redacted);
	await assert.rejects(() => executeRegisteredTool(redactedTools.pi.tools, "issueme_move_project_item", { ...TARGET, afterItemId: "PVTI_anchor" }, { cwd: redactedTools.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.contentType === "unknown");

	const staleMoved = moveServer({ nodes: {} });
	const staleTools = await moveTools(staleMoved);
	await assert.rejects(() => executeRegisteredTool(staleTools.pi.tools, "issueme_move_project_item", { ...TARGET }, { cwd: staleTools.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /accessible/.test(error.message));
});

test("issueme_move_project_item enforces open issues, creator scope, and item identity like the other item tools", async () => {
	const closed = moveServer({ issue: githubIssue({ number: 7, state: "closed" }) });
	const closedTools = await moveTools(closed);
	await assert.rejects(() => executeRegisteredTool(closedTools.pi.tools, "issueme_move_project_item", { ...TARGET }, { cwd: closedTools.cwd }), (error) => error instanceof ClosedIssueMutationError && error.issueNumber === 7);
	assert.deepEqual(closed.calls, ["GET issue 7"], "closed issues are refused before any GraphQL call");

	const scoped = moveServer({ issue: githubIssue({ number: 7, user: { login: "someone-else" } }) });
	const scopedTools = await moveTools(scoped, { allowedIssueCreator: "octocat" });
	await assert.rejects(() => executeRegisteredTool(scopedTools.pi.tools, "issueme_move_project_item", { ...TARGET }, { cwd: scopedTools.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.ISSUE_CREATOR_NOT_ALLOWED);
	assert.equal(scoped.calls.some((call) => call.includes("GraphQL") || call.startsWith("IssueMe")), false);

	const mismatch = moveServer({ nodes: { PVTI_7: itemNode("PVTI_7", { content: { ...itemNode("PVTI_7").content, number: 8 } }) } });
	const mismatchTools = await moveTools(mismatch);
	await assert.rejects(() => executeRegisteredTool(mismatchTools.pi.tools, "issueme_move_project_item", { ...TARGET }, { cwd: mismatchTools.cwd }), (error) => error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && error.safeDetails.actualIssueNumber === 8);
	assert.equal(mismatch.calls.some((call) => call.startsWith("IssueMeMoveProjectV2Item")), false);
});

test("issueme_move_project_item reports an accepted move it cannot verify as retry-safe partial success", async () => {
	for (const [label, options] of [
		["item missing from the returned window", { order: ["PVTI_other", "PVTI_last"] }],
		["item not at the top", { order: ["PVTI_other", "PVTI_7"] }],
		["malformed payload", { mutationResponse: () => graphQLResponse({ updateProjectV2ItemPosition: { items: null } }) }],
	]) {
		const server = moveServer(options);
		const { pi, cwd } = await moveTools(server);
		const result = await executeRegisteredTool(pi.tools, "issueme_move_project_item", { ...TARGET }, { cwd });
		assert.equal(result.details.result, "partial_success", label);
		assert.equal(result.details.status, "move_project_item_response_partial_success", label);
		assert.equal(result.details.error.details.mutationSettlement, "remote_success_known", label);
		assert.match(result.content[0].text, /could not verify its new position/, label);
		assertNoToken(result);
	}
});
