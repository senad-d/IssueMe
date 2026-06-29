import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { GitHubIssueCloseReason } from "../github/client.ts";
import { githubIssueToRecord, issueRecordToToolSummary } from "../issues/format.ts";
import { removeIssueByNumber, relativeIssuePath } from "../issues/store.ts";
import { assertIssueCreatorAllowed, createIssueMeRuntime, issueCreatorScopeLabel, partialSuccessToolText, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

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
				const changedFields = reason ? ["state", "state_reason"] : ["state"];
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const current = await runtime.client.getIssue(params.number, signal);
				assertIssueCreatorAllowed(runtime.config, current, { repository: runtime.repository, operation: "close_issue" });
				const alreadyClosed = current.state === "closed";
				const issue = alreadyClosed ? current : await runtime.client.closeIssue(params.number, { reason }, signal);
				const issueSummary = issueRecordToToolSummary(githubIssueToRecord(runtime.client.repository, issue, []));
				let removedPaths: string[] = [];
				try {
					const removed = await removeIssueByNumber(runtime.projectRoot, runtime.config, params.number, runtime.repository, signal);
					removedPaths = removed.map((path) => relativeIssuePath(runtime.projectRoot, path) ?? path);
				} catch (error) {
					const title = typeof issue.title === "string" ? issue.title : `#${params.number}`;
					return partialSuccessToolText(
						`${alreadyClosed ? "Issue was already closed" : "Closed issue"} #${params.number}: ${title}${!alreadyClosed && reason ? `\nClose reason: ${reason}` : ""}\nURL: ${issueSummary.html_url}\nLocal cache removal failed; run issueme_sync_issues before relying on cache state.`,
						error,
						{
							repository: runtime.repository,
							creatorScope: issueCreatorScopeLabel(runtime.config),
							issue: issueSummary,
							changedFields: alreadyClosed ? [] : changedFields,
						},
						alreadyClosed ? "already_closed_partial_success" : "closed_now_partial_success",
					);
				}
				const title = typeof issue.title === "string" ? issue.title : `#${params.number}`;
				return toolText(`${alreadyClosed ? "Issue was already closed" : "Closed issue"} #${params.number}: ${title}${!alreadyClosed && reason ? `\nClose reason: ${reason}` : ""}\nURL: ${issueSummary.html_url}\nRemoved local file(s): ${removedPaths.length || 0}`, {
					repository: runtime.repository,
					creatorScope: issueCreatorScopeLabel(runtime.config),
					issue: issueSummary,
					removedPaths,
					changedFields: alreadyClosed ? [] : changedFields,
					counts: { removed: removedPaths.length },
					cacheUpdated: true,
					status: alreadyClosed ? "already_closed" : "closed_now",
				});
			},
		}),
	);
}

function normalizeCloseReason(value: unknown): GitHubIssueCloseReason | undefined {
	if (value === undefined) return undefined;
	if (value === "completed" || value === "not_planned") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Close reason must be completed or not_planned when provided.", { field: "reason" });
}
