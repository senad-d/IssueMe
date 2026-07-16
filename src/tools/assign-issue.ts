import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { MAX_TOOL_ASSIGNEES } from "../constants.ts";
import { githubIssueToRecord, issueRecordToToolSummary } from "../issues/format.ts";
import type { GitHubIssueResponse, ToolIssueSummary } from "../types.ts";
import { assertExistingIssueCreatorAllowed, createIssueMeRuntime, issueCreatorScopeLabel, partialSuccessToolText, refreshAndCacheIssue, requireNonEmptyGitHubLogins, sanitizeGitHubLoginList, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const AssignIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Open issue number." }),
		action: StringEnum(["add", "remove", "set"] as const, { description: "Assignment action; set [] clears all." }),
		assignees: Type.Array(Type.String(), { maxItems: MAX_TOOL_ASSIGNEES, description: `Usernames. Max ${MAX_TOOL_ASSIGNEES}.` }),
	},
	{ additionalProperties: false },
);

export function registerAssignIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_assign_issue",
			label: "IssueMe Assign Issue",
			description: "Add, remove, or set issue assignees.",
			promptSnippet: "Add/remove/set issue assignees.",
			promptGuidelines: [
				"Use issueme_assign_issue to add, remove, or set assignees on open issues; add/set reject users GitHub reports as unassignable.",
			],
			executionMode: "sequential",
			parameters: AssignIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const assignees = params.action === "set" ? sanitizeGitHubLoginList(params.assignees, "assignees") : requireNonEmptyGitHubLogins(params.assignees, "assignees");
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				await assertExistingIssueCreatorAllowed(runtime, params.number, "assign_issue", signal);
				let updatedIssue: GitHubIssueResponse;
				if (params.action === "add") {
					updatedIssue = await runtime.client.addAssignees(params.number, assignees, signal);
				} else if (params.action === "remove") {
					updatedIssue = await runtime.client.removeAssignees(params.number, assignees, signal);
				} else {
					updatedIssue = await runtime.client.setAssignees(params.number, assignees, signal);
				}
				let updatedSummary: ToolIssueSummary | undefined;

				try {
					updatedSummary = issueRecordToToolSummary(githubIssueToRecord(runtime.client.repository, updatedIssue, []));
					const { record, summary, path } = await refreshAndCacheIssue(ctx, runtime, params.number, signal);
					return toolText(`Assignees for issue #${params.number}: ${record.assignees.length ? record.assignees.join(", ") : "none"}`, {
						repository: runtime.repository,
						creatorScope: issueCreatorScopeLabel(runtime.config),
						issue: summary,
						changedFields: ["assignees"],
						paths: path ? [path] : [],
						cacheUpdated: true,
					});
				} catch (error) {
					return partialSuccessToolText(
						`Updated assignees for issue #${params.number} remotely. Local cache refresh failed; run issueme_sync_issues before retrying local work.`,
						error,
						{
							repository: runtime.repository,
							creatorScope: issueCreatorScopeLabel(runtime.config),
							...(updatedSummary ? { issue: updatedSummary } : {}),
							changedFields: ["assignees"],
						},
					);
				}
			},
		}),
	);
}
