import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import {
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
	SettingsManager,
} from "@earendil-works/pi-coding-agent";

import { writeIssueRecord } from "../src/issues/store.ts";
import { registerIssueMeTools } from "../src/tools/issueme-tools.ts";

const TOKEN = "ghp_pi_runner_test_token";
const REPOSITORY = "owner/repo";
const CONFIG = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };
const ZERO_USAGE = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function githubIssue(number, title, overrides = {}) {
	const { labels = [], assignees = [], commentsCount, ...rest } = overrides;
	return {
		node_id: `ISSUE_${number}`,
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
		comments: commentsCount ?? 0,
		labels: labels.map((name) => ({ name })),
		assignees: assignees.map((login) => ({ login })),
	};
}

function issueRecord(number, title, overrides = {}) {
	return {
		schemaVersion: 1,
		repository: REPOSITORY,
		number,
		title,
		state: "open",
		body: "Cached body",
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
		headers: { "content-type": "application/json" },
	});
}

function fakePi() {
	const tools = [];
	return {
		tools,
		registerTool(tool) { tools.push(tool); },
	};
}

function collectIssueMeTools(fetchFn) {
	const pi = fakePi();
	registerIssueMeTools(pi, {
		runtime: {
			config: CONFIG,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	});
	return pi.tools;
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-pi-runner-test-"));
}

async function readJson(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

function assistantMessage(content, stopReason = "stop", overrides = {}) {
	return {
		role: "assistant",
		content,
		api: "openai-completions",
		provider: "issueme-mock",
		model: "tool-batch",
		usage: ZERO_USAGE,
		stopReason,
		timestamp: Date.now(),
		...overrides,
	};
}

function makeToolBatchStream(toolCalls) {
	let responseIndex = 0;
	return (_model, _context, options = {}) => {
		const stream = createAssistantMessageEventStream();
		const aborted = options.signal?.aborted;
		const message = aborted
			? assistantMessage([{ type: "text", text: "aborted" }], "aborted", { errorMessage: "aborted" })
			: responseIndex++ === 0
				? assistantMessage(toolCalls.map((call, index) => ({
					type: "toolCall",
					id: `issueme-call-${index + 1}`,
					name: call.name,
					arguments: call.params,
				})), "toolUse")
				: assistantMessage([{ type: "text", text: "IssueMe tool batch complete." }]);
		stream.end(message);
		return stream;
	};
}

async function runIssueMeToolBatchThroughPiSession(projectRoot, fetchFn, toolCalls, options = {}) {
	const authStorage = AuthStorage.inMemory();
	authStorage.setRuntimeApiKey("issueme-mock", "mock-key");
	const modelRegistry = ModelRegistry.inMemory(authStorage);
	modelRegistry.registerProvider("issueme-mock", {
		name: "IssueMe Mock Provider",
		baseUrl: "http://localhost/issueme-mock",
		api: "openai-completions",
		apiKey: "mock-key",
		streamSimple: makeToolBatchStream(toolCalls),
		models: [
			{
				id: "tool-batch",
				name: "Tool Batch",
				reasoning: false,
				input: ["text"],
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
				contextWindow: 8192,
				maxTokens: 1024,
			},
		],
	});
	const model = modelRegistry.find("issueme-mock", "tool-batch");
	assert.ok(model, "mock model should be registered");

	const settingsManager = SettingsManager.inMemory(
		{ compaction: { enabled: false }, retry: { enabled: false } },
		{ projectTrusted: true },
	);
	const agentDir = join(projectRoot, ".pi-agent-test");
	const resourceLoader = new DefaultResourceLoader({
		cwd: projectRoot,
		agentDir,
		settingsManager,
		noExtensions: true,
		noSkills: true,
		noPromptTemplates: true,
		noThemes: true,
		noContextFiles: true,
		systemPrompt: "Test IssueMe same-turn tool scheduling with mocked GitHub.",
	});
	await resourceLoader.reload();

	const { session } = await createAgentSession({
		cwd: projectRoot,
		agentDir,
		authStorage,
		modelRegistry,
		model,
		thinkingLevel: "off",
		customTools: collectIssueMeTools(fetchFn),
		tools: [...new Set(toolCalls.map((call) => call.name))],
		resourceLoader,
		sessionManager: SessionManager.inMemory(projectRoot),
		settingsManager,
	});
	options.sessionRef && (options.sessionRef.session = session);

	const events = [];
	const toolResults = [];
	const unsubscribe = session.subscribe((event) => {
		events.push(event);
		if (event.type === "message_end" && event.message.role === "toolResult") toolResults.push(event.message);
	});

	try {
		await session.prompt("Run the mocked same-turn IssueMe tool batch.", { expandPromptTemplates: false, source: "rpc" });
	} finally {
		unsubscribe();
		session.dispose();
	}

	return { events, toolResults };
}

function makeIssueFetch(sessionRef) {
	const calls = [];
	const issues = new Map([[10, githubIssue(10, "Original Title")]]);
	const comments = new Map([[10, []]]);

	const fetchFn = async (input, init = {}) => {
		const url = new URL(input.toString());
		const method = init.method ?? "GET";
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method, path: url.pathname, body });

		const issueMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)$/);
		if (issueMatch) {
			const number = Number(issueMatch[1]);
			const current = issues.get(number);
			if (!current) return jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
			if (method === "GET") return jsonResponse(current);
			if (method === "PATCH") {
				const state = body.state ?? current.state;
				const next = githubIssue(number, body.title ?? current.title, {
					body: body.body ?? current.body,
					state,
					labels: body.labels ?? current.labels.map((label) => label.name),
					assignees: body.assignees ?? current.assignees.map((assignee) => assignee.login),
					commentsCount: current.comments,
					closed_at: state === "closed" ? "2026-06-27T00:05:00Z" : current.closed_at,
					updated_at: "2026-06-27T00:05:00Z",
				});
				issues.set(number, next);
				if (sessionRef?.abortAfterIssuePatch) sessionRef.session?.agent.abort();
				return jsonResponse(next);
			}
		}

		const commentsMatch = url.pathname.match(/^\/repos\/owner\/repo\/issues\/(\d+)\/comments$/);
		if (commentsMatch && method === "GET") {
			return jsonResponse(comments.get(Number(commentsMatch[1])) ?? []);
		}

		throw new Error(`Unexpected mocked GitHub request: ${method} ${url.pathname}`);
	};

	return { calls, fetchFn, issues };
}

function executionOrder(events) {
	return events
		.filter((event) => event.type === "tool_execution_start" || event.type === "tool_execution_end")
		.map((event) => `${event.type}:${event.toolName}`);
}

test("Pi session serializes same-turn IssueMe write/write cache refreshes for one issue", async () => {
	const projectRoot = await tempProject();
	const mock = makeIssueFetch();

	const { events, toolResults } = await runIssueMeToolBatchThroughPiSession(projectRoot, mock.fetchFn, [
		{ name: "issueme_get_issue", params: { number: 10, refresh: true } },
		{ name: "issueme_update_issue", params: { number: 10, title: "Pi Runner Ordered" } },
	]);

	assert.deepEqual(executionOrder(events), [
		"tool_execution_start:issueme_get_issue",
		"tool_execution_end:issueme_get_issue",
		"tool_execution_start:issueme_update_issue",
		"tool_execution_end:issueme_update_issue",
	]);
	assert.deepEqual(toolResults.map((result) => result.details.result), ["success", "success"]);
	assert.deepEqual(await readdir(join(projectRoot, "issues")), ["10-pi-runner-ordered.json"]);
	const finalRecord = await readJson(join(projectRoot, "issues", "10-pi-runner-ordered.json"));
	assert.equal(finalRecord.title, "Pi Runner Ordered");
	assert.equal(finalRecord.repository, REPOSITORY);
	assert.deepEqual(toolResults[1].details.removedPaths, ["issues/10-original-title.json"]);

	const firstRefreshIndex = mock.calls.findIndex((call) => call.method === "GET" && call.path === "/repos/owner/repo/issues/10/comments");
	const patchIndex = mock.calls.findIndex((call) => call.method === "PATCH" && call.path === "/repos/owner/repo/issues/10");
	assert.ok(firstRefreshIndex >= 0, "get refresh should fetch comments before writing cache");
	assert.ok(patchIndex > firstRefreshIndex, "update mutation should start after the first cache refresh completes");
});

test("Pi session serializes same-turn IssueMe write/remove cache races for one issue", async () => {
	const projectRoot = await tempProject();
	const mock = makeIssueFetch();

	const { events, toolResults } = await runIssueMeToolBatchThroughPiSession(projectRoot, mock.fetchFn, [
		{ name: "issueme_update_issue", params: { number: 10, title: "Pi Runner Removed" } },
		{ name: "issueme_close_issue", params: { number: 10, reason: "completed" } },
	]);

	assert.deepEqual(executionOrder(events), [
		"tool_execution_start:issueme_update_issue",
		"tool_execution_end:issueme_update_issue",
		"tool_execution_start:issueme_close_issue",
		"tool_execution_end:issueme_close_issue",
	]);
	assert.deepEqual(toolResults.map((result) => result.details.result), ["success", "success"]);
	assert.deepEqual(toolResults[1].details.removedPaths, ["issues/10-pi-runner-removed.json"]);
	assert.deepEqual(await readdir(join(projectRoot, "issues")), []);
	assert.equal(mock.issues.get(10).state, "closed");
});

test("Pi session abort checkpoint prevents same-turn IssueMe cache removal after remote close", async () => {
	const projectRoot = await tempProject();
	await writeIssueRecord(projectRoot, CONFIG, issueRecord(10, "Abort Close"));
	const sessionRef = { abortAfterIssuePatch: true, session: undefined };
	const mock = makeIssueFetch(sessionRef);
	mock.issues.set(10, githubIssue(10, "Abort Close"));

	const { toolResults } = await runIssueMeToolBatchThroughPiSession(projectRoot, mock.fetchFn, [
		{ name: "issueme_close_issue", params: { number: 10, reason: "completed" } },
	], { sessionRef });

	assert.equal(toolResults.length, 1);
	assert.equal(toolResults[0].details.result, "partial_success");
	assert.equal(toolResults[0].details.cacheUpdated, false);
	assert.equal(toolResults[0].details.needsSync, true);
	assert.equal(toolResults[0].details.error.code, "github_request_aborted");
	assert.deepEqual(await readdir(join(projectRoot, "issues")), ["10-abort-close.json"]);
	const cached = await readJson(join(projectRoot, "issues", "10-abort-close.json"));
	assert.equal(cached.state, "open");
	assert.equal(mock.issues.get(10).state, "closed");
});
