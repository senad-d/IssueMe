import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ISSUEME_ERROR_CODES, IssueMeError, isRemoteMutationSuccessKnown } from "../errors.ts";
import { githubIssueToRecord, issueRecordToToolSummary } from "../issues/format.ts";
import { removeIssueByNumber, relativeIssuePath } from "../issues/store.ts";
import type { GitHubIssueResponse, ToolIssueSummary } from "../types.ts";
import { normalizePositiveSafeInteger } from "../utils/validation.ts";
import { assertIssueCreatorAllowed, createIssueMeRuntime, issueCreatorScopeLabel, partialSuccessToolText, remoteMutationPartialSuccessToolText, toolText, type IssueMeRuntime, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const DeleteIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Issue number to permanently delete." }),
		confirmDelete: Type.Boolean({ description: "Required true after explicit confirmation." }),
	},
	{ additionalProperties: false },
);

export function registerDeleteIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_delete_issue",
			label: "IssueMe Permanently Delete Issue",
			description: "Permanently delete one GitHub issue.",
			promptSnippet: "Permanently delete confirmed issue.",
			promptGuidelines: [
				"Use issueme_delete_issue only for an explicit request to permanently delete one exact issue after warning that deletion is irreversible; require confirmDelete true and never use it for pull requests.",
			],
			executionMode: "sequential",
			parameters: DeleteIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const issueNumber = normalizeDeleteIssueNumber(params.number);
				assertIssueDeleteConfirmed(params.confirmDelete);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const target = await prepareIssueDeletion(runtime, issueNumber, signal);
				try {
					await runtime.client.deleteIssueByIssueResponse(target.issue, signal);
				} catch (error) {
					if (!isRemoteMutationSuccessKnown(error)) throw error;
					return remoteMutationPartialSuccessToolText(
						`GitHub accepted the request to permanently delete issue #${issueNumber}, but IssueMe could not verify the deletion response.`,
						error,
						deleteIssueDetails(runtime, target.issueSummary),
						"delete_issue_response_partial_success",
					);
				}
				try {
					const removedPaths = await removeDeletedIssueCache(runtime, issueNumber, signal);
					return deleteIssueSuccessToolText(runtime, target.issueSummary, removedPaths);
				} catch (error) {
					return deleteIssuePartialSuccessToolText(runtime, target.issueSummary, error);
				}
			},
		}),
	);
}

interface DeleteIssueTarget {
	issue: GitHubIssueResponse;
	issueSummary: ToolIssueSummary;
}

async function prepareIssueDeletion(runtime: IssueMeRuntime, issueNumber: number, signal?: AbortSignal): Promise<DeleteIssueTarget> {
	const issue = await runtime.client.getIssue(issueNumber, signal);
	assertIssueCreatorAllowed(runtime.config, issue, { repository: runtime.repository, operation: "delete_issue", issueNumber });
	const issueSummary = issueRecordToToolSummary(githubIssueToRecord(runtime.client.repository, issue, []));
	return { issue, issueSummary };
}

async function removeDeletedIssueCache(runtime: IssueMeRuntime, issueNumber: number, signal?: AbortSignal): Promise<string[]> {
	const removed = await removeIssueByNumber(runtime.projectRoot, runtime.config, issueNumber, runtime.repository, signal);
	return removed.map((path) => relativeIssuePath(runtime.projectRoot, path) ?? path);
}

function deleteIssueSuccessToolText(runtime: IssueMeRuntime, issue: ToolIssueSummary, removedPaths: string[]) {
	return toolText(
		`Permanently deleted GitHub issue #${issue.number}: ${issue.title}\nFormer URL: ${issue.html_url}\nRemoved local file(s): ${removedPaths.length}`,
		{
			...deleteIssueDetails(runtime, issue),
			removedPaths,
			counts: { removed: removedPaths.length },
			cacheUpdated: true,
			status: "issue_deleted",
		},
	);
}

function deleteIssuePartialSuccessToolText(runtime: IssueMeRuntime, issue: ToolIssueSummary, error: unknown) {
	return partialSuccessToolText(
		`GitHub issue #${issue.number} was permanently deleted, but local cache removal failed; run issueme_sync_issues before relying on cache state.`,
		error,
		deleteIssueDetails(runtime, issue),
		"issue_deleted_partial_success",
	);
}

function deleteIssueDetails(runtime: IssueMeRuntime, issue: ToolIssueSummary) {
	return {
		repository: runtime.repository,
		creatorScope: issueCreatorScopeLabel(runtime.config),
		issue,
		changedFields: ["deleted"],
	};
}

function normalizeDeleteIssueNumber(value: number | undefined): number {
	return normalizePositiveSafeInteger(value, "issueNumber", { message: "Issue number must be a positive safe integer." });
}

function assertIssueDeleteConfirmed(value: boolean | undefined): void {
	if (value === true) return;
	throw new IssueMeError(
		ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
		"Permanent issue deletion requires confirmDelete: true after explicit user confirmation.",
		{ field: "confirmDelete" },
	);
}
