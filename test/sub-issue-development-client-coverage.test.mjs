import assert from "node:assert/strict";
import test from "node:test";

import { MAX_TOOL_DEVELOPMENT_LINKS, MAX_TOOL_ISSUES } from "../src/constants.ts";
import { GitHubApiError, IssueMeError } from "../src/errors.ts";
import { mapGitHubGraphQLError } from "../src/github/graphql-errors.ts";
import {
	assertReorderableSubIssueList,
	buildSubIssueRelationshipsQuery,
	moveNativeSubIssue,
	nativeSubIssueToSafeSummary,
	normalizeNativeSubIssueRelationshipResult,
	normalizeNativeSubIssueSummary,
	normalizeReprioritizeSubIssueResult,
	normalizeSubIssueMutationResult,
	normalizeSubIssueRelationshipLimit,
	normalizeSubIssueReorderNumbers,
	requireIssueNodeId,
} from "../src/github/sub-issues-client.ts";
import {
	buildIssueDevelopmentLinksQuery,
	normalizeIssueDevelopmentLinkLimit,
	normalizeIssueDevelopmentLinksResult,
} from "../src/github/development-links-client.ts";

const REPOSITORY = "owner/repo";

function nativeIssue(number, title, overrides = {}) {
	return {
		id: `I_${number}`,
		number,
		title,
		state: "OPEN",
		url: `https://github.com/${REPOSITORY}/issues/${number}`,
		author: { login: `author-${number}` },
		...overrides,
	};
}

function relationshipData({ issue = nativeIssue(1, "Parent"), parent = null, children = [], totalCount = children.length, hasNextPage = false } = {}) {
	return {
		repository: {
			issue: {
				...issue,
				parent,
				subIssues: {
					totalCount,
					nodes: children,
					pageInfo: { hasNextPage },
				},
			},
		},
	};
}

function developmentIssue(number = 42, title = "Feature issue") {
	return nativeIssue(number, title, { author: { login: "hubot" } });
}

function pullRequest(number, title, overrides = {}) {
	return {
		__typename: "PullRequest",
		number,
		title,
		state: "OPEN",
		merged: false,
		url: `https://github.com/${REPOSITORY}/pull/${number}`,
		headRefName: `feature/${number}`,
		baseRefName: "main",
		isDraft: false,
		...overrides,
	};
}

function commit(oid, message, overrides = {}) {
	return {
		__typename: "Commit",
		oid,
		messageHeadline: message,
		url: `https://github.com/${REPOSITORY}/commit/${oid}`,
		...overrides,
	};
}

function developmentLinksData({ events, totalCount = events.length, hasNextPage = false, issue = developmentIssue() }) {
	return {
		repository: {
			issue: {
				...issue,
				timelineItems: {
					totalCount,
					nodes: events,
					pageInfo: { hasNextPage },
				},
			},
		},
	};
}

function assertInvalidToolInput(fn) {
	assert.throws(fn, (error) => error instanceof IssueMeError && error.code === "invalid_tool_input");
}

function assertGitHubShapeError(fn) {
	assert.throws(fn, (error) => error instanceof GitHubApiError && error.code === "github_response_shape_invalid");
}

test("GraphQL error mapper handles forbidden status for all IssueMe GraphQL domains", () => {
	const subIssue = mapGitHubGraphQLError({ operationName: "IssueMeListSubIssues", detail: "blocked", status: 403 });
	const project = mapGitHubGraphQLError({ operationName: "IssueMeUpdateProjectV2ItemFieldValue", detail: "blocked", status: 403 });
	const development = mapGitHubGraphQLError({ operationName: "IssueMeListIssueDevelopmentLinks", detail: "blocked", status: 403 });
	const unknown = mapGitHubGraphQLError({ operationName: "OtherOperation", detail: "blocked", status: 403 });

	assert.ok(subIssue instanceof GitHubApiError);
	assert.equal(subIssue.code, "github_sub_issue_forbidden");
	assert.match(subIssue.message, /ListSubIssues was forbidden/);
	assert.ok(project instanceof GitHubApiError);
	assert.equal(project.code, "github_projects_v2_forbidden");
	assert.match(project.message, /project item management/);
	assert.ok(development instanceof GitHubApiError);
	assert.equal(development.code, "github_development_links_forbidden");
	assert.equal(unknown, undefined);
});

test("sub-issue query builders and input normalizers cover validation edges", () => {
	const query = buildSubIssueRelationshipsQuery();
	assert.match(query, /query IssueMeListSubIssues/);
	assert.match(query, /parent/);
	assert.match(query, /subIssues\(first: \$first\)/);
	assert.equal(normalizeSubIssueRelationshipLimit(undefined), 25);
	assert.equal(normalizeSubIssueRelationshipLimit(1), 1);
	assert.equal(normalizeSubIssueRelationshipLimit(100), 100);
	assertInvalidToolInput(() => normalizeSubIssueRelationshipLimit(0));
	assertInvalidToolInput(() => normalizeSubIssueRelationshipLimit(101));
	assertInvalidToolInput(() => normalizeSubIssueRelationshipLimit(1.5));
	assert.deepEqual(normalizeSubIssueReorderNumbers([2, 3], 1), [2, 3]);
	assertInvalidToolInput(() => normalizeSubIssueReorderNumbers(undefined, 1));
	assertInvalidToolInput(() => normalizeSubIssueReorderNumbers([1], 1));
	assertInvalidToolInput(() => normalizeSubIssueReorderNumbers([2, 2], 1));
	assertInvalidToolInput(() => normalizeSubIssueReorderNumbers([0], 1));
	assertInvalidToolInput(() => normalizeSubIssueReorderNumbers(Array.from({ length: MAX_TOOL_ISSUES + 1 }, (_, index) => index + 2), 1));
});

test("sub-issue normalizers cover relationship, mutation, reorder, and summary branches", () => {
	const parent = nativeIssue(1, "Parent", { author: undefined });
	const child = nativeIssue(2, "Child", { url: "", author: { login: "ChildUser" } });
	const result = normalizeNativeSubIssueRelationshipResult(
		relationshipData({ issue: parent, children: [child], totalCount: 3, hasNextPage: true }),
		REPOSITORY,
		1,
		1,
	);

	assert.equal(result.issue.creator, undefined);
	assert.equal(result.subIssues[0].creator, "ChildUser");
	assert.equal(result.subIssues[0].html_url, "https://github.com/owner/repo/issues/2");
	assert.equal(result.subIssuesCount, 3);
	assert.equal(result.truncated, true);
	assert.deepEqual(nativeSubIssueToSafeSummary(REPOSITORY, result.subIssues[0]), {
		repository: REPOSITORY,
		number: 2,
		title: "Child",
		state: "open",
		creator: "ChildUser",
		labels: [],
		assignees: [],
		html_url: "https://github.com/owner/repo/issues/2",
	});

	const addResult = normalizeSubIssueMutationResult({ addSubIssue: { issue: parent, subIssue: child } }, "addSubIssue", REPOSITORY);
	assert.equal(addResult.parent.number, 1);
	assert.equal(addResult.child.number, 2);
	const removeResult = normalizeSubIssueMutationResult({ removeSubIssue: { issue: parent, subIssue: child } }, "removeSubIssue", REPOSITORY);
	assert.equal(removeResult.child.number, 2);
	const reprioritized = normalizeReprioritizeSubIssueResult({ reprioritizeSubIssue: { issue: parent } }, REPOSITORY, removeResult.child);
	assert.equal(reprioritized.parent.number, 1);
	assert.equal(reprioritized.child.number, 2);

	assert.deepEqual(moveNativeSubIssue([addResult.parent, addResult.child], 2, { beforeNumber: 1 }).map((issue) => issue.number), [2, 1]);
	assert.deepEqual(moveNativeSubIssue([addResult.parent, addResult.child], 1, { afterNumber: 2 }).map((issue) => issue.number), [2, 1]);
	assert.deepEqual(moveNativeSubIssue([addResult.parent, addResult.child], 99, { beforeNumber: 1 }).map((issue) => issue.number), [1, 2]);
	assert.equal(requireIssueNodeId({ node_id: "I_123" }, "issue"), "I_123");
	assert.throws(() => requireIssueNodeId({}, "issue"), (error) => error instanceof GitHubApiError && error.code === "github_issue_shape_invalid");
	assert.equal(normalizeNativeSubIssueSummary({ ...nativeIssue(9, "Bad"), state: "MYSTERY" }, REPOSITORY), undefined);
	assertGitHubShapeError(() => normalizeNativeSubIssueRelationshipResult(relationshipData({ children: [{ id: "broken" }] }), REPOSITORY, 1, 25));
	assertGitHubShapeError(() => normalizeSubIssueMutationResult({ addSubIssue: { issue: parent } }, "addSubIssue", REPOSITORY));
	assertGitHubShapeError(() => normalizeReprioritizeSubIssueResult({ reprioritizeSubIssue: {} }, REPOSITORY, addResult.child));
});

test("sub-issue reorder preflight detects incomplete, truncated, and closed relationships", () => {
	const openParent = normalizeNativeSubIssueSummary(nativeIssue(1, "Parent"), REPOSITORY);
	const firstChild = normalizeNativeSubIssueSummary(nativeIssue(2, "First"), REPOSITORY);
	const secondChild = normalizeNativeSubIssueSummary(nativeIssue(3, "Second"), REPOSITORY);
	assert.ok(openParent);
	assert.ok(firstChild);
	assert.ok(secondChild);
	const relationship = { issue: openParent, parentIssue: null, subIssues: [firstChild, secondChild], subIssuesCount: 2, truncated: false };

	assert.doesNotThrow(() => assertReorderableSubIssueList(REPOSITORY, 1, [3, 2], relationship));
	assertInvalidToolInput(() => assertReorderableSubIssueList(REPOSITORY, 1, [2], relationship));
	assertInvalidToolInput(() => assertReorderableSubIssueList(REPOSITORY, 1, [2, 4], relationship));
	assertInvalidToolInput(() => assertReorderableSubIssueList(REPOSITORY, 1, [2, 3], { ...relationship, truncated: true }));
	assert.throws(
		() => assertReorderableSubIssueList(REPOSITORY, 1, [2, 3], { ...relationship, issue: { ...openParent, state: "closed" } }),
		(error) => error instanceof IssueMeError && error.code === "closed_issue_mutation_refused",
	);
	assert.throws(
		() => assertReorderableSubIssueList(REPOSITORY, 1, [2, 3], { ...relationship, subIssues: [{ ...firstChild, state: "closed" }, secondChild] }),
		(error) => error instanceof IssueMeError && error.code === "closed_issue_mutation_refused",
	);
});

test("development-link query builders, limits, and normalizers merge PR and commit references", () => {
	const query = buildIssueDevelopmentLinksQuery();
	assert.match(query, /query IssueMeListIssueDevelopmentLinks/);
	assert.match(query, /timelineItems/);
	assert.match(query, /CONNECTED_EVENT/);
	assert.equal(normalizeIssueDevelopmentLinkLimit(undefined), 25);
	assert.equal(normalizeIssueDevelopmentLinkLimit(MAX_TOOL_DEVELOPMENT_LINKS), MAX_TOOL_DEVELOPMENT_LINKS);
	assertInvalidToolInput(() => normalizeIssueDevelopmentLinkLimit(0));
	assertInvalidToolInput(() => normalizeIssueDevelopmentLinkLimit(MAX_TOOL_DEVELOPMENT_LINKS + 1));

	const pr = pullRequest(7, "Implement feature", { merged: true, isDraft: true });
	const closedPr = pullRequest(8, "Closed attempt", { state: "CLOSED", merged: false, headRefName: "" });
	const commitNode = commit("abcdef1234567890", "Reference issue");
	const result = normalizeIssueDevelopmentLinksResult(
		developmentLinksData({
			events: [
				{ __typename: "ConnectedEvent", subject: pr },
				{ __typename: "CrossReferencedEvent", willCloseTarget: true, source: pr },
				{ __typename: "ClosedEvent", closer: closedPr },
				{ __typename: "ReferencedEvent", commit: commitNode },
				{ __typename: "ClosedEvent", closer: { oid: "abcdef1234567890", messageHeadline: "Closed by commit" } },
				{ __typename: "MysteryEvent", source: pr },
				{ __typename: "ReferencedEvent", commit: { messageHeadline: "missing oid" } },
			],
			totalCount: 9,
			hasNextPage: true,
		}),
		REPOSITORY,
		42,
		5,
	);

	assert.equal(result.issue.number, 42);
	assert.equal(result.truncated, true);
	assert.equal(result.timelineEventCount, 9);
	assert.equal(result.links.length, 3);
	const mergedPr = result.links.find((link) => link.type === "pull_request" && link.number === 7);
	assert.deepEqual(mergedPr.referenceTypes, ["connected", "closing_reference"]);
	assert.equal(mergedPr.state, "merged");
	assert.equal(mergedPr.willCloseTarget, true);
	assert.equal(mergedPr.isDraft, true);
	const closedByPr = result.links.find((link) => link.type === "pull_request" && link.number === 8);
	assert.equal(closedByPr.state, "closed");
	assert.equal(closedByPr.closedBy, true);
	assert.equal(closedByPr.branchName, undefined);
	const mergedCommit = result.links.find((link) => link.type === "commit");
	assert.equal(mergedCommit.commitOid, "abcdef1234567890");
	assert.deepEqual(mergedCommit.referenceTypes, ["commit_reference", "closed_by"]);
	assert.equal(mergedCommit.closedBy, true);
});

test("development-link normalizers reject inaccessible or malformed GraphQL shapes safely", () => {
	assert.throws(
		() => normalizeIssueDevelopmentLinksResult({}, REPOSITORY, 42, 25),
		(error) => error instanceof GitHubApiError && error.code === "github_response_shape_invalid",
	);
	assert.throws(
		() => normalizeIssueDevelopmentLinksResult({ repository: { issue: null } }, REPOSITORY, 42, 25),
		(error) => error instanceof GitHubApiError && error.code === "github_api_error",
	);
	assertGitHubShapeError(() => normalizeIssueDevelopmentLinksResult({ repository: { issue: { ...developmentIssue(), timelineItems: null } } }, REPOSITORY, 42, 25));
	assertGitHubShapeError(() => normalizeIssueDevelopmentLinksResult(developmentLinksData({ issue: { ...developmentIssue(), title: "" }, events: [] }), REPOSITORY, 42, 25));
});
