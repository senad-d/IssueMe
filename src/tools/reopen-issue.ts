import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { IssueMeError } from "../errors.ts";
import { githubIssueToRecord, issueRecordToToolSummary } from "../issues/format.ts";
import type { GitHubCommentResponse, GitHubIssueResponse, ToolCommentSummary, ToolIssueSummary } from "../types.ts";
import { assertIssueCreatorAllowed, createIssueMeRuntime, issueCreatorScopeLabel, partialSuccessToolError, partialSuccessToolText, refreshAndCacheIssue, toolText, type IssueMeRuntime, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const ReopenIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Closed issue number; open is no-op." }),
		comment: Type.Optional(Type.String({ description: "Optional reopen comment; only posted when reopening." })),
	},
	{ additionalProperties: false },
);

export function registerReopenIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_reopen_issue",
			label: "IssueMe Reopen Issue",
			description: "Reopen closed issue, optionally with comment.",
			promptSnippet: "Reopen closed issue.",
			promptGuidelines: [
				"Use issueme_reopen_issue only when the user explicitly wants reopening; comment only when an explanation should be posted.",
			],
			executionMode: "sequential",
			parameters: ReopenIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const commentBody = normalizeReopenComment(params.comment);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const current = await runtime.client.getIssue(params.number, signal);
				assertIssueCreatorAllowed(runtime.config, current, { repository: runtime.repository, operation: "reopen_issue" });
				const currentSummary = issueSummaryFromGitHub(runtime, current);
				if (current.state === "open") {
					return toolText(`Issue #${params.number} is already open: ${currentSummary.title}\nURL: ${currentSummary.html_url}`, {
						repository: runtime.repository,
						creatorScope: issueCreatorScopeLabel(runtime.config),
						issue: currentSummary,
						changedFields: [],
						cacheUpdated: false,
						needsSync: false,
						status: "already_open",
					});
				}

				const reopenedIssue = await runtime.client.reopenIssue(params.number, signal);
				let reopenedSummary = issueSummaryFromGitHub(runtime, reopenedIssue);
				let commentDetails: ToolCommentSummary | undefined;
				const changedFields = ["state"];

				if (commentBody !== undefined) {
					try {
						const comment = await runtime.client.addComment(params.number, commentBody, signal);
						commentDetails = commentSummary(comment);
						changedFields.push("comments");
					} catch (error) {
						const safeError = partialSuccessToolError(error, "reopened_comment_partial_success");
						return toolText(
							`Reopened issue #${params.number}: ${reopenedSummary.title}\nURL: ${reopenedSummary.html_url}\nAdding the reopen comment failed; run issueme_sync_issues before retrying local work.`,
							{
								repository: runtime.repository,
								creatorScope: issueCreatorScopeLabel(runtime.config),
								issue: reopenedSummary,
								changedFields,
								cacheUpdated: false,
								needsSync: true,
								status: "reopened_comment_partial_success",
								message: safeError.message,
								error: safeError,
							},
						);
					}
				}

				try {
					const { summary, path, removedPaths } = await refreshAndCacheIssue(ctx, runtime, params.number, signal);
					reopenedSummary = summary;
					const successText = formatReopenedIssueText(params.number, summary, commentDetails, `\nLocal file: ${path ?? "not written"}`);
					return toolText(
						successText,
						{
							repository: runtime.repository,
							creatorScope: issueCreatorScopeLabel(runtime.config),
							issue: summary,
							...(commentDetails ? { comment: commentDetails } : {}),
							changedFields,
							paths: path ? [path] : [],
							removedPaths,
							cacheUpdated: true,
							status: "reopened",
						},
					);
				} catch (error) {
					const partialText = formatReopenedIssueText(params.number, reopenedSummary, commentDetails, "\nLocal cache refresh failed; run issueme_sync_issues before relying on cache state.");
					return partialSuccessToolText(
						partialText,
						error,
						{
							repository: runtime.repository,
							creatorScope: issueCreatorScopeLabel(runtime.config),
							issue: reopenedSummary,
							...(commentDetails ? { comment: commentDetails } : {}),
							changedFields,
						},
						"reopened_partial_success",
					);
				}
			},
		}),
	);
}

function normalizeReopenComment(comment: string | undefined): string | undefined {
	if (comment === undefined) return undefined;
	const trimmed = comment.trim();
	if (!trimmed) throw new IssueMeError("invalid_tool_input", "Reopen comment must not be empty when provided.", { field: "comment" });
	return trimmed;
}

function issueSummaryFromGitHub(runtime: IssueMeRuntime, issue: GitHubIssueResponse): ToolIssueSummary {
	return issueRecordToToolSummary(githubIssueToRecord(runtime.client.repository, issue, []));
}

function commentSummary(comment: GitHubCommentResponse): ToolCommentSummary {
	return {
		...(typeof comment.id === "number" && Number.isSafeInteger(comment.id) ? { id: comment.id } : {}),
		...(typeof comment.html_url === "string" ? { html_url: comment.html_url } : {}),
	};
}

function formatReopenedIssueText(issueNumber: number, summary: ToolIssueSummary, comment: ToolCommentSummary | undefined, suffix: string): string {
	const commentLine = formatReopenedIssueCommentLine(comment);
	return `Reopened issue #${issueNumber}: ${summary.title}\nURL: ${summary.html_url}${commentLine}${suffix}`;
}

function formatReopenedIssueCommentLine(comment: ToolCommentSummary | undefined): string {
	if (typeof comment?.html_url === "string") return `\nComment: ${comment.html_url}`;
	return "";
}
