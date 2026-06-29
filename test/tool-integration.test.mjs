import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import issueMeExtension from "../src/extension.ts";
import { ClosedIssueMutationError } from "../src/errors.ts";
import { GitHubClient } from "../src/github/client.ts";
import { writeIssueRecord } from "../src/issues/store.ts";
import { registerIssueMeTools } from "../src/tools/issueme-tools.ts";
import { normalizeRuntimeRepository } from "../src/tools/runtime.ts";

const TOKEN = "ghp_injected_integration_token";
const REPOSITORY = "owner/repo";
const repository = { owner: "owner", repo: "repo", fullName: REPOSITORY };
const config = { issueDirectory: "issues", defaultLabels: ["from-config"], defaultAssignees: ["octocat"], defaultSkillPath: null };

function fakePi() {
	const commands = new Map();
	const tools = new Map();
	return {
		commands,
		tools,
		registerCommand(name, options) { commands.set(name, options); },
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-tool-integration-test-"));
}

function registerInjectedTools(fetchFn) {
	const pi = fakePi();
	registerIssueMeTools(pi, {
		runtime: {
			config,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	});
	return pi.tools;
}

async function execute(tool, cwd, params) {
	return tool.execute("tool-call", params, undefined, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

function githubIssue(number, title, overrides = {}) {
	const { labels = [], assignees = [], comments, commentsCount, ...rest } = overrides;
	return {
		node_id: `I_${number}`,
		number,
		title,
		state: "open",
		body: `Body for ${title}`,
		milestone: null,
		html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		...rest,
		comments: commentsCount ?? comments ?? 0,
		labels: labels.map((name) => ({ name })),
		assignees: assignees.map((login) => ({ login })),
	};
}

function githubComment(issueNumber, id = 1, body = "Mock comment") {
	return {
		id,
		user: { login: "octocat" },
		body,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		html_url: `https://github.com/${REPOSITORY}/issues/${issueNumber}#issuecomment-${id}`,
		issue_url: `https://api.github.com/repos/${REPOSITORY}/issues/${issueNumber}`,
	};
}

function issueRecord(number, title, overrides = {}) {
	return {
		schemaVersion: 1,
		repository: REPOSITORY,
		number,
		title,
		state: "open",
		body: "Local body",
		labels: [],
		assignees: [],
		milestone: null,
		comments: [],
		html_url: `https://github.com/${REPOSITORY}/issues/${number}`,
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		synced_at: "2026-06-27T00:00:01Z",
		...overrides,
	};
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json", ...(init.headers ?? {}) },
	});
}

function makeSuccessFetch() {
	const calls = [];
	const issues = new Map([
		[10, githubIssue(10, "Sync Target", { labels: ["synced"], assignees: ["octocat"], commentsCount: 1 })],
		[20, githubIssue(20, "Pull Request", { pull_request: {}, commentsCount: 0 })],
	]);
	const comments = new Map([[10, [githubComment(10, 100, "Existing comment")]]]);
	const repositoryLabels = new Map([
		["bug", { name: "bug", description: "Bug reports", color: "d73a4a", default: true, url: "https://api.github.com/repos/owner/repo/labels/bug" }],
		["ready", { name: "ready", description: "Ready for work", color: "0e8a16", default: false, url: "https://api.github.com/repos/owner/repo/labels/ready" }],
	]);
	const repositoryMilestones = new Map([
		[1, { number: 1, title: "v1.0", state: "open", description: "First release", due_on: "2026-07-01T00:00:00Z", open_issues: 1, closed_issues: 0, html_url: "https://github.com/owner/repo/milestone/1", url: "https://api.github.com/repos/owner/repo/milestones/1" }],
		[2, { number: 2, title: "Backlog", state: "closed", description: "Archived backlog", due_on: null, open_issues: 0, closed_issues: 4, html_url: "https://github.com/owner/repo/milestone/2", url: "https://api.github.com/repos/owner/repo/milestones/2" }],
	]);
	const repositoryAssignees = [
		{ login: "octocat", id: 1, type: "User", html_url: "https://github.com/octocat", url: "https://api.github.com/users/octocat" },
		{ login: "hubot", id: 2, type: "Bot", html_url: "https://github.com/hubot", url: "https://api.github.com/users/hubot" },
	];
	const project = {
		id: "PVT_repo_1",
		title: "Roadmap",
		number: 1,
		url: "https://github.com/users/owner/projects/1",
		shortDescription: "Development board",
		closed: false,
		public: false,
		owner: { __typename: "User", login: "owner" },
	};
	const projectFields = [
		{ __typename: "ProjectV2SingleSelectField", id: "PVTSSF_status", name: "Status", dataType: "SINGLE_SELECT", options: [{ id: "opt_todo", name: "Todo", color: "GRAY", description: "Not started" }, { id: "opt_done", name: "Done", color: "GREEN" }] },
		{ __typename: "ProjectV2IterationField", id: "PVTF_iteration", name: "Iteration", dataType: "ITERATION", configuration: { iterations: [{ id: "iter_1", title: "Sprint 1", startDate: "2026-07-01", duration: 14 }], completedIterations: [] } },
	];
	const projectItem = {
		id: "PVTI_10",
		type: "ISSUE",
		project,
		content: { __typename: "Issue", id: "I_10", number: 10, title: "Sync Target", state: "OPEN", url: "https://github.com/owner/repo/issues/10", repository: { nameWithOwner: REPOSITORY } },
	};
	let nextIssueNumber = 11;
	let nextCommentId = 200;

	const fetchFn = async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method, path: url.pathname, body, authorization: init.headers?.Authorization });

		if (url.pathname === "/repos/owner/repo/issues" && method === "GET") {
			return jsonResponse([...issues.values()].filter((issue) => issue.state === "open"));
		}
		if (url.pathname === "/repos/owner/repo/labels" && method === "GET") {
			return jsonResponse([...repositoryLabels.values()]);
		}
		if (url.pathname === "/repos/owner/repo/milestones" && method === "GET") {
			const state = url.searchParams.get("state") ?? "open";
			return jsonResponse([...repositoryMilestones.values()].filter((milestone) => state === "all" || milestone.state === state));
		}
		if (url.pathname === "/repos/owner/repo/assignees" && method === "GET") {
			return jsonResponse(repositoryAssignees);
		}
		const repositoryAssigneeMatch = url.pathname.match(/^\/repos\/owner\/repo\/assignees\/([^/]+)$/);
		if (repositoryAssigneeMatch && method === "GET") {
			const login = decodeURIComponent(repositoryAssigneeMatch[1]);
			return repositoryAssignees.some((assignee) => assignee.login === login)
				? new Response(null, { status: 204, statusText: "No Content" })
				: jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
		}
		if (url.pathname === "/graphql" && method === "POST") {
			if (body.operationName === "IssueMeListSubIssues") {
				const issue = issues.get(body.variables.issueNumber);
				return jsonResponse({
					data: {
						repository: {
							issue: {
								id: issue.node_id,
								number: issue.number,
								title: issue.title,
								state: issue.state.toUpperCase(),
								url: issue.html_url,
								parent: null,
								subIssues: { totalCount: 0, nodes: [], pageInfo: { hasNextPage: false } },
							},
						},
					},
				});
			}
			if (body.operationName === "IssueMeListProjectsV2") {
				return jsonResponse({ data: { repository: { projectsV2: { nodes: [project], pageInfo: { hasNextPage: false } } } } });
			}
			if (body.operationName === "IssueMeGetProjectV2FieldsByNumber") {
				return jsonResponse({ data: { repository: { projectV2: { ...project, fields: { nodes: projectFields, pageInfo: { hasNextPage: false } } } } } });
			}
			if (body.operationName === "IssueMeValidateProjectV2ForAdd") {
				return jsonResponse({ data: { node: project } });
			}
			if (body.operationName === "IssueMeAddIssueToProjectV2") {
				return jsonResponse({ data: { addProjectV2ItemById: { item: projectItem } } });
			}
			if (body.operationName === "IssueMeValidateProjectV2ItemForUpdate") {
				return jsonResponse({ data: { node: projectItem } });
			}
			if (body.operationName === "IssueMeUpdateProjectV2ItemFieldValue") {
				return jsonResponse({ data: { updateProjectV2ItemFieldValue: { projectV2Item: projectItem } } });
			}
		}
		if (url.pathname === "/repos/owner/repo/milestones" && method === "POST") {
			const number = Math.max(...repositoryMilestones.keys()) + 1;
			const milestone = { number, title: body.title, state: "open", description: body.description ?? "", due_on: body.due_on ?? null, open_issues: 0, closed_issues: 0, html_url: `https://github.com/owner/repo/milestone/${number}`, url: `https://api.github.com/repos/owner/repo/milestones/${number}` };
			repositoryMilestones.set(number, milestone);
			return jsonResponse(milestone, { status: 201, statusText: "Created" });
		}
		const repositoryMilestoneMatch = url.pathname.match(/^\/repos\/owner\/repo\/milestones\/(\d+)$/);
		if (repositoryMilestoneMatch) {
			const number = Number(repositoryMilestoneMatch[1]);
			const current = repositoryMilestones.get(number);
			if (!current) return jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
			if (method === "PATCH") {
				const next = { ...current, title: body.title ?? current.title, state: body.state ?? current.state, description: body.description ?? current.description, due_on: Object.hasOwn(body, "due_on") ? body.due_on : current.due_on };
				repositoryMilestones.set(number, next);
				return jsonResponse(next);
			}
			if (method === "DELETE") {
				repositoryMilestones.delete(number);
				return new Response(null, { status: 204, statusText: "No Content" });
			}
		}
		if (url.pathname === "/repos/owner/repo/labels" && method === "POST") {
			const label = { name: body.name, description: body.description ?? "", color: body.color, default: false, url: `https://api.github.com/repos/owner/repo/labels/${encodeURIComponent(body.name)}` };
			repositoryLabels.set(label.name, label);
			return jsonResponse(label, { status: 201, statusText: "Created" });
		}
		const repositoryLabelMatch = url.pathname.match(/^\/repos\/owner\/repo\/labels\/([^/]+)$/);
		if (repositoryLabelMatch) {
			const labelName = decodeURIComponent(repositoryLabelMatch[1]);
			const current = repositoryLabels.get(labelName);
			if (!current) return jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
			if (method === "GET") return jsonResponse(current);
			if (method === "PATCH") {
				const nextName = body.new_name ?? labelName;
				const next = { ...current, name: nextName, color: body.color ?? current.color, description: body.description ?? current.description };
				repositoryLabels.delete(labelName);
				repositoryLabels.set(nextName, next);
				return jsonResponse(next);
			}
			if (method === "DELETE") {
				repositoryLabels.delete(labelName);
				return new Response(null, { status: 204, statusText: "No Content" });
			}
		}
		if (url.pathname === "/repos/owner/repo/issues" && method === "POST") {
			const issue = githubIssue(nextIssueNumber++, body.title, {
				body: body.body,
				labels: body.labels ?? [],
				assignees: body.assignees ?? [],
			});
			issues.set(issue.number, issue);
			return jsonResponse(issue);
		}

		const issueMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)$/);
		if (issueMatch) {
			const number = Number(issueMatch[1]);
			const issue = issues.get(number);
			if (!issue) return jsonResponse({ message: "not found" }, { status: 404, statusText: "Not Found" });
			if (method === "GET") return jsonResponse(issue);
			if (method === "PATCH") {
				const next = githubIssue(number, body.title ?? issue.title, {
					body: body.body ?? issue.body,
					state: body.state ?? issue.state,
					labels: body.labels ?? issue.labels.map((label) => label.name),
					assignees: body.assignees ?? issue.assignees.map((assignee) => assignee.login),
					closed_at: body.state === "closed" ? "2026-06-27T00:05:00Z" : issue.closed_at,
					commentsCount: issue.comments,
				});
				issues.set(number, next);
				return jsonResponse(next);
			}
		}

		const commentsMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/comments$/);
		if (commentsMatch) {
			const number = Number(commentsMatch[1]);
			if (method === "GET") return jsonResponse(comments.get(number) ?? []);
			if (method === "POST") {
				const comment = githubComment(number, nextCommentId++, body.body);
				comments.set(number, [...(comments.get(number) ?? []), comment]);
				const issue = issues.get(number);
				if (issue) issues.set(number, { ...issue, comments: (issue.comments ?? 0) + 1 });
				return jsonResponse(comment);
			}
		}

		const singleCommentMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/comments\/(\d+)$/);
		if (singleCommentMatch) {
			const commentId = Number(singleCommentMatch[1]);
			const entry = [...comments.entries()].find(([, issueComments]) => issueComments.some((comment) => comment.id === commentId));
			if (!entry) return jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
			const [issueNumber, issueComments] = entry;
			const current = issueComments.find((comment) => comment.id === commentId);
			if (method === "GET") return jsonResponse(current);
			if (method === "PATCH") {
				const updated = { ...current, body: body.body, updated_at: "2026-06-27T00:06:00Z" };
				comments.set(issueNumber, issueComments.map((comment) => comment.id === commentId ? updated : comment));
				return jsonResponse(updated);
			}
			if (method === "DELETE") {
				comments.set(issueNumber, issueComments.filter((comment) => comment.id !== commentId));
				const issue = issues.get(issueNumber);
				if (issue) issues.set(issueNumber, { ...issue, comments: Math.max(0, (issue.comments ?? 0) - 1) });
				return new Response(null, { status: 204, statusText: "No Content" });
			}
		}

		const assigneeMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/assignees$/);
		if (assigneeMatch && method === "POST") {
			const number = Number(assigneeMatch[1]);
			const issue = issues.get(number);
			const current = issue.assignees.map((assignee) => assignee.login);
			const next = githubIssue(number, issue.title, {
				...issue,
				labels: issue.labels.map((label) => label.name),
				assignees: [...new Set([...current, ...body.assignees])],
			});
			issues.set(number, next);
			return jsonResponse(next);
		}

		const labelMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/labels$/);
		if (labelMatch && method === "POST") {
			const number = Number(labelMatch[1]);
			const issue = issues.get(number);
			const current = issue.labels.map((label) => label.name);
			const labels = [...new Set([...current, ...body.labels])];
			issues.set(number, githubIssue(number, issue.title, {
				...issue,
				labels,
				assignees: issue.assignees.map((assignee) => assignee.login),
			}));
			return jsonResponse(labels.map((name) => ({ name })));
		}

		throw new Error(`Unexpected injected GitHub request: ${method} ${url.pathname}`);
	};

	return { calls, fetchFn };
}

function makeClosedFetch() {
	const calls = [];
	const closed = githubIssue(99, "Closed Target", {
		state: "closed",
		closed_at: "2026-06-27T00:05:00Z",
	});
	const fetchFn = async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		calls.push({ method, path: url.pathname, body: init.body });
		if (url.pathname === "/repos/owner/repo/issues" && method === "GET") return jsonResponse([]);
		if (url.pathname === "/repos/owner/repo/issues/99" && method === "GET") return jsonResponse(closed);
		throw new Error(`Closed safety mock should not receive mutation request: ${method} ${url.pathname}`);
	};
	return { calls, fetchFn };
}

function assertNoToken(value) {
	assert.doesNotMatch(JSON.stringify(value), /ghp_injected_integration_token/);
}

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

test("registered IssueMe tools run with injected config, repository, token, and fetch", async () => {
	const projectRoot = await tempProject();
	const mock = makeSuccessFetch();
	const tools = registerInjectedTools(mock.fetchFn);
	const results = [];

	const listResult = await execute(tools.get("issueme_list_issues"), projectRoot, { state: "all", limit: 5 });
	assert.equal(listResult.details.cacheUpdated, false);
	assert.deepEqual(listResult.details.issues.map((item) => item.number), [10]);
	results.push(listResult);

	const labelListResult = await execute(tools.get("issueme_list_labels"), projectRoot, { query: "ready", limit: 5 });
	assert.equal(labelListResult.details.cacheUpdated, false);
	assert.deepEqual(labelListResult.details.labels.map((item) => item.name), ["ready"]);
	results.push(labelListResult);

	const milestoneListResult = await execute(tools.get("issueme_list_milestones"), projectRoot, { state: "all", limit: 5 });
	assert.equal(milestoneListResult.details.cacheUpdated, false);
	assert.deepEqual(milestoneListResult.details.milestones.map((item) => item.number), [1, 2]);
	results.push(milestoneListResult);

	const assigneeListResult = await execute(tools.get("issueme_list_assignees"), projectRoot, { login: "hub", limit: 5 });
	assert.equal(assigneeListResult.details.cacheUpdated, false);
	assert.deepEqual(assigneeListResult.details.assignees.map((item) => item.login), ["hubot"]);
	results.push(assigneeListResult);

	const projectListResult = await execute(tools.get("issueme_list_projects"), projectRoot, { limit: 5 });
	assert.equal(projectListResult.details.cacheUpdated, false);
	assert.deepEqual(projectListResult.details.projects.map((item) => item.title), ["Roadmap"]);
	results.push(projectListResult);

	const projectFieldsResult = await execute(tools.get("issueme_get_project_fields"), projectRoot, { projectNumber: 1, fieldLimit: 5 });
	assert.equal(projectFieldsResult.details.cacheUpdated, false);
	assert.deepEqual(projectFieldsResult.details.projectFields.map((item) => item.name), ["Status", "Iteration"]);
	results.push(projectFieldsResult);

	const subIssuesResult = await execute(tools.get("issueme_list_sub_issues"), projectRoot, { issueNumber: 10 });
	assert.equal(subIssuesResult.details.cacheUpdated, false);
	assert.equal(subIssuesResult.details.issue.number, 10);
	assert.equal(subIssuesResult.details.counts.subIssuesTotal, 0);
	results.push(subIssuesResult);

	const addProjectItemResult = await execute(tools.get("issueme_add_issue_to_project"), projectRoot, { issueNumber: 10, projectId: "PVT_repo_1" });
	assert.equal(addProjectItemResult.details.projectItem.id, "PVTI_10");
	results.push(addProjectItemResult);

	const updateProjectItemResult = await execute(tools.get("issueme_update_project_item"), projectRoot, { projectId: "PVT_repo_1", itemId: "PVTI_10", issueNumber: 10, fieldId: "PVTSSF_status", valueType: "single_select", singleSelectOptionId: "opt_todo" });
	assert.deepEqual(updateProjectItemResult.details.changedFields, ["PVTSSF_status"]);
	results.push(updateProjectItemResult);

	results.push(await execute(tools.get("issueme_manage_label"), projectRoot, { action: "create", name: "triage", color: "fbca04", description: "Needs triage" }));
	assert.equal(results.at(-1).details.labels[0].name, "triage");

	results.push(await execute(tools.get("issueme_manage_milestone"), projectRoot, { action: "create", title: "v3.0", description: "Third release", dueOn: "2026-09-01" }));
	assert.equal(results.at(-1).details.milestones[0].title, "v3.0");

	results.push(await execute(tools.get("issueme_sync_issues"), projectRoot, {}));
	assert.equal((await readJson(join(projectRoot, "issues", "10-sync-target.json"))).repository, REPOSITORY);

	results.push(await execute(tools.get("issueme_create_issue"), projectRoot, { title: "Created from test", body: "Body" }));
	const created = await readJson(join(projectRoot, "issues", "11-created-from-test.json"));
	assert.deepEqual(created.labels, ["from-config"]);
	assert.deepEqual(created.assignees, ["octocat"]);

	results.push(await execute(tools.get("issueme_get_issue"), projectRoot, { number: 10, refresh: true }));
	results.push(await execute(tools.get("issueme_update_issue"), projectRoot, { number: 10, title: "Updated Target", labels: ["ready"] }));
	assert.equal((await readJson(join(projectRoot, "issues", "10-updated-target.json"))).title, "Updated Target");
	assert.deepEqual(results.at(-1).details.removedPaths, ["issues/10-sync-target.json"]);

	results.push(await execute(tools.get("issueme_comment_issue"), projectRoot, { number: 10, body: "Safe progress note" }));
	results.push(await execute(tools.get("issueme_update_comment"), projectRoot, { issueNumber: 10, commentId: 200, body: "Corrected progress note" }));
	results.push(await execute(tools.get("issueme_delete_comment"), projectRoot, { issueNumber: 10, commentId: 200 }));
	results.push(await execute(tools.get("issueme_assign_issue"), projectRoot, { number: 10, action: "add", assignees: ["hubot"] }));
	results.push(await execute(tools.get("issueme_label_issue"), projectRoot, { number: 10, action: "add", labels: ["bug"] }));
	results.push(await execute(tools.get("issueme_reopen_issue"), projectRoot, { number: 10 }));
	results.push(await execute(tools.get("issueme_close_issue"), projectRoot, { number: 10 }));

	assert.deepEqual(await readdir(join(projectRoot, "issues")), ["11-created-from-test.json"]);
	for (const result of results) {
		assert.equal(result.details.result, "success");
		assertNoToken(result);
	}
	assert.ok(mock.calls.length > 0);
	assert.ok(mock.calls.every((call) => call.authorization === `Bearer ${TOKEN}`));
	assert.equal(mock.calls.some((call) => call.path === "/repos/owner/repo/issues" && call.method === "POST"), true);
	assert.equal(mock.calls.some((call) => call.path === "/repos/owner/repo/issues/10" && call.method === "PATCH" && call.body?.state === "closed"), true);
});

test("cache-refresh tools stay sequential and order same-issue cache writes with update flows", async () => {
	const extensionPi = fakePi();
	issueMeExtension(extensionPi);
	assert.equal(extensionPi.commands.has("issueme"), true);
	for (const name of ["issueme_get_issue", "issueme_list_sub_issues", "issueme_sync_issues", "issueme_update_issue"]) {
		assert.equal(extensionPi.tools.get(name).executionMode, "sequential", `${name} must serialize cache write phases`);
	}

	const projectRoot = await tempProject();
	const mock = makeSuccessFetch();
	const tools = registerInjectedTools(mock.fetchFn);

	const syncResult = await execute(tools.get("issueme_sync_issues"), projectRoot, {});
	assert.equal(syncResult.details.cacheUpdated, true);
	assert.deepEqual(await readdir(join(projectRoot, "issues")), ["10-sync-target.json"]);

	const getRefresh = await execute(tools.get("issueme_get_issue"), projectRoot, { number: 10, refresh: true });
	assert.equal(getRefresh.details.cacheUpdated, true);
	assert.deepEqual(getRefresh.details.paths, ["issues/10-sync-target.json"]);

	const relationshipRefresh = await execute(tools.get("issueme_list_sub_issues"), projectRoot, { issueNumber: 10, refreshCache: true });
	assert.equal(relationshipRefresh.details.cacheUpdated, true);
	assert.deepEqual(relationshipRefresh.details.paths, ["issues/10-sync-target.json"]);
	assert.equal((await readJson(join(projectRoot, "issues", "10-sync-target.json"))).sub_issues_count, 0);

	const updateResult = await execute(tools.get("issueme_update_issue"), projectRoot, { number: 10, title: "Ordered Target", labels: ["ready"] });
	assert.equal(updateResult.details.cacheUpdated, true);
	assert.deepEqual(updateResult.details.paths, ["issues/10-ordered-target.json"]);
	assert.deepEqual(updateResult.details.removedPaths, ["issues/10-sync-target.json"]);
	assert.deepEqual(await readdir(join(projectRoot, "issues")), ["10-ordered-target.json"]);
	const finalRecord = await readJson(join(projectRoot, "issues", "10-ordered-target.json"));
	assert.equal(finalRecord.title, "Ordered Target");
	assert.deepEqual(finalRecord.labels, ["ready"]);

	const listSubIssuesCallIndex = mock.calls.findIndex((call) => call.path === "/graphql" && call.body?.operationName === "IssueMeListSubIssues");
	const patchCallIndex = mock.calls.findIndex((call) => call.path === "/repos/owner/repo/issues/10" && call.method === "PATCH");
	assert.ok(listSubIssuesCallIndex >= 0, "relationship refresh should use the mocked GraphQL list operation");
	assert.ok(patchCallIndex > listSubIssuesCallIndex, "update mutation should run after the relationship refresh in this same-issue scenario");
});

test("IssueMe runtime validates injected repository objects", () => {
	assert.deepEqual(normalizeRuntimeRepository(repository), repository);
	assert.deepEqual(normalizeRuntimeRepository(REPOSITORY), repository);
	assert.throws(
		() => normalizeRuntimeRepository({ owner: "owner", repo: "repo", fullName: "other/repo" }),
		(error) => error?.code === "invalid_github_repository" && /fields must match/.test(error.message),
	);
	assert.throws(
		() => normalizeRuntimeRepository({ owner: "owner/name", repo: "repo", fullName: "owner/name/repo" }),
		(error) => error?.code === "invalid_github_repository" && /valid GitHub/.test(error.message),
	);
});

test("registered IssueMe tools reject unsafe numeric identifiers before requests or cache writes", async () => {
	const projectRoot = await tempProject();
	const calls = [];
	const tools = registerInjectedTools(async (input, init = {}) => {
		const url = new URL(input.toString());
		calls.push({ method: init.method ?? "GET", path: url.pathname });
		return jsonResponse({});
	});
	const unsafe = Number.MAX_SAFE_INTEGER + 1;
	const cases = [
		["issueme_get_issue", { number: unsafe, refresh: true }, "issueNumber"],
		["issueme_update_issue", { number: unsafe, title: "Updated" }, "issueNumber"],
		["issueme_update_issue", { number: 1, milestoneNumber: unsafe }, "milestoneNumber"],
		["issueme_comment_issue", { number: unsafe, body: "Progress note" }, "issueNumber"],
		["issueme_update_comment", { issueNumber: 1, commentId: unsafe, body: "Corrected note" }, "commentId"],
		["issueme_delete_comment", { issueNumber: 1, commentId: unsafe }, "commentId"],
		["issueme_close_issue", { number: unsafe }, "issueNumber"],
		["issueme_reopen_issue", { number: unsafe }, "issueNumber"],
		["issueme_add_sub_issue", { parentNumber: unsafe, childNumber: 2 }, "issueNumber"],
		["issueme_reorder_sub_issues", { parentNumber: unsafe, orderedChildNumbers: [2] }, "parentNumber"],
		["issueme_list_sub_issues", { issueNumber: unsafe }, "issueNumber"],
		["issueme_add_issue_to_project", { issueNumber: unsafe, projectId: "PVT_repo_1" }, "issueNumber"],
		["issueme_update_project_item", { projectId: "PVT_repo_1", itemId: "PVTI_1", issueNumber: unsafe, fieldId: "PVTSSF_status", valueType: "single_select", singleSelectOptionId: "opt_todo" }, "issueNumber"],
	];

	for (const [name, params, field] of cases) {
		const callCountBefore = calls.length;
		await assert.rejects(
			() => execute(tools.get(name), projectRoot, params),
			(error) => {
				assert.equal(error?.code, "invalid_tool_input", name);
				assert.equal(error.safeDetails?.field, field, name);
				return true;
			},
		);
		assert.equal(calls.length, callCountBefore, `${name} should fail before GitHub requests`);
	}
	assert.deepEqual(await readdir(projectRoot), []);
});

test("IssueMe tool runtime accepts an injected GitHubClient instance", async () => {
	const projectRoot = await tempProject();
	const mock = makeSuccessFetch();
	const pi = fakePi();
	registerIssueMeTools(pi, {
		runtime: {
			config,
			client: new GitHubClient({ repository, token: TOKEN, fetchFn: mock.fetchFn }),
		},
	});

	const result = await execute(pi.tools.get("issueme_create_issue"), projectRoot, { title: "Client injected", body: "Body", labels: [], assignees: [] });
	assert.equal(result.details.result, "success");
	assert.equal((await readJson(join(projectRoot, "issues", "11-client-injected.json"))).title, "Client injected");
	assert.ok(mock.calls.every((call) => call.authorization === `Bearer ${TOKEN}`));
	assertNoToken(result);
});

test("registered IssueMe tools keep safety paths mocked and token-free", async () => {
	const projectRoot = await tempProject();
	const mock = makeClosedFetch();
	const tools = registerInjectedTools(mock.fetchFn);

	await assert.rejects(
		() => execute(tools.get("issueme_create_issue"), projectRoot, { title: "   ", body: `private ${TOKEN}` }),
		(error) => error?.code === "invalid_tool_input" && !JSON.stringify(error).includes(TOKEN),
	);

	await assert.rejects(
		() => execute(tools.get("issueme_get_issue"), projectRoot, { number: 404 }),
		(error) => error?.code === "issue_not_found" && !JSON.stringify(error).includes(TOKEN),
	);

	await mkdir(join(projectRoot, "issues"), { recursive: true });
	await writeFile(join(projectRoot, "issues", "1-corrupt.json"), "{not json", "utf8");
	const syncResult = await execute(tools.get("issueme_sync_issues"), projectRoot, {});
	assert.equal(syncResult.details.counts.invalid, 1);
	assertNoToken(syncResult);

	for (const [name, params] of [
		["issueme_add_issue_to_project", { issueNumber: 99, projectId: "PVT_repo_1" }],
		["issueme_update_project_item", { projectId: "PVT_repo_1", itemId: "PVTI_99", issueNumber: 99, fieldId: "PVTSSF_status", valueType: "single_select", singleSelectOptionId: "opt_todo" }],
		["issueme_update_issue", { number: 99, body: `private ${TOKEN}` }],
		["issueme_comment_issue", { number: 99, body: `private ${TOKEN}` }],
		["issueme_update_comment", { issueNumber: 99, commentId: 1, body: `private ${TOKEN}` }],
		["issueme_delete_comment", { issueNumber: 99, commentId: 1 }],
		["issueme_assign_issue", { number: 99, action: "add", assignees: ["octocat"] }],
		["issueme_label_issue", { number: 99, action: "add", labels: ["bug"] }],
	]) {
		await assert.rejects(
			() => execute(tools.get(name), projectRoot, params),
			(error) => {
				assert.ok(error instanceof ClosedIssueMutationError);
				assert.equal(error.safeDetails.status, "closed_issue_mutation_refused");
				assertNoToken({ message: error.message, safeDetails: error.safeDetails });
				return true;
			},
			`${name} should refuse closed issues before mutation`,
		);
	}

	await writeIssueRecord(projectRoot, config, issueRecord(99, "Closed Target"));
	const closeResult = await execute(tools.get("issueme_close_issue"), projectRoot, { number: 99 });
	assert.equal(closeResult.details.status, "already_closed");
	assert.deepEqual(closeResult.details.removedPaths, ["issues/99-closed-target.json"]);
	assertNoToken(closeResult);

	assert.deepEqual(
		mock.calls.filter((call) => call.path === "/repos/owner/repo/issues/99").map((call) => call.method),
		["GET", "GET", "GET", "GET", "GET", "GET", "GET", "GET", "GET"],
	);
	assert.equal(mock.calls.some((call) => ["PATCH", "POST", "PUT", "DELETE"].includes(call.method)), false);
});
