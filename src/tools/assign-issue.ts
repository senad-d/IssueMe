import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { createIssueMeRuntime, requireNonEmptyStrings, refreshIssueRecord, toolText, writeAndSummarizeIssue } from "./runtime.ts";

const AssignIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Open issue number to assign or unassign." }),
		action: StringEnum(["add", "remove", "set"] as const, { description: "Assignment action to perform." }),
		assignees: Type.Array(Type.String(), { description: "GitHub usernames for the action." }),
	},
	{ additionalProperties: false },
);

export function registerAssignIssueTool(pi: ExtensionAPI) {
	pi.registerTool(
		defineTool({
			name: "issueme_assign_issue",
			label: "IssueMe Assign Issue",
			description: "Add, remove, or set assignees on an open GitHub issue and update the local cache.",
			promptSnippet: "Assign, unassign, or set GitHub issue assignees for open issues.",
			promptGuidelines: [
				"Use issueme_assign_issue to change assignees on open issues; issueme_assign_issue refuses closed issues.",
			],
			parameters: AssignIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const assignees = requireNonEmptyStrings(params.assignees, "assignees");
				const runtime = await createIssueMeRuntime(ctx);
				if (params.action === "add") await runtime.client.addAssignees(params.number, assignees, signal);
				else if (params.action === "remove") await runtime.client.removeAssignees(params.number, assignees, signal);
				else await runtime.client.setAssignees(params.number, assignees, signal);

				const record = await refreshIssueRecord(runtime, params.number, signal);
				const { summary, path } = await writeAndSummarizeIssue(ctx, runtime, record);
				return toolText(
					`Assignees for issue #${params.number}: ${record.assignees.length ? record.assignees.join(", ") : "none"}`,
					{
						repository: runtime.repository,
						issue: summary,
						changedFields: ["assignees"],
						paths: path ? [path] : [],
					},
				);
			},
		}),
	);
}
