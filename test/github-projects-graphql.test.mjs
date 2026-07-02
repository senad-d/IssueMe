import assert from "node:assert/strict";
import test from "node:test";

import { GitHubClient } from "../src/github/client.ts";
import { GitHubApiError, IssueMeError } from "../src/errors.ts";
import { normalizeProjectV2FieldValueInput, normalizeProjectV2Summary } from "../src/github/projects-client.ts";
import { registerProjectTools } from "../src/tools/projects.ts";
import {
	TEST_REPOSITORY,
	TEST_REPOSITORY_OBJECT,
	TEST_TOKEN,
	assertNoSecretLeak,
	createFakePi,
	createFakeToolContext,
	createFetchRecorder,
	executeRegisteredTool,
	githubIssue,
	graphQLConnection,
	graphQLResponse,
	jsonResponse,
	projectV2Iteration,
	projectV2IterationField,
	projectV2ItemNode,
	projectV2Node,
	runtimeOptions,
	tempProject,
} from "./helpers/issueme-test-helpers.mjs";

function clientWithFetch(fetchFn) {
	return new GitHubClient({ repository: TEST_REPOSITORY_OBJECT, token: TEST_TOKEN, fetchFn });
}

async function runProjectTool(toolName, fetchFn, params = {}) {
	const pi = createFakePi();
	registerProjectTools(pi, { runtime: runtimeOptions({ fetchFn }) });
	return executeRegisteredTool(pi.tools, toolName, params, { cwd: await tempProject("issueme-projects-graphql-tool-") });
}

function toolsWithFailingRuntime() {
	const pi = createFakePi();
	const state = { runtimeCalls: 0 };
	registerProjectTools(pi, {
		runtime: () => {
			state.runtimeCalls += 1;
			throw new Error("runtime should not be resolved for invalid Projects v2 params");
		},
	});
	return { tools: pi.tools, state };
}

function repositoryOwner() {
	return { __typename: "Repository", nameWithOwner: TEST_REPOSITORY };
}

function closedUserProjectPage(_call, calls) {
	return graphQLResponse({
		user: {
			projectsV2: graphQLConnection([
				projectV2Node({
					id: `PVT_closed_${calls.length}`,
					number: calls.length,
					title: `Closed ${calls.length}`,
					owner: { __typename: "User", login: "octocat" },
					closed: true,
				}),
			], { hasNextPage: true, endCursor: `cursor-${calls.length}` }),
		},
	});
}

function updateValidationHandler(call) {
	if (call.url.pathname === "/repos/owner/repo/issues/7") return jsonResponse(githubIssue({ number: 7, node_id: "I_7" }));
	if (call.json?.operationName === "IssueMeValidateProjectV2ItemForUpdate") {
		return graphQLResponse({ node: projectV2ItemNode({ issueNumber: 7, project: {} }) });
	}
	throw new Error(`Unexpected Projects v2 validation call: ${call.method} ${call.url.pathname} ${call.json?.operationName ?? ""}`);
}

function unknownContentValidationHandler(call) {
	if (call.url.pathname === "/repos/owner/repo/issues/7") return jsonResponse(githubIssue({ number: 7, node_id: "I_7" }));
	if (call.json?.operationName === "IssueMeValidateProjectV2ItemForUpdate") {
		return graphQLResponse({ node: projectV2ItemNode({ id: "PVTI_7", issueNumber: 7, project: { id: "PVT_1" }, content: null }) });
	}
	throw new Error(`Unexpected Projects v2 content validation call: ${call.method} ${call.url.pathname} ${call.json?.operationName ?? ""}`);
}

function projectWithoutVisibilityHandler() {
	return graphQLResponse({
		repository: {
			projectsV2: graphQLConnection([
				projectV2Node({ id: "PVT_no_visibility", number: 3, title: "Visibility Unknown", owner: repositoryOwner(), public: undefined }),
			]),
		},
	});
}

function iterationWithoutMetadataHandler() {
	return graphQLResponse({
		repository: {
			projectV2: {
				...projectV2Node({ id: "PVT_1", number: 1, title: "Roadmap", owner: repositoryOwner() }),
				fields: graphQLConnection([
					projectV2IterationField({
						id: "PVTF_iteration",
						configuration: {
							iterations: [projectV2Iteration({ id: "iter_no_metadata", title: "No Metadata", startDate: undefined, duration: undefined })],
							completedIterations: [],
						},
					}),
				]),
			},
		},
	});
}

function operationNames(calls) {
	return calls.map((call) => call.json?.operationName ?? call.url.pathname);
}

test("GitHubClient Projects v2 list scans user pages to the cap after closed-board filtering", async () => {
	const recorder = createFetchRecorder(closedUserProjectPage);
	const client = clientWithFetch(recorder.fetchFn);
	const result = await client.listProjectsV2({ scope: "user", owner: "octocat", query: "  board  ", limit: 2 });

	assert.equal(result.scope, "user");
	assert.equal(result.owner, "octocat");
	assert.deepEqual(result.projects, []);
	assert.equal(result.truncated, true);
	assert.equal(recorder.calls.length, 10);
	assert.equal(recorder.calls[0].url.pathname, "/graphql");
	assert.equal(recorder.calls[0].json.operationName, "IssueMeListProjectsV2");
	assert.match(recorder.calls[0].json.query, /user\(login: \$owner\)/);
	assert.deepEqual(recorder.calls[0].json.variables, { owner: "octocat", first: 2, query: "board" });
	assert.equal(recorder.calls[1].json.variables.after, "cursor-1");
	assertNoSecretLeak(result);
});

test("Projects v2 normalizers reject invalid owners and missing field value objects", () => {
	assert.equal(normalizeProjectV2Summary(projectV2Node({ owner: { __typename: "Repository", nameWithOwner: "   " } })), undefined);
	assert.throws(
		() => normalizeProjectV2FieldValueInput(undefined),
		(error) => error instanceof IssueMeError && error.code === "invalid_tool_input" && error.safeDetails.field === "value",
	);
});

test("GitHubClient Projects v2 item update refuses incomplete validation data before mutation", async () => {
	const recorder = createFetchRecorder(updateValidationHandler);
	const client = clientWithFetch(recorder.fetchFn);

	await assert.rejects(
		() => client.updateProjectV2ItemField({ projectId: "PVT_1", itemId: "PVTI_7", fieldId: "PVTF_status", issueNumber: 7, value: { text: "Ready" } }),
		(error) => error instanceof GitHubApiError && error.code === "github_response_shape_invalid" && /incomplete project data/.test(error.message),
	);
	assert.deepEqual(operationNames(recorder.calls), ["/repos/owner/repo/issues/7", "IssueMeValidateProjectV2ItemForUpdate"]);
});

test("GitHubClient Projects v2 item update refuses unknown content before mutation", async () => {
	const recorder = createFetchRecorder(unknownContentValidationHandler);
	const client = clientWithFetch(recorder.fetchFn);

	await assert.rejects(
		() => client.updateProjectV2ItemField({ projectId: "PVT_1", itemId: "PVTI_7", fieldId: "PVTF_status", issueNumber: 7, value: { text: "Ready" } }),
		(error) => error instanceof IssueMeError && error.code === "invalid_tool_input" && error.safeDetails.contentType === "unknown",
	);
	assert.deepEqual(operationNames(recorder.calls), ["/repos/owner/repo/issues/7", "IssueMeValidateProjectV2ItemForUpdate"]);
});

test("Projects v2 tools reject invalid params before runtime and network setup", async () => {
	const { tools, state } = toolsWithFailingRuntime();
	const context = createFakeToolContext(await tempProject("issueme-projects-graphql-invalid-"));
	await assert.rejects(
		() => executeRegisteredTool(tools, "issueme_get_project_fields", {}, { context }),
		(error) => error instanceof IssueMeError && error.code === "invalid_tool_input" && error.safeDetails.field === "projectNumber",
	);
	await assert.rejects(
		() => executeRegisteredTool(tools, "issueme_update_project_item", { projectId: "PVT_1", itemId: "PVTI_1", issueNumber: 7, fieldId: "PVTF_status", valueType: "unsupported" }, { context }),
		(error) => error instanceof IssueMeError && error.code === "invalid_tool_input" && error.safeDetails.field === "valueType",
	);
	await assert.rejects(
		() => executeRegisteredTool(tools, "issueme_list_projects", { scope: "team" }, { context }),
		(error) => error instanceof IssueMeError && error.code === "invalid_tool_input" && error.safeDetails.field === "scope",
	);
	assert.equal(state.runtimeCalls, 0);
});

test("Projects v2 tool text handles absent visibility and iteration metadata", async () => {
	const listResult = await runProjectTool("issueme_list_projects", projectWithoutVisibilityHandler, { includeClosed: true, limit: 1 });
	assert.equal(listResult.details.status, "list_projects");
	assert.equal(listResult.details.projects[0].public, undefined);
	assert.match(listResult.content[0].text, /open, repository: owner\/repo/);
	assert.doesNotMatch(listResult.content[0].text, /public|private/);

	const fieldsResult = await runProjectTool("issueme_get_project_fields", iterationWithoutMetadataHandler, { projectNumber: 1, fieldLimit: 1 });
	assert.equal(fieldsResult.details.status, "get_project_fields");
	assert.equal(fieldsResult.details.projectFields[0].iterations[0].startDate, undefined);
	assert.match(fieldsResult.content[0].text, /iterations: No Metadata/);
	assert.doesNotMatch(fieldsResult.content[0].text, /No Metadata \(/);
	assertNoSecretLeak({ listResult, fieldsResult });
});
