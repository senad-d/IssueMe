import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import test from "node:test";

import {
	MAX_CACHE_COMMENTS,
	MAX_TOOL_CHANGED_FIELDS,
	MAX_TOOL_ERROR_DETAIL_ITEMS,
	MAX_TOOL_ISSUES,
	MAX_TOOL_LABELS,
	MAX_TOOL_TEXT_CHARS,
} from "../src/constants.ts";
import { IssueMeError } from "../src/errors.ts";
import { GitHubClient } from "../src/github/client.ts";
import {
	allowedIssueCreator,
	assertAuthenticatedUserAllowedForCreate,
	assertExistingIssueCreatorAllowed,
	assertIssueCreatorAllowed,
	boundToolDetails,
	createIssueMeRuntime,
	fetchIssueRecord,
	isAbortError,
	issueCreatorMatchesConfig,
	issueCreatorScopeLabel,
	listChangedFields,
	normalizeIssueBody,
	normalizeRuntimeRepository,
	partialSuccessToolError,
	partialSuccessToolText,
	refreshAndCacheIssue,
	refreshIssueRecord,
	requireNonEmptyGitHubLogins,
	requireNonEmptyStrings,
	requireNonEmptyTitle,
	safeToolError,
	sanitizeGitHubLoginList,
	sanitizeStringList,
	toolText,
	writeAndSummarizeIssue,
} from "../src/tools/runtime.ts";
import {
	TEST_REPOSITORY,
	TEST_REPOSITORY_OBJECT,
	createFetchRecorder,
	createGitProject,
	createNoNetworkFetch,
	githubComment,
	githubIssue,
	githubLabel,
	githubMilestone,
	githubUser,
	issueMeConfig,
	localIssueRecord,
	projectV2FieldOption,
	readJsonFile,
	runtimeOptions,
	tempProject,
	writeLocalIssueRecord,
} from "./helpers/issueme-test-helpers.mjs";

const RUNTIME_TOKEN = "ghp_runtime_details_secret";
const ctxFor = (cwd, trusted = true) => ({ cwd, isProjectTrusted: () => trusted });

function assertIssueMeError(error, code) {
	assert.ok(error instanceof IssueMeError);
	assert.equal(error.code, code);
	return true;
}

function assertNoRuntimeToken(value) {
	assert.doesNotMatch(JSON.stringify(value), /ghp_runtime_details_secret/);
}

function makeRuntime(projectRoot, overrides = {}) {
	return {
		projectRoot,
		config: issueMeConfig(overrides.config),
		repository: TEST_REPOSITORY,
		commentsTruncated: false,
		truncatedCommentIssues: [],
		client: {
			repository: TEST_REPOSITORY_OBJECT,
			...overrides.client,
		},
	};
}

function minimalIssueSummary(number = 1, overrides = {}) {
	return {
		repository: TEST_REPOSITORY,
		number,
		title: `Issue ${number}`,
		state: "open",
		creator: "octocat",
		labels: ["bug"],
		assignees: ["octocat"],
		html_url: `https://github.com/${TEST_REPOSITORY}/issues/${number}`,
		...overrides,
	};
}

function relationship(number, overrides = {}) {
	return {
		number,
		title: `Related ${number}`,
		state: "open",
		creator: "octocat",
		html_url: `https://github.com/${TEST_REPOSITORY}/issues/${number}`,
		...overrides,
	};
}

function toolDetailFixture() {
	const issue = minimalIssueSummary(1, {
		labels: Array.from({ length: MAX_TOOL_LABELS + 1 }, (_, index) => `label-${index}`),
		assignees: ["octocat"],
		parentIssue: relationship(99),
		subIssues: Array.from({ length: MAX_TOOL_ISSUES + 1 }, (_, index) => relationship(index + 10)),
		subIssuesCount: MAX_TOOL_ISSUES + 1,
	});
	return {
		status: "partial_success_cache_refresh",
		message: `token ${RUNTIME_TOKEN}`,
		paths: ["issues/1-test.json"],
		removedPaths: ["issues/1-old.json"],
		changedFields: Array.from({ length: MAX_TOOL_CHANGED_FIELDS + 1 }, (_, index) => `field-${index}`),
		fileActions: [{ action: "renamed", path: "issues/1-test.json", removedPaths: ["issues/1-old.json"], issue }],
		invalidFiles: [{ path: "issues/bad.json", fileName: "bad.json", reason: "invalid" }],
		issue,
		comment: { id: 5, html_url: "https://github.com/owner/repo/issues/1#issuecomment-5", body: "must not survive" },
		issues: [issue],
		labels: [githubLabel({ name: "bug", description: `desc ${RUNTIME_TOKEN}`, url: "https://api.github.com/repos/owner/repo/labels/bug" })],
		milestones: [githubMilestone({ title: `v1 ${RUNTIME_TOKEN}` })],
		assignees: [githubUser({ login: "octocat", type: `User ${RUNTIME_TOKEN}` })],
		project: { id: `PVT_${RUNTIME_TOKEN}`, title: "Roadmap", number: 1, owner: "owner", ownerType: "repository" },
		projects: [{ id: "PVT_2", title: `Board ${RUNTIME_TOKEN}`, number: 2, owner: "owner", ownerType: "user" }],
		projectFields: [{
			id: "PVTF_status",
			name: `Status ${RUNTIME_TOKEN}`,
			dataType: "SINGLE_SELECT",
			type: "ProjectV2SingleSelectField",
			options: [projectV2FieldOption({ id: "todo", name: `Todo ${RUNTIME_TOKEN}` })],
			iterations: [],
			completedIterations: [],
		}],
		projectItem: {
			id: `PVTI_${RUNTIME_TOKEN}`,
			type: "ISSUE",
			project: { id: "PVT_1", title: "Roadmap", number: 1, owner: "owner", ownerType: "repository" },
			issue: relationship(1),
		},
		developmentLinks: [{
			type: "pull_request",
			referenceTypes: ["closing"],
			number: 2,
			title: `PR ${RUNTIME_TOKEN}`,
			state: "merged",
			html_url: "https://github.com/owner/repo/pull/2",
			branchName: `feature-${RUNTIME_TOKEN}`,
			baseBranchName: "main",
			commitOid: "abcdef",
			message: `message ${RUNTIME_TOKEN}`,
			willCloseTarget: true,
			closedBy: true,
			isDraft: false,
		}],
		bulkResults: [{
			number: 1,
			action: `add_labels_${RUNTIME_TOKEN}`,
			status: "unexpected-status",
			message: `bulk ${RUNTIME_TOKEN}`,
			issue,
			projectItem: {
				id: `PVTI_bulk_${RUNTIME_TOKEN}`,
				type: "ISSUE",
				project: { id: "PVT_2", title: "Roadmap", number: 2, owner: "owner", ownerType: "repository" },
				issue: relationship(1),
			},
			paths: ["issues/1-test.json"],
			removedPaths: ["issues/1-old.json"],
			changedFields: ["labels"],
			cacheUpdated: false,
			needsSync: true,
			error: { code: "bad code!", message: `boom ${RUNTIME_TOKEN}`, details: { token: RUNTIME_TOKEN, visible: "safe" } },
		}],
		error: { code: "bad code!", message: `boom ${RUNTIME_TOKEN}`, recoveryHint: `retry ${RUNTIME_TOKEN}`, details: { token: RUNTIME_TOKEN, body: "private" } },
	};
}

test("createIssueMeRuntime covers trust, injected options, async providers, repository validation, defaults, and env token resolution", async () => {
	const projectRoot = await createGitProject();
	let providerCalled = false;
	await assert.rejects(
		() => createIssueMeRuntime(ctxFor(projectRoot, false), () => {
			providerCalled = true;
			return runtimeOptions({ token: RUNTIME_TOKEN });
		}),
		(error) => assertIssueMeError(error, "project_untrusted"),
	);
	assert.equal(providerCalled, false);

	let providerCtx;
	const injectedRuntime = await createIssueMeRuntime(ctxFor(projectRoot), async (ctx) => {
		providerCtx = ctx;
		return runtimeOptions({
			config: { allowedIssueCreator: "octocat" },
			projectRoot,
			repository: "owner/repo",
			token: RUNTIME_TOKEN,
			fetchFn: createNoNetworkFetch(),
		});
	});
	assert.equal(providerCtx.cwd, projectRoot);
	assert.equal(injectedRuntime.projectRoot, projectRoot);
	assert.equal(injectedRuntime.repository, TEST_REPOSITORY);
	assert.equal(injectedRuntime.config.allowedIssueCreator, "octocat");
	assert.equal(injectedRuntime.commentsTruncated, false);
	assert.deepEqual(injectedRuntime.truncatedCommentIssues, []);

	const envProject = await createGitProject();
	await writeFile(`${envProject}/.env`, `GH_TOKEN=${RUNTIME_TOKEN}\n`, "utf8");
	const recorder = createFetchRecorder(() => new Response(JSON.stringify(githubIssue({ number: 3 })), { headers: { "content-type": "application/json" } }));
	const envRuntime = await createIssueMeRuntime(ctxFor(envProject), { projectRoot: envProject, env: {}, fetchFn: recorder.fetchFn });
	assert.equal(envRuntime.config.issueDirectory, "issues");
	assert.equal(envRuntime.config.allowedIssueCreator, "all");
	await envRuntime.client.getIssue(3);
	assert.equal(recorder.calls[0].headers.Authorization, `Bearer ${RUNTIME_TOKEN}`);

	const mismatchedClient = new GitHubClient({ repository: { owner: "owner", repo: "other", fullName: "owner/other" }, token: RUNTIME_TOKEN, fetchFn: createNoNetworkFetch() });
	await assert.rejects(
		() => createIssueMeRuntime(ctxFor(projectRoot), { projectRoot, config: issueMeConfig(), repository: "owner/repo", client: mismatchedClient }),
		(error) => assertIssueMeError(error, "runtime_repository_mismatch"),
	);
	await assert.rejects(
		() => createIssueMeRuntime(ctxFor(projectRoot), { projectRoot, config: issueMeConfig(), repository: "not-a-repository", token: RUNTIME_TOKEN, fetchFn: createNoNetworkFetch() }),
		(error) => assertIssueMeError(error, "invalid_github_repository"),
	);
	assert.throws(() => normalizeRuntimeRepository({ owner: "owner", repo: "repo", fullName: "owner/other" }), (error) => assertIssueMeError(error, "invalid_github_repository"));
});

test("creator-scope helpers cover existing issue, authenticated user, unknown creator, and invalid config outcomes", async () => {
	assert.throws(() => allowedIssueCreator({ allowedIssueCreator: undefined }), (error) => assertIssueMeError(error, "config_tui_invalid_setting"));
	assert.equal(issueCreatorScopeLabel({ allowedIssueCreator: "ALL" }), "all");
	assert.equal(issueCreatorMatchesConfig({ allowedIssueCreator: "octocat" }, { user: { login: "bad login" } }), false);
	assert.throws(
		() => assertIssueCreatorAllowed({ allowedIssueCreator: "octocat" }, { number: 9 }, { repository: TEST_REPOSITORY, operation: "update" }),
		(error) => {
			assertIssueMeError(error, "issue_creator_not_allowed");
			assert.equal(error.safeDetails.creator, "unknown");
			assert.equal(error.safeDetails.issueNumber, 9);
			return true;
		},
	);

	let unrestrictedCalls = 0;
	const unrestrictedRuntime = makeRuntime(await tempProject(), {
		config: { allowedIssueCreator: "all" },
		client: { ensureIssueOpen: async () => { unrestrictedCalls += 1; } },
	});
	assert.equal(await assertExistingIssueCreatorAllowed(unrestrictedRuntime, 1, "update"), undefined);
	assert.equal(unrestrictedCalls, 0);

	const controller = new AbortController();
	const restrictedCalls = [];
	const restrictedRuntime = makeRuntime(await tempProject(), {
		config: { allowedIssueCreator: "octocat" },
		client: {
			ensureIssueOpen: async (issueNumber, signal) => {
				restrictedCalls.push(["ensure", issueNumber, signal]);
				return githubIssue({ number: issueNumber, user: { login: "OctoCat" } });
			},
			getIssue: async (issueNumber, signal) => {
				restrictedCalls.push(["get", issueNumber, signal]);
				return githubIssue({ number: issueNumber, user: { login: "other" } });
			},
			getAuthenticatedUserLogin: async (signal) => {
				restrictedCalls.push(["auth", 0, signal]);
				return "octocat";
			},
		},
	});
	const issue = await assertExistingIssueCreatorAllowed(restrictedRuntime, 12, "update_issue", controller.signal);
	assert.equal(issue.number, 12);
	await assert.rejects(
		() => assertExistingIssueCreatorAllowed(restrictedRuntime, 13, "read_issue", controller.signal, { requireOpen: false }),
		(error) => assertIssueMeError(error, "issue_creator_not_allowed"),
	);
	await assert.doesNotReject(() => assertAuthenticatedUserAllowedForCreate(restrictedRuntime, controller.signal));
	assert.deepEqual(restrictedCalls.map((call) => [call[0], call[1], call[2] === controller.signal]), [
		["ensure", 12, true],
		["get", 13, true],
		["auth", 0, true],
	]);
});

test("fetch, refresh, write, and refresh-cache runtime helpers handle truncation, creator checks, renames, and aborts", async () => {
	const projectRoot = await tempProject();
	const commentSet = [githubComment({ id: 1, issueNumber: 7 }), githubComment({ id: 2, issueNumber: 7 })];
	const calls = [];
	const runtime = makeRuntime(projectRoot, {
		config: { allowedIssueCreator: "octocat" },
		client: {
			getIssue: async (issueNumber, signal) => {
				calls.push(["getIssue", issueNumber, signal?.aborted ?? false]);
				return githubIssue({ number: issueNumber, title: `Remote ${issueNumber}`, user: { login: "octocat" }, comments: 3 });
			},
			listComments: async (issueNumber, signal, options) => {
				calls.push(["listComments", issueNumber, signal?.aborted ?? false, options.limit]);
				return commentSet;
			},
		},
	});

	const fetched = await fetchIssueRecord(runtime, githubIssue({ number: 7, title: "Fetched", user: { login: "octocat" }, comments: 3 }));
	assert.equal(fetched.number, 7);
	assert.equal(fetched.comments.length, 2);
	assert.equal(fetched.comments_truncated, true);
	assert.equal(fetched.comments_count, 3);
	assert.equal(fetched.comments_fetch_limit, MAX_CACHE_COMMENTS);
	assert.equal(runtime.commentsTruncated, true);
	assert.deepEqual(runtime.truncatedCommentIssues, [7]);
	assert.deepEqual(calls.at(-1), ["listComments", 7, false, MAX_CACHE_COMMENTS]);

	await assert.rejects(
		() => fetchIssueRecord(runtime, githubIssue({ number: 8, user: { login: "other" } })),
		(error) => assertIssueMeError(error, "issue_creator_not_allowed"),
	);
	const refreshed = await refreshIssueRecord(runtime, 9);
	assert.equal(refreshed.title, "Remote 9");

	await writeLocalIssueRecord(projectRoot, { number: 20, title: "Old Runtime Title" });
	const renamedRecord = localIssueRecord({ number: 20, title: "New Runtime Title", comments_truncated: true, comments_count: 3, comments_fetch_limit: 2 });
	const renamed = await writeAndSummarizeIssue(ctxFor(projectRoot), runtime, renamedRecord);
	assert.equal(renamed.action, "renamed");
	assert.equal(renamed.path, "issues/20-new-runtime-title.json");
	assert.deepEqual(renamed.removedPaths, ["issues/20-old-runtime-title.json"]);
	assert.equal(renamed.summary.localPath, "issues/20-new-runtime-title.json");
	assert.equal((await readJsonFile(`${projectRoot}/issues/20-new-runtime-title.json`)).title, "New Runtime Title");

	const aborted = new AbortController();
	aborted.abort();
	await assert.rejects(
		() => writeAndSummarizeIssue(ctxFor(projectRoot), runtime, localIssueRecord({ number: 21, title: "Aborted" }), aborted.signal),
		(error) => assertIssueMeError(error, "github_request_aborted"),
	);
	assert.equal(isAbortError(new IssueMeError("github_request_aborted", "aborted")), true);
	assert.equal(isAbortError(new IssueMeError("local_cache_error", "nope")), false);

	const cached = await refreshAndCacheIssue(ctxFor(projectRoot), runtime, 22);
	assert.equal(cached.record.number, 22);
	assert.equal(cached.action, "created");
	assert.equal(cached.path, "issues/22-remote-22.json");
});

test("fetchIssueRecord treats missing remote comment counts as truncated when the cache limit is filled", async () => {
	const projectRoot = await tempProject();
	const runtime = makeRuntime(projectRoot, {
		client: {
			listComments: async () => Array.from({ length: MAX_CACHE_COMMENTS }, (_, index) => githubComment({ id: index + 1, issueNumber: 5 })),
		},
	});
	const record = await fetchIssueRecord(runtime, githubIssue({ number: 5, comments: undefined }));
	assert.equal(record.comments_truncated, true);
	assert.equal(record.comments_count, MAX_CACHE_COMMENTS);
	assert.deepEqual(runtime.truncatedCommentIssues, [5]);
});

test("toolText and boundToolDetails preserve safe details while bounding every public collection", () => {
	const details = toolDetailFixture();
	const bounded = boundToolDetails(details);
	assert.equal(bounded.result, "partial_success");
	assert.equal(bounded.cacheUpdated, false);
	assert.equal(bounded.needsSync, true);
	assert.equal(bounded.comment.body, undefined);
	assert.equal(bounded.changedFields.length, MAX_TOOL_CHANGED_FIELDS);
	assert.equal(bounded.issue.labels.length, MAX_TOOL_LABELS);
	assert.equal(bounded.issue.subIssues.length, MAX_TOOL_ISSUES);
	assert.equal(bounded.bulkResults[0].status, "failed");
	assert.equal(bounded.error.details.token, "[REDACTED]");
	assert.equal(bounded.error.details.body, "[REDACTED]");
	assert.ok(bounded.truncation.changedFields);
	assert.ok(bounded.truncation.issue.labels);
	assert.ok(bounded.truncation.issue.subIssues);
	assertNoRuntimeToken(bounded);

	const short = toolText("short output", { status: "ok" });
	assert.equal(short.content[0].text, "short output");
	assert.equal(short.details.result, "success");
	assert.equal(short.details.truncated, undefined);

	const long = toolText("x".repeat(MAX_TOOL_TEXT_CHARS + 20), { truncation: { previous: true } });
	assert.match(long.content[0].text, /IssueMe tool output truncated/);
	assert.equal(long.details.truncated, true);
	assert.equal(long.details.truncation.previous, true);
	assert.ok(long.details.truncation.content);
});

test("safe errors and partial-success helpers sanitize Node, domain, nested, and unknown failures", () => {
	const oversizedDetails = { token: RUNTIME_TOKEN };
	for (let index = 0; index < MAX_TOOL_ERROR_DETAIL_ITEMS + 2; index += 1) {
		oversizedDetails[`field${index}`] = `value-${index}-${RUNTIME_TOKEN}`;
	}
	const domainError = new IssueMeError("bad code!", `Domain ${RUNTIME_TOKEN}`, oversizedDetails);
	const safeDomain = safeToolError(domainError);
	assert.equal(safeDomain.code, "bad_code_");
	assert.equal(safeDomain.details.token, "[REDACTED]");
	assert.equal(safeDomain.details.truncated, true);
	assertNoRuntimeToken(safeDomain);

	const nodeError = new Error(`denied ${RUNTIME_TOKEN}`);
	nodeError.code = "EACCES";
	const safeNode = safeToolError(nodeError);
	assert.equal(safeNode.code, "node_eacces");
	assert.equal(safeNode.details.nodeCode, "EACCES");
	assertNoRuntimeToken(safeNode);

	const safeUnknown = safeToolError({ message: `unknown ${RUNTIME_TOKEN}` });
	assert.equal(safeUnknown.code, "local_cache_error");
	assertNoRuntimeToken(safeUnknown);

	const partialInput = new IssueMeError("partial_input", `Partial ${RUNTIME_TOKEN}`, { visible: "safe", token: RUNTIME_TOKEN });
	const partial = partialSuccessToolError(partialInput, "cache_refresh_failed");
	assert.equal(partial.details.partialSuccessStatus, "cache_refresh_failed");
	assert.match(partial.details.partialSuccessRecoveryHint, /issueme_sync_issues/);
	const partialText = partialSuccessToolText("Remote step finished", partialInput, { repository: TEST_REPOSITORY }, "cache_refresh_failed", "cache_write_failed");
	assert.equal(partialText.details.result, "partial_success");
	assert.equal(partialText.details.cacheUpdated, false);
	assert.equal(partialText.details.needsSync, true);
	assert.equal(partialText.details.status, "cache_write_failed");
	assertNoRuntimeToken({ partial, partialText });
});

test("runtime input sanitizers normalize valid values and reject blanks, newlines, null bytes, and invalid logins", () => {
	assert.deepEqual(sanitizeStringList(undefined, "labels"), []);
	assert.deepEqual(sanitizeStringList([" bug ", "", "bug", "feature"], "labels"), ["bug", "feature"]);
	assert.throws(() => sanitizeStringList(["bad\nlabel"], "labels"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.throws(() => sanitizeStringList(["bad\0label"], "labels"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.deepEqual(sanitizeGitHubLoginList([" OctoCat ", "hubot-1"], "assignees"), ["OctoCat", "hubot-1"]);
	assert.throws(() => sanitizeGitHubLoginList(["-bad"], "assignees"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.deepEqual(requireNonEmptyStrings([" docs "], "labels"), ["docs"]);
	assert.throws(() => requireNonEmptyStrings(["   "], "labels"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.deepEqual(requireNonEmptyGitHubLogins(["octocat"], "assignees"), ["octocat"]);
	assert.throws(() => requireNonEmptyGitHubLogins(["bad_login"], "assignees"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.equal(requireNonEmptyTitle("  Useful title  "), "Useful title");
	assert.throws(() => requireNonEmptyTitle("\t"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.equal(normalizeIssueBody("Body", "create"), "Body");
	assert.equal(normalizeIssueBody("", "create"), "");
	assert.equal(normalizeIssueBody("", "update"), "");
	assert.throws(() => normalizeIssueBody("   ", "create"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.throws(() => normalizeIssueBody("\n\t", "update"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.deepEqual(listChangedFields({ title: "New", body: undefined, labels: [], milestone: null }), ["title", "labels", "milestone"]);
});
