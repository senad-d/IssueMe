import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { createIssueMeRuntime, requireNonEmptyStrings, refreshIssueRecord, toolText, writeAndSummarizeIssue } from "./runtime.ts";

const LabelIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Open issue number to label." }),
		action: StringEnum(["add", "remove", "set"] as const, { description: "Label action to perform." }),
		labels: Type.Array(Type.String(), { description: "Label names for the action." }),
	},
	{ additionalProperties: false },
);

export function registerLabelIssueTool(pi: ExtensionAPI) {
	pi.registerTool(
		defineTool({
			name: "issueme_label_issue",
			label: "IssueMe Label Issue",
			description: "Add, remove, or set labels on an open GitHub issue and update the local cache.",
			promptSnippet: "Add, remove, or set GitHub issue labels for open issues.",
			promptGuidelines: [
				"Use issueme_label_issue to change labels on open issues; issueme_label_issue refuses closed issues.",
			],
			parameters: LabelIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const labels = requireNonEmptyStrings(params.labels, "labels");
				const runtime = await createIssueMeRuntime(ctx);
				if (params.action === "add") await runtime.client.addLabels(params.number, labels, signal);
				else if (params.action === "set") await runtime.client.setLabels(params.number, labels, signal);
				else {
					for (const label of labels) await runtime.client.removeLabel(params.number, label, signal);
				}

				const record = await refreshIssueRecord(runtime, params.number, signal);
				const { summary, path } = await writeAndSummarizeIssue(ctx, runtime, record);
				return toolText(
					`Labels for issue #${params.number}: ${record.labels.length ? record.labels.join(", ") : "none"}`,
					{
						repository: runtime.repository,
						issue: summary,
						changedFields: ["labels"],
						paths: path ? [path] : [],
					},
				);
			},
		}),
	);
}
