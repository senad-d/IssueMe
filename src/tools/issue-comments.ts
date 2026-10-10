import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_COMMENT_BODY_CHARS, MAX_TOOL_COMMENTS } from "../constants.ts";
import { ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { GitHubIssueCommentListResult } from "../github/client.ts";
import { normalizeContinuationTokenInput, readTextWindow, type ContinuationBinding } from "../github/continuation.ts";
import { isPullRequestIssueResponse, issueResponseToSafeSummary } from "../github/issues-client.ts";
import type { GitHubCommentResponse, GitHubIssueResponse, IssueMeToolDetails, ToolIssueCommentSummary, ToolIssueSummary } from "../types.ts";
import { normalizeBoundedToolLimit, normalizeOptionalIsoDateOrTimestamp, normalizePositiveSafeInteger } from "../utils/validation.ts";
import { appendContinuationLine, assertIssueCreatorAllowed, createIssueMeRuntime, issueCreatorScopeLabel, toolText, type IssueMeRuntime, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const DEFAULT_COMMENT_LIST_LIMIT = Math.min(25, MAX_TOOL_COMMENTS);
const DEFAULT_LIST_BODY_CHARS = 400;
const READ_ONLY_NOTE = "This tool is read-only; it does not sync, write, or change local issue cache files or the cache comment cap.";

const ListIssueCommentsParams = Type.Object(
	{
		issueNumber: Type.Integer({ minimum: 1, description: "Issue number; open or closed." }),
		since: Type.Optional(Type.String({ description: "Only comments updated at/after this ISO date or timestamp." })),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_COMMENTS, description: `Max comments. Default ${DEFAULT_COMMENT_LIST_LIMIT}; max ${MAX_TOOL_COMMENTS}.` })),
		bodyLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_COMMENT_BODY_CHARS, description: `Max body chars per comment. Default ${DEFAULT_LIST_BODY_CHARS}; max ${MAX_TOOL_COMMENT_BODY_CHARS}.` })),
		after: Type.Optional(Type.String({ description: "Continuation token; same issue and since." })),
	},
	{ additionalProperties: false },
);

const GetCommentParams = Type.Object(
	{
		issueNumber: Type.Integer({ minimum: 1, description: "Issue number owning the comment; open or closed." }),
		commentId: Type.Integer({ minimum: 1, description: "Issue comment ID." }),
		bodyLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_COMMENT_BODY_CHARS, description: `Max body chars per call. Default ${MAX_TOOL_COMMENT_BODY_CHARS}.` })),
		after: Type.Optional(Type.String({ description: "Body continuation token; same comment." })),
	},
	{ additionalProperties: false },
);

type ListIssueCommentsToolParams = Static<typeof ListIssueCommentsParams>;
type GetCommentToolParams = Static<typeof GetCommentParams>;

interface NormalizedListIssueCommentsParams {
	issueNumber: number;
	since?: string;
	limit: number;
	bodyLimit: number;
	after?: string;
}

interface NormalizedGetCommentParams {
	issueNumber: number;
	commentId: number;
	bodyLimit: number;
	after?: string;
}

export function registerIssueCommentReadTools(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	registerListIssueCommentsTool(pi, options);
	registerGetCommentTool(pi, options);
}

export function registerListIssueCommentsTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_list_issue_comments",
			label: "IssueMe List Issue Comments",
			description: "List issue comments with IDs and bounded bodies.",
			promptSnippet: "List issue comments with IDs.",
			promptGuidelines: [
				"Use issueme_list_issue_comments to read discussion beyond the cached first page or to find comment IDs; read-only, continue with after, then issueme_get_comment for full text.",
			],
			parameters: ListIssueCommentsParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeListIssueCommentsParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const issue = await fetchAllowedIssue(runtime, normalized.issueNumber, "list_issue_comments", signal);
				const result = await runtime.client.listIssueComments(normalized.issueNumber, { since: normalized.since, limit: normalized.limit, after: normalized.after }, signal);
				const comments = result.comments.map((comment) => summarizeComment(comment, normalized.bodyLimit));
				const issueSummary = requireIssueSummary(runtime.repository, issue, normalized.issueNumber);
				const details = buildListCommentsDetails(runtime, issueSummary, comments, result, normalized, commentTotal(issue));
				return toolText(appendContinuationLine(formatListCommentsText(runtime.repository, issueSummary, comments, result, normalized), result.continuation), details);
			},
		}),
	);
}

export function registerGetCommentTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_get_comment",
			label: "IssueMe Get Comment",
			description: "Read one verified issue comment in full.",
			promptSnippet: "Read one issue comment.",
			promptGuidelines: [
				"Use issueme_get_comment with issueNumber and commentId for exact comment text; long bodies continue with after; read-only.",
			],
			parameters: GetCommentParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeGetCommentParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const { issue, comment } = await runtime.client.getIssueCommentForIssue(normalized.issueNumber, normalized.commentId, signal);
				assertIssueReadable(runtime, issue, normalized.issueNumber, "get_comment");
				const binding: ContinuationBinding = { collection: "comment_body", repository: runtime.repository, filters: { issueNumber: normalized.issueNumber, commentId: normalized.commentId, updatedAt: commentText(comment.updated_at) } };
				const window = readTextWindow(commentBody(comment), normalized.after, normalized.bodyLimit, binding);
				const summary = summarizeCommentWindow(comment, window.text, window.offset, window.truncated);
				const issueSummary = requireIssueSummary(runtime.repository, issue, normalized.issueNumber);
				const details: IssueMeToolDetails = {
					repository: runtime.repository,
					creatorScope: issueCreatorScopeLabel(runtime.config),
					status: "get_comment",
					issue: issueSummary,
					comment: { id: summary.id, html_url: summary.html_url },
					comments: [summary],
					counts: { bodyLength: summary.bodyLength, bodyShown: summary.body.length, bodyOffset: window.offset, bodyLimit: normalized.bodyLimit },
					cacheUpdated: false,
					needsSync: false,
					truncated: window.truncated,
					...(window.truncated ? { truncation: { body: { shown: summary.body.length, total: summary.bodyLength, max: normalized.bodyLimit, offset: window.offset } } } : {}),
					continuation: window.continuation,
				};
				return toolText(appendContinuationLine(formatGetCommentText(runtime.repository, issueSummary, summary, window.offset, normalized.bodyLimit), window.continuation), details);
			},
		}),
	);
}

function normalizeListIssueCommentsParams(params: ListIssueCommentsToolParams): NormalizedListIssueCommentsParams {
	const since = normalizeOptionalIsoDateOrTimestamp(params.since, "since", { invalidMessage: "since must be a valid ISO YYYY-MM-DD date or ISO 8601 timestamp with timezone." });
	const after = normalizeContinuationTokenInput(params.after);
	return {
		issueNumber: normalizePositiveSafeInteger(params.issueNumber, "issueNumber"),
		...(since ? { since } : {}),
		limit: normalizeBoundedToolLimit(params.limit, { max: MAX_TOOL_COMMENTS, defaultValue: DEFAULT_COMMENT_LIST_LIMIT }),
		bodyLimit: normalizeBoundedToolLimit(params.bodyLimit, { field: "bodyLimit", max: MAX_TOOL_COMMENT_BODY_CHARS, defaultValue: DEFAULT_LIST_BODY_CHARS }),
		...(after ? { after } : {}),
	};
}

function normalizeGetCommentParams(params: GetCommentToolParams): NormalizedGetCommentParams {
	const after = normalizeContinuationTokenInput(params.after);
	return {
		issueNumber: normalizePositiveSafeInteger(params.issueNumber, "issueNumber"),
		commentId: normalizePositiveSafeInteger(params.commentId, "commentId"),
		bodyLimit: normalizeBoundedToolLimit(params.bodyLimit, { field: "bodyLimit", max: MAX_TOOL_COMMENT_BODY_CHARS, defaultValue: MAX_TOOL_COMMENT_BODY_CHARS }),
		...(after ? { after } : {}),
	};
}

async function fetchAllowedIssue(runtime: IssueMeRuntime, issueNumber: number, operation: string, signal?: AbortSignal): Promise<GitHubIssueResponse> {
	const issue = await runtime.client.getIssue(issueNumber, signal);
	assertIssueReadable(runtime, issue, issueNumber, operation);
	return issue;
}

function assertIssueReadable(runtime: IssueMeRuntime, issue: GitHubIssueResponse, issueNumber: number, operation: string): void {
	if (isPullRequestIssueResponse(issue)) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "issueNumber identifies a pull request, not a GitHub issue; IssueMe reads issue comments only.", { field: "issueNumber", issueNumber });
	}
	assertIssueCreatorAllowed(runtime.config, issue, { repository: runtime.repository, operation, issueNumber });
}

function requireIssueSummary(repository: string, issue: GitHubIssueResponse, issueNumber: number): ToolIssueSummary {
	const summary = issueResponseToSafeSummary(repository, issue, issueNumber);
	if (summary) return summary;
	throw new IssueMeError(ISSUEME_ERROR_CODES.GITHUB_ISSUE_SHAPE_INVALID, `GitHub REST API returned issue #${issueNumber} without a valid open/closed state.`, { issueNumber });
}

function commentTotal(issue: GitHubIssueResponse): number | undefined {
	return typeof issue.comments === "number" && Number.isSafeInteger(issue.comments) && issue.comments >= 0 ? issue.comments : undefined;
}

function commentBody(comment: GitHubCommentResponse): string {
	return typeof comment.body === "string" ? comment.body : "";
}

function commentText(value: unknown): string {
	return typeof value === "string" ? value : "";
}

function commentAuthor(comment: GitHubCommentResponse): string {
	const user = typeof comment.user === "object" && comment.user !== null ? (comment.user as { login?: unknown }) : undefined;
	return typeof user?.login === "string" && user.login.trim() ? user.login : "unknown";
}

function summarizeComment(comment: GitHubCommentResponse, bodyLimit: number): ToolIssueCommentSummary {
	const body = commentBody(comment);
	return summarizeCommentWindow(comment, body.slice(0, bodyLimit), 0, body.length > bodyLimit);
}

function summarizeCommentWindow(comment: GitHubCommentResponse, window: string, offset: number, truncated: boolean): ToolIssueCommentSummary {
	const summary: ToolIssueCommentSummary = {
		id: typeof comment.id === "number" ? comment.id : 0,
		author: commentAuthor(comment),
		createdAt: commentText(comment.created_at),
		updatedAt: commentText(comment.updated_at),
		html_url: commentText(comment.html_url),
		body: window,
		bodyLength: commentBody(comment).length,
		bodyTruncated: truncated,
	};
	if (offset > 0) summary.bodyOffset = offset;
	return summary;
}

function buildListCommentsDetails(
	runtime: IssueMeRuntime,
	issue: ToolIssueSummary,
	comments: ToolIssueCommentSummary[],
	result: GitHubIssueCommentListResult,
	params: NormalizedListIssueCommentsParams,
	total: number | undefined,
): IssueMeToolDetails {
	const bodyTruncated = comments.filter((comment) => comment.bodyTruncated).length;
	const truncation: Record<string, unknown> = {};
	if (result.truncated) truncation.comments = { shown: comments.length, max: params.limit };
	if (bodyTruncated > 0) truncation.bodies = { affectedComments: bodyTruncated, maxChars: params.bodyLimit };
	return {
		repository: runtime.repository,
		creatorScope: issueCreatorScopeLabel(runtime.config),
		status: "list_issue_comments",
		issue,
		comments,
		counts: { returned: comments.length, bodyTruncated, limit: params.limit, bodyLimit: params.bodyLimit, ...(total !== undefined ? { total } : {}) },
		cacheUpdated: false,
		needsSync: false,
		truncated: result.truncated || bodyTruncated > 0,
		...(Object.keys(truncation).length > 0 ? { truncation } : {}),
		...(result.continuation ? { continuation: result.continuation } : {}),
	};
}

function formatListCommentsText(repository: string, issue: ToolIssueSummary, comments: ToolIssueCommentSummary[], result: GitHubIssueCommentListResult, params: NormalizedListIssueCommentsParams): string {
	const lines = [
		`Comments for ${repository}#${issue.number} [${issue.state}] ${issue.title}: ${comments.length} returned${params.since ? ` (updated since ${params.since})` : ""}.`,
		`Limit: ${params.limit}; bodyLimit: ${params.bodyLimit} chars per comment. ${READ_ONLY_NOTE}`,
		"",
		comments.length === 0 ? "No comments were returned for this request." : undefined,
		...comments.flatMap(formatCommentLines),
		result.truncated ? `More comments exist beyond ${params.limit}; continue with the returned token.` : undefined,
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatCommentLines(comment: ToolIssueCommentSummary): string[] {
	const edited = comment.updatedAt && comment.updatedAt !== comment.createdAt ? ` (edited ${comment.updatedAt})` : "";
	const lines = [`- ${comment.id} by ${comment.author} at ${comment.createdAt}${edited}: ${comment.html_url}`, indentBody(comment.body)];
	if (comment.bodyTruncated) lines.push(`  [body truncated: ${comment.body.length} of ${comment.bodyLength} chars; use issueme_get_comment with commentId ${comment.id}]`);
	return lines;
}

function indentBody(body: string): string {
	if (!body) return "  (empty body)";
	return body.split("\n").map((line) => `  ${line}`).join("\n");
}

function formatGetCommentText(repository: string, issue: ToolIssueSummary, comment: ToolIssueCommentSummary, offset: number, bodyLimit: number): string {
	const end = offset + comment.body.length;
	const edited = comment.updatedAt && comment.updatedAt !== comment.createdAt ? `; edited ${comment.updatedAt}` : "";
	return [
		`Comment ${comment.id} on ${repository}#${issue.number} [${issue.state}] ${issue.title} by ${comment.author}; created ${comment.createdAt}${edited}; ${comment.html_url}`,
		`Body chars ${offset}-${end} of ${comment.bodyLength} (bodyLimit ${bodyLimit}):`,
		comment.body || "(empty body)",
		READ_ONLY_NOTE,
	].join("\n");
}
