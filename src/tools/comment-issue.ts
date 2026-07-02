import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { IssueMeError } from "../errors.ts";
import type { GitHubCommentResponse, ToolCommentSummary } from "../types.ts";
import { assertExistingIssueCreatorAllowed, createIssueMeRuntime, issueCreatorScopeLabel, partialSuccessToolText, refreshAndCacheIssue, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const CommentIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Open issue number." }),
		body: Type.String({ description: "Markdown comment. Non-empty." }),
	},
	{ additionalProperties: false },
);

const UpdateCommentParams = Type.Object(
	{
		issueNumber: Type.Integer({ minimum: 1, description: "Open issue number owning comment." }),
		commentId: Type.Integer({ minimum: 1, description: "Issue comment ID." }),
		body: Type.String({ description: "Replacement Markdown comment. Non-empty." }),
	},
	{ additionalProperties: false },
);

const DeleteCommentParams = Type.Object(
	{
		issueNumber: Type.Integer({ minimum: 1, description: "Open issue number owning comment." }),
		commentId: Type.Integer({ minimum: 1, description: "Issue comment ID." }),
	},
	{ additionalProperties: false },
);

export function registerCommentIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_comment_issue",
			label: "IssueMe Comment Issue",
			description: "Comment on open issue and refresh cache.",
			promptSnippet: "Comment on open issue.",
			promptGuidelines: [
				"Use issueme_comment_issue for new notes when the issue body should stay unchanged.",
			],
			executionMode: "sequential",
			parameters: CommentIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const body = normalizeCommentBody(params.body);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				await assertExistingIssueCreatorAllowed(runtime, params.number, "comment_issue", signal);
				const comment = await runtime.client.addComment(params.number, body, signal);
				const commentDetails = commentSummary(comment);
				const commentUrl = commentDetails.html_url;
				const successText = formatCommentCreateText(params.number, commentUrl);
				try {
					const { summary, path } = await refreshAndCacheIssue(ctx, runtime, params.number, signal);
					return toolText(successText, {
						repository: runtime.repository,
						creatorScope: issueCreatorScopeLabel(runtime.config),
						issue: summary,
						comment: commentDetails,
						changedFields: ["comments"],
						paths: path ? [path] : [],
						cacheUpdated: true,
					});
				} catch (error) {
					return partialSuccessToolText(
						`${successText}\nLocal cache refresh failed; run issueme_sync_issues before retrying local work.`,
						error,
						{
							repository: runtime.repository,
							creatorScope: issueCreatorScopeLabel(runtime.config),
							comment: commentDetails,
							changedFields: ["comments"],
						},
					);
				}
			},
		}),
	);
}

export function registerUpdateCommentTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_update_comment",
			label: "IssueMe Update Comment",
			description: "Edit verified comment on open issue.",
			promptSnippet: "Edit verified issue comment.",
			promptGuidelines: [
				"Use issueme_update_comment only for explicit comment edits; comment must belong to the open issue.",
			],
			executionMode: "sequential",
			parameters: UpdateCommentParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const body = normalizeCommentBody(params.body);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				await assertExistingIssueCreatorAllowed(runtime, params.issueNumber, "update_comment", signal);
				const comment = await runtime.client.updateComment(params.issueNumber, params.commentId, body, signal);
				const commentDetails = commentSummary(comment);
				const commentUrl = commentDetails.html_url;
				const successText = formatCommentUpdateText(params.commentId, params.issueNumber, commentUrl);
				try {
					const { summary, path } = await refreshAndCacheIssue(ctx, runtime, params.issueNumber, signal);
					return toolText(successText, {
						repository: runtime.repository,
						creatorScope: issueCreatorScopeLabel(runtime.config),
						issue: summary,
						comment: commentDetails,
						changedFields: ["comments"],
						paths: path ? [path] : [],
						cacheUpdated: true,
					});
				} catch (error) {
					return partialSuccessToolText(
						`${successText}\nLocal cache refresh failed; run issueme_sync_issues before retrying local work.`,
						error,
						{
							repository: runtime.repository,
							creatorScope: issueCreatorScopeLabel(runtime.config),
							comment: commentDetails,
							changedFields: ["comments"],
						},
					);
				}
			},
		}),
	);
}

export function registerDeleteCommentTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_delete_comment",
			label: "IssueMe Delete Comment",
			description: "Delete verified comment on open issue.",
			promptSnippet: "Delete verified issue comment.",
			promptGuidelines: [
				"Use issueme_delete_comment only for explicit comment deletion; comment must belong to the open issue.",
			],
			executionMode: "sequential",
			parameters: DeleteCommentParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				await assertExistingIssueCreatorAllowed(runtime, params.issueNumber, "delete_comment", signal);
				const deletedComment = await runtime.client.deleteComment(params.issueNumber, params.commentId, signal);
				const commentDetails = commentSummary(deletedComment);
				const commentUrl = commentDetails.html_url;
				const successText = formatCommentDeleteText(params.commentId, params.issueNumber, commentUrl);
				try {
					const { summary, path } = await refreshAndCacheIssue(ctx, runtime, params.issueNumber, signal);
					return toolText(successText, {
						repository: runtime.repository,
						creatorScope: issueCreatorScopeLabel(runtime.config),
						issue: summary,
						comment: commentDetails,
						changedFields: ["comments"],
						paths: path ? [path] : [],
						cacheUpdated: true,
						status: "comment_deleted",
					});
				} catch (error) {
					return partialSuccessToolText(
						`${successText}\nLocal cache refresh failed; run issueme_sync_issues before retrying local work.`,
						error,
						{
							repository: runtime.repository,
							creatorScope: issueCreatorScopeLabel(runtime.config),
							comment: commentDetails,
							changedFields: ["comments"],
						},
					);
				}
			},
		}),
	);
}

function normalizeCommentBody(body: string): string {
	const trimmed = body.trim();
	if (trimmed) return trimmed;
	throw new IssueMeError("invalid_tool_input", "Comment body must not be empty.", { field: "body" });
}

function formatCommentCreateText(issueNumber: number, commentUrl: string | undefined): string {
	return `Added comment to issue #${issueNumber}.${formatOptionalCommentUrlLine("Comment", commentUrl)}`;
}

function formatCommentUpdateText(commentId: number, issueNumber: number, commentUrl: string | undefined): string {
	return `Updated comment ${commentId} on issue #${issueNumber}.${formatOptionalCommentUrlLine("Comment", commentUrl)}`;
}

function formatCommentDeleteText(commentId: number, issueNumber: number, commentUrl: string | undefined): string {
	return `Deleted comment ${commentId} from issue #${issueNumber}.${formatOptionalCommentUrlLine("Deleted comment URL", commentUrl)}`;
}

function formatOptionalCommentUrlLine(label: string, commentUrl: string | undefined): string {
	if (commentUrl) return `\n${label}: ${commentUrl}`;
	return "";
}

function commentSummary(comment: GitHubCommentResponse): ToolCommentSummary {
	return {
		...(typeof comment.id === "number" && Number.isSafeInteger(comment.id) ? { id: comment.id } : {}),
		...(typeof comment.html_url === "string" ? { html_url: comment.html_url } : {}),
	};
}
