import assert from "node:assert/strict";
import test from "node:test";

import { GitHubApiError, IssueMeError } from "../src/errors.ts";
import { GitHubClient } from "../src/github/client.ts";

const TOKEN = "ghp_client_coverage_secret";
const REPOSITORY = { owner: "owner", repo: "repo", fullName: "owner/repo" };

function clientWith(fetchFn) {
	return new GitHubClient({ repository: REPOSITORY, token: TOKEN, fetchFn });
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json", ...(init.headers ?? {}) },
	});
}

function emptyResponse(init = {}) {
	return new Response(null, { status: init.status ?? 204, statusText: init.statusText ?? "No Content", headers: init.headers });
}

function issue(number, overrides = {}) {
	return {
		node_id: `I_${number}`,
		number,
		title: `Issue ${number}`,
		state: "open",
		body: `Body ${number}`,
		labels: [],
		assignees: [],
		milestone: null,
		html_url: `https://github.com/${REPOSITORY.fullName}/issues/${number}`,
		created_at: "2026-07-02T00:00:00Z",
		updated_at: "2026-07-02T00:00:00Z",
		closed_at: null,
		comments: 0,
		user: { login: "octocat" },
		...overrides,
	};
}

function comment(id, issueNumber = 1, overrides = {}) {
	return {
		id,
		user: { login: "octocat" },
		body: `Comment ${id}`,
		created_at: "2026-07-02T00:00:00Z",
		updated_at: "2026-07-02T00:00:00Z",
		html_url: `https://github.com/${REPOSITORY.fullName}/issues/${issueNumber}#issuecomment-${id}`,
		issue_url: `https://api.github.com/repos/${REPOSITORY.fullName}/issues/${issueNumber}`,
		...overrides,
	};
}

function label(name, overrides = {}) {
	return { name, color: "ededed", description: `${name} label`, default: false, url: `https://api.github.com/repos/${REPOSITORY.fullName}/labels/${name}`, ...overrides };
}

function milestone(number, overrides = {}) {
	return { number, title: `Milestone ${number}`, state: "open", description: "", due_on: null, open_issues: 0, closed_issues: 0, html_url: `https://github.com/${REPOSITORY.fullName}/milestone/${number}`, url: `https://api.github.com/repos/${REPOSITORY.fullName}/milestones/${number}`, ...overrides };
}

function user(login, overrides = {}) {
	return { login, id: 100, type: "User", html_url: `https://github.com/${login}`, url: `https://api.github.com/users/${login}`, ...overrides };
}

function project(overrides = {}) {
	return {
		id: "PVT_project",
		title: "Roadmap",
		number: 1,
		url: "https://github.com/users/owner/projects/1",
		shortDescription: "Roadmap board",
		closed: false,
		public: false,
		owner: { __typename: "User", login: "owner" },
		...overrides,
	};
}

function projectItem(overrides = {}) {
	return {
		id: "PVTI_item",
		type: "ISSUE",
		project: project(),
		content: { __typename: "Issue", id: "I_5", number: 5, title: "Issue 5", state: "OPEN", url: `https://github.com/${REPOSITORY.fullName}/issues/5`, repository: { nameWithOwner: REPOSITORY.fullName }, author: { login: "octocat" } },
		...overrides,
	};
}

function captureCall(calls, input, init = {}) {
	const url = new URL(input.toString());
	const body = init.body ? JSON.parse(init.body) : undefined;
	calls.push({ method: init.method, path: url.pathname, search: url.search, headers: init.headers, body, signal: init.signal });
	return { url, body };
}

function assertNoToken(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TOKEN));
}

function assertAllRepoCallsStayInBoundary(calls) {
	for (const call of calls) {
		if (call.path === "/graphql" || call.path === "/user" || call.path === "/search/issues") continue;
		assert.match(call.path, /^\/repos\/owner\/repo(?:\/|$)/);
	}
}

test("GitHubClient REST issue and repository methods construct safe requests", async () => {
	const calls = [];
	const client = clientWith(async (input, init = {}) => {
		const { url, body } = captureCall(calls, input, init);
		if (url.pathname === "/repos/owner/repo/issues" && init.method === "POST") return jsonResponse(issue(11, { title: body.title }), { status: 201, statusText: "Created" });
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") return jsonResponse(issue(1));
		if (url.pathname === "/repos/owner/repo/labels/bug" && init.method === "GET") return jsonResponse(label("bug"));
		if (url.pathname === "/repos/owner/repo/assignees/octocat" && init.method === "GET") return emptyResponse();
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "PATCH") return jsonResponse(issue(1, { title: body.title ?? "Issue 1", state: body.state ?? "open" }));
		if (url.pathname === "/repos/owner/repo/issues/2" && init.method === "PATCH") return jsonResponse(issue(2, { state: "open" }));
		if (url.pathname === "/repos/owner/repo/labels" && init.method === "POST") return jsonResponse(label(body.name), { status: 201, statusText: "Created" });
		if (url.pathname === "/repos/owner/repo/labels/bug" && init.method === "PATCH") return jsonResponse(label(body.new_name ?? "bug"));
		if (url.pathname === "/repos/owner/repo/labels/bug" && init.method === "DELETE") return emptyResponse();
		if (url.pathname === "/repos/owner/repo/milestones" && init.method === "POST") return jsonResponse(milestone(1, { title: body.title }), { status: 201, statusText: "Created" });
		if (url.pathname === "/repos/owner/repo/milestones/1" && init.method === "PATCH") return jsonResponse(milestone(1, { title: body.title }));
		if (url.pathname === "/repos/owner/repo/milestones/1" && init.method === "DELETE") return emptyResponse();
		throw new Error(`Unexpected request ${init.method} ${url.pathname}`);
	});

	assert.equal((await client.createIssue({ title: "Created", body: "Body", labels: ["bug"], assignees: ["octocat"] })).number, 11);
	assert.equal((await client.updateIssue(1, { title: "Updated", labels: ["bug"], assignees: ["octocat"] })).title, "Updated");
	assert.equal((await client.closeIssue(1, { reason: "completed" })).state, "closed");
	assert.equal((await client.reopenIssue(2)).state, "open");
	assert.equal((await client.createRepositoryLabel({ name: "triage", color: "fbca04", description: "Triage" })).name, "triage");
	assert.equal((await client.updateRepositoryLabel("bug", { new_name: "defect", color: "d73a4a" })).name, "defect");
	await client.deleteRepositoryLabel("bug");
	assert.equal((await client.createRepositoryMilestone({ title: "M1", description: "One" })).title, "M1");
	assert.equal((await client.updateRepositoryMilestone(1, { title: "M1 updated", due_on: null })).title, "M1 updated");
	await client.deleteRepositoryMilestone(1);

	assert.deepEqual(calls.map((call) => `${call.method} ${call.path}`), [
		"POST /repos/owner/repo/issues",
		"GET /repos/owner/repo/issues/1",
		"GET /repos/owner/repo/labels/bug",
		"GET /repos/owner/repo/assignees/octocat",
		"PATCH /repos/owner/repo/issues/1",
		"GET /repos/owner/repo/issues/1",
		"PATCH /repos/owner/repo/issues/1",
		"PATCH /repos/owner/repo/issues/2",
		"POST /repos/owner/repo/labels",
		"PATCH /repos/owner/repo/labels/bug",
		"DELETE /repos/owner/repo/labels/bug",
		"POST /repos/owner/repo/milestones",
		"PATCH /repos/owner/repo/milestones/1",
		"DELETE /repos/owner/repo/milestones/1",
	]);
	assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
	assert.equal(calls[0].body.title, "Created");
	assert.equal(calls[4].body.title, "Updated");
	assert.equal(calls[6].body.state_reason, "completed");
	assert.equal(calls[7].body.state_reason, "reopened");
	assertAllRepoCallsStayInBoundary(calls);
	assertNoToken(calls.map((call) => ({ path: call.path, method: call.method, body: call.body })));
});

test("GitHubClient comments, labels, assignees, and pagination methods use expected paths", async () => {
	const calls = [];
	const client = clientWith(async (input, init = {}) => {
		const { url, body } = captureCall(calls, input, init);
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") return jsonResponse(issue(1));
		if (url.pathname === "/repos/owner/repo/issues/1/comments" && init.method === "GET") return jsonResponse([comment(101, 1)]);
		if (url.pathname === "/repos/owner/repo/issues/comments/101" && init.method === "GET") return jsonResponse(comment(101, 1));
		if (url.pathname === "/repos/owner/repo/issues/1/comments" && init.method === "POST") return jsonResponse(comment(102, 1, { body: body.body }), { status: 201, statusText: "Created" });
		if (url.pathname === "/repos/owner/repo/issues/comments/101" && init.method === "PATCH") return jsonResponse(comment(101, 1, { body: body.body }));
		if (url.pathname === "/repos/owner/repo/issues/comments/101" && init.method === "DELETE") return emptyResponse();
		if (url.pathname === "/repos/owner/repo/assignees/octocat" && init.method === "GET") return emptyResponse();
		if (url.pathname === "/repos/owner/repo/issues/1/assignees" && init.method === "POST") return jsonResponse(issue(1, { assignees: body.assignees.map((login) => ({ login })) }));
		if (url.pathname === "/repos/owner/repo/issues/1/assignees" && init.method === "DELETE") return jsonResponse(issue(1, { assignees: [] }));
		if (url.pathname === "/repos/owner/repo/labels/bug" && init.method === "GET") return jsonResponse(label("bug"));
		if (url.pathname === "/repos/owner/repo/issues/1/labels" && init.method === "PUT") return jsonResponse(body.labels.map((name) => label(name)));
		if (url.pathname === "/repos/owner/repo/issues/1/labels" && init.method === "POST") return jsonResponse(body.labels.map((name) => label(name)));
		if (url.pathname === "/repos/owner/repo/issues/1/labels/bug" && init.method === "DELETE") return jsonResponse([]);
		if (url.pathname === "/repos/owner/repo/labels" && init.method === "GET") return jsonResponse([label("bug"), label("docs")]);
		if (url.pathname === "/repos/owner/repo/milestones" && init.method === "GET") return jsonResponse([milestone(1), milestone(2, { state: "closed" })]);
		if (url.pathname === "/repos/owner/repo/assignees" && init.method === "GET") return jsonResponse([user("octocat"), user("hubot")]);
		throw new Error(`Unexpected request ${init.method} ${url.pathname}`);
	});

	assert.equal((await client.listComments(1, undefined, { limit: 1 })).length, 1);
	assert.equal((await client.getIssueComment(101)).id, 101);
	assert.equal((await client.addComment(1, "Created comment")).body, "Created comment");
	assert.equal((await client.updateComment(1, 101, "Updated comment")).body, "Updated comment");
	assert.equal((await client.deleteComment(1, 101)).id, 101);
	assert.equal(await client.isRepositoryAssigneeAssignable("octocat"), true);
	assert.equal((await client.addAssignees(1, ["octocat"])).assignees[0].login, "octocat");
	assert.equal((await client.removeAssignees(1, ["octocat"])).assignees.length, 0);
	assert.equal((await client.setLabels(1, ["bug"])).length, 1);
	assert.equal((await client.addLabels(1, ["bug"])).length, 1);
	assert.deepEqual(await client.removeLabel(1, "bug"), []);
	assert.deepEqual((await client.listLabels({ query: "do", limit: 2 })).labels.map((item) => item.name), ["docs"]);
	assert.deepEqual((await client.listMilestones({ state: "all", limit: 2 })).milestones.map((item) => item.number), [1, 2]);
	assert.deepEqual((await client.listAssignees({ login: "octo", limit: 2 })).assignees.map((item) => item.login), ["octocat"]);

	const pathMethods = calls.map((call) => `${call.method} ${call.path}${call.search}`);
	assert.ok(pathMethods.includes("GET /repos/owner/repo/issues/1/comments?per_page=1"));
	assert.ok(pathMethods.includes("GET /repos/owner/repo/labels?per_page=2"));
	assert.ok(pathMethods.includes("GET /repos/owner/repo/milestones?state=all&per_page=2"));
	assert.ok(pathMethods.includes("GET /repos/owner/repo/assignees?per_page=2"));
	assertAllRepoCallsStayInBoundary(calls);
});

test("GitHubClient GraphQL Projects v2 methods send variables and normalize items", async () => {
	const calls = [];
	const client = clientWith(async (input, init = {}) => {
		const { url, body } = captureCall(calls, input, init);
		if (url.pathname === "/repos/owner/repo/issues/5" && init.method === "GET") return jsonResponse(issue(5));
		if (url.pathname !== "/graphql" || init.method !== "POST") throw new Error(`Unexpected request ${init.method} ${url.pathname}`);
		if (body.operationName === "IssueMeListProjectsV2") return jsonResponse({ data: { repository: { projectsV2: { nodes: [project(), project({ id: "PVT_closed", closed: true })], pageInfo: { hasNextPage: false, endCursor: null } } } } });
		if (body.operationName === "IssueMeGetProjectV2FieldsByNumber") return jsonResponse({ data: { repository: { projectV2: { ...project(), fields: { nodes: [{ __typename: "ProjectV2Field", id: "PVTF_text", name: "Notes", dataType: "TEXT" }], pageInfo: { hasNextPage: false } } } } } });
		if (body.operationName === "IssueMeValidateProjectV2ForAdd") return jsonResponse({ data: { node: project() } });
		if (body.operationName === "IssueMeAddIssueToProjectV2") return jsonResponse({ data: { addProjectV2ItemById: { item: projectItem() } } });
		if (body.operationName === "IssueMeValidateProjectV2ItemForUpdate") return jsonResponse({ data: { node: { id: "PVTI_item", type: "ISSUE", project: { id: "PVT_project" }, content: projectItem().content } } });
		if (body.operationName === "IssueMeUpdateProjectV2ItemFieldValue") return jsonResponse({ data: { updateProjectV2ItemFieldValue: { projectV2Item: projectItem({ id: "PVTI_updated" }) } } });
		throw new Error(`Unexpected GraphQL operation ${body.operationName}`);
	});

	const listResult = await client.listProjectsV2({ limit: 2, query: "Roadmap" });
	assert.deepEqual(listResult.projects.map((item) => item.id), ["PVT_project"]);
	assert.equal(listResult.owner, REPOSITORY.fullName);
	const fieldsResult = await client.getProjectV2Fields({ projectNumber: 1, fieldLimit: 5 });
	assert.deepEqual(fieldsResult.fields.map((field) => field.name), ["Notes"]);
	const addResult = await client.addIssueToProjectV2({ projectId: "PVT_project", issueNumber: 5 });
	assert.equal(addResult.item.id, "PVTI_item");
	const updateResult = await client.updateProjectV2ItemField({ projectId: "PVT_project", itemId: "PVTI_item", fieldId: "PVTF_text", issueNumber: 5, value: { text: "Done" } });
	assert.equal(updateResult.item.id, "PVTI_updated");

	const operations = calls.filter((call) => call.path === "/graphql").map((call) => ({ operationName: call.body.operationName, variables: call.body.variables }));
	assert.deepEqual(operations.map((operation) => operation.operationName), [
		"IssueMeListProjectsV2",
		"IssueMeGetProjectV2FieldsByNumber",
		"IssueMeValidateProjectV2ForAdd",
		"IssueMeAddIssueToProjectV2",
		"IssueMeValidateProjectV2ItemForUpdate",
		"IssueMeUpdateProjectV2ItemFieldValue",
	]);
	assert.deepEqual(operations[0].variables, { owner: "owner", repo: "repo", first: 2, query: "Roadmap" });
	assert.deepEqual(operations[3].variables, { projectId: "PVT_project", contentId: "I_5" });
	assert.deepEqual(operations[5].variables.value, { text: "Done" });
	assertAllRepoCallsStayInBoundary(calls);
	assertNoToken(calls.map((call) => ({ path: call.path, body: call.body })));
});

test("GitHubClient maps aborts, malformed responses, missing resources, and validation failures safely", async () => {
	const aborted = new AbortController();
	aborted.abort();
	let abortFetchCalls = 0;
	await assert.rejects(
		() => clientWith(async () => {
			abortFetchCalls += 1;
			return jsonResponse([]);
		}).listLabels({}, aborted.signal),
		(error) => error instanceof GitHubApiError && error.code === "github_request_aborted",
	);
	assert.equal(abortFetchCalls, 0);

	await assert.rejects(
		() => clientWith(async () => jsonResponse(["not an issue object"])).createIssue({ title: "Bad shape" }),
		(error) => error instanceof GitHubApiError && error.code === "github_response_shape_invalid",
	);

	const calls = [];
	const client = clientWith(async (input, init = {}) => {
		const { url } = captureCall(calls, input, init);
		if (url.pathname === "/repos/owner/repo/labels/missing" && init.method === "GET") return jsonResponse({ message: `not found ${TOKEN}` }, { status: 404, statusText: "Not Found" });
		if (url.pathname === "/repos/owner/repo/issues/1/labels/missing" && init.method === "DELETE") return jsonResponse({ message: `not found ${TOKEN}` }, { status: 404, statusText: "Not Found" });
		if (url.pathname === "/repos/owner/repo/assignees/nobody" && init.method === "GET") return jsonResponse({ message: `not found ${TOKEN}` }, { status: 404, statusText: "Not Found" });
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") return jsonResponse(issue(1));
		throw new Error(`Unexpected request ${init.method} ${url.pathname}`);
	});
	assert.equal(await client.getRepositoryLabel("missing"), undefined);
	assert.equal(await client.isRepositoryAssigneeAssignable("nobody"), false);
	assert.equal(await client.removeLabel(1, "missing"), undefined);
	await assert.rejects(() => client.addLabels(1, ["missing"]), (error) => {
		assert.ok(error instanceof IssueMeError);
		assert.equal(error.code, "invalid_tool_input");
		assert.deepEqual(error.safeDetails.missingLabels, ["missing"]);
		assertNoToken(error.safeDetails);
		return true;
	});
	assertAllRepoCallsStayInBoundary(calls);
});
