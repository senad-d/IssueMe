import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { registerAssignIssueTool } from "../src/tools/assign-issue.ts";
import { registerCreateIssueTool } from "../src/tools/create-issue.ts";
import { registerLabelIssueTool } from "../src/tools/label-issue.ts";
import { registerUpdateIssueTool } from "../src/tools/update-issue.ts";

function githubIssue(overrides = {}) {
	return {
		number: 1,
		title: "Tool Target",
		state: "open",
		user: { login: "octocat" },
		body: "Body",
		labels: [],
		assignees: [],
		milestone: null,
		html_url: "https://github.com/owner/repo/issues/1",
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		...overrides,
	};
}

function issueFromPayload(payload = {}, overrides = {}) {
	const number = overrides.number ?? payload.number ?? 1;
	return githubIssue({
		number,
		title: typeof payload.title === "string" ? payload.title : `Issue ${number}`,
		body: typeof payload.body === "string" ? payload.body : "Body",
		labels: Array.isArray(payload.labels) ? payload.labels.map((name) => ({ name })) : [],
		assignees: Array.isArray(payload.assignees) ? payload.assignees.map((login) => ({ login })) : [],
		html_url: `https://github.com/owner/repo/issues/${number}`,
		...overrides,
	});
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json" },
	});
}

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

async function tempProject(config) {
	const root = await mkdtemp(join(tmpdir(), "issueme-sanitization-test-"));
	if (config !== undefined) {
		await mkdir(join(root, ".pi", "agent"), { recursive: true });
		await writeFile(join(root, ".pi", "agent", "issueme.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
	}
	return root;
}

function registerTools(options) {
	const pi = fakePi();
	registerCreateIssueTool(pi, options);
	registerUpdateIssueTool(pi, options);
	registerAssignIssueTool(pi, options);
	registerLabelIssueTool(pi, options);
	return pi.tools;
}

async function execute(tool, cwd, params) {
	return tool.execute("tool-call", params, undefined, undefined, {
		cwd,
		isProjectTrusted: () => true,
	});
}

async function withMockedIssueTools(fetchFn, callback, config) {
	const projectRoot = await tempProject(config);
	const tools = registerTools();
	const originalFetch = globalThis.fetch;
	const originalGhToken = process.env.GH_TOKEN;
	const originalGithubToken = process.env.GITHUB_TOKEN;
	const originalGithubRepository = process.env.GITHUB_REPOSITORY;
	globalThis.fetch = fetchFn;
	process.env.GH_TOKEN = "ghp_test_token";
	delete process.env.GITHUB_TOKEN;
	process.env.GITHUB_REPOSITORY = "owner/repo";
	try {
		return await callback({ projectRoot, tools });
	} finally {
		globalThis.fetch = originalFetch;
		restoreEnv("GH_TOKEN", originalGhToken);
		restoreEnv("GITHUB_TOKEN", originalGithubToken);
		restoreEnv("GITHUB_REPOSITORY", originalGithubRepository);
	}
}

test("issueme_create_issue applies configured defaults only when label and assignee fields are omitted", async () => {
	const requests = [];
	let nextIssueNumber = 1;
	const config = {
		defaultLabels: [" default ", "default", "triaged", ""],
		defaultAssignees: [" octocat ", "octocat", ""],
	};

	await withMockedIssueTools(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		requests.push({ path: url.pathname, method: init.method, body });
		if (url.pathname === "/repos/owner/repo/issues" && init.method === "POST") {
			return jsonResponse(issueFromPayload(body, { number: nextIssueNumber++ }));
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, tools }) => {
		await execute(tools.get("issueme_create_issue"), projectRoot, { title: "  Uses defaults  ", body: "Body" });
		await execute(tools.get("issueme_create_issue"), projectRoot, { title: "No defaults", body: "Body", labels: [], assignees: [] });

		assert.deepEqual(requests.map((request) => `${request.method} ${request.path}`), [
			"POST /repos/owner/repo/issues",
			"POST /repos/owner/repo/issues",
		]);
		assert.equal(requests[0].body.title, "Uses defaults");
		assert.deepEqual(requests[0].body.labels, ["default", "triaged"]);
		assert.deepEqual(requests[0].body.assignees, ["octocat"]);
		assert.deepEqual(requests[1].body.labels, []);
		assert.deepEqual(requests[1].body.assignees, []);
	}, config);
});

test("restricted issueme_create_issue verifies authenticated user before remote create", async () => {
	const restrictedConfig = { allowedIssueCreator: "hubot" };
	const requests = [];
	await withMockedIssueTools(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		requests.push(`${init.method} ${url.pathname}`);
		if (url.pathname === "/user" && init.method === "GET") return jsonResponse({ login: "Hubot" });
		if (url.pathname === "/repos/owner/repo/issues" && init.method === "POST") {
			return jsonResponse(issueFromPayload(body, { number: 7, user: { login: "Hubot" } }));
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, tools }) => {
		const result = await execute(tools.get("issueme_create_issue"), projectRoot, { title: "Restricted create", body: "Body" });
		assert.deepEqual(requests, ["GET /user", "POST /repos/owner/repo/issues"]);
		assert.equal(result.details.creatorScope, "hubot");
		assert.equal(result.details.issue.creator, "Hubot");
		const cached = JSON.parse(await readFile(join(projectRoot, "issues", "7-restricted-create.json"), "utf8"));
		assert.equal(cached.creator, "Hubot");
	}, restrictedConfig);

	const deniedRequests = [];
	await withMockedIssueTools(async (input, init) => {
		const url = new URL(input.toString());
		deniedRequests.push(`${init.method} ${url.pathname}`);
		if (url.pathname === "/user" && init.method === "GET") return jsonResponse({ login: "intruder" });
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, tools }) => {
		await assert.rejects(
			() => execute(tools.get("issueme_create_issue"), projectRoot, { title: "Denied", body: "Body" }),
			(error) => error?.code === "issue_creator_not_allowed" && error.safeDetails?.authenticatedUser === "intruder",
		);
		assert.deepEqual(deniedRequests, ["GET /user"]);
	}, restrictedConfig);
});

test("restricted issueme_update_issue refuses out-of-scope issues before mutation", async () => {
	const requests = [];
	await withMockedIssueTools(async (input, init) => {
		const url = new URL(input.toString());
		requests.push(`${init.method} ${url.pathname}`);
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") {
			return jsonResponse(githubIssue({ user: { login: "intruder" }, body: "PRIVATE INTRUDER BODY" }));
		}
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, tools }) => {
		await assert.rejects(
			() => execute(tools.get("issueme_update_issue"), projectRoot, { number: 1, title: "Should not patch" }),
			(error) => {
				assert.equal(error?.code, "issue_creator_not_allowed");
				assert.equal(error.safeDetails?.creator, "intruder");
				assert.doesNotMatch(error.message, /PRIVATE/);
				return true;
			},
		);
		assert.deepEqual(requests, ["GET /repos/owner/repo/issues/1"]);
	}, { allowedIssueCreator: "hubot" });
});

test("invalid loaded allowedIssueCreator blocks tools before GitHub requests", async () => {
	const requests = [];
	await withMockedIssueTools(async (input, init) => {
		const url = new URL(input.toString());
		requests.push(`${init.method} ${url.pathname}`);
		return jsonResponse(issueFromPayload());
	}, async ({ projectRoot, tools }) => {
		await assert.rejects(
			() => execute(tools.get("issueme_create_issue"), projectRoot, { title: "Should not create", body: "Body" }),
			(error) => {
				assert.equal(error?.code, "config_tui_invalid_setting");
				assert.equal(error.safeDetails?.field, "allowedIssueCreator");
				assert.match(error.message, /Allowed issue creator/);
				return true;
			},
		);
		assert.deepEqual(requests, []);
	}, { allowedIssueCreator: "bad login" });
});

test("non-object loaded config roots block tools before GitHub requests", async () => {
	for (const invalidRoot of [[], null, 42, "not-an-object"]) {
		const requests = [];
		await withMockedIssueTools(async (input, init) => {
			const url = new URL(input.toString());
			requests.push(`${init.method} ${url.pathname}`);
			return jsonResponse(issueFromPayload());
		}, async ({ projectRoot, tools }) => {
			await assert.rejects(
				() => execute(tools.get("issueme_create_issue"), projectRoot, { title: "Should not create", body: "Body" }),
				(error) => error?.code === "config_root_invalid" && error.safeDetails?.field === "config",
			);
			assert.deepEqual(requests, []);
		}, invalidRoot);
	}
});

test("IssueMe create, update, assign, and label tools trim, de-duplicate, and drop blank list values consistently", async () => {
	const requests = [];
	await withMockedIssueTools(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		requests.push({ path: url.pathname, method: init.method, body });
		const labelMatch = url.pathname.match(/^\/repos\/owner\/repo\/labels\/([^/]+)$/);
		if (labelMatch && init.method === "GET") return jsonResponse({ name: decodeURIComponent(labelMatch[1]) });
		const assigneeMatch = url.pathname.match(/^\/repos\/owner\/repo\/assignees\/([^/]+)$/);
		if (assigneeMatch && init.method === "GET") return new Response(null, { status: 204, statusText: "No Content" });
		if (url.pathname === "/repos/owner/repo/issues" && init.method === "POST") return jsonResponse(issueFromPayload(body));
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") return jsonResponse(githubIssue());
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "PATCH") return jsonResponse(issueFromPayload(body));
		if (url.pathname === "/repos/owner/repo/issues/1/comments" && init.method === "GET") return jsonResponse([]);
		if (url.pathname === "/repos/owner/repo/issues/1/assignees" && init.method === "POST") return jsonResponse(issueFromPayload(body));
		if (url.pathname === "/repos/owner/repo/issues/1/labels" && init.method === "POST") return jsonResponse(body.labels.map((name) => ({ name })));
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, tools }) => {
		const noisyLabels = [" bug ", "bug", "", " triaged ", "   "];
		const noisyAssignees = [" octocat ", "octocat", "", " hubot ", "   "];
		await execute(tools.get("issueme_create_issue"), projectRoot, { title: "Create", body: "Body", labels: noisyLabels, assignees: noisyAssignees });
		await execute(tools.get("issueme_update_issue"), projectRoot, { number: 1, labels: noisyLabels, assignees: noisyAssignees });
		await execute(tools.get("issueme_assign_issue"), projectRoot, { number: 1, action: "add", assignees: noisyAssignees });
		await execute(tools.get("issueme_label_issue"), projectRoot, { number: 1, action: "add", labels: noisyLabels });
	});

	const requestBodies = requests.map((request) => [`${request.method} ${request.path}`, request.body]);
	assert.deepEqual(requestBodies.find(([key]) => key === "POST /repos/owner/repo/issues")?.[1].labels, ["bug", "triaged"]);
	assert.deepEqual(requestBodies.find(([key]) => key === "POST /repos/owner/repo/issues")?.[1].assignees, ["octocat", "hubot"]);
	assert.deepEqual(requestBodies.find(([key]) => key === "PATCH /repos/owner/repo/issues/1")?.[1].labels, ["bug", "triaged"]);
	assert.deepEqual(requestBodies.find(([key]) => key === "PATCH /repos/owner/repo/issues/1")?.[1].assignees, ["octocat", "hubot"]);
	assert.deepEqual(requestBodies.find(([key]) => key === "POST /repos/owner/repo/issues/1/assignees")?.[1].assignees, ["octocat", "hubot"]);
	assert.deepEqual(requestBodies.find(([key]) => key === "POST /repos/owner/repo/issues/1/labels")?.[1].labels, ["bug", "triaged"]);
});

test("collection limits reject direct tool execution before runtime resolution", async () => {
	const projectRoot = await tempProject();
	let runtimeCalls = 0;
	const tools = registerTools({
		runtime: () => {
			runtimeCalls += 1;
			throw new Error("runtime resolution must not run for over-limit input");
		},
	});
	const tooManyLabels = Array.from({ length: 26 }, (_, index) => `label-${index}`);
	const tooManyAssignees = Array.from({ length: 26 }, (_, index) => `user-${index}`);
	for (const [name, params, field] of [
		["issueme_create_issue", { title: "Create", body: "Body", labels: tooManyLabels }, "labels"],
		["issueme_create_issue", { title: "Create", body: "Body", assignees: tooManyAssignees }, "assignees"],
		["issueme_update_issue", { number: 1, labels: tooManyLabels }, "labels"],
		["issueme_update_issue", { number: 1, assignees: tooManyAssignees }, "assignees"],
		["issueme_assign_issue", { number: 1, action: "set", assignees: tooManyAssignees }, "assignees"],
		["issueme_label_issue", { number: 1, action: "set", labels: tooManyLabels }, "labels"],
	]) {
		await assert.rejects(
			() => execute(tools.get(name), projectRoot, params),
			(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === field && error.safeDetails?.max === 25,
		);
	}
	assert.equal(runtimeCalls, 0);
});

test("set-style updates honor explicit empty arrays for labels and assignees", async () => {
	const requests = [];
	await withMockedIssueTools(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		requests.push({ path: url.pathname, method: init.method, body });
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") return jsonResponse(githubIssue());
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "PATCH") return jsonResponse(issueFromPayload(body));
		if (url.pathname === "/repos/owner/repo/issues/1/comments" && init.method === "GET") return jsonResponse([]);
		if (url.pathname === "/repos/owner/repo/issues/1/labels" && init.method === "PUT") return jsonResponse([]);
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, tools }) => {
		await execute(tools.get("issueme_update_issue"), projectRoot, { number: 1, labels: [], assignees: [] });
		await execute(tools.get("issueme_assign_issue"), projectRoot, { number: 1, action: "set", assignees: [] });
		await execute(tools.get("issueme_label_issue"), projectRoot, { number: 1, action: "set", labels: [] });
	});

	const patchBodies = requests.filter((request) => request.method === "PATCH" && request.path === "/repos/owner/repo/issues/1").map((request) => request.body);
	assert.deepEqual(patchBodies[0].labels, []);
	assert.deepEqual(patchBodies[0].assignees, []);
	assert.deepEqual(patchBodies[1].assignees, []);
	assert.deepEqual(requests.find((request) => request.method === "PUT" && request.path === "/repos/owner/repo/issues/1/labels")?.body.labels, []);
});

test("issueme_update_issue omits body by default and clears it only for an explicit empty string", async () => {
	const patchBodies = [];
	await withMockedIssueTools(async (input, init) => {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "PATCH") patchBodies.push(body);
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "GET") return jsonResponse(githubIssue());
		if (url.pathname === "/repos/owner/repo/issues/1" && init.method === "PATCH") return jsonResponse(issueFromPayload(body));
		if (url.pathname === "/repos/owner/repo/issues/1/comments" && init.method === "GET") return jsonResponse([]);
		throw new Error(`Unexpected GitHub mock request: ${init.method} ${url.toString()}`);
	}, async ({ projectRoot, tools }) => {
		await execute(tools.get("issueme_update_issue"), projectRoot, { number: 1, title: "Updated title" });
		await execute(tools.get("issueme_update_issue"), projectRoot, { number: 1, body: "" });
		await assert.rejects(
			() => execute(tools.get("issueme_update_issue"), projectRoot, { number: 1, body: "   " }),
			(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === "body" && /explicit empty string/.test(error.message),
		);
	});

	assert.equal(Object.hasOwn(patchBodies[0], "body"), false);
	assert.equal(patchBodies[1].body, "");
});

test("blank issue titles and blank-only additive list values fail with safe IssueMe errors", async () => {
	await withMockedIssueTools(async () => {
		throw new Error("No GitHub requests should be made for invalid local tool input.");
	}, async ({ projectRoot, tools }) => {
		for (const [name, params] of [
			["issueme_create_issue", { title: "   ", body: "Private body should not leak" }],
			["issueme_update_issue", { number: 1, title: "\t\n" }],
		]) {
			await assert.rejects(
				() => execute(tools.get(name), projectRoot, params),
				(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === "title" && !/Private body/.test(error.message),
				`${name} should reject blank titles safely`,
			);
		}

		for (const [name, params, field] of [
			["issueme_assign_issue", { number: 1, action: "add", assignees: [" ", ""] }, "assignees"],
			["issueme_label_issue", { number: 1, action: "remove", labels: [" ", ""] }, "labels"],
		]) {
			await assert.rejects(
				() => execute(tools.get(name), projectRoot, params),
				(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === field && !/ghp_test_token/.test(error.message),
				`${name} should reject blank-only ${field} safely`,
			);
		}

		for (const [name, params, field] of [
			["issueme_create_issue", { title: "Create", body: "Body", labels: ["safe", "bad\0label"] }, "labels"],
			["issueme_update_issue", { number: 1, assignees: ["octocat", "bad\0login"] }, "assignees"],
			["issueme_assign_issue", { number: 1, action: "set", assignees: ["bad\0login"] }, "assignees"],
			["issueme_label_issue", { number: 1, action: "set", labels: ["bad\0label"] }, "labels"],
		]) {
			await assert.rejects(
				() => execute(tools.get(name), projectRoot, params),
				(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === field && /null bytes/.test(error.message) && !/ghp_test_token/.test(error.message),
				`${name} should reject null-byte ${field} safely`,
			);
		}

		for (const [name, params, field] of [
			["issueme_create_issue", { title: "Create", body: "Body", labels: ["bad\nlabel"] }, "labels"],
			["issueme_label_issue", { number: 1, action: "set", labels: ["bad\nlabel"] }, "labels"],
		]) {
			await assert.rejects(
				() => execute(tools.get(name), projectRoot, params),
				(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === field && /one line/.test(error.message) && !/ghp_test_token/.test(error.message),
				`${name} should reject multi-line ${field} safely`,
			);
		}

		for (const [name, params] of [
			["issueme_create_issue", { title: "Create", body: "Body", assignees: ["bad login"] }],
			["issueme_update_issue", { number: 1, assignees: ["-bad"] }],
			["issueme_assign_issue", { number: 1, action: "set", assignees: ["bad_login?"] }],
		]) {
			await assert.rejects(
				() => execute(tools.get(name), projectRoot, params),
				(error) => error?.code === "invalid_tool_input" && error.safeDetails?.field === "assignees" && /valid GitHub usernames/.test(error.message) && !/ghp_test_token/.test(error.message),
				`${name} should reject invalid assignee usernames safely`,
			);
		}
	});
});

function restoreEnv(name, value) {
	if (value === undefined) delete process.env[name];
	else process.env[name] = value;
}
