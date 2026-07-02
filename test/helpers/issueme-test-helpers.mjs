import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { DEFAULT_CONFIG_PATH } from "../../src/constants.ts";
import { writeIssueRecord } from "../../src/issues/store.ts";

export const TEST_REPOSITORY = "owner/repo";
export const TEST_REPOSITORY_OBJECT = { owner: "owner", repo: "repo", fullName: TEST_REPOSITORY };
export const TEST_TOKEN = "ghp_issueme_test_token";
export const TEST_NOW = "2026-06-27T00:00:00Z";
export const TEST_SYNCED_AT = "2026-06-27T00:00:01Z";

export function issueMeConfig(overrides = {}) {
	return {
		issueDirectory: "issues",
		allowedIssueCreator: "all",
		defaultLabels: [],
		defaultAssignees: [],
		defaultSkillPath: null,
		...overrides,
	};
}

export async function tempProject(prefix = "issueme-test-") {
	return mkdtemp(join(tmpdir(), prefix));
}

export async function createGitProject(options = {}) {
	const root = await tempProject(options.prefix ?? "issueme-git-test-");
	await writeGitConfig(root, options);
	if (options.config) await writeIssueMeConfig(root, options.config);
	return root;
}

export async function writeGitConfig(projectRoot, options = {}) {
	const repository = normalizeRepositoryName(options.repository ?? TEST_REPOSITORY);
	const remoteName = options.remoteName ?? "origin";
	const remoteUrl = options.url ?? `https://github.com/${repository}.git`;
	const gitDirectory = join(projectRoot, ".git");
	await mkdir(gitDirectory, { recursive: true });
	const path = join(gitDirectory, "config");
	await writeFile(path, `[remote "${remoteName}"]\n\turl = ${remoteUrl}\n`, "utf8");
	return path;
}

export async function writeIssueMeConfig(projectRoot, overrides = {}) {
	const config = issueMeConfig(overrides);
	const path = join(projectRoot, DEFAULT_CONFIG_PATH);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
	return { config, path };
}

export async function readJsonFile(path) {
	return JSON.parse(await readFile(path, "utf8"));
}

export function localIssueRecord(overrides = {}) {
	const repository = normalizeRepositoryName(overrides.repository ?? TEST_REPOSITORY);
	const number = overrides.number ?? 1;
	const title = overrides.title ?? "Test Issue";
	return {
		schemaVersion: 1,
		repository,
		number,
		title,
		state: "open",
		creator: "octocat",
		body: "Issue body",
		labels: [],
		assignees: [],
		milestone: null,
		comments: [],
		html_url: `https://github.com/${repository}/issues/${number}`,
		created_at: TEST_NOW,
		updated_at: TEST_NOW,
		closed_at: null,
		synced_at: TEST_SYNCED_AT,
		...overrides,
	};
}

export async function writeLocalIssueRecord(projectRoot, overrides = {}, configOverrides = {}) {
	const config = issueMeConfig(configOverrides);
	const record = localIssueRecord(overrides);
	const result = await writeIssueRecord(projectRoot, config, record);
	return { config, record, result };
}

export function githubIssue(overrides = {}) {
	const repository = normalizeRepositoryName(overrides.repository ?? TEST_REPOSITORY);
	const number = overrides.number ?? 1;
	const title = overrides.title ?? "Test Issue";
	const labels = overrides.labels ?? [];
	const assignees = overrides.assignees ?? [];
	const milestone = overrides.milestone ?? null;
	const comments = overrides.comments ?? 0;
	return {
		node_id: `I_${number}`,
		number,
		title,
		state: "open",
		user: { login: "octocat" },
		body: "Issue body",
		labels: labels.map(githubLabel),
		assignees: assignees.map(githubUser),
		milestone,
		comments,
		html_url: `https://github.com/${repository}/issues/${number}`,
		url: `https://api.github.com/repos/${repository}/issues/${number}`,
		created_at: TEST_NOW,
		updated_at: TEST_NOW,
		closed_at: null,
		...withoutFixtureOnlyKeys(overrides, ["repository"]),
	};
}

export function githubComment(overrides = {}) {
	const repository = normalizeRepositoryName(overrides.repository ?? TEST_REPOSITORY);
	const issueNumber = overrides.issueNumber ?? 1;
	const id = overrides.id ?? 100;
	return {
		id,
		user: { login: overrides.author ?? "octocat" },
		body: overrides.body ?? "Comment body",
		created_at: overrides.created_at ?? TEST_NOW,
		updated_at: overrides.updated_at ?? TEST_NOW,
		html_url: `https://github.com/${repository}/issues/${issueNumber}#issuecomment-${id}`,
		issue_url: `https://api.github.com/repos/${repository}/issues/${issueNumber}`,
		...withoutFixtureOnlyKeys(overrides, ["author", "issueNumber", "repository"]),
	};
}

export function githubLabel(input = {}) {
	const label = typeof input === "string" ? { name: input } : input;
	const name = label.name ?? "bug";
	return {
		name,
		description: label.description ?? `${name} label`,
		color: label.color ?? "d73a4a",
		default: label.default ?? false,
		url: label.url ?? `https://api.github.com/repos/${TEST_REPOSITORY}/labels/${encodeURIComponent(name)}`,
	};
}

export function githubMilestone(overrides = {}) {
	const number = overrides.number ?? 1;
	const title = overrides.title ?? "v1.0";
	return {
		number,
		title,
		state: overrides.state ?? "open",
		description: overrides.description ?? "Release milestone",
		due_on: overrides.due_on ?? "2026-07-01T00:00:00Z",
		open_issues: overrides.open_issues ?? 0,
		closed_issues: overrides.closed_issues ?? 0,
		html_url: overrides.html_url ?? `https://github.com/${TEST_REPOSITORY}/milestone/${number}`,
		url: overrides.url ?? `https://api.github.com/repos/${TEST_REPOSITORY}/milestones/${number}`,
		...overrides,
	};
}

export function githubUser(input = {}) {
	const user = typeof input === "string" ? { login: input } : input;
	const login = user.login ?? "octocat";
	return {
		login,
		id: user.id ?? 1,
		type: user.type ?? "User",
		html_url: user.html_url ?? `https://github.com/${login}`,
		url: user.url ?? `https://api.github.com/users/${login}`,
	};
}

export function projectV2Node(overrides = {}) {
	const number = overrides.number ?? 1;
	const owner = overrides.owner ?? { __typename: "User", login: "owner" };
	const title = overrides.title ?? "Roadmap";
	return {
		id: overrides.id ?? `PVT_${number}`,
		title,
		number,
		url: overrides.url ?? `https://github.com/users/${owner.login ?? "owner"}/projects/${number}`,
		shortDescription: overrides.shortDescription ?? `${title} board`,
		closed: overrides.closed ?? false,
		public: overrides.public ?? false,
		owner,
		...overrides,
	};
}

export function projectV2SingleSelectField(overrides = {}) {
	const name = overrides.name ?? "Status";
	return {
		__typename: "ProjectV2SingleSelectField",
		id: overrides.id ?? "PVTSSF_status",
		name,
		dataType: "SINGLE_SELECT",
		options: overrides.options ?? [projectV2FieldOption({ id: "todo", name: "Todo" })],
		...overrides,
	};
}

export function projectV2IterationField(overrides = {}) {
	return {
		__typename: "ProjectV2IterationField",
		id: overrides.id ?? "PVTF_iteration",
		name: overrides.name ?? "Iteration",
		dataType: "ITERATION",
		configuration: overrides.configuration ?? {
			iterations: [projectV2Iteration({ id: "iter_1", title: "Sprint 1" })],
			completedIterations: [],
		},
		...overrides,
	};
}

export function projectV2FieldOption(overrides = {}) {
	return {
		id: overrides.id ?? "option_1",
		name: overrides.name ?? "Option",
		color: overrides.color ?? "GRAY",
		description: overrides.description ?? "Project field option",
		...overrides,
	};
}

export function projectV2Iteration(overrides = {}) {
	return {
		id: overrides.id ?? "iter_1",
		title: overrides.title ?? "Sprint 1",
		startDate: overrides.startDate ?? "2026-07-01",
		duration: overrides.duration ?? 14,
		...overrides,
	};
}

export function projectV2ItemNode(overrides = {}) {
	const issue = githubIssue({ number: overrides.issueNumber ?? 1, title: overrides.issueTitle ?? "Test Issue" });
	return {
		id: overrides.id ?? `PVTI_${issue.number}`,
		type: overrides.type ?? "ISSUE",
		project: overrides.project ?? projectV2Node(),
		content: overrides.content ?? {
			__typename: "Issue",
			id: issue.node_id,
			number: issue.number,
			title: issue.title,
			state: issue.state.toUpperCase(),
			url: issue.html_url,
			repository: { nameWithOwner: TEST_REPOSITORY },
		},
		...withoutFixtureOnlyKeys(overrides, ["issueNumber", "issueTitle"]),
	};
}

export function graphQLConnection(nodes = [], pageInfo = {}) {
	return {
		nodes,
		pageInfo: {
			hasNextPage: false,
			endCursor: null,
			...pageInfo,
		},
	};
}

export function graphQLResponse(data, init = {}) {
	return jsonResponse({ data, ...(init.errors ? { errors: init.errors } : {}) }, init);
}

export function jsonResponse(body, init = {}) {
	const headers = new Headers(init.headers ?? {});
	if (!headers.has("content-type")) headers.set("content-type", "application/json");
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers,
	});
}

export function noContentResponse(init = {}) {
	return new Response(null, {
		status: init.status ?? 204,
		statusText: init.statusText ?? "No Content",
		headers: init.headers,
	});
}

export function createFetchRecorder(handler) {
	const calls = [];
	return {
		calls,
		fetchFn: async (input, init = {}) => {
			const call = recordFetchCall(input, init);
			calls.push(call);
			if (typeof handler === "function") return handler(call, calls);
			if (Array.isArray(handler)) return nextRecordedResponse(handler, call);
			if (handler instanceof Response) return handler;
			throw new Error(`Unexpected fetch call: ${call.method} ${call.urlString}`);
		},
	};
}

export function createNoNetworkFetch(message = "Unexpected live network call in deterministic IssueMe test") {
	return async (input, init = {}) => {
		const call = recordFetchCall(input, init);
		throw new Error(`${message}: ${call.method} ${call.urlString}`);
	};
}

export function recordFetchCall(input, init = {}) {
	const urlString = fetchInputUrl(input);
	const url = new URL(urlString);
	const body = init.body === undefined ? undefined : String(init.body);
	return {
		input,
		init,
		url,
		urlString,
		method: init.method ?? requestMethod(input) ?? "GET",
		headers: normalizeHeaders(init.headers ?? requestHeaders(input)),
		body,
		json: parseJsonBody(body),
	};
}

export function createFakePi() {
	const commands = new Map();
	const tools = new Map();
	const messages = [];
	const userMessages = [];
	return {
		commands,
		tools,
		messages,
		userMessages,
		registerCommand(name, options) { commands.set(name, options); },
		registerTool(tool) { tools.set(tool.name, tool); },
		sendMessage(message, options) { messages.push({ message, options }); },
		sendUserMessage(content, options) { userMessages.push({ content, options }); },
	};
}

export function createFakeToolContext(cwd, overrides = {}) {
	const trusted = overrides.trusted ?? true;
	return {
		cwd,
		isProjectTrusted: overrides.isProjectTrusted ?? (() => trusted),
		...withoutFixtureOnlyKeys(overrides, ["trusted"]),
	};
}

export function createFakeCommandContext(cwd, overrides = {}) {
	const notifications = [];
	const customCalls = [];
	const renderRequests = [];
	const tui = { requestRender() { renderRequests.push({ at: renderRequests.length }); } };
	const theme = createFakeTheme();
	const ui = overrides.ui ?? {
		notify(message, level) { notifications.push({ message, level }); },
		async custom(factory) {
			customCalls.push({ factory });
			if (Object.hasOwn(overrides, "customResult")) return overrides.customResult;
			if (typeof overrides.customRunner === "function") return overrides.customRunner(factory, { tui, theme, notifications, customCalls, renderRequests });
			return undefined;
		},
	};
	return {
		cwd,
		mode: overrides.mode ?? "json",
		hasUI: overrides.hasUI ?? false,
		ui,
		notifications,
		customCalls,
		renderRequests,
		isIdle: overrides.isIdle ?? (() => true),
		isProjectTrusted: overrides.isProjectTrusted ?? (() => overrides.trusted ?? true),
		...withoutFixtureOnlyKeys(overrides, ["customResult", "customRunner", "trusted", "ui"]),
	};
}

export async function executeTool(tool, params = {}, options = {}) {
	return tool.execute(
		options.callId ?? "issueme-test-call",
		params,
		options.signal,
		options.progress,
		options.context ?? createFakeToolContext(options.cwd ?? await tempProject()),
	);
}

export async function executeRegisteredTool(tools, name, params = {}, options = {}) {
	const tool = tools instanceof Map ? tools.get(name) : tools[name];
	assert.ok(tool, `Expected registered tool ${name}`);
	return executeTool(tool, params, options);
}

export function runtimeOptions(overrides = {}) {
	return {
		config: issueMeConfig(overrides.config),
		repository: overrides.repository ?? TEST_REPOSITORY,
		token: overrides.token ?? TEST_TOKEN,
		fetchFn: overrides.fetchFn ?? createNoNetworkFetch(),
		...withoutFixtureOnlyKeys(overrides, ["config"]),
	};
}

export async function withCleanGitHubEnv(fn) {
	const keys = ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_REPOSITORY"];
	const previous = new Map(keys.map((key) => [key, process.env[key]]));
	for (const key of keys) delete process.env[key];
	try {
		return await fn();
	} finally {
		for (const key of keys) {
			const value = previous.get(key);
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

export function assertNoSecretLeak(value, secrets = [TEST_TOKEN]) {
	const text = typeof value === "string" ? value : JSON.stringify(value);
	for (const secret of secrets.filter((item) => typeof item === "string" && item.length > 0)) {
		assert.doesNotMatch(text, new RegExp(escapeRegExp(secret)), `Expected output not to leak secret value ${secret}`);
	}
}

export function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRepositoryName(repository) {
	if (typeof repository === "string") return repository;
	return repository.fullName ?? `${repository.owner}/${repository.repo}`;
}

function withoutFixtureOnlyKeys(input, keys) {
	const output = { ...input };
	for (const key of keys) delete output[key];
	return output;
}

function createFakeTheme() {
	return {
		fg(_role, text) { return text; },
		bold(text) { return text; },
	};
}

function nextRecordedResponse(responses, call) {
	const response = responses.shift();
	if (response === undefined) throw new Error(`Unexpected fetch call: ${call.method} ${call.urlString}`);
	return response;
}

function fetchInputUrl(input) {
	if (typeof input === "string") return input;
	if (input instanceof URL) return input.toString();
	if (input && typeof input.url === "string") return input.url;
	return input.toString();
}

function requestMethod(input) {
	if (input && typeof input.method === "string") return input.method;
	return undefined;
}

function requestHeaders(input) {
	if (input && input.headers) return input.headers;
	return undefined;
}

function normalizeHeaders(headers) {
	if (!headers) return {};
	if (headers instanceof Headers) return Object.fromEntries(headers.entries());
	if (Array.isArray(headers)) return Object.fromEntries(headers);
	return { ...headers };
}

function parseJsonBody(body) {
	if (body === undefined) return undefined;
	try {
		return JSON.parse(body);
	} catch {
		return undefined;
	}
}
