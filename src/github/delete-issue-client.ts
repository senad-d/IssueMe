import { GITHUB_API_BASE_URL } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { GitHubIssueResponse } from "../types.ts";
import { isPullRequestIssueResponse } from "./issues-client.ts";
import { isObject } from "./shared.ts";
import { requireIssueNodeId } from "./sub-issues-client.ts";

interface DeleteIssueMutationData {
	deleteIssue?: unknown;
}

export function buildDeleteIssueMutation(): string {
	return `mutation IssueMeDeleteIssue($issueId: ID!) {
		deleteIssue(input: {issueId: $issueId}) {
			clientMutationId
		}
	}`;
}

export function requireDeletableIssueNodeId(issue: GitHubIssueResponse): string {
	if (isPullRequestIssueResponse(issue)) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			"The requested number identifies a pull request, not a GitHub issue; refusing permanent deletion.",
			{ field: "number", issueNumber: issue.number },
		);
	}
	return requireIssueNodeId(issue, "issue deletion target");
}

export function normalizeDeleteIssueMutationResult(data: DeleteIssueMutationData): void {
	if (isObject(data.deleteIssue)) return;
	throw new GitHubApiError("GitHub GraphQL deleteIssue mutation returned an unexpected response shape.", {
		code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID,
		path: `${GITHUB_API_BASE_URL}/graphql`,
		mutationSettlement: "remote_success_known",
	});
}
