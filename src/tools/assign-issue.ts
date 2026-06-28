import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { githubIssueToRecord, issueRecordToToolSummary } from "../issues/format.ts";
import type { ToolIssueSummary } from "../types.ts";
import { createIssueMeRuntime, partialSuccessToolError, refreshIssueRecord, requireNonEmptyGitHubLogins, sanitizeGitHubLoginList, toolText, type IssueMeToolRegistrationOptions, writeAndSummarizeIssue } from "./runtime.ts";

const AssignIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Open issue number." }),
		action: StringEnum(["add", "remove", "set"] as const, { description: "Assignment action; set [] clears all." }),
		assignees: Type.Array(Type.String(), { description: "Usernames." }),
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
				"Use issueme_assign_issue to add, remove, or set assignees on open issues.",
			],
			executionMode: "sequential",
			parameters: AssignIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const assignees = params.action === "set" ? sanitizeGitHubLoginList(params.assignees, "assignees") : requireNonEmptyGitHubLogins(params.assignees, "assignees");
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const updatedIssue = params.action === "add"
					? await runtime.client.addAssignees(params.number, assignees, signal)
					: params.action === "remove"
						? await runtime.client.removeAssignees(params.number, assignees, signal)
						: await runtime.client.setAssignees(params.number, assignees, signal);
				let updatedSummary: ToolIssueSummary | undefined;

				try {
					updatedSummary = issueRecordToToolSummary(githubIssueToRecord(runtime.client.repository, updatedIssue, []));
					const record = await refreshIssueRecord(runtime, params.number, signal);
					const { summary, path } = await writeAndSummarizeIssue(ctx, runtime, record);
					return toolText(`Assignees for issue #${params.number}: ${record.assignees.length ? record.assignees.join(", ") : "none"}`, {
						repository: runtime.repository,
						issue: summary,
						changedFields: ["assignees"],
						paths: path ? [path] : [],
						cacheUpdated: true,
					});
				} catch (error) {
					const safeError = partialSuccessToolError(error);
					return toolText(
						`Updated assignees for issue #${params.number} remotely. Local cache refresh failed; run issueme_sync_issues before retrying local work.`,
						{
							repository: runtime.repository,
							...(updatedSummary ? { issue: updatedSummary } : {}),
							changedFields: ["assignees"],
							cacheUpdated: false,
							needsSync: true,
							status: "partial_success",
							message: safeError.message,
							error: safeError,
						},
					);
				}
			},
		}),
	);
}
