import assert from "node:assert/strict";
import test from "node:test";

import { GitHubApiError, IssueMeError } from "../src/errors.ts";
import {
	MAX_TOOL_ASSIGNEES,
	MAX_TOOL_CHANGED_FIELDS,
	MAX_TOOL_DEVELOPMENT_LINKS,
	MAX_TOOL_ISSUES,
	MAX_TOOL_LABELS,
	MAX_TOOL_MILESTONES,
	MAX_TOOL_PATHS,
	MAX_TOOL_PROJECT_FIELD_OPTIONS,
	MAX_TOOL_PROJECT_FIELDS,
	MAX_TOOL_PROJECT_ITERATIONS,
	MAX_TOOL_PROJECTS,
	MAX_TOOL_TEXT_CHARS,
} from "../src/constants.ts";
import {
	allowedIssueCreator,
	assertAuthenticatedUserAllowedForCreate,
	assertIssueCreatorAllowed,
	assertTrustedProject,
	boundToolDetails,
	extractIssueCreator,
	isCreatorScopeRestricted,
	isProjectTrusted,
	issueCreatorMatchesConfig,
	issueCreatorScopeLabel,
	issueMeResultPolicyPromptGuideline,
	listChangedFields,
	normalizeIssueBody,
	normalizeRuntimeRepository,
	partialSuccessToolError,
	partialSuccessToolText,
	requireNonEmptyGitHubLogins,
	requireNonEmptyStrings,
	requireNonEmptyTitle,
	safeToolError,
	sanitizeGitHubLoginList,
	sanitizeStringList,
	toolText,
} from "../src/tools/runtime.ts";

const TOKEN = "ghp_runtime_secret";
const REPOSITORY = { owner: "owner", repo: "repo", fullName: "owner/repo" };

function assertIssueMeError(error, code) {
	assert.ok(error instanceof IssueMeError);
	assert.equal(error.code, code);
	return true;
}

function assertTokenRedacted(value) {
	assert.doesNotMatch(JSON.stringify(value), new RegExp(TOKEN));
}

function longText(prefix = "value", length = 900) {
	return `${prefix}-${"x".repeat(length)}`;
}

function issueSummary(number = 1, overrides = {}) {
	return {
		repository: REPOSITORY.fullName,
		number,
		title: `Issue ${number}`,
		state: "open",
		creator: "octocat",
		labels: ["bug"],
		assignees: ["octocat"],
		html_url: `https://github.com/${REPOSITORY.fullName}/issues/${number}`,
		...overrides,
	};
}

function relationship(number, overrides = {}) {
	return {
		number,
		title: `Related ${number}`,
		state: "open",
		creator: "octocat",
		html_url: `https://github.com/${REPOSITORY.fullName}/issues/${number}`,
		...overrides,
	};
}

function labelSummary(index, overrides = {}) {
	return {
		name: `label-${index}-${longText("token", 560)}-${TOKEN}`,
		description: longText("description", 560),
		color: "a".repeat(80),
		default: index % 2 === 0,
		url: longText("https://api.github.com/labels", 560),
		...overrides,
	};
}

function milestoneSummary(index) {
	return {
		number: index,
		title: longText("milestone", 560),
		state: "open",
		description: longText("milestone-description", 560),
		due_on: `${"2026-07-02"}${"Z".repeat(80)}`,
		open_issues: index,
		closed_issues: index + 1,
		html_url: longText("https://github.com/milestones", 560),
		url: longText("https://api.github.com/milestones", 560),
	};
}

function assigneeSummary(index) {
	return {
		login: `octocat-${index}-${longText("login", 560)}`,
		id: index,
		type: longText("User", 160),
		html_url: longText("https://github.com/users", 560),
		url: longText("https://api.github.com/users", 560),
	};
}

function projectSummary(index) {
	return {
		id: `PVT_${index}_${longText("id", 560)}`,
		title: longText("Project", 560),
		number: index,
		owner: longText("owner", 560),
		ownerType: "user",
		url: longText("https://github.com/users/owner/projects", 560),
		shortDescription: longText("short", 560),
		closed: false,
		public: true,
	};
}

function projectFieldSummary(index) {
	return {
		id: `PVTF_${index}_${longText("field", 560)}`,
		name: longText("Field", 560),
		dataType: longText("TEXT", 160),
		type: longText("ProjectV2Field", 160),
		options: Array.from({ length: MAX_TOOL_PROJECT_FIELD_OPTIONS + 2 }, (_, optionIndex) => ({
			id: `option-${optionIndex}-${longText("id", 560)}`,
			name: longText("option", 560),
			color: longText("blue", 80),
			description: longText("option-description", 560),
		})),
		iterations: Array.from({ length: MAX_TOOL_PROJECT_ITERATIONS + 2 }, (_, iterationIndex) => ({
			id: `iteration-${iterationIndex}-${longText("id", 560)}`,
			title: longText("iteration", 560),
			startDate: "2026-07-02".repeat(8),
			duration: 14,
		})),
		completedIterations: Array.from({ length: MAX_TOOL_PROJECT_ITERATIONS + 2 }, (_, iterationIndex) => ({
			id: `completed-${iterationIndex}-${longText("id", 560)}`,
			title: longText("completed", 560),
			startDate: "2026-06-02".repeat(8),
			duration: 7,
		})),
	};
}

function developmentLinkSummary(index) {
	return {
		type: index % 2 === 0 ? "pull_request" : "commit",
		referenceTypes: Array.from({ length: MAX_TOOL_CHANGED_FIELDS + 2 }, (_, item) => `ref-${item}`),
		number: index,
		title: longText("PR", 560),
		state: index % 2 === 0 ? "merged" : "unknown-state",
		html_url: longText("https://github.com/pulls", 560),
		branchName: longText("branch", 220),
		baseBranchName: longText("base", 220),
		commitOid: longText("abcdef", 160),
		message: `${longText("message", 560)} ${TOKEN}`,
		willCloseTarget: true,
		closedBy: false,
		isDraft: false,
	};
}

function bulkResultSummary(index) {
	return {
		number: index,
		action: longText("bulk-action", 160),
		status: index % 2 === 0 ? "success" : "unexpected-status",
		message: `${longText("bulk-message", 900)} ${TOKEN}`,
		issue: issueSummary(index, {
			labels: Array.from({ length: MAX_TOOL_LABELS + 2 }, (_, item) => `label-${item}`),
			assignees: Array.from({ length: MAX_TOOL_ASSIGNEES + 2 }, (_, item) => `user-${item}`),
		}),
		projectItem: {
			id: longText("item", 560),
			type: longText("ISSUE", 160),
			project: projectSummary(index),
			issue: relationship(index),
		},
		paths: Array.from({ length: MAX_TOOL_PATHS + 2 }, (_, item) => `issues/path-${item}.json`),
		removedPaths: Array.from({ length: MAX_TOOL_PATHS + 2 }, (_, item) => `issues/removed-${item}.json`),
		changedFields: Array.from({ length: MAX_TOOL_CHANGED_FIELDS + 2 }, (_, item) => `field-${item}`),
		cacheUpdated: index % 2 === 0,
		needsSync: index % 2 !== 0,
		error: { code: "bad code!", message: `failed ${TOKEN}`, details: { token: TOKEN, body: "secret body", nested: { password: TOKEN } } },
	};
}

function oversizedToolDetails() {
	const labels = Array.from({ length: MAX_TOOL_LABELS + 2 }, (_, index) => labelSummary(index));
	const assignees = Array.from({ length: MAX_TOOL_ASSIGNEES + 2 }, (_, index) => assigneeSummary(index));
	const issueLabels = Array.from({ length: MAX_TOOL_LABELS + 2 }, (_, index) => `label-${index}`);
	const issueAssignees = Array.from({ length: MAX_TOOL_ASSIGNEES + 2 }, (_, index) => `user-${index}`);
	const subIssues = Array.from({ length: MAX_TOOL_ISSUES + 2 }, (_, index) => relationship(index + 10, { title: longText("Sub issue", 560) }));
	return {
		status: "oversized",
		message: `message includes ${TOKEN}`,
		paths: Array.from({ length: MAX_TOOL_PATHS + 2 }, (_, index) => `issues/path-${index}.json`),
		removedPaths: Array.from({ length: MAX_TOOL_PATHS + 2 }, (_, index) => `issues/removed-${index}.json`),
		changedFields: Array.from({ length: MAX_TOOL_CHANGED_FIELDS + 2 }, (_, index) => `changed-${index}`),
		invalidFiles: Array.from({ length: MAX_TOOL_PATHS + 2 }, (_, index) => ({ path: `issues/invalid-${index}.json`, fileName: `invalid-${index}.json`, reason: "issue_file_invalid" })),
		issue: issueSummary(1, { labels: issueLabels, assignees: issueAssignees, parentIssue: relationship(99, { title: longText("Parent", 560) }), subIssues, subIssuesCount: subIssues.length + 10 }),
		comment: { id: 123, html_url: longText("https://github.com/comment", 560), body: "private body should be dropped" },
		issues: Array.from({ length: MAX_TOOL_ISSUES + 2 }, (_, index) => issueSummary(index + 1, { labels: issueLabels, assignees: issueAssignees })),
		labels,
		milestones: Array.from({ length: MAX_TOOL_MILESTONES + 2 }, (_, index) => milestoneSummary(index + 1)),
		assignees,
		project: projectSummary(1),
		projects: Array.from({ length: MAX_TOOL_PROJECTS + 2 }, (_, index) => projectSummary(index + 1)),
		projectFields: Array.from({ length: MAX_TOOL_PROJECT_FIELDS + 2 }, (_, index) => projectFieldSummary(index + 1)),
		projectItem: { id: longText("item", 560), type: longText("ISSUE", 160), project: projectSummary(2), issue: relationship(2, { title: longText("Issue item", 560) }) },
		developmentLinks: Array.from({ length: MAX_TOOL_DEVELOPMENT_LINKS + 2 }, (_, index) => developmentLinkSummary(index + 1)),
		bulkResults: Array.from({ length: MAX_TOOL_ISSUES + 2 }, (_, index) => bulkResultSummary(index + 1)),
		fileActions: Array.from({ length: MAX_TOOL_ISSUES + 2 }, (_, index) => ({ action: "updated", path: `issues/${index}.json`, issue: issueSummary(index + 1, { labels: issueLabels, assignees: issueAssignees }) })),
		error: { code: "bad code!", message: `boom ${TOKEN}`, recoveryHint: `retry ${TOKEN}`, details: { token: TOKEN, password: TOKEN, body: "secret body", visible: longText("visible", 560) } },
	};
}

test("runtime repository, trust, and creator-scope helpers cover valid and refusing paths", async () => {
	assert.equal(issueMeResultPolicyPromptGuideline("issueme_test"), "issueme_test: check details.result, details.status, details.needsSync; partial_success/error may not throw.");
	assert.deepEqual(normalizeRuntimeRepository("owner/repo"), REPOSITORY);
	assert.deepEqual(normalizeRuntimeRepository(REPOSITORY), REPOSITORY);
	assert.throws(() => normalizeRuntimeRepository("not-a-repo"), (error) => assertIssueMeError(error, "invalid_github_repository"));
	assert.throws(() => normalizeRuntimeRepository({ owner: "owner", repo: "other", fullName: "owner/repo" }), (error) => assertIssueMeError(error, "invalid_github_repository"));

	assert.equal(isProjectTrusted({ isProjectTrusted: () => true }), true);
	assert.throws(() => assertTrustedProject({ isProjectTrusted: () => false }, "trust required"), (error) => assertIssueMeError(error, "project_untrusted"));

	assert.equal(allowedIssueCreator({}), "all");
	assert.equal(allowedIssueCreator({ allowedIssueCreator: "OctoCat" }), "OctoCat");
	assert.equal(isCreatorScopeRestricted({ allowedIssueCreator: "all" }), false);
	assert.equal(isCreatorScopeRestricted({ allowedIssueCreator: "OctoCat" }), true);
	assert.equal(issueCreatorScopeLabel({}), "all");
	assert.equal(issueCreatorScopeLabel({ allowedIssueCreator: "OctoCat" }), "OctoCat");

	assert.equal(issueCreatorMatchesConfig({ allowedIssueCreator: "OctoCat" }, "octocat"), true);
	assert.equal(issueCreatorMatchesConfig({ allowedIssueCreator: "OctoCat" }, { user: { login: "OCTOCAT" } }), true);
	assert.equal(issueCreatorMatchesConfig({ allowedIssueCreator: "OctoCat" }, { author: { login: "octocat" } }), true);
	assert.equal(issueCreatorMatchesConfig({ allowedIssueCreator: "OctoCat" }, { creator: "other" }), false);
	assert.equal(issueCreatorMatchesConfig({ allowedIssueCreator: "all" }, { creator: "legacy-missing" }), true);
	assert.equal(extractIssueCreator({ user: { login: "octocat" } }), "octocat");
	assert.equal(extractIssueCreator({ author: { login: "author" } }), "author");
	assert.equal(extractIssueCreator({ creator: "creator" }), "creator");

	assert.doesNotThrow(() => assertIssueCreatorAllowed({ allowedIssueCreator: "octocat" }, { number: 7, user: { login: "OctoCat" } }, { repository: REPOSITORY.fullName, operation: "read" }));
	assert.throws(() => assertIssueCreatorAllowed({ allowedIssueCreator: "octocat" }, { number: 8, user: { login: "other" } }, { repository: REPOSITORY.fullName, operation: "read" }), (error) => {
		assertIssueMeError(error, "issue_creator_not_allowed");
		assert.equal(error.safeDetails.issueNumber, 8);
		assert.equal(error.safeDetails.allowedIssueCreator, "octocat");
		return true;
	});

	const runtime = { config: { allowedIssueCreator: "OctoCat" }, repository: REPOSITORY.fullName, client: { getAuthenticatedUserLogin: async () => "octocat" } };
	await assert.doesNotReject(() => assertAuthenticatedUserAllowedForCreate(runtime));
	const mismatchRuntime = { config: { allowedIssueCreator: "OctoCat" }, repository: REPOSITORY.fullName, client: { getAuthenticatedUserLogin: async () => "other" } };
	await assert.rejects(() => assertAuthenticatedUserAllowedForCreate(mismatchRuntime), (error) => assertIssueMeError(error, "issue_creator_not_allowed"));
});

test("runtime list sanitizers and issue body validators normalize edge cases", () => {
	assert.deepEqual(sanitizeStringList([" bug ", "", "bug", "feature"], "labels"), ["bug", "feature"]);
	assert.throws(() => sanitizeStringList(["bad\nlabel"], "labels"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.throws(() => sanitizeStringList(["bad\0label"], "labels"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.deepEqual(sanitizeGitHubLoginList([" octocat ", "octocat", "hubot-1"], "assignees"), ["octocat", "hubot-1"]);
	assert.throws(() => sanitizeGitHubLoginList(["bad_login"], "assignees"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.equal(sanitizeStringList(Array.from({ length: MAX_TOOL_LABELS }, (_, index) => `label-${index}`), "labels").length, MAX_TOOL_LABELS);
	assert.throws(
		() => sanitizeStringList(Array.from({ length: MAX_TOOL_LABELS + 1 }, () => "duplicate"), "labels"),
		(error) => assertIssueMeError(error, "invalid_tool_input") && error.safeDetails?.max === MAX_TOOL_LABELS,
	);
	assert.equal(sanitizeGitHubLoginList(Array.from({ length: MAX_TOOL_ASSIGNEES }, (_, index) => `user-${index}`), "assignees").length, MAX_TOOL_ASSIGNEES);
	assert.throws(
		() => sanitizeGitHubLoginList(Array.from({ length: MAX_TOOL_ASSIGNEES + 1 }, () => "octocat"), "assignees"),
		(error) => assertIssueMeError(error, "invalid_tool_input") && error.safeDetails?.max === MAX_TOOL_ASSIGNEES,
	);
	assert.deepEqual(requireNonEmptyStrings(["  docs  "], "labels"), ["docs"]);
	assert.throws(() => requireNonEmptyStrings(["  "], "labels"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.deepEqual(requireNonEmptyGitHubLogins(["octocat"], "assignees"), ["octocat"]);
	assert.throws(() => requireNonEmptyGitHubLogins([], "assignees"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.equal(requireNonEmptyTitle("  Keep title  "), "Keep title");
	assert.throws(() => requireNonEmptyTitle("   "), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.equal(normalizeIssueBody("Body", "create"), "Body");
	assert.equal(normalizeIssueBody("", "update"), "");
	assert.throws(() => normalizeIssueBody("   ", "create"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.throws(() => normalizeIssueBody("   ", "update"), (error) => assertIssueMeError(error, "invalid_tool_input"));
	assert.deepEqual(listChangedFields({ title: "New", body: undefined, labels: [] }), ["title", "labels"]);
});

test("runtime safe error helpers redact sensitive fields and preserve recovery guidance", () => {
	const issueMeError = new IssueMeError("invalid_tool_input", `Bad token ${TOKEN}`, { token: TOKEN, password: TOKEN, body: "secret body", visible: `visible ${TOKEN}` });
	const safeIssueMeError = safeToolError(issueMeError);
	assert.equal(safeIssueMeError.code, "invalid_tool_input");
	assert.equal(safeIssueMeError.details.token, "[REDACTED]");
	assert.equal(safeIssueMeError.details.password, "[REDACTED]");
	assert.equal(safeIssueMeError.details.body, "[REDACTED]");
	assertTokenRedacted(safeIssueMeError);

	const apiError = safeToolError(new GitHubApiError(`GitHub failed ${TOKEN}`, { status: 403, path: "/repos/owner/repo/issues", rateLimit: { remaining: 0 } }));
	assert.equal(apiError.code, "github_api_error");
	assert.equal(apiError.details.status, 403);
	assertTokenRedacted(apiError);

	const nodeError = new Error("EACCES");
	nodeError.code = "EACCES";
	const safeNodeError = safeToolError(nodeError);
	assert.equal(safeNodeError.code, "node_eacces");
	assert.equal(safeNodeError.details.nodeCode, "EACCES");
	assert.equal(safeToolError(new Error(`plain ${TOKEN}`)).code, "local_cache_error");
	assert.equal(safeToolError("not an error").code, "local_cache_error");

	const partialError = partialSuccessToolError(issueMeError, "partial_success_after_remote");
	assert.equal(partialError.details.partialSuccessCode, "partial_success_cache_sync_required");
	assert.equal(partialError.details.partialSuccessStatus, "partial_success_after_remote");
	assert.match(partialError.details.partialSuccessRecoveryHint, /issueme_sync_issues/);
	assertTokenRedacted(partialError);

	const partialText = partialSuccessToolText("Remote mutation completed", issueMeError, { repository: REPOSITORY.fullName }, "partial_success_after_remote", "cache_refresh_failed");
	assert.equal(partialText.details.result, "partial_success");
	assert.equal(partialText.details.cacheUpdated, false);
	assert.equal(partialText.details.needsSync, true);
	assert.equal(partialText.details.status, "cache_refresh_failed");
	assertTokenRedacted(partialText);
});

test("runtime tool text and detail bounding truncate all public detail collections", () => {
	const bounded = boundToolDetails(oversizedToolDetails());
	assert.equal(bounded.result, "error");
	assert.equal(bounded.truncated, true);
	assert.equal(bounded.paths.length, MAX_TOOL_PATHS);
	assert.equal(bounded.removedPaths.length, MAX_TOOL_PATHS);
	assert.equal(bounded.changedFields.length, MAX_TOOL_CHANGED_FIELDS);
	assert.equal(bounded.invalidFiles.length, MAX_TOOL_PATHS);
	assert.equal(bounded.issues.length, MAX_TOOL_ISSUES);
	assert.equal(bounded.labels.length, MAX_TOOL_LABELS);
	assert.equal(bounded.milestones.length, MAX_TOOL_MILESTONES);
	assert.equal(bounded.assignees.length, MAX_TOOL_ASSIGNEES);
	assert.equal(bounded.projects.length, MAX_TOOL_PROJECTS);
	assert.equal(bounded.projectFields.length, MAX_TOOL_PROJECT_FIELDS);
	assert.equal(bounded.developmentLinks.length, MAX_TOOL_DEVELOPMENT_LINKS);
	assert.equal(bounded.bulkResults.length, MAX_TOOL_ISSUES);
	assert.equal(bounded.fileActions.length, MAX_TOOL_ISSUES);
	assert.equal(bounded.issue.labels.length, MAX_TOOL_LABELS);
	assert.equal(bounded.issue.assignees.length, MAX_TOOL_ASSIGNEES);
	assert.equal(bounded.issue.subIssues.length, MAX_TOOL_ISSUES);
	assert.equal(bounded.comment.body, undefined);
	assert.equal(bounded.projectFields[0].options.length, MAX_TOOL_PROJECT_FIELD_OPTIONS);
	assert.equal(bounded.projectFields[0].iterations.length, MAX_TOOL_PROJECT_ITERATIONS);
	assert.equal(bounded.projectFields[0].completedIterations.length, MAX_TOOL_PROJECT_ITERATIONS);
	assert.equal(bounded.bulkResults[0].status, "failed");
	assert.equal(bounded.bulkResults[0].paths.length, MAX_TOOL_PATHS);
	assert.equal(bounded.bulkResults[0].changedFields.length, MAX_TOOL_CHANGED_FIELDS);
	assert.equal(bounded.error.details.token, "[REDACTED]");
	assert.equal(bounded.error.details.body, "[REDACTED]");
	assert.ok(bounded.truncation.paths);
	assert.ok(bounded.truncation.issue.labels);
	assert.ok(bounded.truncation.projectFields.options);
	assert.ok(bounded.truncation.developmentLinks.referenceTypes);
	assert.ok(bounded.truncation.bulkResults.paths);
	assertTokenRedacted(bounded);

	const textResult = toolText("A".repeat(MAX_TOOL_TEXT_CHARS + 200), oversizedToolDetails());
	assert.equal(textResult.content[0].text.length <= MAX_TOOL_TEXT_CHARS, true);
	assert.match(textResult.content[0].text, /IssueMe tool output truncated/);
	assert.equal(textResult.details.truncated, true);
	assert.ok(textResult.details.truncation.content);
	assert.equal(textResult.details.result, "error");
	assertTokenRedacted(textResult);
});
