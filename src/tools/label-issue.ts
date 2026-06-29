import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { createIssueMeRuntime, partialSuccessToolError, partialSuccessToolText, refreshAndCacheIssue, requireNonEmptyStrings, sanitizeStringList, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const LabelIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Open issue number." }),
		action: StringEnum(["add", "remove", "set"] as const, { description: "Label action; set [] clears all." }),
		labels: Type.Array(Type.String(), { description: "Label names." }),
	},
	{ additionalProperties: false },
);

export function registerLabelIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_label_issue",
			label: "IssueMe Label Issue",
			description: "Add, remove, or set issue labels.",
			promptSnippet: "Add/remove/set issue labels.",
			promptGuidelines: [
				"Use issueme_label_issue to add, remove, or set labels on open issues; add/set require existing repository labels.",
			],
			executionMode: "sequential",
			parameters: LabelIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const labels = params.action === "set" ? sanitizeStringList(params.labels, "labels") : requireNonEmptyStrings(params.labels, "labels");
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				if (params.action === "add") await runtime.client.addLabels(params.number, labels, signal);
				else if (params.action === "set") await runtime.client.setLabels(params.number, labels, signal);
				else {
					let removedLabelMutations = 0;
					try {
						for (const label of labels) {
							const response = await runtime.client.removeLabel(params.number, label, signal);
							if (response !== undefined) removedLabelMutations += 1;
						}
					} catch (error) {
						if (removedLabelMutations === 0) throw error;
						const safeError = partialSuccessToolError(error, "remote_partial_success");
						return toolText(
							`Removed ${removedLabelMutations} label(s) from issue #${params.number} before a later label removal failed. Run issueme_sync_issues before retrying local work.`,
							{
								repository: runtime.repository,
								changedFields: ["labels"],
								cacheUpdated: false,
								needsSync: true,
								status: "remote_partial_success",
								message: safeError.message,
								error: safeError,
							},
						);
					}
				}

				try {
					const { record, summary, path } = await refreshAndCacheIssue(ctx, runtime, params.number, signal);
					return toolText(`Labels for issue #${params.number}: ${record.labels.length ? record.labels.join(", ") : "none"}`, {
						repository: runtime.repository,
						issue: summary,
						changedFields: ["labels"],
						paths: path ? [path] : [],
						cacheUpdated: true,
					});
				} catch (error) {
					return partialSuccessToolText(
						`Updated labels for issue #${params.number} remotely. Local cache refresh failed; run issueme_sync_issues before retrying local work.`,
						error,
						{
							repository: runtime.repository,
							changedFields: ["labels"],
						},
					);
				}
			},
		}),
	);
}
