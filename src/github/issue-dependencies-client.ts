import { GITHUB_API_BASE_URL } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { GitHubIssueResponse, GitHubRepository, IssueDependencyDirection, ToolIssueDependencySummary } from "../types.ts";
import { normalizeGraphQLIssueCreator } from "./graphql-normalizers.ts";
import { isPullRequestIssueResponse } from "./issues-client.ts";
import { isObject } from "./shared.ts";

/**
 * Native issue dependency helpers for GitHub's REST `blocked_by` / `blocking` collections.
 *
 * Mutations identify the blocking issue by its integer database `id` (the `issue_id` body/path
 * parameter), never by issue number or GraphQL node ID. These helpers resolve and validate that
 * identity and keep the dependency semantics separate from sub-issues and related issues.
 */

export const ISSUE_DEPENDENCY_DIRECTIONS = ["blocked_by", "blocking"] as const;
/** Bounded preflight scan: at most this many 100-member pages when checking for an existing edge. */
export const ISSUE_DEPENDENCY_PREFLIGHT_PAGE_CAP = 10;

export type IssueDependencyMutationAction = "add" | "remove";

export function normalizeIssueDependencyDirection(value: unknown): IssueDependencyDirection {
	if (value === "blocked_by" || value === "blocking") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "direction must be blocked_by or blocking.", { field: "direction" });
}

export function issueDependencyPath(issueNumber: number, direction: IssueDependencyDirection): string {
	return `/issues/${issueNumber}/dependencies/${direction}`;
}

export function issueDependencyRemovalPath(issueNumber: number, blockingIssueId: number): string {
	return `/issues/${issueNumber}/dependencies/blocked_by/${blockingIssueId}`;
}

export function assertDistinctDependencyNumbers(issueNumber: number, blockingIssueNumber: number): void {
	if (issueNumber !== blockingIssueNumber) return;
	throw new IssueMeError(
		ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
		"blockingIssueNumber must differ from issueNumber; an issue cannot block itself.",
		{ field: "blockingIssueNumber", issueNumber, blockingIssueNumber },
	);
}

export function assertDependencyTargetIsIssue(issue: GitHubIssueResponse, field: string): void {
	if (!isPullRequestIssueResponse(issue)) return;
	throw new IssueMeError(
		ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
		`${field} identifies a pull request, not a GitHub issue; native dependencies connect issues only.`,
		{ field, issueNumber: typeof issue.number === "number" ? issue.number : undefined },
	);
}

/** The REST `issue_id` for dependency mutations is the numeric database id, not the number or node_id. */
export function requireIssueDatabaseId(issue: GitHubIssueResponse, label: string): number {
	if (typeof issue.id === "number" && Number.isSafeInteger(issue.id) && issue.id > 0) return issue.id;
	throw new GitHubApiError(`GitHub ${label} response did not include the numeric database id required for dependency mutations.`, {
		code: ISSUEME_ERROR_CODES.GITHUB_ISSUE_SHAPE_INVALID,
		recoveryHint: "Retry after refreshing the issue from GitHub; if the id is still absent, update IssueMe or verify GitHub issue API compatibility.",
	});
}

export function isIssueDependencyMember(value: unknown): value is GitHubIssueResponse & { number: number } {
	return isObject(value) && typeof value.number === "number" && Number.isSafeInteger(value.number) && value.number > 0;
}

export function assertIssueDependencyMember(value: unknown, path = GITHUB_API_BASE_URL): asserts value is GitHubIssueResponse & { number: number } {
	if (isIssueDependencyMember(value)) return;
	throw new GitHubApiError("GitHub REST API returned a malformed issue dependency collection member.", {
		code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID,
		path,
	});
}

export function normalizeIssueDependencySummary(
	issue: GitHubIssueResponse,
	direction: IssueDependencyDirection,
	repository: GitHubRepository,
): ToolIssueDependencySummary {
	assertIssueDependencyMember(issue);
	const title = typeof issue.title === "string" && issue.title.trim() ? issue.title : `#${issue.number}`;
	const memberRepository = dependencyMemberRepository(issue) ?? repository.fullName;
	const summary: ToolIssueDependencySummary = {
		direction,
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

export function dependencyMemberRepository(issue: GitHubIssueResponse): string | undefined {
	const fromApi = parseRepositoryFromUrl(issue.repository_url, "api");
	if (fromApi) return fromApi;
	return parseRepositoryFromUrl(issue.html_url, "html");
}

function parseRepositoryFromUrl(value: unknown, kind: "api" | "html"): string | undefined {
	if (typeof value !== "string") return undefined;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	const segments = url.pathname.split("/").filter(Boolean);
	if (kind === "api") {
		if (url.host !== new URL(GITHUB_API_BASE_URL).host || segments[0] !== "repos" || segments.length < 3) return undefined;
		return `${segments[1]}/${segments[2]}`;
	}
	if (url.hostname !== "github.com" || segments.length < 2) return undefined;
	return `${segments[0]}/${segments[1]}`;
}

/** 404/410 after the parent issue resolved means GitHub does not expose dependencies here; never a silent empty list. */
export function mapIssueDependencyReadError(error: unknown): GitHubApiError | undefined {
	if (!(error instanceof GitHubApiError)) return undefined;
	if (error.status === 404 || error.status === 410) return issueDependenciesUnsupportedError(error.message);
	return undefined;
}

export function mapIssueDependencyMutationError(error: unknown, action: IssueDependencyMutationAction): GitHubApiError | undefined {
	if (!(error instanceof GitHubApiError)) return undefined;
	if (error.status === 422) return issueDependencyRefusedError(action, error.message);
	if (action === "add" && (error.status === 404 || error.status === 410)) return issueDependenciesUnsupportedError(error.message);
	return undefined;
}

export function isIssueDependencyRemovalNotFound(error: unknown): boolean {
	return error instanceof GitHubApiError && error.status === 404;
}

function issueDependenciesUnsupportedError(detail: string): GitHubApiError {
	return new GitHubApiError(
		`GitHub did not expose native issue dependencies for this repository or token. IssueMe did not fall back to body-text references. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_ISSUE_DEPENDENCIES_UNSUPPORTED,
			status: 404,
			recoveryHint: "Confirm the repository exposes GitHub's issue dependency feature to this token, or manage blockers in GitHub's UI; IssueMe will not invent body-only dependencies.",
			mutationSettlement: "no_remote_success_known",
		},
	);
}

function issueDependencyRefusedError(action: IssueDependencyMutationAction, detail: string): GitHubApiError {
	const verb = action === "add" ? "add" : "remove";
	return new GitHubApiError(
		`GitHub refused to ${verb} the issue dependency (validation failed, for example a dependency cycle or an unsupported blocker). GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_ISSUE_DEPENDENCY_REFUSED,
			status: 422,
			recoveryHint: "Inspect both issues with issueme_list_issue_dependencies, remove any conflicting or circular edge, and choose a different relationship if GitHub keeps refusing it.",
			mutationSettlement: "no_remote_success_known",
		},
	);
}
