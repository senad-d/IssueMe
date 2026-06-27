import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { createIssueMeRuntime, listChangedFields, refreshIssueRecord, toolText, writeAndSummarizeIssue } from "./runtime.ts";

const UpdateIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Open issue number to update." }),
		title: Type.Optional(Type.String({ description: "New issue title." })),
		body: Type.Optional(Type.String({ description: "New issue body." })),
		labels: Type.Optional(Type.Array(Type.String(), { description: "Complete label set to apply." })),
		assignees: Type.Optional(Type.Array(Type.String(), { description: "Complete assignee set to apply." })),
		milestone: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()], { description: "Milestone number or null to clear." })),
	},
	{ additionalProperties: false },
);

export function registerUpdateIssueTool(pi: ExtensionAPI) {
	pi.registerTool(
		defineTool({
			name: "issueme_update_issue",
			label: "IssueMe Update Issue",
			description: "Update explicit fields on an open GitHub issue and refresh its local IssueMe JSON file.",
			promptSnippet: "Update title, body, labels, assignees, or milestone for an open GitHub issue.",
			promptGuidelines: [
				"Use issueme_update_issue only for explicit requested changes; issueme_update_issue refuses closed issues.",
			],
			parameters: UpdateIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const { number, ...updates } = params;
				const changedFields = listChangedFields(updates);
				if (changedFields.length === 0) throw new Error("Provide at least one field to update.");

				const runtime = await createIssueMeRuntime(ctx);
				await runtime.client.updateIssue(number, updates, signal);
				const record = await refreshIssueRecord(runtime, number, signal);
				const { summary, path, removedPaths } = await writeAndSummarizeIssue(ctx, runtime, record);
				return toolText(
					`Updated issue #${number}: ${changedFields.join(", ")}\nLocal file: ${path ?? "removed"}`,
					{
						repository: runtime.repository,
						issue: summary,
						changedFields,
						paths: path ? [path] : [],
						removedPaths,
					},
				);
			},
		}),
	);
}
