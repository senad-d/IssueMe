import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ISSUEME_ERROR_CODES, GitHubApiError } from "../src/errors.ts";
import { registerManageLabelTool } from "../src/tools/manage-label.ts";

const TOKEN = "ghp_manage_labels_secret";
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
	return mkdtemp(join(tmpdir(), "issueme-manage-label-tool-"));
}

function registerTool(fetchFn) {
	const pi = fakePi();
	registerManageLabelTool(pi, {
		runtime: {
			config,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	});
	return pi.tools.get("issueme_manage_label");
}

async function executeManageLabelTool(fetchFn, params) {
	return registerTool(fetchFn).execute("call", params, undefined, undefined, {
		cwd: await tempProject(),
		isProjectTrusted: () => true,
	});
}

function label(name, overrides = {}) {
	return {
		name,
		description: `${name} label`,
		color: "d73a4a",
		default: false,
		url: `https://api.github.com/repos/${REPOSITORY}/labels/${encodeURIComponent(name)}`,
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

test("issueme_manage_label creates, updates, and deletes repository labels", async () => {
	const calls = [];
	const fetchFn = async (url, init) => {
		const requestUrl = new URL(url.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method: init.method, path: requestUrl.pathname, body, authorization: init.headers?.Authorization });
		if (requestUrl.pathname === "/repos/owner/repo/labels" && init.method === "POST") {
			return jsonResponse(label(body.name, { color: body.color, description: body.description }), { status: 201, statusText: "Created" });
		}
		if (requestUrl.pathname === "/repos/owner/repo/labels/triage" && init.method === "PATCH") {
			return jsonResponse(label(body.new_name, { color: body.color, description: body.description }));
		}
		if (requestUrl.pathname === "/repos/owner/repo/labels/needs%20triage" && init.method === "DELETE") {
			return new Response(null, { status: 204, statusText: "No Content" });
		}
		throw new Error(`Unexpected request ${init.method} ${requestUrl.pathname}`);
	};

	const tool = registerTool(fetchFn);
	const ctx = { cwd: await tempProject(), isProjectTrusted: () => true };
	const created = await tool.execute("call", { action: "create", name: "triage", color: "#D73A4A", description: "Needs triage" }, undefined, undefined, ctx);
	const updated = await tool.execute("call", { action: "update", name: "triage", newName: "needs triage", color: "fbca04", description: "Ready for triage" }, undefined, undefined, ctx);
	const deleted = await tool.execute("call", { action: "delete", name: "needs triage", confirmDelete: true }, undefined, undefined, ctx);

	assert.equal(created.details.status, "label_created");
	assert.deepEqual(created.details.labels[0], {
		name: "triage",
		description: "Needs triage",
		color: "d73a4a",
		default: false,
		url: "https://api.github.com/repos/owner/repo/labels/triage",
	});
	assert.equal(updated.details.status, "label_updated");
	assert.deepEqual(updated.details.changedFields, ["name", "color", "description"]);
	assert.equal(updated.details.labels[0].name, "needs triage");
	assert.equal(deleted.details.status, "label_deleted");
	assert.match(deleted.content[0].text, /does not delete issues/);
	assert.equal(deleted.details.cacheUpdated, false);
	assert.equal(deleted.details.needsSync, false);
	assert.deepEqual(calls.map((call) => [call.method, call.path]), [
		["POST", "/repos/owner/repo/labels"],
		["PATCH", "/repos/owner/repo/labels/triage"],
		["DELETE", "/repos/owner/repo/labels/needs%20triage"],
	]);
	assert.equal(calls[0].body.color, "d73a4a");
	assert.ok(calls.every((call) => call.authorization === `Bearer ${TOKEN}`));
	assertNoToken({ created, updated, deleted });
});

test("issueme_manage_label returns retry-safe partial success for malformed accepted responses", async () => {
	const result = await executeManageLabelTool(
		async () => jsonResponse({}, { status: 201, statusText: "Created" }),
		{ action: "create", name: "triage", color: "d73a4a" },
	);
	assert.equal(result.details.result, "partial_success");
	assert.equal(result.details.status, "label_create_response_partial_success");
	assert.equal(result.details.error.details.mutationSettlement, "remote_success_known");
	assert.match(result.content[0].text, /Do not repeat the mutation blindly/);
});

test("issueme_manage_label rejects invalid names, colors, and unsafe delete inputs before fetch", async () => {
	let calls = 0;
	const fetchFn = async () => {
		calls += 1;
		return jsonResponse(label("unexpected"));
	};
	for (const params of [
		{ action: "create", name: " ", color: "d73a4a" },
		{ action: "create", name: "bug", color: "not-a-color" },
		{ action: "create", name: "bug" },
		{ action: "update", name: "bug" },
		{ action: "delete", name: "bug" },
		{ action: "delete", name: "bug", color: "d73a4a", confirmDelete: true },
	]) {
		await assert.rejects(
			() => executeManageLabelTool(fetchFn, params),
			(error) => error?.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			`expected validation failure for ${JSON.stringify(params)}`,
		);
	}
	assert.equal(calls, 0);
});

test("issueme_manage_label returns actionable duplicate and missing-label results", async () => {
	const createConflict = await executeManageLabelTool(async () => jsonResponse({ message: `already exists ${TOKEN}` }, { status: 422, statusText: "Unprocessable Entity" }), {
		action: "create",
		name: "bug",
		color: "d73a4a",
	});
	assert.equal(createConflict.details.result, "error");
	assert.equal(createConflict.details.status, "label_create_conflict");
	assert.equal(createConflict.details.needsSync, false);
	assert.match(createConflict.content[0].text, /use issueme_manage_label with action "update"/);
	assertNoToken(createConflict);

	const updateMissing = await executeManageLabelTool(async () => jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" }), {
		action: "update",
		name: "missing",
		color: "0e8a16",
	});
	assert.equal(updateMissing.details.result, "error");
	assert.equal(updateMissing.details.status, "label_not_found");
	assert.match(updateMissing.content[0].text, /create it first/);
	assertNoToken(updateMissing);

	const deleteMissing = await executeManageLabelTool(async () => jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" }), {
		action: "delete",
		name: "missing",
		confirmDelete: true,
	});
	assert.equal(deleteMissing.details.result, "success");
	assert.equal(deleteMissing.details.status, "label_already_absent");
	assert.match(deleteMissing.content[0].text, /already absent/);
	assertNoToken(deleteMissing);
});

test("issueme_manage_label surfaces unexpected API failures safely", async () => {
	await assert.rejects(
		() => executeManageLabelTool(async () => jsonResponse({ message: `server saw ${TOKEN}` }, { status: 500, statusText: "Server Error" }), {
			action: "update",
			name: "bug",
			color: "0e8a16",
		}),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assert.match(error.message, /500 Server Error/);
			assert.doesNotMatch(error.message, new RegExp(TOKEN));
			return true;
		},
	);
});

test("issueme_manage_label covers description clearing, no-op rename text, and update conflicts", async () => {
	const calls = [];
	const cleared = await executeManageLabelTool(async (url, init) => {
		const requestUrl = new URL(url.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method: init.method, path: requestUrl.pathname, body });
		assert.equal(requestUrl.pathname, "/repos/owner/repo/labels/triage");
		assert.equal(init.method, "PATCH");
		return jsonResponse(label("triage", { description: "", color: body.color }));
	}, {
		action: "update",
		name: "triage",
		newName: "triage",
		color: "#0E8A16",
		description: "",
	});

	assert.equal(cleared.details.result, "success");
	assert.deepEqual(cleared.details.changedFields, ["name", "color", "description"]);
	assert.equal(cleared.details.labels[0].name, "triage");
	assert.equal(cleared.details.labels[0].description, undefined);
	assert.deepEqual(calls[0].body, { new_name: "triage", color: "0e8a16", description: "" });
	assert.match(cleared.content[0].text, /description cleared/);
	assert.doesNotMatch(cleared.content[0].text, /renamed from/);
	assertNoToken(cleared);

	const conflict = await executeManageLabelTool(async () => jsonResponse({ message: `duplicate target ${TOKEN}` }, { status: 422, statusText: "Unprocessable Entity" }), {
		action: "update",
		name: "triage",
		newName: "bug",
	});
	assert.equal(conflict.details.result, "error");
	assert.equal(conflict.details.status, "label_update_conflict");
	assert.deepEqual(conflict.details.labels[0], { name: "bug" });
	assert.doesNotMatch(conflict.details.error.message, new RegExp(TOKEN));
	assertNoToken(conflict);
});

test("issueme_manage_label rejects action-specific field, length, and control-character edge cases", async () => {
	let calls = 0;
	const fetchFn = async () => {
		calls += 1;
		return jsonResponse(label("unexpected"));
	};
	for (const params of [
		{ action: "update", name: "bug", color: "0e8a16", confirmDelete: true },
		{ action: "create", name: `${"x".repeat(51)}`, color: "0e8a16" },
		{ action: "create", name: "bug\nnext", color: "0e8a16" },
		{ action: "update", name: "bug", description: `${"x".repeat(101)}` },
		{ action: "update", name: "bug", description: "bad\0description" },
	]) {
		await assert.rejects(
			() => executeManageLabelTool(fetchFn, params),
			(error) => error?.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			`expected label validation failure for ${JSON.stringify(params)}`,
		);
	}
	assert.equal(calls, 0);
});
