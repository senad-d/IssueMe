import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ISSUEME_ERROR_CODES, IssueMeError, isRemoteMutationSuccessKnown, markMutationSettlement } from "../errors.ts";
import type { GitHubIssueCloseReason } from "../github/client.ts";
import { githubIssueToRecord, issueRecordToToolSummary } from "../issues/format.ts";
import { removeIssueByNumber, relativeIssuePath } from "../issues/store.ts";
import type { GitHubIssueResponse, ToolIssueSummary } from "../types.ts";
import { assertIssueCreatorAllowed, createIssueMeRuntime, issueCreatorScopeLabel, partialSuccessToolText, remoteMutationPartialSuccessToolText, toolText, type IssueMeRuntime, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const CloseIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Issue number; already closed is no-op." }),
		reason: Type.Optional(StringEnum(["completed", "not_planned"] as const, { description: "Close reason; omit for GitHub default." })),
	},
	{ additionalProperties: false },
);

export function registerCloseIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_close_issue",
			label: "IssueMe Close Issue",
			description: "Close open issue and remove local cache.",
			promptSnippet: "Close open issue.",
			promptGuidelines: [
				"Use issueme_close_issue only for explicit close requests; never deletes remote issues, and not_planned requires explicit not-planned intent.",
			],
			executionMode: "sequential",
			parameters: CloseIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const reason = normalizeCloseReason(params.reason);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				let result: CloseIssueResult;
				try {
					result = await closeIssueForTool(runtime, params.number, reason, signal);
				} catch (error) {
					if (!isRemoteMutationSuccessKnown(error)) throw error;
					return remoteMutationPartialSuccessToolText(
						`GitHub accepted the request to close issue #${params.number}, but IssueMe could not verify the closed issue response.`,
						error,
						{ repository: runtime.repository, creatorScope: issueCreatorScopeLabel(runtime.config), changedFields: closeIssueChangedFields(reason) },
						"close_issue_response_partial_success",
					);
				}
				try {
					const removedPaths = await removeClosedIssueCache(runtime, params.number, signal);
					return closeIssueSuccessToolText(runtime, result, removedPaths);
				} catch (error) {
					return closeIssuePartialSuccessToolText(runtime, result, error);
				}
			},
		}),
	);
}

interface CloseIssueResult {
	number: number;
	reason: GitHubIssueCloseReason | undefined;
	alreadyClosed: boolean;
	issue: GitHubIssueResponse;
	issueSummary: ToolIssueSummary;
	changedFields: string[];
}

async function closeIssueForTool(runtime: IssueMeRuntime, issueNumber: number, reason: GitHubIssueCloseReason | undefined, signal?: AbortSignal): Promise<CloseIssueResult> {
	const current = await runtime.client.getIssue(issueNumber, signal);
	assertIssueCreatorAllowed(runtime.config, current, { repository: runtime.repository, operation: "close_issue" });
	const alreadyClosed = current.state === "closed";
	const issue = await closeIssueResponse(runtime, current, issueNumber, reason, signal);
	let issueSummary: ToolIssueSummary;
	try {
		issueSummary = issueRecordToToolSummary(githubIssueToRecord(runtime.client.repository, issue, []));
	} catch (error) {
		if (!alreadyClosed) throw markMutationSettlement(error, "remote_success_known");
		throw error;
	}
	return {
		number: issueNumber,
		reason,
		alreadyClosed,
		issue,
		issueSummary,
		changedFields: closeIssueChangedFields(reason),
	};
}

async function closeIssueResponse(
	runtime: IssueMeRuntime,
	current: GitHubIssueResponse,
	issueNumber: number,
	reason: GitHubIssueCloseReason | undefined,
	signal?: AbortSignal,
): Promise<GitHubIssueResponse> {
	if (current.state === "closed") return current;
	return runtime.client.closeIssue(issueNumber, { reason }, signal);
}

function closeIssueChangedFields(reason: GitHubIssueCloseReason | undefined): string[] {
	if (typeof reason === "string") return ["state", "state_reason"];
	return ["state"];
}

async function removeClosedIssueCache(runtime: IssueMeRuntime, issueNumber: number, signal?: AbortSignal): Promise<string[]> {
	const removed = await removeIssueByNumber(runtime.projectRoot, runtime.config, issueNumber, runtime.repository, signal);
	return removed.map((path) => relativeIssuePath(runtime.projectRoot, path) ?? path);
}

function closeIssueSuccessToolText(runtime: IssueMeRuntime, result: CloseIssueResult, removedPaths: string[]) {
	return toolText(`${closeIssueBaseText(result)}\nRemoved local file(s): ${removedPaths.length || 0}`, {
		repository: runtime.repository,
		creatorScope: issueCreatorScopeLabel(runtime.config),
		issue: result.issueSummary,
		removedPaths,
		changedFields: closeIssueResultChangedFields(result),
		counts: { removed: removedPaths.length },
		cacheUpdated: true,
		status: closeIssueStatus(result),
	});
}

function closeIssuePartialSuccessToolText(runtime: IssueMeRuntime, result: CloseIssueResult, error: unknown) {
	return partialSuccessToolText(
		`${closeIssueBaseText(result)}\nLocal cache removal failed; run issueme_sync_issues before relying on cache state.`,
		error,
		{
			repository: runtime.repository,
			creatorScope: issueCreatorScopeLabel(runtime.config),
			issue: result.issueSummary,
			changedFields: closeIssueResultChangedFields(result),
		},
		`${closeIssueStatus(result)}_partial_success`,
	);
}

function closeIssueBaseText(result: CloseIssueResult): string {
	const lines = [`${closeIssueVerb(result)} #${result.number}: ${closeIssueTitle(result)}`];
	if (shouldShowCloseReason(result)) lines.push(`Close reason: ${result.reason}`);
	lines.push(`URL: ${result.issueSummary.html_url}`);
	return lines.join("\n");
}

function closeIssueTitle(result: CloseIssueResult): string {
	if (typeof result.issue.title === "string") return result.issue.title;
	return `#${result.number}`;
}

function closeIssueVerb(result: CloseIssueResult): string {
	if (result.alreadyClosed) return "Issue was already closed";
	return "Closed issue";
}

function shouldShowCloseReason(result: CloseIssueResult): boolean {
	if (result.alreadyClosed) return false;
	return typeof result.reason === "string";
}

function closeIssueResultChangedFields(result: CloseIssueResult): string[] {
	if (result.alreadyClosed) return [];
	return result.changedFields;
}

function closeIssueStatus(result: CloseIssueResult): string {
	if (result.alreadyClosed) return "already_closed";
	return "closed_now";
}

function normalizeCloseReason(value: unknown): GitHubIssueCloseReason | undefined {
	if (value === undefined) return undefined;
	if (value === "completed" || value === "not_planned") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Close reason must be completed or not_planned when provided.", { field: "reason" });
}
