import assert from "node:assert/strict";
import test from "node:test";

import { MAX_TOOL_ISSUES } from "../src/constants.ts";
import { GitHubApiError, IssueMeError } from "../src/errors.ts";
import {
	buildIssueDevelopmentLinksQuery,
	normalizeIssueDevelopmentLinksResult,
} from "../src/github/development-links-client.ts";
import {
	buildSubIssueRelationshipsQuery,
	moveNativeSubIssue,
	normalizeNativeSubIssueRelationshipResult,
	normalizeNativeSubIssueSummary,
	normalizeReprioritizeSubIssueResult,
	normalizeSubIssueMutationResult,
} from "../src/github/sub-issues-client.ts";
import { registerListIssueDevelopmentLinksTool } from "../src/tools/development-links.ts";
import { registerSubIssueTools } from "../src/tools/sub-issue.ts";
import {
	TEST_REPOSITORY,
	TEST_REPOSITORY_OBJECT,
	assertNoSecretLeak,
	createFakePi,
	createFakeToolContext,
	executeRegisteredTool,
	githubIssue,
	issueMeConfig,
	tempProject,
} from "./helpers/issueme-test-helpers.mjs";

function rawNativeIssue(number, title, overrides = {}) {
	return {
		id: `I_${number}`,
		number,
		title,
		state: "OPEN",
		url: `https://github.com/${TEST_REPOSITORY}/issues/${number}`,
		author: { login: "octocat" },
		...overrides,
	};
}

function nativeSummary(number, title, overrides = {}) {
	const summary = normalizeNativeSubIssueSummary(rawNativeIssue(number, title, overrides), TEST_REPOSITORY);
	assert.ok(summary, `Expected valid native issue summary for #${number}`);
	return summary;
}

function relationship(overrides = {}) {
	const subIssues = overrides.subIssues ?? [nativeSummary(2, "Child")];
	return {
		issue: overrides.issue ?? nativeSummary(1, "Parent"),
		parentIssue: overrides.parentIssue ?? null,
		subIssues,
		subIssuesCount: overrides.subIssuesCount ?? subIssues.length,
		truncated: overrides.truncated ?? false,
	};
}

function relationshipData(issueNode) {
	return { repository: { issue: issueNode } };
}

function timelineData(events, overrides = {}) {
	return {
		repository: {
			issue: {
				...rawNativeIssue(42, "Feature issue"),
				timelineItems: {
					totalCount: overrides.totalCount ?? events.length,
					nodes: events,
					pageInfo: { hasNextPage: overrides.hasNextPage ?? false },
				},
			},
		},
	};
}

function assertGitHubShapeError(fn) {
	assert.throws(fn, (error) => error instanceof GitHubApiError && error.code === "github_response_shape_invalid");
}

function assertInvalidToolInput(error, field) {
	assert.ok(error instanceof IssueMeError);
	assert.equal(error.code, "invalid_tool_input");
	if (field) assert.equal(error.safeDetails.field, field);
	return true;
}

function registerSubIssueToolsWithRuntime(runtime) {
	const pi = createFakePi();
	registerSubIssueTools(pi, { runtime });
	return pi.tools;
}

function registerDevelopmentLinksToolWithRuntime(runtime) {
	const pi = createFakePi();
	registerListIssueDevelopmentLinksTool(pi, { runtime });
	return pi.tools;
}

function toolRuntimeWithClient(client) {
	return {
		config: issueMeConfig(),
		repository: TEST_REPOSITORY_OBJECT,
		client,
	};
}

test("relationship query builders expose native sub-issue and development-link GraphQL shapes", () => {
	const subIssueQuery = buildSubIssueRelationshipsQuery();
	assert.match(subIssueQuery, /query IssueMeListSubIssues/);
	assert.match(subIssueQuery, /parent/);
	assert.match(subIssueQuery, /subIssues\(first: \$first\)/);
	assert.match(subIssueQuery, /pageInfo \{ hasNextPage \}/);

	const developmentQuery = buildIssueDevelopmentLinksQuery();
	assert.match(developmentQuery, /query IssueMeListIssueDevelopmentLinks/);
	assert.match(developmentQuery, /CONNECTED_EVENT/);
	assert.match(developmentQuery, /CROSS_REFERENCED_EVENT/);
	assert.match(developmentQuery, /fragment IssueMeDevelopmentPullRequest/);
	assert.match(developmentQuery, /fragment IssueMeDevelopmentCommit/);
});

test("sub-issue normalizers cover invalid GraphQL shapes and no-position reorder planning", () => {
	const parent = nativeSummary(1, "Parent");
	const child = nativeSummary(2, "Child");
	assert.deepEqual(moveNativeSubIssue([parent, child], 2, {}).map((issue) => issue.number), [1, 2]);
	assertGitHubShapeError(() => normalizeSubIssueMutationResult({}, "addSubIssue", TEST_REPOSITORY));
	assertGitHubShapeError(() => normalizeReprioritizeSubIssueResult({}, TEST_REPOSITORY, child));
	assertGitHubShapeError(() => normalizeNativeSubIssueRelationshipResult({}, TEST_REPOSITORY, 1, 25));
	assert.throws(
		() => normalizeNativeSubIssueRelationshipResult({ repository: { issue: null } }, TEST_REPOSITORY, 1, 25),
		(error) => error instanceof GitHubApiError && error.code === "github_api_error",
	);
	assertGitHubShapeError(() => normalizeNativeSubIssueRelationshipResult(relationshipData({ ...rawNativeIssue(1, ""), title: "" }), TEST_REPOSITORY, 1, 25));
	assertGitHubShapeError(() => normalizeNativeSubIssueRelationshipResult(
		relationshipData({ ...rawNativeIssue(1, "Parent"), parent: { id: "I_broken" }, subIssues: { nodes: [], pageInfo: { hasNextPage: false } } }),
		TEST_REPOSITORY,
		1,
		25,
	));
});

test("development-link normalizer merges URL-only commits and omits unknown PR state", () => {
	const commitUrl = `https://github.com/${TEST_REPOSITORY}/commit/url-only`;
	const result = normalizeIssueDevelopmentLinksResult(
		timelineData([
			{ __typename: "ReferencedEvent", commit: { __typename: "Commit", url: commitUrl, messageHeadline: "URL-only reference" } },
			{ __typename: "ClosedEvent", closer: { __typename: "Commit", url: commitUrl, messageHeadline: "URL-only close" } },
			{ __typename: "ConnectedEvent", subject: { __typename: "PullRequest", number: 11, title: "Unknown state PR", state: "READY", merged: false, url: "" } },
		]),
		TEST_REPOSITORY,
		42,
		25,
	);

	const commitLink = result.links.find((link) => link.type === "commit");
	assert.ok(commitLink);
	assert.equal(commitLink.html_url, commitUrl);
	assert.equal(commitLink.commitOid, undefined);
	assert.deepEqual(commitLink.referenceTypes, ["commit_reference", "closed_by"]);
	assert.equal(commitLink.closedBy, true);
	const prLink = result.links.find((link) => link.type === "pull_request");
	assert.ok(prLink);
	assert.equal(prLink.state, undefined);
	assert.equal(prLink.html_url, `https://github.com/${TEST_REPOSITORY}/pull/11`);
});

test("sub-issue tools reject invalid relationship parameters before runtime resolution", async () => {
	const pi = createFakePi();
	let runtimeCalls = 0;
	registerSubIssueTools(pi, {
		runtime: () => {
			runtimeCalls += 1;
			throw new Error("runtime should not be created for invalid relationship input");
		},
	});
	const context = createFakeToolContext(await tempProject("issueme-relationship-invalid-"));
	const cases = [
		["issueme_reorder_sub_issues", { parentNumber: 1, orderedChildNumbers: [] }, "orderedChildNumbers"],
		["issueme_reorder_sub_issues", { parentNumber: 1, orderedChildNumbers: Array.from({ length: MAX_TOOL_ISSUES + 1 }, (_, index) => index + 2) }, "orderedChildNumbers"],
		["issueme_reorder_sub_issues", { parentNumber: 1, orderedChildNumbers: [1] }, "orderedChildNumbers"],
		["issueme_reorder_sub_issues", { parentNumber: 1, orderedChildNumbers: [2, 2] }, "orderedChildNumbers"],
		["issueme_add_sub_issue", { parentNumber: 1, childNumber: 1 }, undefined],
		["issueme_remove_sub_issue", { parentNumber: 1, childNumber: 1 }, undefined],
	];

	for (const [toolName, params, field] of cases) {
		await assert.rejects(
			() => executeRegisteredTool(pi.tools, toolName, params, { context }),
			(error) => assertInvalidToolInput(error, field),
		);
	}
	assert.equal(runtimeCalls, 0);
});

test("sub-issue tools throw unexpected remove failures and report refresh-cache partial success without live APIs", async () => {
	const removeClient = {
		repository: TEST_REPOSITORY_OBJECT,
		async ensureIssueOpen(issueNumber) {
			return githubIssue({ number: issueNumber, title: issueNumber === 1 ? "Parent" : "Child", node_id: `I_${issueNumber}` });
		},
		async removeSubIssueByIssueResponses() {
			throw new Error("native remove failed");
		},
	};
	const removeTools = registerSubIssueToolsWithRuntime(toolRuntimeWithClient(removeClient));
	const removeRoot = await tempProject("issueme-relationship-remove-");
	await assert.rejects(
		() => executeRegisteredTool(removeTools, "issueme_remove_sub_issue", { parentNumber: 1, childNumber: 2 }, { cwd: removeRoot }),
		/native remove failed/,
	);

	const listClient = {
		repository: TEST_REPOSITORY_OBJECT,
		async listSubIssueRelationships() {
			return relationship();
		},
		async getIssue(issueNumber) {
			return githubIssue({ number: issueNumber, title: issueNumber === 1 ? "Parent" : "Child", node_id: `I_${issueNumber}` });
		},
		async listComments(issueNumber) {
			if (issueNumber === 2) throw new Error("comment cache refresh failed");
			return [];
		},
	};
	const listTools = registerSubIssueToolsWithRuntime(toolRuntimeWithClient(listClient));
	const listResult = await executeRegisteredTool(listTools, "issueme_list_sub_issues", { issueNumber: 1, refreshCache: true }, { cwd: await tempProject("issueme-relationship-list-" ) });
	assert.equal(listResult.details.result, "partial_success");
	assert.equal(listResult.details.status, "partial_success");
	assert.equal(listResult.details.needsSync, true);
	assert.equal(listResult.details.error.details.partialSuccessStatus, "sub_issue_cache_refresh_failed");
	assert.match(listResult.content[0].text, /cache refresh failed/i);
	assertNoSecretLeak({ listResult });
});

test("development-link tool formatting covers missing PR branch/base and commit message", async () => {
	const client = {
		repository: TEST_REPOSITORY_OBJECT,
		async listIssueDevelopmentLinks() {
			return {
				issue: nativeSummary(42, "Feature issue"),
				links: [
					{ type: "pull_request", referenceTypes: ["connected"], number: 7, title: "No branch PR", state: "open", html_url: `https://github.com/${TEST_REPOSITORY}/pull/7` },
					{ type: "pull_request", referenceTypes: ["cross_reference"], number: 8, title: "No base PR", state: "open", html_url: `https://github.com/${TEST_REPOSITORY}/pull/8`, branchName: "feature/no-base" },
					{ type: "commit", referenceTypes: ["commit_reference"], commitOid: "abcdef1234567890" },
				],
				timelineEventCount: 3,
				truncated: false,
			};
		},
	};
	const tools = registerDevelopmentLinksToolWithRuntime(toolRuntimeWithClient(client));
	const result = await executeRegisteredTool(tools, "issueme_list_issue_development_links", { issueNumber: 42 }, { cwd: await tempProject("issueme-relationship-development-" ) });

	assert.equal(result.details.result, "success");
	assert.match(result.content[0].text, /PR #7 \[open\] No branch PR; connected/);
	assert.match(result.content[0].text, /PR #8 \[open\] No base PR; branch feature\/no-base; cross_reference/);
	assert.doesNotMatch(result.content[0].text, /feature\/no-base ->/);
	assert.match(result.content[0].text, /Commit abcdef123456; commit_reference; no URL returned/);
	assertNoSecretLeak(result);
});
