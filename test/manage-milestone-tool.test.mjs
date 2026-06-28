import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ISSUEME_ERROR_CODES, GitHubApiError } from "../src/errors.ts";
import { registerManageMilestoneTool } from "../src/tools/manage-milestone.ts";

const TOKEN = "ghp_manage_milestones_secret";
const REPOSITORY = "owner/repo";
const config = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-manage-milestone-tool-"));
}

function registerTool(fetchFn) {
	const pi = fakePi();
	registerManageMilestoneTool(pi, {
		runtime: {
			config,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	});
	return pi.tools.get("issueme_manage_milestone");
}

async function executeManageMilestoneTool(fetchFn, params) {
	return registerTool(fetchFn).execute("call", params, undefined, undefined, {
		cwd: await tempProject(),
		isProjectTrusted: () => true,
	});
}

function milestone(number, title, overrides = {}) {
	return {
		number,
		title,
		state: "open",
		description: `${title} milestone`,
		due_on: "2026-07-01T00:00:00Z",
		open_issues: 3,
		closed_issues: 2,
		html_url: `https://github.com/${REPOSITORY}/milestone/${number}`,
		url: `https://api.github.com/repos/${REPOSITORY}/milestones/${number}`,
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

function assertNoToken(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TOKEN));
}

test("issueme_manage_milestone creates, updates, closes, reopens, and deletes repository milestones", async () => {
	const calls = [];
	const fetchFn = async (url, init) => {
		const requestUrl = new URL(url.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method: init.method, path: requestUrl.pathname, body, authorization: init.headers?.Authorization });
		if (requestUrl.pathname === "/repos/owner/repo/milestones" && init.method === "POST") {
			return jsonResponse(milestone(1, body.title, { description: body.description, due_on: body.due_on }), { status: 201, statusText: "Created" });
		}
		if (requestUrl.pathname === "/repos/owner/repo/milestones/1" && init.method === "PATCH" && body.title) {
			return jsonResponse(milestone(1, body.title, { description: body.description, due_on: body.due_on }));
		}
		if (requestUrl.pathname === "/repos/owner/repo/milestones/1" && init.method === "PATCH" && body.state === "closed") {
			return jsonResponse(milestone(1, "v1.1", { state: "closed" }));
		}
		if (requestUrl.pathname === "/repos/owner/repo/milestones/1" && init.method === "PATCH" && body.state === "open") {
			return jsonResponse(milestone(1, "v1.1", { state: "open" }));
		}
		if (requestUrl.pathname === "/repos/owner/repo/milestones/1" && init.method === "DELETE") {
			return new Response(null, { status: 204, statusText: "No Content" });
		}
		throw new Error(`Unexpected request ${init.method} ${requestUrl.pathname}`);
	};

	const tool = registerTool(fetchFn);
	const ctx = { cwd: await tempProject(), isProjectTrusted: () => true };
	const created = await tool.execute("call", { action: "create", title: "v1.0", description: "First release", dueOn: "2026-07-01" }, undefined, undefined, ctx);
	const updated = await tool.execute("call", { action: "update", number: 1, title: "v1.1", description: "Second release", dueOn: "2026-08-15T12:00:00Z" }, undefined, undefined, ctx);
	const closed = await tool.execute("call", { action: "close", number: 1 }, undefined, undefined, ctx);
	const reopened = await tool.execute("call", { action: "reopen", number: 1 }, undefined, undefined, ctx);
	const deleted = await tool.execute("call", { action: "delete", number: 1, confirmDelete: true }, undefined, undefined, ctx);

	assert.equal(created.details.status, "milestone_created");
	assert.deepEqual(created.details.milestones[0], {
		number: 1,
		title: "v1.0",
		state: "open",
		description: "First release",
		due_on: "2026-07-01T00:00:00Z",
		open_issues: 3,
		closed_issues: 2,
		html_url: "https://github.com/owner/repo/milestone/1",
		url: "https://api.github.com/repos/owner/repo/milestones/1",
	});
	assert.equal(updated.details.status, "milestone_updated");
	assert.deepEqual(updated.details.changedFields, ["title", "description", "due_on"]);
	assert.equal(updated.details.milestones[0].title, "v1.1");
	assert.equal(closed.details.status, "milestone_closed");
	assert.equal(closed.details.milestones[0].state, "closed");
	assert.equal(reopened.details.status, "milestone_reopened");
	assert.equal(reopened.details.milestones[0].state, "open");
	assert.equal(deleted.details.status, "milestone_deleted");
	assert.match(deleted.content[0].text, /does not delete issues/);
	assert.equal(deleted.details.cacheUpdated, false);
	assert.equal(deleted.details.needsSync, false);
	assert.deepEqual(calls.map((call) => [call.method, call.path]), [
		["POST", "/repos/owner/repo/milestones"],
		["PATCH", "/repos/owner/repo/milestones/1"],
		["PATCH", "/repos/owner/repo/milestones/1"],
		["PATCH", "/repos/owner/repo/milestones/1"],
		["DELETE", "/repos/owner/repo/milestones/1"],
	]);
	assert.equal(calls[0].body.due_on, "2026-07-01T00:00:00Z");
	assert.equal(calls[1].body.due_on, "2026-08-15T12:00:00Z");
	assert.deepEqual(calls[2].body, { state: "closed" });
	assert.deepEqual(calls[3].body, { state: "open" });
	assert.ok(calls.every((call) => call.authorization === `Bearer ${TOKEN}`));
	assertNoToken({ created, updated, closed, reopened, deleted });
});

test("issueme_manage_milestone rejects invalid titles, due dates, and unsafe delete inputs before fetch", async () => {
	let calls = 0;
	const fetchFn = async () => {
		calls += 1;
		return jsonResponse(milestone(1, "unexpected"));
	};
	for (const params of [
		{ action: "create", title: " " },
		{ action: "create", number: 1, title: "v1" },
		{ action: "update", number: 1 },
		{ action: "update", number: 1, dueOn: "not-a-date" },
		{ action: "update", number: 1, dueOn: "2026-02-30" },
		{ action: "update", number: 1, dueOn: "2026-07-01", clearDueOn: true },
		{ action: "close", number: 1, title: "v1" },
		{ action: "delete", number: 1 },
		{ action: "delete", number: 1, title: "v1", confirmDelete: true },
		{ action: "delete" },
	]) {
		await assert.rejects(
			() => executeManageMilestoneTool(fetchFn, params),
			(error) => error?.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			`expected validation failure for ${JSON.stringify(params)}`,
		);
	}
	assert.equal(calls, 0);
});

test("issueme_manage_milestone returns actionable duplicate, missing, and absent results", async () => {
	const createConflict = await executeManageMilestoneTool(async () => jsonResponse({ message: `already exists ${TOKEN}` }, { status: 422, statusText: "Unprocessable Entity" }), {
		action: "create",
		title: "v1.0",
	});
	assert.equal(createConflict.details.result, "error");
	assert.equal(createConflict.details.status, "milestone_create_conflict");
	assert.equal(createConflict.details.needsSync, false);
	assert.match(createConflict.content[0].text, /duplicate title/);
	assertNoToken(createConflict);

	const updateMissing = await executeManageMilestoneTool(async () => jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" }), {
		action: "update",
		number: 123,
		title: "v1.1",
	});
	assert.equal(updateMissing.details.result, "error");
	assert.equal(updateMissing.details.status, "milestone_not_found");
	assert.match(updateMissing.content[0].text, /list milestones/);
	assertNoToken(updateMissing);

	const deleteMissing = await executeManageMilestoneTool(async () => jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" }), {
		action: "delete",
		number: 123,
		confirmDelete: true,
	});
	assert.equal(deleteMissing.details.result, "success");
	assert.equal(deleteMissing.details.status, "milestone_already_absent");
	assert.match(deleteMissing.content[0].text, /already absent/);
	assertNoToken(deleteMissing);
});

test("issueme_manage_milestone surfaces unexpected permission and API failures safely", async () => {
	await assert.rejects(
		() => executeManageMilestoneTool(async () => jsonResponse({ message: `forbidden ${TOKEN}` }, { status: 403, statusText: "Forbidden" }), {
			action: "update",
			number: 1,
			title: "v1.1",
		}),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assert.match(error.message, /403 Forbidden/);
			assert.doesNotMatch(error.message, new RegExp(TOKEN));
			return true;
		},
	);
});
