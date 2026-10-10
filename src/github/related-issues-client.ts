import { GITHUB_API_BASE_URL } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { GitHubIssueResponse, GitHubRepository, ToolRelatedIssueSummary } from "../types.ts";
import { normalizeGraphQLIssueCreator } from "./graphql-normalizers.ts";
import { assertIssueDependencyMember, dependencyMemberRepository } from "./issue-dependencies-client.ts";
import { isObject } from "./shared.ts";

/**
 * Native related-issue helpers for GitHub's REST `relates_to` collection.
 *
 * Related issues are neither prerequisites (dependencies) nor decomposition (sub-issues). The
 * mutation identifies the other issue by its integer database `id`, exactly like dependencies.
 * GitHub documents one `relates_to` collection per issue and does not state whether the edge is
 * mirrored, so IssueMe reports only the collection it read and never assumes the reverse edge.
 */

export const RELATED_ISSUE_PREFLIGHT_PAGE_CAP = 10;

export type RelatedIssueMutationAction = "add" | "remove";

export function relatedIssuesPath(issueNumber: number): string {
	return `/issues/${issueNumber}/relates_to`;
}

export function relatedIssueRemovalPath(issueNumber: number, relatedIssueId: number): string {
	return `/issues/${issueNumber}/relates_to/${relatedIssueId}`;
}

export function assertDistinctRelatedNumbers(issueNumber: number, relatedIssueNumber: number): void {
	if (issueNumber !== relatedIssueNumber) return;
	throw new IssueMeError(
		ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
		"relatedIssueNumber must differ from issueNumber; an issue cannot relate to itself.",
		{ field: "relatedIssueNumber", issueNumber, relatedIssueNumber },
	);
}

export function normalizeRelatedIssueSummary(issue: GitHubIssueResponse, repository: GitHubRepository): ToolRelatedIssueSummary {
	assertIssueDependencyMember(issue);
	const title = typeof issue.title === "string" && issue.title.trim() ? issue.title : `#${issue.number}`;
	const memberRepository = dependencyMemberRepository(issue) ?? repository.fullName;
	const summary: ToolRelatedIssueSummary = {
		number: issue.number,
		title,
		html_url: typeof issue.html_url === "string" && issue.html_url.trim() ? issue.html_url : `https://github.com/${memberRepository}/issues/${issue.number}`,
		repository: memberRepository,
	};
	if (issue.state === "open" || issue.state === "closed") summary.state = issue.state;
	const creator = normalizeGraphQLIssueCreator(issue.user);
	if (creator) summary.creator = creator;
	if (typeof issue.id === "number" && Number.isSafeInteger(issue.id) && issue.id > 0) summary.id = issue.id;
	return summary;
}

export function mapRelatedIssueReadError(error: unknown): GitHubApiError | undefined {
	if (!(error instanceof GitHubApiError)) return undefined;
	if (error.status === 404 || error.status === 410) return relatedIssuesUnsupportedError(error.message);
	return undefined;
}

export function mapRelatedIssueMutationError(error: unknown, action: RelatedIssueMutationAction): GitHubApiError | undefined {
	if (!(error instanceof GitHubApiError)) return undefined;
	if (error.status === 422) return relatedIssueRefusedError(action, error.message);
	if (action === "add" && (error.status === 404 || error.status === 410)) return relatedIssuesUnsupportedError(error.message);
	return undefined;
}

export function isRelatedIssueRemovalNotFound(error: unknown): boolean {
	return error instanceof GitHubApiError && error.status === 404;
}

export function isRelatedIssueMember(value: unknown): value is GitHubIssueResponse & { number: number } {
	return isObject(value) && typeof value.number === "number" && Number.isSafeInteger(value.number) && value.number > 0;
}

function relatedIssuesUnsupportedError(detail: string): GitHubApiError {
	return new GitHubApiError(
		`GitHub did not expose native related issues for this repository or token. IssueMe did not fall back to body-text references. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_RELATED_ISSUES_UNSUPPORTED,
			status: 404,
			path: `${GITHUB_API_BASE_URL}/repos`,
			recoveryHint: "Confirm the repository exposes GitHub's related-issue feature to this token, or manage related issues in GitHub's UI; IssueMe will not invent body-only relationships.",
			mutationSettlement: "no_remote_success_known",
		},
	);
}

function relatedIssueRefusedError(action: RelatedIssueMutationAction, detail: string): GitHubApiError {
	return new GitHubApiError(
		`GitHub refused to ${action} the related-issue link (validation failed). GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_RELATED_ISSUE_REFUSED,
			status: 422,
			recoveryHint: "Inspect both issues with issueme_list_related_issues and choose a different relationship if GitHub keeps refusing it.",
			mutationSettlement: "no_remote_success_known",
		},
	);
}
