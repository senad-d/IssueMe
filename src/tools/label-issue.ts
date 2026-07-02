import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { assertExistingIssueCreatorAllowed, createIssueMeRuntime, issueCreatorScopeLabel, partialSuccessToolError, partialSuccessToolText, refreshAndCacheIssue, requireNonEmptyStrings, sanitizeStringList, toolText, type IssueMeRuntime, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const LabelIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Open issue number." }),
		action: StringEnum(["add", "remove", "set"] as const, { description: "Label action; set [] clears all." }),
		labels: Type.Array(Type.String(), { description: "Label names." }),
	},
	{ additionalProperties: false },
);

type LabelIssueToolParams = Static<typeof LabelIssueParams>;

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
				const labels = normalizeLabelMutationLabels(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				await assertExistingIssueCreatorAllowed(runtime, params.number, "label_issue", signal);
				const partialResult = await applyLabelMutationForTool(runtime, params, labels, signal);
				if (partialResult) return partialResult;
				try {
					const { record, summary, path } = await refreshAndCacheIssue(ctx, runtime, params.number, signal);
					return toolText(`Labels for issue #${params.number}: ${record.labels.length ? record.labels.join(", ") : "none"}`, {
						repository: runtime.repository,
						creatorScope: issueCreatorScopeLabel(runtime.config),
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
							creatorScope: issueCreatorScopeLabel(runtime.config),
							changedFields: ["labels"],
						},
					);
				}
			},
		}),
	);
}

function normalizeLabelMutationLabels(params: LabelIssueToolParams): string[] {
	if (params.action === "set") return sanitizeStringList(params.labels, "labels");
	return requireNonEmptyStrings(params.labels, "labels");
}

async function applyLabelMutationForTool(runtime: IssueMeRuntime, params: LabelIssueToolParams, labels: string[], signal: AbortSignal | undefined) {
	if (params.action === "add") {
		await runtime.client.addLabels(params.number, labels, signal);
		return undefined;
	}
	if (params.action === "set") {
		await runtime.client.setLabels(params.number, labels, signal);
		return undefined;
	}
	return removeLabelsForTool(runtime, params.number, labels, signal);
}

async function removeLabelsForTool(runtime: IssueMeRuntime, issueNumber: number, labels: string[], signal: AbortSignal | undefined) {
	let removedLabelMutations = 0;
	try {
		for (const label of labels) {
			const response = await runtime.client.removeLabel(issueNumber, label, signal);
			if (response === undefined) continue;
			removedLabelMutations += 1;
		}
		return undefined;
	} catch (error) {
		if (removedLabelMutations === 0) throw error;
		const safeError = partialSuccessToolError(error, "remote_partial_success");
		return toolText(
			`Removed ${removedLabelMutations} label(s) from issue #${issueNumber} before a later label removal failed. Run issueme_sync_issues before retrying local work.`,
			{
				repository: runtime.repository,
				creatorScope: issueCreatorScopeLabel(runtime.config),
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
