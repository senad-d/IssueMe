import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

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
	projectV2SingleSelectField,
	runtimeOptions,
	tempProject,
	TEST_REPOSITORY,
	TEST_TOKEN,
} from "./helpers/issueme-test-helpers.mjs";

/**
 * Mocked end-to-end workflows across the integrated tool surface. One stateful fake GitHub (REST + GraphQL)
 * backs every tool so the tests prove safe composition and cleanup, not single-tool behavior.
 */

const PROJECT = projectV2Node({ id: "PVT_1", number: 1, title: "Roadmap", owner: { __typename: "Repository", nameWithOwner: TEST_REPOSITORY } });
const STATUS_FIELD = projectV2SingleSelectField({ id: "PVTSSF_status", name: "Status", options: [{ id: "opt_todo", name: "Todo", color: "GRAY", description: "" }, { id: "opt_done", name: "Done", color: "GREEN", description: "" }] });
const BUG_TYPE = { id: 1, node_id: "IT_1", name: "Bug", description: "Something is broken", color: "red", is_enabled: true };
const ISSUE_ROOT = "/repos/owner/repo/issues";

function page(items, call, pathForLink) {
	const perPage = Number(call.url.searchParams.get("per_page") ?? "30");
	const pageNumber = Number(call.url.searchParams.get("page") ?? "1");
	const start = (pageNumber - 1) * perPage;
	const slice = items.slice(start, start + perPage);
	const headers = start + perPage < items.length ? { link: `<https://api.github.com${pathForLink}?per_page=${perPage}&page=${pageNumber + 1}>; rel="next"` } : {};
	return jsonResponse(slice, { headers });
}

function itemContent(issue) {
	return { __typename: "Issue", id: issue.node_id, number: issue.number, title: issue.title, state: issue.state.toUpperCase(), url: issue.html_url, author: { login: "octocat" }, repository: { nameWithOwner: TEST_REPOSITORY } };
}

/** Stateful fake GitHub: issues, comments, dependencies, timeline, and one Projects v2 board. */
function createFakeGitHub() {
	const state = { nextNumber: 100, nextCommentId: 500, nextEventId: 1, issues: new Map(), comments: [], blockedBy: new Map(), timeline: new Map(), items: new Map(), ownerType: "Organization" };
	const addEvent = (number, event) => {
		const events = state.timeline.get(number) ?? [];
		events.push({ id: state.nextEventId++, actor: { login: "octocat" }, created_at: `2026-10-${String(events.length + 1).padStart(2, "0")}T00:00:00Z`, ...event });
		state.timeline.set(number, events);
	};
	const issueByNumber = (number) => state.issues.get(number);
	const itemNode = (item) => ({
		id: item.id,
		type: "ISSUE",
		isArchived: item.isArchived,
		createdAt: "2026-10-01T00:00:00Z",
		updatedAt: "2026-10-01T00:00:00Z",
		project: PROJECT,
		content: itemContent(issueByNumber(item.issueNumber)),
		fieldValues: { ...graphQLConnection(item.status ? [{ __typename: "ProjectV2ItemFieldSingleSelectValue", name: item.status.name, optionId: item.status.optionId, field: { id: STATUS_FIELD.id, name: "Status", dataType: "SINGLE_SELECT" } }] : []), totalCount: item.status ? 1 : 0 },
	});
	const itemForIssue = (number) => [...state.items.values()].find((item) => item.issueNumber === number);
	const graphql = (call) => {
		const { operationName, variables } = call.json;
		switch (operationName) {
			case "IssueMeListProjectsV2": return graphQLResponse({ repository: { projectsV2: { nodes: [PROJECT], pageInfo: { hasNextPage: false, endCursor: null } } } });
			case "IssueMeGetProjectV2FieldsById": return graphQLResponse({ node: { ...PROJECT, fields: { nodes: [STATUS_FIELD], pageInfo: { hasNextPage: false, endCursor: null } } } });
			case "IssueMeValidateProjectV2ForAdd": return graphQLResponse({ node: variables.projectId === PROJECT.id ? PROJECT : null });
			case "IssueMeAddIssueToProjectV2": {
				const issue = [...state.issues.values()].find((candidate) => candidate.node_id === variables.contentId);
				const existing = itemForIssue(issue.number) ?? { id: `PVTI_${issue.number}`, issueNumber: issue.number, isArchived: false, status: null };
				state.items.set(existing.id, existing);
				addEvent(issue.number, { event: "added_to_project" });
				return graphQLResponse({ addProjectV2ItemById: { item: itemNode(existing) } });
			}
			case "IssueMeValidateProjectV2ItemForUpdate": return graphQLResponse({ node: state.items.has(variables.itemId) ? itemNode(state.items.get(variables.itemId)) : null });
			case "IssueMeUpdateProjectV2ItemFieldValue": {
				const item = state.items.get(variables.itemId);
				const option = STATUS_FIELD.options.find((candidate) => candidate.id === variables.value.singleSelectOptionId);
				item.status = { name: option.name, optionId: option.id };
				return graphQLResponse({ updateProjectV2ItemFieldValue: { projectV2Item: itemNode(item) } });
			}
			case "IssueMeGetProjectV2ItemByIssue": {
				const found = itemForIssue(variables.issueNumber);
				const nodes = found ? [itemNode(found)] : [];
				return graphQLResponse({ repository: { issue: { id: issueByNumber(variables.issueNumber).node_id, number: variables.issueNumber, projectItems: { ...graphQLConnection(nodes), totalCount: nodes.length } } } });
			}
			case "IssueMeListProjectV2Items": {
				const nodes = [...state.items.values()].map(itemNode);
				return graphQLResponse({ node: { ...PROJECT, items: { ...graphQLConnection(nodes), totalCount: nodes.length } } });
			}
			case "IssueMeValidateProjectV2Field": return graphQLResponse({ node: variables.fieldId === STATUS_FIELD.id ? { id: STATUS_FIELD.id, name: "Status", dataType: "SINGLE_SELECT", project: { id: PROJECT.id } } : null });
			case "IssueMeValidateProjectV2ItemField": {
				const item = state.items.get(variables.itemId);
				return graphQLResponse({ node: { ...itemNode(item), fieldValueByName: item.status ? { __typename: "ProjectV2ItemFieldSingleSelectValue" } : null } });
			}
			case "IssueMeClearProjectV2ItemFieldValue": {
				const item = state.items.get(variables.itemId);
				item.status = null;
				return graphQLResponse({ clearProjectV2ItemFieldValue: { projectV2Item: { id: item.id, fieldValueByName: null } } });
			}
			case "IssueMeArchiveProjectV2Item": {
				const item = state.items.get(variables.itemId);
				item.isArchived = true;
				return graphQLResponse({ archiveProjectV2Item: { item: { id: item.id, isArchived: true } } });
			}
			case "IssueMeDeleteProjectV2Item": {
				state.items.delete(variables.itemId);
				return graphQLResponse({ deleteProjectV2Item: { deletedItemId: variables.itemId } });
			}
			default: throw new Error(`Unexpected GraphQL operation ${operationName}`);
		}
	};
	const rest = (call) => {
		const path = call.url.pathname;
		const method = call.method;
		if (path === "/repos/owner/repo") return jsonResponse({ full_name: TEST_REPOSITORY, owner: { login: "owner", type: state.ownerType } });
		if (path === "/orgs/owner/issue-types") return jsonResponse([BUG_TYPE]);
		if (path === "/repos/owner/repo/labels") return jsonResponse([{ name: "bug", color: "d73a4a" }, { name: "triage", color: "ededed" }]);
		if (path === ISSUE_ROOT && method === "GET") {
			const wantedState = call.url.searchParams.get("state") ?? "open";
			const wantedType = call.url.searchParams.get("type");
			const matches = [...state.issues.values()].filter((issue) => (wantedState === "all" || issue.state === wantedState) && (wantedType === null || issue.type?.name === wantedType));
			return page(matches, call, path);
		}
		if (path === ISSUE_ROOT && method === "POST") {
			const number = state.nextNumber++;
			const type = call.json.type === undefined ? null : { ...BUG_TYPE, name: call.json.type };
			const issue = githubIssue({ number, id: 1000 + number, title: call.json.title, body: call.json.body, labels: call.json.labels ?? [], assignees: [], repository_url: `https://api.github.com/repos/${TEST_REPOSITORY}`, type });
			state.issues.set(number, issue);
			for (const label of issue.labels) addEvent(number, { event: "labeled", label: { name: label.name, color: label.color ?? "ededed" } });
			if (type) addEvent(number, { event: "issue_type_added", issue_type: { name: type.name } });
			return jsonResponse(issue, { status: 201, statusText: "Created" });
		}
		const single = path.match(/^\/repos\/owner\/repo\/issues\/(\d+)$/);
		if (single) {
			const issue = issueByNumber(Number(single[1]));
			if (!issue) return jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
			if (method === "GET") return jsonResponse(issue);
			assert.equal(method, "PATCH");
			if (call.json.state === "closed") {
				Object.assign(issue, { state: "closed", closed_at: "2026-10-09T00:00:00Z", state_reason: call.json.state_reason ?? "completed" });
				addEvent(issue.number, { event: "closed", state_reason: issue.state_reason });
			}
			if (call.json.state === "open") {
				Object.assign(issue, { state: "open", closed_at: null, state_reason: "reopened" });
				addEvent(issue.number, { event: "reopened" });
			}
			return jsonResponse(issue);
		}
		const commentsPath = path.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/comments$/);
		if (commentsPath) {
			const number = Number(commentsPath[1]);
			if (method === "POST") {
				const id = state.nextCommentId++;
				const comment = { id, user: { login: "octocat" }, body: call.json.body, created_at: `2026-10-0${id - 499}T00:00:00Z`, updated_at: `2026-10-0${id - 499}T00:00:00Z`, html_url: `https://github.com/${TEST_REPOSITORY}/issues/${number}#issuecomment-${id}`, issue_url: `https://api.github.com/repos/${TEST_REPOSITORY}/issues/${number}` };
				state.comments.push(comment);
				issueByNumber(number).comments += 1;
				addEvent(number, { event: "commented", user: { login: "octocat" }, body: call.json.body, html_url: comment.html_url });
				return jsonResponse(comment, { status: 201, statusText: "Created" });
			}
			return page(state.comments.filter((comment) => comment.issue_url.endsWith(`/issues/${number}`)), call, path);
		}
		const commentById = path.match(/^\/repos\/owner\/repo\/issues\/comments\/(\d+)$/);
		if (commentById) {
			const comment = state.comments.find((candidate) => candidate.id === Number(commentById[1]));
			return comment ? jsonResponse(comment) : jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
		}
		const timeline = path.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/timeline$/);
		if (timeline) return page(state.timeline.get(Number(timeline[1])) ?? [], call, path);
		const dependencies = path.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/dependencies\/(blocked_by|blocking)$/);
		if (dependencies && method === "GET") {
			const number = Number(dependencies[1]);
			const members = dependencies[2] === "blocked_by"
				? (state.blockedBy.get(number) ?? []).map(issueByNumber)
				: [...state.blockedBy.entries()].filter(([, blockers]) => blockers.includes(number)).map(([dependent]) => issueByNumber(dependent));
			return page(members, call, path);
		}
		if (dependencies && method === "POST") {
			const dependent = Number(dependencies[1]);
			const blocker = [...state.issues.values()].find((issue) => issue.id === call.json.issue_id);
			state.blockedBy.set(dependent, [...(state.blockedBy.get(dependent) ?? []), blocker.number]);
			addEvent(dependent, { event: "blocked_by_added", blocked_by: { number: blocker.number } });
			return jsonResponse(blocker, { status: 201, statusText: "Created" });
		}
		const removal = path.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/dependencies\/blocked_by\/(\d+)$/);
		if (removal && method === "DELETE") {
			const dependent = Number(removal[1]);
			const blocker = [...state.issues.values()].find((issue) => issue.id === Number(removal[2]));
			state.blockedBy.set(dependent, (state.blockedBy.get(dependent) ?? []).filter((number) => number !== blocker.number));
			addEvent(dependent, { event: "blocked_by_removed", blocked_by: { number: blocker.number } });
			return jsonResponse(blocker);
		}
		throw new Error(`Unexpected request ${method} ${path}`);
	};
	return { state, handler: (call) => (call.url.pathname === "/graphql" ? graphql(call) : rest(call)) };
}

async function workflow() {
	const github = createFakeGitHub();
	const recorder = createFetchRecorder(github.handler);
	const pi = createFakePi();
	registerIssueMeTools(pi, { runtime: runtimeOptions({ fetchFn: recorder.fetchFn }) });
	const cwd = await tempProject();
	const run = (name, params = {}) => executeRegisteredTool(pi.tools, name, params, { cwd });
	const cacheFiles = async () => (await readdir(join(cwd, "issues")).catch(() => [])).filter((name) => name.endsWith(".json")).sort();
	return { github, recorder, run, cwd, cacheFiles };
}

function assertNoToken(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TEST_TOKEN));
}

function mutationCalls(recorder) {
	return recorder.calls.filter((call) => call.method !== "GET").map((call) => `${call.method} ${call.url.pathname}${call.json?.operationName ? ` ${call.json.operationName}` : ""}`);
}

test("workflow: dependency planning creates issues, links and unlinks blockers, and cleans up without cache writes from dependency tools", async () => {
	const { github, recorder, run, cacheFiles } = await workflow();
	const blocker = await run("issueme_create_issue", { title: "Blocker work", body: "Do this first", labels: ["bug"] });
	const dependent = await run("issueme_create_issue", { title: "Dependent work", body: "Needs the blocker" });
	assert.equal(blocker.details.issue.number, 100);
	assert.equal(dependent.details.issue.number, 101);
	assert.deepEqual(await cacheFiles(), ["100-blocker-work.json", "101-dependent-work.json"]);

	const added = await run("issueme_add_issue_dependency", { issueNumber: 101, blockingIssueNumber: 100 });
	assert.equal(added.details.status, "dependency_added");
	assert.equal(added.details.cacheUpdated, false);
	const again = await run("issueme_add_issue_dependency", { issueNumber: 101, blockingIssueNumber: 100 });
	assert.equal(again.details.changedFields.length, 0, "repeating the add is a no-op");

	const dependentView = await run("issueme_list_issue_dependencies", { issueNumber: 101 });
	assert.deepEqual(dependentView.details.dependencies.map((dependency) => [dependency.direction, dependency.number]), [["blocked_by", 100]]);
	const blockerView = await run("issueme_list_issue_dependencies", { issueNumber: 100 });
	assert.deepEqual(blockerView.details.dependencies.map((dependency) => [dependency.direction, dependency.number]), [["blocking", 101]]);
	const history = await run("issueme_list_issue_timeline", { issueNumber: 101, eventTypes: ["blocked_by_added"] });
	assert.deepEqual(history.details.timeline.map((event) => [event.event, event.metadata.blockedBy]), [["blocked_by_added", 100]]);

	const removed = await run("issueme_remove_issue_dependency", { issueNumber: 101, blockingIssueNumber: 100 });
	assert.equal(removed.details.status, "dependency_removed");
	assert.deepEqual((await run("issueme_list_issue_dependencies", { issueNumber: 101 })).details.dependencies, []);
	assert.deepEqual(await cacheFiles(), ["100-blocker-work.json", "101-dependent-work.json"], "dependency tools never touch the cache");

	const closed = await run("issueme_bulk_update_issues", { issueNumbers: [101, 100], action: "close", reason: "completed" });
	assert.equal(closed.details.result, "success");
	assert.deepEqual(closed.details.bulkResults.map((entry) => entry.issue.stateReason), ["completed", "completed"]);
	assert.deepEqual(await cacheFiles(), []);
	assert.deepEqual(mutationCalls(recorder), [
		"POST /repos/owner/repo/issues",
		"POST /repos/owner/repo/issues",
		"POST /repos/owner/repo/issues/101/dependencies/blocked_by",
		"DELETE /repos/owner/repo/issues/101/dependencies/blocked_by/1100",
		"PATCH /repos/owner/repo/issues/101",
		"PATCH /repos/owner/repo/issues/100",
	]);
	assert.deepEqual([...github.state.blockedBy.values()].flat(), []);
	assertNoToken({ blocker, dependent, added, dependentView, removed, closed });
});

test("workflow: board discovery, add, update, inspect, clear, archive, and remove compose over one issue and leave the issue untouched", async () => {
	const { github, recorder, run, cacheFiles } = await workflow();
	const created = await run("issueme_create_issue", { title: "Board candidate", body: "Track on the roadmap" });
	const number = created.details.issue.number;

	const boards = await run("issueme_list_projects", {});
	assert.deepEqual(boards.details.projects.map((project) => project.id), ["PVT_1"]);
	const fields = await run("issueme_get_project_fields", { projectId: "PVT_1" });
	assert.deepEqual(fields.details.projectFields.map((field) => [field.id, field.options?.map((option) => option.id)]), [["PVTSSF_status", ["opt_todo", "opt_done"]]]);

	const added = await run("issueme_add_issue_to_project", { issueNumber: number, projectId: "PVT_1" });
	const itemId = added.details.projectItem.id;
	assert.equal(itemId, `PVTI_${number}`);
	const target = { projectId: "PVT_1", itemId, issueNumber: number };
	const updated = await run("issueme_update_project_item", { ...target, fieldId: "PVTSSF_status", valueType: "single_select", singleSelectOptionId: "opt_todo" });
	assert.equal(updated.details.status, "update_project_item");
	const inspected = await run("issueme_get_project_item", { projectId: "PVT_1", issueNumber: number });
	assert.deepEqual(inspected.details.projectItem.fieldValues.map((value) => [value.name, value.optionName ?? value.name]), [["Status", "Todo"]]);
	assert.equal(inspected.details.projectItem.isArchived, false);

	const cleared = await run("issueme_clear_project_item_field", { ...target, fieldId: "PVTSSF_status" });
	assert.equal(cleared.details.status, "project_item_field_cleared");
	assert.deepEqual((await run("issueme_get_project_item", { projectId: "PVT_1", issueNumber: number })).details.projectItem.fieldValues, []);
	const clearedAgain = await run("issueme_clear_project_item_field", { ...target, fieldId: "PVTSSF_status" });
	assert.deepEqual(clearedAgain.details.changedFields, [], "clearing an already-clear field is a no-op");

	const archived = await run("issueme_archive_project_item", { ...target, action: "archive" });
	assert.equal(archived.details.projectItem.isArchived, true);
	const listed = await run("issueme_list_project_items", { projectId: "PVT_1" });
	assert.deepEqual(listed.details.projectItems.map((item) => [item.id, item.isArchived]), [[itemId, true]]);

	const removed = await run("issueme_remove_issue_from_project", { ...target, confirmRemove: true });
	assert.equal(removed.details.status, "project_item_removed");
	const absent = await run("issueme_get_project_item", { projectId: "PVT_1", issueNumber: number });
	assert.equal(absent.details.projectItem, undefined);
	assert.equal(github.state.items.size, 0);

	assert.equal(github.state.issues.get(number).state, "open", "project maintenance never closes the issue");
	assert.deepEqual(await cacheFiles(), [`${number}-board-candidate.json`], "project tools never remove the issue cache");
	assert.ok(recorder.calls.every((call) => !(call.method === "PATCH" || call.method === "DELETE") || call.url.pathname === "/graphql"), "no REST issue mutation happened after creation");
	const closed = await run("issueme_close_issue", { number });
	assert.equal(closed.details.status, "closed_now");
	assert.deepEqual(await cacheFiles(), []);
	assertNoToken({ boards, fields, added, updated, inspected, cleared, archived, listed, removed, absent, closed });
});

test("workflow: later comments are reachable through list continuation and get_comment while the cache keeps its bounded view", async () => {
	const { run, recorder } = await workflow();
	const created = await run("issueme_create_issue", { title: "Discussion", body: "Long thread" });
	const number = created.details.issue.number;
	const posted = [];
	for (const body of ["first", "second", "third", "fourth"]) posted.push(await run("issueme_comment_issue", { number, body: `Comment ${body}` }));
	assert.deepEqual(posted.map((result) => result.details.comment.id), [500, 501, 502, 503]);

	const firstPage = await run("issueme_list_issue_comments", { issueNumber: number, limit: 2 });
	assert.deepEqual(firstPage.details.comments.map((comment) => comment.id), [500, 501]);
	assert.equal(firstPage.details.continuation.complete, false);
	const secondPage = await run("issueme_list_issue_comments", { issueNumber: number, limit: 2, after: firstPage.details.continuation.nextToken });
	assert.deepEqual(secondPage.details.comments.map((comment) => comment.id), [502, 503]);
	assert.equal(secondPage.details.continuation.resumed, true);
	assert.equal(secondPage.details.continuation.complete, true);
	assert.equal(firstPage.details.cacheUpdated, false);

	const single = await run("issueme_get_comment", { issueNumber: number, commentId: 503 });
	assert.equal(single.details.comment.id, 503);
	assert.match(single.content[0].text, /Comment fourth/);
	const cached = await run("issueme_get_issue", { number });
	assert.equal(cached.details.issue.number, number);
	assert.ok(recorder.calls.every((call) => call.method !== "GET" || !call.url.pathname.endsWith("/comments") || Number(call.url.searchParams.get("per_page") ?? "30") <= 100), "comment reads stay bounded");

	const closed = await run("issueme_close_issue", { number, reason: "not_planned" });
	assert.equal(closed.details.issue.stateReason, "not_planned");
	const afterClose = await run("issueme_list_issue_comments", { issueNumber: number });
	assert.equal(afterClose.details.comments.length, 4, "comment reads keep working on closed issues");
	assertNoToken({ posted, firstPage, secondPage, single, cached, closed, afterClose });
});

test("workflow: issue type discovery, typed creation, refresh, and history inspection agree and clean up", async () => {
	const { run, cacheFiles } = await workflow();
	const types = await run("issueme_list_issue_types", {});
	assert.deepEqual(types.details.issueTypes.map((type) => type.name), ["Bug"]);

	const created = await run("issueme_create_issue", { title: "Typed defect", body: "Crash on start", labels: ["bug"], type: "Bug" });
	assert.equal(created.details.result, "success");
	assert.equal(created.details.issue.issueType, "Bug");
	const number = created.details.issue.number;

	const refreshed = await run("issueme_get_issue", { number, refresh: true });
	assert.match(refreshed.content[0].text, /^Type: Bug$/m);
	assert.equal(refreshed.details.issue.issueType, "Bug");
	const listed = await run("issueme_list_issues", { type: "Bug" });
	assert.deepEqual(listed.details.issues.map((issue) => [issue.number, issue.issueType]), [[number, "Bug"]]);

	const history = await run("issueme_list_issue_timeline", { issueNumber: number });
	assert.deepEqual(history.details.timeline.map((event) => event.event), ["labeled", "issue_type_added"]);
	assert.equal(history.details.cacheUpdated, false);

	const closed = await run("issueme_close_issue", { number, reason: "not_planned" });
	assert.equal(closed.details.issue.stateReason, "not_planned");
	const afterClose = await run("issueme_list_issue_timeline", { issueNumber: number, eventTypes: ["closed"] });
	assert.deepEqual(afterClose.details.timeline.map((event) => [event.event, event.metadata.stateReason]), [["closed", "not_planned"]]);
	assert.deepEqual(await cacheFiles(), []);
	assertNoToken({ types, created, refreshed, listed, history, closed, afterClose });
});
