import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_ISSUES } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES, isRemoteMutationSuccessKnown } from "../errors.ts";
import type { GitHubRelatedIssueListResult, GitHubRelatedIssueMutationResult } from "../github/client.ts";
import { normalizeContinuationTokenInput } from "../github/continuation.ts";
import { assertDependencyTargetIsIssue } from "../github/issue-dependencies-client.ts";
import { issueResponseToSafeSummary } from "../github/issues-client.ts";
import { assertDistinctRelatedNumbers, normalizeRelatedIssueSummary } from "../github/related-issues-client.ts";
import type { GitHubIssueResponse, IssueMeToolDetails, ToolIssueSummary, ToolRelatedIssueSummary } from "../types.ts";
import { normalizeBoundedToolLimit, normalizePositiveSafeInteger } from "../utils/validation.ts";
import { appendContinuationLine, assertIssueCreatorAllowed, createIssueMeRuntime, issueCreatorMatchesConfig, issueCreatorScopeLabel, remoteMutationPartialSuccessToolText, safeToolError, toolText, type IssueMeRuntime, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const DEFAULT_RELATED_LIMIT = 25;
const RELATED_SEMANTICS_NOTE = "Related issues are GitHub's native relates_to links: neither prerequisites (dependencies) nor decomposition (sub-issues). IssueMe reports only the collection GitHub returns for the requested issue and does not assume the reverse link exists; it never parses or writes body-text references.";

const ListRelatedIssuesParams = Type.Object(
	{
		issueNumber: Type.Integer({ minimum: 1, description: "Issue number." }),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_ISSUES, description: `Max results. Default ${DEFAULT_RELATED_LIMIT}; max ${MAX_TOOL_ISSUES}.` })),
		after: Type.Optional(Type.String({ description: "Continuation token; same issue." })),
	},
	{ additionalProperties: false },
);

const RelatedIssueMutationParams = Type.Object(
	{
		issueNumber: Type.Integer({ minimum: 1, description: "Open issue number." }),
		relatedIssueNumber: Type.Integer({ minimum: 1, description: "Open related issue number; must differ." }),
	},
	{ additionalProperties: false },
);

type ListRelatedIssuesToolParams = Static<typeof ListRelatedIssuesParams>;
type RelatedIssueMutationToolParams = Static<typeof RelatedIssueMutationParams>;

interface NormalizedListRelatedIssuesParams {
	issueNumber: number;
	limit: number;
	after?: string;
}

interface NormalizedRelatedIssueMutationParams {
	issueNumber: number;
	relatedIssueNumber: number;
}

export function registerRelatedIssueTools(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	registerListRelatedIssuesTool(pi, options);
	registerAddRelatedIssueTool(pi, options);
	registerRemoveRelatedIssueTool(pi, options);
}

export function registerListRelatedIssuesTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_list_related_issues",
			label: "IssueMe List Related Issues",
			description: "Inspect native related-issue links for one issue.",
			promptSnippet: "Inspect native related issues.",
			promptGuidelines: [
				"Use issueme_list_related_issues for GitHub's native relates_to links; read-only, distinct from dependencies and sub-issues, no body-text parsing.",
			],
			parameters: ListRelatedIssuesParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeListRelatedIssuesParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const issue = await fetchAllowedIssueAnyState(runtime, normalized.issueNumber, "list_related_issues", signal);
				const result = await runtime.client.listRelatedIssues(normalized.issueNumber, { limit: normalized.limit, after: normalized.after }, signal);
				const { relatedIssues, omittedOutOfScope } = summarizeRelatedIssues(runtime, result);
				const issueSummary = requireIssueSummary(runtime.repository, issue, normalized.issueNumber);
				const details = buildListRelatedDetails(runtime, issueSummary, relatedIssues, omittedOutOfScope, result, normalized);
				return toolText(appendContinuationLine(formatListRelatedText(runtime.repository, issueSummary, relatedIssues, omittedOutOfScope, result, normalized), result.continuation), details);
			},
		}),
	);
}

export function registerAddRelatedIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_add_related_issue",
			label: "IssueMe Add Related Issue",
			description: "Link two open issues as native related issues.",
			promptSnippet: "Add native related-issue link.",
			promptGuidelines: [
				"Use issueme_add_related_issue only for a genuine relation between two open issues that is neither a blocker nor a sub-issue; never write body-text references instead.",
			],
			executionMode: "sequential",
			parameters: RelatedIssueMutationParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeRelatedIssueMutationParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const { issue, relatedIssue } = await fetchRelatedMutationTargets(runtime, normalized, "add_related_issue", signal);
				let result: GitHubRelatedIssueMutationResult;
				try {
					result = await runtime.client.addRelatedIssueByIssueResponses(issue, relatedIssue, signal);
				} catch (error) {
					if (isRemoteMutationSuccessKnown(error)) {
						return remoteMutationPartialSuccessToolText(
							`GitHub accepted the request to relate issue #${normalized.issueNumber} to #${normalized.relatedIssueNumber}, but IssueMe could not verify the response.`,
							error,
							mutationBaseDetails(runtime, issue, normalized, ["relates_to"]),
							"add_related_issue_response_partial_success",
						);
					}
					return handledRelatedRefusal(error, runtime, issue, normalized, "add") ?? throwError(error);
				}
				return relatedMutationSuccessToolText(runtime, result, normalized);
			},
		}),
	);
}

export function registerRemoveRelatedIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_remove_related_issue",
			label: "IssueMe Remove Related Issue",
			description: "Remove a native related-issue link between open issues.",
			promptSnippet: "Remove native related-issue link.",
			promptGuidelines: [
				"Use issueme_remove_related_issue to detach a native relates_to link between two open issues; an already-absent link is a safe no-op.",
			],
			executionMode: "sequential",
			parameters: RelatedIssueMutationParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeRelatedIssueMutationParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const { issue, relatedIssue } = await fetchRelatedMutationTargets(runtime, normalized, "remove_related_issue", signal);
				let result: GitHubRelatedIssueMutationResult;
				try {
					result = await runtime.client.removeRelatedIssueByIssueResponses(issue, relatedIssue, signal);
				} catch (error) {
					if (isRemoteMutationSuccessKnown(error)) {
						return remoteMutationPartialSuccessToolText(
							`GitHub accepted the request to unlink issue #${normalized.issueNumber} from #${normalized.relatedIssueNumber}, but IssueMe could not verify the response.`,
							error,
							mutationBaseDetails(runtime, issue, normalized, ["relates_to"]),
							"remove_related_issue_response_partial_success",
						);
					}
					return handledRelatedRefusal(error, runtime, issue, normalized, "remove") ?? throwError(error);
				}
				return relatedMutationSuccessToolText(runtime, result, normalized);
			},
		}),
	);
}

function throwError(error: unknown): never {
	throw error;
}

function normalizeListRelatedIssuesParams(params: ListRelatedIssuesToolParams): NormalizedListRelatedIssuesParams {
	const after = normalizeContinuationTokenInput(params.after);
	return {
		issueNumber: normalizePositiveSafeInteger(params.issueNumber, "issueNumber"),
		limit: normalizeBoundedToolLimit(params.limit, { max: MAX_TOOL_ISSUES, defaultValue: DEFAULT_RELATED_LIMIT }),
		...(after ? { after } : {}),
	};
}

function normalizeRelatedIssueMutationParams(params: RelatedIssueMutationToolParams): NormalizedRelatedIssueMutationParams {
	const issueNumber = normalizePositiveSafeInteger(params.issueNumber, "issueNumber");
	const relatedIssueNumber = normalizePositiveSafeInteger(params.relatedIssueNumber, "relatedIssueNumber");
	assertDistinctRelatedNumbers(issueNumber, relatedIssueNumber);
	return { issueNumber, relatedIssueNumber };
}

async function fetchAllowedIssueAnyState(runtime: IssueMeRuntime, issueNumber: number, operation: string, signal?: AbortSignal): Promise<GitHubIssueResponse> {
	const issue = await runtime.client.getIssue(issueNumber, signal);
	assertDependencyTargetIsIssue(issue, "issueNumber");
	assertIssueCreatorAllowed(runtime.config, issue, { repository: runtime.repository, operation, issueNumber });
	return issue;
}

async function fetchAllowedOpenIssue(runtime: IssueMeRuntime, issueNumber: number, field: string, operation: string, signal?: AbortSignal): Promise<GitHubIssueResponse> {
	const issue = await runtime.client.ensureIssueOpen(issueNumber, signal);
	assertDependencyTargetIsIssue(issue, field);
	assertIssueCreatorAllowed(runtime.config, issue, { repository: runtime.repository, operation, issueNumber });
	return issue;
}

async function fetchRelatedMutationTargets(
	runtime: IssueMeRuntime,
	params: NormalizedRelatedIssueMutationParams,
	operation: string,
	signal?: AbortSignal,
): Promise<{ issue: GitHubIssueResponse; relatedIssue: GitHubIssueResponse }> {
	const issue = await fetchAllowedOpenIssue(runtime, params.issueNumber, "issueNumber", operation, signal);
	const relatedIssue = await fetchAllowedOpenIssue(runtime, params.relatedIssueNumber, "relatedIssueNumber", `${operation}_target`, signal);
	return { issue, relatedIssue };
}

function requireIssueSummary(repository: string, issue: GitHubIssueResponse, issueNumber: number): ToolIssueSummary {
	const summary = issueResponseToSafeSummary(repository, issue, issueNumber);
	if (summary) return summary;
	throw new GitHubApiError(`GitHub REST API returned issue #${issueNumber} without a valid open/closed state.`, { code: ISSUEME_ERROR_CODES.GITHUB_ISSUE_SHAPE_INVALID });
}

function summarizeRelatedIssues(runtime: IssueMeRuntime, result: GitHubRelatedIssueListResult): { relatedIssues: ToolRelatedIssueSummary[]; omittedOutOfScope: number } {
	const relatedIssues: ToolRelatedIssueSummary[] = [];
	let omittedOutOfScope = 0;
	for (const issue of result.issues) {
		const summary = normalizeRelatedIssueSummary(issue, runtime.client.repository);
		if (!issueCreatorMatchesConfig(runtime.config, summary.creator)) {
			omittedOutOfScope += 1;
			continue;
		}
		relatedIssues.push(summary);
	}
	return { relatedIssues, omittedOutOfScope };
}

function buildListRelatedDetails(
	runtime: IssueMeRuntime,
	issue: ToolIssueSummary,
	relatedIssues: ToolRelatedIssueSummary[],
	omittedOutOfScope: number,
	result: GitHubRelatedIssueListResult,
	params: NormalizedListRelatedIssuesParams,
): IssueMeToolDetails {
	return {
		repository: runtime.repository,
		creatorScope: issueCreatorScopeLabel(runtime.config),
		status: "list_related_issues",
		issue,
		relatedIssues,
		counts: { returned: relatedIssues.length, omittedOutOfScope, limit: params.limit },
		cacheUpdated: false,
		needsSync: false,
		truncated: result.truncated,
		...(result.truncated ? { truncation: { relatedIssues: { shown: relatedIssues.length, max: params.limit } } } : {}),
		...(result.continuation ? { continuation: result.continuation } : {}),
		message: RELATED_SEMANTICS_NOTE,
	};
}

function formatListRelatedText(
	repository: string,
	issue: ToolIssueSummary,
	relatedIssues: ToolRelatedIssueSummary[],
	omittedOutOfScope: number,
	result: GitHubRelatedIssueListResult,
	params: NormalizedListRelatedIssuesParams,
): string {
	const lines = [
		`Native related issues for ${repository}#${issue.number} [${issue.state}] ${issue.title}: ${relatedIssues.length}${result.truncated ? "+" : ""} returned.`,
		"This tool is read-only; it writes no local cache files.",
		relatedIssues.length === 0 ? "- none" : undefined,
		...relatedIssues.map(formatRelatedLine),
		omittedOutOfScope > 0 ? `- ${omittedOutOfScope} related issue(s) omitted: created outside the configured creator scope.` : undefined,
		result.truncated ? `Results truncated at ${params.limit}; continue with the returned token.` : undefined,
		`Semantics: ${RELATED_SEMANTICS_NOTE}`,
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatRelatedLine(related: ToolRelatedIssueSummary): string {
	const state = related.state ?? "unknown";
	const creator = related.creator ? `; by ${related.creator}` : "";
	const repositoryText = related.repository ? ` (${related.repository})` : "";
	return `- #${related.number} [${state}] ${related.title}${repositoryText}${creator}; ${related.html_url}`;
}

function mutationBaseDetails(runtime: IssueMeRuntime, issue: GitHubIssueResponse, params: NormalizedRelatedIssueMutationParams, changedFields: string[]): IssueMeToolDetails {
	return {
		repository: runtime.repository,
		creatorScope: issueCreatorScopeLabel(runtime.config),
		issue: requireIssueSummary(runtime.repository, issue, params.issueNumber),
		changedFields,
		cacheUpdated: false,
	};
}

function relatedMutationSuccessToolText(runtime: IssueMeRuntime, result: GitHubRelatedIssueMutationResult, params: NormalizedRelatedIssueMutationParams) {
	const changed = result.status === "added" || result.status === "removed";
	const relatedIssue = normalizeRelatedIssueSummary(result.relatedIssue, runtime.client.repository);
	const details: IssueMeToolDetails = {
		...mutationBaseDetails(runtime, result.issue, params, changed ? ["relates_to"] : []),
		status: relatedMutationStatus(result.status),
		relatedIssue,
		counts: { changed: changed ? 1 : 0 },
		needsSync: false,
	};
	return toolText(formatRelatedMutationText(result, relatedIssue, params), details);
}

function relatedMutationStatus(status: GitHubRelatedIssueMutationResult["status"]): string {
	if (status === "added") return "related_issue_added";
	if (status === "removed") return "related_issue_removed";
	if (status === "already_present") return "related_issue_already_present";
	return "related_issue_already_absent";
}

function formatRelatedMutationText(result: GitHubRelatedIssueMutationResult, relatedIssue: ToolRelatedIssueSummary, params: NormalizedRelatedIssueMutationParams): string {
	const edge = `#${params.issueNumber} relates to #${params.relatedIssueNumber} (${relatedIssue.title})`;
	const headlines: Record<GitHubRelatedIssueMutationResult["status"], string> = {
		added: `Added native related-issue link: ${edge}.`,
		removed: `Removed native related-issue link: ${edge}.`,
		already_present: `Native related-issue link already present: ${edge}; nothing was changed.`,
		already_absent: `Native related-issue link already absent: ${edge}; nothing was changed.`,
	};
	const lines = [headlines[result.status]];
	if (result.inferred) lines.push("GitHub reported the link as not found during removal; no link remains on this issue.");
	lines.push(`Related issue database id: ${result.relatedIssueId}.`, "No local cache files were changed; related issues are not stored in issue cache records.", `Semantics: ${RELATED_SEMANTICS_NOTE}`);
	return lines.join("\n");
}

function handledRelatedRefusal(
	error: unknown,
	runtime: IssueMeRuntime,
	issue: GitHubIssueResponse,
	params: NormalizedRelatedIssueMutationParams,
	action: "add" | "remove",
): ReturnType<typeof toolText> | undefined {
	if (!(error instanceof GitHubApiError)) return undefined;
	if (error.code !== ISSUEME_ERROR_CODES.GITHUB_RELATED_ISSUE_REFUSED && error.code !== ISSUEME_ERROR_CODES.GITHUB_RELATED_ISSUES_UNSUPPORTED) return undefined;
	const status = error.code === ISSUEME_ERROR_CODES.GITHUB_RELATED_ISSUE_REFUSED ? "related_issue_refused" : "related_issues_unsupported";
	const message = `GitHub did not ${action} the related-issue link #${params.issueNumber} <-> #${params.relatedIssueNumber}: ${error.message}`;
	return toolText(message, {
		...mutationBaseDetails(runtime, issue, params, []),
		status,
		needsSync: false,
		result: "error",
		message,
		error: safeToolError(error),
	});
}
