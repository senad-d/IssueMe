import { GITHUB_API_BASE_URL } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES } from "../errors.ts";
import { isObject } from "./shared.ts";
import type { GitHubGraphQLErrorContext } from "./transport.ts";

export function mapGitHubGraphQLError(context: GitHubGraphQLErrorContext): GitHubApiError | undefined {
	if (context.status === 403) {
		if (isSubIssueOperation(context.operationName)) return subIssuePermissionError(context.operationName, context.detail);
		if (isProjectV2Operation(context.operationName)) return projectV2PermissionError(context.operationName, context.detail);
		if (isDevelopmentLinkOperation(context.operationName)) return developmentLinksPermissionError(context.detail);
		return undefined;
	}

	const errors = context.errors ?? [];
	if (isSubIssueOperation(context.operationName) && errors.some(isForbiddenGraphQLError)) {
		return subIssuePermissionError(context.operationName, context.detail);
	}
	if (isSubIssueOperation(context.operationName) && errors.some(isUnsupportedSubIssueGraphQLError)) {
		return subIssueUnsupportedError(context.operationName, context.detail);
	}
	if (isProjectV2Operation(context.operationName) && errors.some(isForbiddenGraphQLError)) {
		return projectV2PermissionError(context.operationName, context.detail);
	}
	if (isDevelopmentLinkOperation(context.operationName) && errors.some(isForbiddenGraphQLError)) {
		return developmentLinksPermissionError(context.detail);
	}
	if (isDevelopmentLinkOperation(context.operationName) && errors.some(isUnsupportedDevelopmentLinksGraphQLError)) {
		return developmentLinksUnsupportedError(context.detail);
	}
	return undefined;
}

function isSubIssueOperation(operationName: string): boolean {
	return operationName === "IssueMeAddSubIssue"
		|| operationName === "IssueMeRemoveSubIssue"
		|| operationName === "IssueMeReprioritizeSubIssue"
		|| operationName === "IssueMeListSubIssues";
}

function isProjectV2Operation(operationName: string): boolean {
	return operationName === "IssueMeListProjectsV2"
		|| operationName === "IssueMeGetProjectV2FieldsById"
		|| operationName === "IssueMeGetProjectV2FieldsByNumber"
		|| operationName === "IssueMeValidateProjectV2ForAdd"
		|| operationName === "IssueMeAddIssueToProjectV2"
		|| operationName === "IssueMeValidateProjectV2ItemForUpdate"
		|| operationName === "IssueMeUpdateProjectV2ItemFieldValue";
}

function isDevelopmentLinkOperation(operationName: string): boolean {
	return operationName === "IssueMeListIssueDevelopmentLinks";
}

function subIssuePermissionError(operationName: string, detail: string): GitHubApiError {
	const actionName = operationName === "IssueMeAddSubIssue"
		? "AddSubIssue"
		: operationName === "IssueMeRemoveSubIssue"
			? "RemoveSubIssue"
			: operationName === "IssueMeReprioritizeSubIssue"
				? "ReprioritizeSubIssue"
				: "ListSubIssues";
	return new GitHubApiError(
		`GitHub GraphQL ${actionName} was forbidden. The GH_TOKEN/GITHUB_TOKEN user or app lacks permission for native sub-issues on this repository. IssueMe did not fall back to body-only references. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_SUB_ISSUE_FORBIDDEN,
			status: 403,
			path: `${GITHUB_API_BASE_URL}/graphql`,
			recoveryHint: "Use a token/user with access to the repository and permission for GitHub native sub-issues, then rerun the IssueMe sub-issue tool.",
		},
	);
}

function subIssueUnsupportedError(operationName: string, detail: string): GitHubApiError {
	return new GitHubApiError(
		`GitHub GraphQL native sub-issue operation ${operationName} is unavailable or unsupported for this repository/API. IssueMe did not fall back to body-only references. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_SUB_ISSUE_UNSUPPORTED,
			path: `${GITHUB_API_BASE_URL}/graphql`,
			recoveryHint: "Use a GitHub environment that exposes native sub-issues through GraphQL, or manage the relationship in GitHub UI; IssueMe will not create body-only relationship fallbacks.",
		},
	);
}

function projectV2PermissionError(operationName: string, detail: string): GitHubApiError {
	const action = operationName === "IssueMeListProjectsV2"
		? "project discovery"
		: operationName === "IssueMeGetProjectV2FieldsById" || operationName === "IssueMeGetProjectV2FieldsByNumber"
			? "project field discovery"
			: "project item management";
	const permission = action === "project item management" ? "read/write permission" : "read permission";
	return new GitHubApiError(
		`GitHub GraphQL Projects v2 ${action} was forbidden. The GH_TOKEN/GITHUB_TOKEN user or app lacks access to the requested repository, organization, or user project scope, or lacks ${permission} for GitHub Projects. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_PROJECTS_V2_FORBIDDEN,
			status: 403,
			path: `${GITHUB_API_BASE_URL}/graphql`,
			recoveryHint: "Use a token/user with access to the requested GitHub Projects v2 board and appropriate project read/write permissions (for example project or read:project access plus write access for item mutations), then rerun the IssueMe project tool.",
		},
	);
}

function developmentLinksPermissionError(detail: string): GitHubApiError {
	return new GitHubApiError(
		`GitHub GraphQL issue development-link inspection was forbidden. The GH_TOKEN/GITHUB_TOKEN user or app lacks permission to inspect linked pull requests, commits, or development references for this issue. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_DEVELOPMENT_LINKS_FORBIDDEN,
			status: 403,
			path: `${GITHUB_API_BASE_URL}/graphql`,
			recoveryHint: "Use a token/user with access to the repository, linked pull requests, and referenced commits, then rerun issueme_list_issue_development_links.",
		},
	);
}

function developmentLinksUnsupportedError(detail: string): GitHubApiError {
	return new GitHubApiError(
		`GitHub GraphQL issue development-link inspection is unavailable or unsupported for this repository/API. IssueMe did not guess from issue body text. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_DEVELOPMENT_LINKS_UNSUPPORTED,
			path: `${GITHUB_API_BASE_URL}/graphql`,
			recoveryHint: "Use a GitHub environment that exposes issue timeline development references through GraphQL, or inspect linked development in GitHub UI; IssueMe will not invent body-only development links.",
		},
	);
}

function isForbiddenGraphQLError(error: unknown): boolean {
	if (!isObject(error)) return false;
	const type = typeof error.type === "string" ? error.type : undefined;
	const extensions = isObject(error.extensions) ? error.extensions : undefined;
	const code = typeof extensions?.code === "string" ? extensions.code : undefined;
	const message = typeof error.message === "string" ? error.message : "";
	return type === "FORBIDDEN" || code === "FORBIDDEN" || /forbidden|resource not accessible/i.test(message);
}

function isUnsupportedSubIssueGraphQLError(error: unknown): boolean {
	if (!isObject(error)) return false;
	const type = typeof error.type === "string" ? error.type : undefined;
	const extensions = isObject(error.extensions) ? error.extensions : undefined;
	const code = typeof extensions?.code === "string" ? extensions.code : undefined;
	const message = typeof error.message === "string" ? error.message : "";
	return type === "undefinedField"
		|| code === "undefinedField"
		|| /subIssues|sub_issues|parent|reprioritizeSubIssue|ReprioritizeSubIssue|subIssue/i.test(message) && /doesn'?t exist|undefined|unsupported|not supported|not available/i.test(message);
}

function isUnsupportedDevelopmentLinksGraphQLError(error: unknown): boolean {
	if (!isObject(error)) return false;
	const type = typeof error.type === "string" ? error.type : undefined;
	const extensions = isObject(error.extensions) ? error.extensions : undefined;
	const code = typeof extensions?.code === "string" ? extensions.code : undefined;
	const message = typeof error.message === "string" ? error.message : "";
	return type === "undefinedField"
		|| code === "undefinedField"
		|| /timelineItems|ConnectedEvent|CrossReferencedEvent|ReferencedEvent|ClosedEvent|willCloseTarget|headRefName|closer|development/i.test(message) && /doesn'?t exist|undefined|unsupported|not supported|not available/i.test(message);
}
