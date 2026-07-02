import assert from "node:assert/strict";
import test from "node:test";

import { ClosedIssueMutationError, GitHubApiError, IssueMeError } from "../src/errors.ts";
import {
	assertProjectV2AllowedForAdd,
	assertProjectV2ItemTargetsIssue,
	buildAddIssueToProjectV2Mutation,
	buildProjectV2AddValidationQuery,
	buildProjectV2FieldsByIdQuery,
	buildProjectV2FieldsByNumberQuery,
	buildProjectV2ItemValidationQuery,
	buildProjectsV2ListQuery,
	buildUpdateProjectV2ItemFieldValueMutation,
	connectionEndCursor,
	connectionHasNextPage,
	extractConnectionNodes,
	extractProjectV2Connection,
	extractProjectV2FieldProject,
	normalizeProjectV2AddValidationPolicy,
	normalizeProjectV2FieldLimit,
	normalizeProjectV2FieldSummary,
	normalizeProjectV2FieldValueInput,
	normalizeProjectV2Id,
	normalizeProjectV2IdRequired,
	normalizeProjectV2IterationLimit,
	normalizeProjectV2ItemMutationResult,
	normalizeProjectV2ListLimit,
	normalizeProjectV2OptionLimit,
	normalizeProjectV2Owner,
	normalizeProjectV2ProjectNumber,
	normalizeProjectV2Query,
	normalizeProjectV2Scope,
	normalizeProjectV2Summary,
} from "../src/github/projects-client.ts";

const REPOSITORY = { owner: "owner", repo: "repo", fullName: "owner/repo" };

function assertIssueMeError(error, code = "invalid_tool_input") {
	assert.ok(error instanceof IssueMeError);
	assert.equal(error.code, code);
	return true;
}

function project(overrides = {}) {
	return {
		id: "PVT_project",
		title: "Roadmap",
		number: 1,
		url: "https://github.com/orgs/acme/projects/1",
		shortDescription: "Planning board",
		closed: false,
		public: true,
		owner: { __typename: "Repository", nameWithOwner: REPOSITORY.fullName },
		...overrides,
	};
}

function issueContent(overrides = {}) {
	return {
		__typename: "Issue",
		number: 5,
		title: "Project item issue",
		state: "OPEN",
		url: `https://github.com/${REPOSITORY.fullName}/issues/5`,
		repository: { nameWithOwner: REPOSITORY.fullName },
		...overrides,
	};
}

function projectItem(overrides = {}) {
	return {
		id: "PVTI_item",
		type: "ISSUE",
		project: project(),
		content: issueContent(),
		...overrides,
	};
}

function fieldOption(index) {
	return { id: `option_${index}`, name: `Option ${index}`, color: "BLUE", description: `Description ${index}` };
}

function iteration(index) {
	return { id: `iteration_${index}`, title: `Sprint ${index}`, startDate: "2026-07-02", duration: 14 };
}

function assertThrowsInvalidInput(fn, field) {
	assert.throws(fn, (error) => {
		assertIssueMeError(error);
		if (field) assert.equal(error.safeDetails.field, field);
		return true;
	});
}

test("Projects v2 query builders include expected operations, owners, and fragments", () => {
	const repositoryQuery = buildProjectsV2ListQuery("repository");
	assert.match(repositoryQuery, /query IssueMeListProjectsV2/);
	assert.match(repositoryQuery, /repository\(owner: \$owner, name: \$repo\)/);
	assert.match(repositoryQuery, /projectsV2\(first: \$first, after: \$after, query: \$query\)/);
	assert.match(repositoryQuery, /fragment IssueMeProjectV2Summary/);

	const organizationQuery = buildProjectsV2ListQuery("organization");
	assert.match(organizationQuery, /organization\(login: \$owner\)/);
	assert.doesNotMatch(organizationQuery, /\$repo/);
	const userQuery = buildProjectsV2ListQuery("user");
	assert.match(userQuery, /user\(login: \$owner\)/);

	assert.match(buildProjectV2FieldsByIdQuery(), /query IssueMeGetProjectV2FieldsById/);
	assert.match(buildProjectV2FieldsByIdQuery(), /fields\(first: \$fieldsFirst\)/);
	assert.match(buildProjectV2FieldsByNumberQuery("repository"), /projectV2\(number: \$projectNumber\)/);
	assert.match(buildProjectV2FieldsByNumberQuery("user"), /user\(login: \$owner\)/);
	assert.match(buildProjectV2AddValidationQuery(), /query IssueMeValidateProjectV2ForAdd/);
	assert.match(buildAddIssueToProjectV2Mutation(), /mutation IssueMeAddIssueToProjectV2/);
	assert.match(buildUpdateProjectV2ItemFieldValueMutation(), /ProjectV2FieldValue!/);
	assert.match(buildProjectV2ItemValidationQuery(), /query IssueMeValidateProjectV2ItemForUpdate/);
});

test("Projects v2 connection and field project extraction handle all scopes and inaccessible owners", () => {
	const connection = { nodes: [project()], pageInfo: { hasNextPage: false, endCursor: "cursor-1" } };
	assert.deepEqual(extractConnectionNodes(connection), [project()]);
	assert.equal(connectionHasNextPage(connection), false);
	assert.equal(connectionEndCursor(connection), "cursor-1");
	assert.equal(extractProjectV2Connection({ repository: { projectsV2: connection } }, "repository"), connection);
	assert.equal(extractProjectV2Connection({ organization: { projectsV2: connection } }, "organization"), connection);
	assert.equal(extractProjectV2Connection({ user: { projectsV2: connection } }, "user"), connection);
	assert.throws(() => extractProjectV2Connection({}, "repository"), (error) => error instanceof GitHubApiError && error.code === "github_response_shape_invalid");

	assert.deepEqual(extractProjectV2FieldProject({ node: project({ id: "PVT_by_id" }) }, { projectId: "PVT_by_id", scope: "repository" }).id, "PVT_by_id");
	assert.equal(extractProjectV2FieldProject({ repository: { projectV2: project({ id: "PVT_number" }) } }, { scope: "repository" }).id, "PVT_number");
	assert.equal(extractProjectV2FieldProject({ organization: { projectV2: project({ id: "PVT_org" }) } }, { scope: "organization" }).id, "PVT_org");
	assert.equal(extractProjectV2FieldProject({ user: { projectV2: project({ id: "PVT_user" }) } }, { scope: "user" }).id, "PVT_user");
	assert.throws(() => extractProjectV2FieldProject({}, { scope: "user" }), (error) => error instanceof GitHubApiError && error.code === "github_response_shape_invalid");
});

test("Projects v2 summary and field normalizers cover owners, types, and truncation", () => {
	assert.deepEqual(normalizeProjectV2Summary(project()), {
		id: "PVT_project",
		title: "Roadmap",
		number: 1,
		owner: REPOSITORY.fullName,
		ownerType: "repository",
		url: "https://github.com/orgs/acme/projects/1",
		shortDescription: "Planning board",
		closed: false,
		public: true,
	});
	assert.equal(normalizeProjectV2Summary(project({ owner: { __typename: "Organization", login: "acme" } })).ownerType, "organization");
	assert.equal(normalizeProjectV2Summary(project({ owner: { __typename: "User", login: "octocat" } })).ownerType, "user");
	assert.equal(normalizeProjectV2Summary(project({ id: "", title: "", number: 0 })), undefined);
	assert.equal(normalizeProjectV2Summary(null), undefined);

	const singleSelect = normalizeProjectV2FieldSummary({
		__typename: "ProjectV2SingleSelectField",
		id: "PVTF_status",
		name: "Status",
		dataType: "SINGLE_SELECT",
		options: [fieldOption(1), fieldOption(2), { id: "", name: "" }],
	}, { optionLimit: 1, iterationLimit: 2 });
	assert.equal(singleSelect.type, "ProjectV2SingleSelectField");
	assert.deepEqual(singleSelect.options, [fieldOption(1)]);
	assert.equal(singleSelect.truncated, true);
	assert.deepEqual(singleSelect.truncation.options, { shown: 1, total: 2, max: 1 });

	const iterationField = normalizeProjectV2FieldSummary({
		__typename: "ProjectV2IterationField",
		id: "PVTF_iteration",
		name: "Iteration",
		dataType: "ITERATION",
		configuration: {
			iterations: [iteration(1), iteration(2), { id: "", title: "" }],
			completedIterations: [iteration(3), iteration(4)],
		},
	}, { optionLimit: 5, iterationLimit: 1 });
	assert.deepEqual(iterationField.iterations, [iteration(1)]);
	assert.deepEqual(iterationField.completedIterations, [iteration(3)]);
	assert.deepEqual(iterationField.truncation.iterations, { shown: 1, total: 2, max: 1 });
	assert.deepEqual(iterationField.truncation.completedIterations, { shown: 1, total: 2, max: 1 });

	const textField = normalizeProjectV2FieldSummary({ __typename: "ProjectV2Field", id: "PVTF_text", name: "Notes", dataType: "TEXT" }, { optionLimit: 5, iterationLimit: 5 });
	assert.deepEqual(textField, { id: "PVTF_text", name: "Notes", dataType: "TEXT", type: "ProjectV2Field" });
	assert.equal(normalizeProjectV2FieldSummary({ id: "", name: "Missing", dataType: "TEXT" }, { optionLimit: 5, iterationLimit: 5 }), undefined);
});

test("Projects v2 mutation result normalizer maps add and update shapes safely", () => {
	const addResult = normalizeProjectV2ItemMutationResult({ addProjectV2ItemById: { item: projectItem() } }, "addProjectV2ItemById", REPOSITORY.fullName);
	assert.equal(addResult.item.id, "PVTI_item");
	assert.equal(addResult.item.project.owner, REPOSITORY.fullName);
	assert.equal(addResult.item.issue.number, 5);

	const updateResult = normalizeProjectV2ItemMutationResult({ updateProjectV2ItemFieldValue: { projectV2Item: projectItem({ id: "PVTI_updated" }) } }, "updateProjectV2ItemFieldValue", REPOSITORY.fullName);
	assert.equal(updateResult.item.id, "PVTI_updated");
	assert.throws(() => normalizeProjectV2ItemMutationResult({}, "addProjectV2ItemById", REPOSITORY.fullName), (error) => error instanceof GitHubApiError && error.code === "github_response_shape_invalid");
	assert.throws(() => normalizeProjectV2ItemMutationResult({ addProjectV2ItemById: { item: { id: "" } } }, "addProjectV2ItemById", REPOSITORY.fullName), (error) => error instanceof GitHubApiError && error.code === "github_response_shape_invalid");
});

test("Projects v2 add and item validation helpers refuse unsafe owners and mismatched items", () => {
	assert.doesNotThrow(() => assertProjectV2AllowedForAdd({ node: project() }, { projectId: "PVT_project", policy: {}, repository: REPOSITORY }));
	assert.doesNotThrow(() => assertProjectV2AllowedForAdd({ node: project({ owner: { __typename: "User", login: "owner" } }) }, { projectId: "PVT_project", policy: {}, repository: REPOSITORY }));
	assert.doesNotThrow(() => assertProjectV2AllowedForAdd({ node: project({ owner: { __typename: "Organization", login: "acme" } }) }, { projectId: "PVT_project", policy: { scope: "organization", owner: "acme" }, repository: REPOSITORY }));
	assert.throws(() => assertProjectV2AllowedForAdd({ node: project({ closed: true }) }, { projectId: "PVT_project", policy: {}, repository: REPOSITORY }), (error) => assertIssueMeError(error));
	assert.throws(() => assertProjectV2AllowedForAdd({ node: project({ owner: { __typename: "Organization", login: "other" } }) }, { projectId: "PVT_project", policy: { scope: "organization", owner: "acme" }, repository: REPOSITORY }), (error) => assertIssueMeError(error));
	assert.throws(() => assertProjectV2AllowedForAdd({ node: null }, { projectId: "PVT_project", policy: {}, repository: REPOSITORY }), (error) => assertIssueMeError(error));

	assert.doesNotThrow(() => assertProjectV2ItemTargetsIssue({ node: projectItem({ project: { id: "PVT_project" } }) }, { projectId: "PVT_project", itemId: "PVTI_item", issueNumber: 5 }, REPOSITORY.fullName));
	assert.throws(() => assertProjectV2ItemTargetsIssue({ node: null }, { projectId: "PVT_project", itemId: "PVTI_item", issueNumber: 5 }, REPOSITORY.fullName), (error) => assertIssueMeError(error));
	assert.throws(() => assertProjectV2ItemTargetsIssue({ node: projectItem({ project: { id: "PVT_other" } }) }, { projectId: "PVT_project", itemId: "PVTI_item", issueNumber: 5 }, REPOSITORY.fullName), (error) => assertIssueMeError(error));
	assert.throws(() => assertProjectV2ItemTargetsIssue({ node: projectItem({ content: { __typename: "PullRequest" } }) }, { projectId: "PVT_project", itemId: "PVTI_item", issueNumber: 5 }, REPOSITORY.fullName), (error) => assertIssueMeError(error));
	assert.throws(() => assertProjectV2ItemTargetsIssue({ node: projectItem({ content: issueContent({ repository: { nameWithOwner: "other/repo" } }) }) }, { projectId: "PVT_project", itemId: "PVTI_item", issueNumber: 5 }, REPOSITORY.fullName), (error) => assertIssueMeError(error));
	assert.throws(() => assertProjectV2ItemTargetsIssue({ node: projectItem({ content: issueContent({ number: 6 }) }) }, { projectId: "PVT_project", itemId: "PVTI_item", issueNumber: 5 }, REPOSITORY.fullName), (error) => assertIssueMeError(error));
	assert.throws(() => assertProjectV2ItemTargetsIssue({ node: projectItem({ content: issueContent({ state: "CLOSED" }) }) }, { projectId: "PVT_project", itemId: "PVTI_item", issueNumber: 5 }, REPOSITORY.fullName), (error) => {
		assert.ok(error instanceof ClosedIssueMutationError);
		assert.equal(error.code, "closed_issue_mutation_refused");
		return true;
	});
	assert.throws(() => assertProjectV2ItemTargetsIssue({ node: projectItem({ content: issueContent({ repository: {} }) }) }, { projectId: "PVT_project", itemId: "PVTI_item", issueNumber: 5 }, REPOSITORY.fullName), (error) => error instanceof GitHubApiError && error.code === "github_response_shape_invalid");
});

test("Projects v2 input normalizers cover limits, scopes, IDs, owners, and field values", () => {
	assert.equal(normalizeProjectV2Query("  roadmap  "), "roadmap");
	assert.equal(normalizeProjectV2Query("   "), undefined);
	assertThrowsInvalidInput(() => normalizeProjectV2Query("bad\0query"), "query");
	assert.equal(normalizeProjectV2ListLimit(undefined), 25);
	assert.equal(normalizeProjectV2ListLimit(100), 25);
	assertThrowsInvalidInput(() => normalizeProjectV2ListLimit(0), "limit");
	assert.equal(normalizeProjectV2Scope(undefined), "repository");
	assert.equal(normalizeProjectV2Scope("organization"), "organization");
	assertThrowsInvalidInput(() => normalizeProjectV2Scope("team"));

	assert.equal(normalizeProjectV2Owner("repository", undefined, REPOSITORY), "owner");
	assertThrowsInvalidInput(() => normalizeProjectV2Owner("repository", "octocat", REPOSITORY), "owner");
	assert.equal(normalizeProjectV2Owner("organization", undefined, REPOSITORY), "owner");
	assert.equal(normalizeProjectV2Owner("user", "octocat", REPOSITORY), "octocat");
	assertThrowsInvalidInput(() => normalizeProjectV2Owner("user", "bad_login", REPOSITORY), "owner");

	assert.deepEqual(normalizeProjectV2AddValidationPolicy({}, REPOSITORY), {});
	assert.deepEqual(normalizeProjectV2AddValidationPolicy({ scope: "repository" }, REPOSITORY), { scope: "repository", owner: REPOSITORY.fullName });
	assert.deepEqual(normalizeProjectV2AddValidationPolicy({ scope: "organization", owner: "acme" }, REPOSITORY), { scope: "organization", owner: "acme" });
	assertThrowsInvalidInput(() => normalizeProjectV2AddValidationPolicy({ owner: "acme" }, REPOSITORY), "scope");

	assert.equal(normalizeProjectV2Id("  PVT_project  "), "PVT_project");
	assert.equal(normalizeProjectV2Id(undefined), undefined);
	assert.equal(normalizeProjectV2IdRequired(" PVTF_status ", "fieldId"), "PVTF_status");
	assertThrowsInvalidInput(() => normalizeProjectV2IdRequired("", "projectId"), "projectId");
	assertThrowsInvalidInput(() => normalizeProjectV2Id("bad\nid"), "projectId");

	assert.deepEqual(normalizeProjectV2FieldValueInput({ singleSelectOptionId: " option_1 " }), { singleSelectOptionId: "option_1" });
	assert.deepEqual(normalizeProjectV2FieldValueInput({ iterationId: " iteration_1 " }), { iterationId: "iteration_1" });
	assert.deepEqual(normalizeProjectV2FieldValueInput({ date: " 2026-07-02 " }), { date: "2026-07-02" });
	assert.deepEqual(normalizeProjectV2FieldValueInput({ text: " Keep spacing " }), { text: " Keep spacing " });
	assert.deepEqual(normalizeProjectV2FieldValueInput({ number: 3.14 }), { number: 3.14 });
	assertThrowsInvalidInput(() => normalizeProjectV2FieldValueInput({}), undefined);
	assertThrowsInvalidInput(() => normalizeProjectV2FieldValueInput({ text: "x", number: 1 }), undefined);
	assertThrowsInvalidInput(() => normalizeProjectV2FieldValueInput({ date: "2026-02-31" }), "date");
	assertThrowsInvalidInput(() => normalizeProjectV2FieldValueInput({ text: "   " }), "text");
	assertThrowsInvalidInput(() => normalizeProjectV2FieldValueInput({ text: "bad\0text" }), "text");
	assertThrowsInvalidInput(() => normalizeProjectV2FieldValueInput({ number: Number.POSITIVE_INFINITY }), "numberValue");
	assertThrowsInvalidInput(() => normalizeProjectV2FieldValueInput({ unsupported: "value" }), "unsupported");

	assert.equal(normalizeProjectV2ProjectNumber(1), 1);
	assertThrowsInvalidInput(() => normalizeProjectV2ProjectNumber(0), "projectNumber");
	assert.equal(normalizeProjectV2FieldLimit(undefined), 25);
	assert.equal(normalizeProjectV2FieldLimit(50), 50);
	assertThrowsInvalidInput(() => normalizeProjectV2FieldLimit(51), "fieldLimit");
	assert.equal(normalizeProjectV2OptionLimit(undefined), 25);
	assert.equal(normalizeProjectV2OptionLimit(25), 25);
	assertThrowsInvalidInput(() => normalizeProjectV2OptionLimit(26), "optionLimit");
	assert.equal(normalizeProjectV2IterationLimit(undefined), 25);
	assert.equal(normalizeProjectV2IterationLimit(25), 25);
	assertThrowsInvalidInput(() => normalizeProjectV2IterationLimit(26), "iterationLimit");
});
