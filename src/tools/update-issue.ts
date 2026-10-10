import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_ASSIGNEES, MAX_TOOL_LABELS } from "../constants.ts";
import { IssueMeError } from "../errors.ts";
import type { IssueUpdateInput } from "../github/client.ts";
import { issueTypeNameOf, normalizeIssueTypeName } from "../github/issues-client.ts";
import { githubIssueToRecord, issueRecordToToolSummary } from "../issues/format.ts";
import type { ToolIssueSummary } from "../types.ts";
import { issueTypeMismatch } from "./create-issue.ts";
import { assertExistingIssueCreatorAllowed, createIssueMeRuntime, issueCreatorScopeLabel, listChangedFields, normalizeIssueBody, partialSuccessToolText, refreshAndCacheIssue, requireNonEmptyTitle, safeToolError, sanitizeGitHubLoginList, sanitizeStringList, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const UpdateIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Open issue number." }),
		title: Type.Optional(Type.String({ description: "New title. Non-empty." })),
		body: Type.Optional(Type.String({ description: "New body. Empty clears intentionally." })),
		labels: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_TOOL_LABELS, description: `Complete label set. Max ${MAX_TOOL_LABELS}.` })),
		assignees: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_TOOL_ASSIGNEES, description: `Complete assignee set. Max ${MAX_TOOL_ASSIGNEES}.` })),
		milestoneNumber: Type.Optional(Type.Integer({ minimum: 1, description: "Milestone number." })),
		clearMilestone: Type.Optional(Type.Boolean({ description: "True clears milestone." })),
		type: Type.Optional(Type.String({ description: "Native issue type name from issueme_list_issue_types." })),
		clearType: Type.Optional(Type.Boolean({ description: "True clears the issue type." })),
	},
	{ additionalProperties: false },
);

type UpdateIssueToolParams = Static<typeof UpdateIssueParams>;

function normalizeUpdateIssuePayload(params: UpdateIssueToolParams): IssueUpdateInput {
	const payload: IssueUpdateInput = {};
	if (params.title !== undefined) payload.title = requireNonEmptyTitle(params.title);
	if (params.body !== undefined) payload.body = normalizeIssueBody(params.body, "update");
	if (params.labels !== undefined) payload.labels = sanitizeStringList(params.labels, "labels");
	if (params.assignees !== undefined) payload.assignees = sanitizeGitHubLoginList(params.assignees, "assignees");
	if (params.milestoneNumber !== undefined && params.clearMilestone) {
		throw new IssueMeError("invalid_tool_input", "Use milestoneNumber or clearMilestone, not both.", { fields: ["milestoneNumber", "clearMilestone"] });
	}
	if (params.milestoneNumber !== undefined) payload.milestone = params.milestoneNumber;
	if (params.clearMilestone) payload.milestone = null;
	if (params.type !== undefined && params.clearType) {
		throw new IssueMeError("invalid_tool_input", "Use type or clearType, not both.", { fields: ["type", "clearType"] });
	}
	if (params.type !== undefined) payload.type = normalizeIssueTypeName(params.type);
	if (params.clearType) payload.type = null;
	return payload;
}

export function registerUpdateIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_update_issue",
			label: "IssueMe Update Issue",
			description: "Update open issue fields and refresh cache.",
			promptSnippet: "Update open issue fields.",
			promptGuidelines: [
				"Use issueme_update_issue only for explicit field changes on open issues; omit body to keep it unchanged.",
			],
			executionMode: "sequential",
			parameters: UpdateIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const updatePayload = normalizeUpdateIssuePayload(params);

				const changedFields = listChangedFields({ ...updatePayload });
				if (changedFields.length === 0) throw new IssueMeError("invalid_tool_input", "Provide at least one field to update.");

				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				await assertExistingIssueCreatorAllowed(runtime, params.number, "update_issue", signal);
				const updatedIssue = await runtime.client.updateIssue(params.number, updatePayload, signal);
				let updatedSummary: ToolIssueSummary | undefined;
				try {
					updatedSummary = issueRecordToToolSummary(githubIssueToRecord(runtime.client.repository, updatedIssue, []));
					const { summary, path, removedPaths } = await refreshAndCacheIssue(ctx, runtime, params.number, signal);
					const successText = `Updated issue #${params.number}: ${changedFields.join(", ")}\nLocal file: ${path ?? "removed"}`;
					const typeMismatch = updatePayload.type === undefined ? undefined : issueTypeMismatch(updatePayload.type, issueTypeNameOf(updatedIssue));
					if (typeMismatch) {
						return toolText(`${successText}\n${typeMismatch.message}`, {
							repository: runtime.repository,
							creatorScope: issueCreatorScopeLabel(runtime.config),
							issue: summary,
							changedFields,
							paths: path ? [path] : [],
							removedPaths,
							cacheUpdated: true,
							needsSync: false,
							result: "partial_success",
							status: "update_issue_type_not_applied",
							message: typeMismatch.message,
							error: safeToolError(typeMismatch),
						});
					}
					return toolText(successText, {
						repository: runtime.repository,
						creatorScope: issueCreatorScopeLabel(runtime.config),
						issue: summary,
						changedFields,
						paths: path ? [path] : [],
						removedPaths,
						cacheUpdated: true,
					});
				} catch (error) {
					return partialSuccessToolText(
						`Updated issue #${params.number} remotely: ${changedFields.join(", ")}\nLocal cache refresh failed; run issueme_sync_issues before retrying local work.`,
						error,
						{
							repository: runtime.repository,
							creatorScope: issueCreatorScopeLabel(runtime.config),
							...(updatedSummary ? { issue: updatedSummary } : {}),
							changedFields,
						},
					);
				}
			},
		}),
	);
}
