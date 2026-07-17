import { GITHUB_API_BASE_URL } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES } from "../errors.ts";
import { isObject } from "./shared.ts";
import type { GitHubGraphQLErrorContext } from "./transport.ts";

export function mapGitHubGraphQLError(context: GitHubGraphQLErrorContext): GitHubApiError | undefined {
	if (context.status === 403) return mapForbiddenGraphQLStatusError(context);
	return mapGraphQLErrorDetails(context, context.errors ?? []);
}

function mapForbiddenGraphQLStatusError(context: GitHubGraphQLErrorContext): GitHubApiError | undefined {
	const operationName = context.operationName;
	if (isIssueDeleteOperation(operationName)) return issueDeletePermissionError(context.detail);
	if (isSubIssueOperation(operationName)) return subIssuePermissionError(operationName, context.detail);
	if (isProjectV2Operation(operationName)) return projectV2PermissionError(operationName, context.detail);
	if (isDevelopmentLinkOperation(operationName)) return developmentLinksPermissionError(context.detail);
	return undefined;
}

function mapGraphQLErrorDetails(context: GitHubGraphQLErrorContext, errors: unknown[]): GitHubApiError | undefined {
	const operationName = context.operationName;
	if (isIssueDeleteOperation(operationName)) return mapIssueDeleteGraphQLError(context.detail, errors);
	if (isSubIssueOperation(operationName)) return mapSubIssueGraphQLError(operationName, context.detail, errors);
	if (isProjectV2Operation(operationName)) return mapProjectV2GraphQLError(operationName, context.detail, errors);
	if (isDevelopmentLinkOperation(operationName)) return mapDevelopmentLinkGraphQLError(context.detail, errors);
	return undefined;
}

function mapIssueDeleteGraphQLError(detail: string, errors: unknown[]): GitHubApiError | undefined {
	if (errors.some(isForbiddenGraphQLError)) return issueDeletePermissionError(detail);
	if (errors.some(isUnsupportedIssueDeleteGraphQLError)) return issueDeleteUnsupportedError(detail);
	return undefined;
}

function mapSubIssueGraphQLError(operationName: string, detail: string, errors: unknown[]): GitHubApiError | undefined {
	if (errors.some(isForbiddenGraphQLError)) return subIssuePermissionError(operationName, detail);
	if (errors.some(isUnsupportedSubIssueGraphQLError)) return subIssueUnsupportedError(operationName, detail);
	return undefined;
}

function mapProjectV2GraphQLError(operationName: string, detail: string, errors: unknown[]): GitHubApiError | undefined {
	if (errors.some(isForbiddenGraphQLError)) return projectV2PermissionError(operationName, detail);
	return undefined;
}

function mapDevelopmentLinkGraphQLError(detail: string, errors: unknown[]): GitHubApiError | undefined {
	if (errors.some(isForbiddenGraphQLError)) return developmentLinksPermissionError(detail);
	if (errors.some(isUnsupportedDevelopmentLinksGraphQLError)) return developmentLinksUnsupportedError(detail);
	return undefined;
}

function isIssueDeleteOperation(operationName: string): boolean {
	return operationName === "IssueMeDeleteIssue";
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

function issueDeletePermissionError(detail: string): GitHubApiError {
	return new GitHubApiError(
		`GitHub GraphQL issue deletion was forbidden. Permanent issue deletion requires repository administrator permission and issue write access. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_ISSUE_DELETE_FORBIDDEN,
			status: 403,
			path: `${GITHUB_API_BASE_URL}/graphql`,
			recoveryHint: "Use a token user with repository administrator permission and issue write access, then explicitly confirm the exact issue deletion again.",
		},
	);
}

function issueDeleteUnsupportedError(detail: string): GitHubApiError {
	return new GitHubApiError(
		`GitHub GraphQL issue deletion is unavailable or unsupported for this repository/API. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_ISSUE_DELETE_UNSUPPORTED,
			path: `${GITHUB_API_BASE_URL}/graphql`,
			recoveryHint: "Use a GitHub environment that supports the GraphQL deleteIssue mutation, or ask a repository administrator to delete the issue in GitHub's UI.",
		},
	);
}

function subIssueOperationActionName(operationName: string): string {
	if (operationName === "IssueMeAddSubIssue") return "AddSubIssue";
	if (operationName === "IssueMeRemoveSubIssue") return "RemoveSubIssue";
	if (operationName === "IssueMeReprioritizeSubIssue") return "ReprioritizeSubIssue";
	return "ListSubIssues";
}

function subIssuePermissionError(operationName: string, detail: string): GitHubApiError {
	const actionName = subIssueOperationActionName(operationName);
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

function projectV2PermissionAction(operationName: string): string {
	if (operationName === "IssueMeListProjectsV2") return "project discovery";
	if (operationName === "IssueMeGetProjectV2FieldsById" || operationName === "IssueMeGetProjectV2FieldsByNumber") return "project field discovery";
	return "project item management";
}

function projectV2PermissionRequirement(action: string): string {
	if (action === "project item management") return "read/write permission";
	return "read permission";
}

function projectV2PermissionError(operationName: string, detail: string): GitHubApiError {
	const action = projectV2PermissionAction(operationName);
	const permission = projectV2PermissionRequirement(action);
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

function isUnsupportedIssueDeleteGraphQLError(error: unknown): boolean {
	if (!isObject(error)) return false;
	const type = typeof error.type === "string" ? error.type : undefined;
	const extensions = isObject(error.extensions) ? error.extensions : undefined;
	const code = typeof extensions?.code === "string" ? extensions.code : undefined;
	const message = typeof error.message === "string" ? error.message : "";
	return type === "undefinedField"
		|| code === "undefinedField"
		|| /deleteIssue/i.test(message) && /doesn'?t exist|undefined|unsupported|not supported|not available/i.test(message);
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
