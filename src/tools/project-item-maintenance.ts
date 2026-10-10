import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { ISSUEME_ERROR_CODES, IssueMeError, isRemoteMutationSuccessKnown } from "../errors.ts";
import type { GitHubProjectV2ItemArchiveResult, GitHubProjectV2ItemFieldClearResult, GitHubProjectV2ItemRemovalResult } from "../github/client.ts";
import { issueResponseToSafeSummary } from "../github/issues-client.ts";
import type { GitHubIssueResponse, IssueMeToolDetails, ToolProjectItemSummary } from "../types.ts";
import { normalizePositiveSafeInteger, normalizeRequiredGitHubOpaqueId } from "../utils/validation.ts";
import { assertExistingIssueCreatorAllowed, createIssueMeRuntime, issueCreatorScopeLabel, remoteMutationPartialSuccessToolText, toolText, type IssueMeRuntime, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const PROJECT_ONLY_POLICY_NOTE = "Project-only operations accept open or closed backing issues in the current repository and creator scope; the issue, its comments, and other boards are never changed.";

const ArchiveAction = StringEnum(["archive", "unarchive"] as const, { description: "Archive or restore the item." });

const RemoveIssueFromProjectParams = Type.Object(
	{
		projectId: Type.String({ description: "ProjectV2 node ID." }),
		itemId: Type.String({ description: "ProjectV2Item node ID from discovery." }),
		issueNumber: Type.Integer({ minimum: 1, description: "Issue number represented by item; open or closed." }),
		confirmRemove: Type.Boolean({ description: "Must be true; the item's board values are discarded. The issue is not deleted or closed." }),
	},
	{ additionalProperties: false },
);

const ClearProjectItemFieldParams = Type.Object(
	{
		projectId: Type.String({ description: "ProjectV2 node ID." }),
		itemId: Type.String({ description: "ProjectV2Item node ID from discovery." }),
		issueNumber: Type.Integer({ minimum: 1, description: "Issue number represented by item; open or closed." }),
		fieldId: Type.String({ description: "Project-owned field node ID to clear (text, number, date, single-select, iteration)." }),
	},
	{ additionalProperties: false },
);

const ArchiveProjectItemParams = Type.Object(
	{
		projectId: Type.String({ description: "ProjectV2 node ID." }),
		itemId: Type.String({ description: "ProjectV2Item node ID from discovery." }),
		issueNumber: Type.Integer({ minimum: 1, description: "Issue number represented by item; open or closed." }),
		action: ArchiveAction,
	},
	{ additionalProperties: false },
);

type RemoveIssueFromProjectToolParams = Static<typeof RemoveIssueFromProjectParams>;
type ClearProjectItemFieldToolParams = Static<typeof ClearProjectItemFieldParams>;
type ArchiveProjectItemToolParams = Static<typeof ArchiveProjectItemParams>;

interface NormalizedProjectItemTarget {
	projectId: string;
	itemId: string;
	issueNumber: number;
}

export function registerProjectItemMaintenanceTools(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	registerRemoveIssueFromProjectTool(pi, options);
	registerClearProjectItemFieldTool(pi, options);
	registerArchiveProjectItemTool(pi, options);
}

export function registerRemoveIssueFromProjectTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_remove_issue_from_project",
			label: "IssueMe Remove Issue From Project",
			description: "Remove one issue item from a Projects v2 board.",
			promptSnippet: "Remove issue item from Projects v2 board.",
			promptGuidelines: [
				"Use issueme_remove_issue_from_project only with confirmRemove true after stating that the item's board values are lost; it never deletes, closes, or uncaches the issue.",
			],
			executionMode: "sequential",
			parameters: RemoveIssueFromProjectParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeRemoveIssueFromProjectParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				await assertExistingIssueCreatorAllowed(runtime, normalized.issueNumber, "remove_issue_from_project", signal, { requireOpen: false });
				let result: GitHubProjectV2ItemRemovalResult;
				try {
					result = await runtime.client.removeProjectV2Item(normalized, signal);
				} catch (error) {
					if (!isRemoteMutationSuccessKnown(error)) throw error;
					return remoteMutationPartialSuccessToolText(
						`GitHub accepted the request to remove project item ${normalized.itemId}, but IssueMe could not verify the deletion response.`,
						error,
						{ repository: runtime.repository, creatorScope: issueCreatorScopeLabel(runtime.config), changedFields: ["project_item"] },
						"remove_issue_from_project_response_partial_success",
					);
				}
				return toolText(formatRemovalText(result, normalized), buildMaintenanceDetails(runtime, result.issue, normalized, {
					status: result.status === "removed" ? "project_item_removed" : "project_item_already_absent",
					changedFields: result.status === "removed" ? ["project_item"] : [],
					...(result.deletedItemId ? { removedPaths: [] } : {}),
				}));
			},
		}),
	);
}

export function registerClearProjectItemFieldTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_clear_project_item_field",
			label: "IssueMe Clear Project Item Field",
			description: "Clear one Projects v2 item field value.",
			promptSnippet: "Clear one Projects v2 item field.",
			promptGuidelines: [
				"Use issueme_clear_project_item_field to unset a project-owned text/number/date/select/iteration value; never pass a replacement value, and use issue tools for labels, assignees, or milestones.",
			],
			executionMode: "sequential",
			parameters: ClearProjectItemFieldParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeClearProjectItemFieldParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				await assertExistingIssueCreatorAllowed(runtime, normalized.issueNumber, "clear_project_item_field", signal, { requireOpen: false });
				let result: GitHubProjectV2ItemFieldClearResult;
				try {
					result = await runtime.client.clearProjectV2ItemField(normalized, signal);
				} catch (error) {
					if (!isRemoteMutationSuccessKnown(error)) throw error;
					return remoteMutationPartialSuccessToolText(
						`GitHub accepted the request to clear field ${normalized.fieldId} on project item ${normalized.itemId}, but IssueMe could not verify the cleared value.`,
						error,
						{ repository: runtime.repository, creatorScope: issueCreatorScopeLabel(runtime.config), changedFields: [normalized.fieldId] },
						"clear_project_item_field_response_partial_success",
					);
				}
				return toolText(formatClearText(result, normalized), buildMaintenanceDetails(runtime, result.issue, normalized, {
					status: result.status === "cleared" ? "project_item_field_cleared" : "project_item_field_already_clear",
					changedFields: result.status === "cleared" ? [result.field.id] : [],
				}));
			},
		}),
	);
}

export function registerArchiveProjectItemTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_archive_project_item",
			label: "IssueMe Archive Project Item",
			description: "Archive or unarchive one Projects v2 item.",
			promptSnippet: "Archive/unarchive one Projects v2 item.",
			promptGuidelines: [
				"Use issueme_archive_project_item to retire or restore a board item while keeping its values; an already-matching state is a no-op.",
			],
			executionMode: "sequential",
			parameters: ArchiveProjectItemParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeArchiveProjectItemParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				await assertExistingIssueCreatorAllowed(runtime, normalized.issueNumber, `${normalized.action}_project_item`, signal, { requireOpen: false });
				let result: GitHubProjectV2ItemArchiveResult;
				try {
					result = await runtime.client.setProjectV2ItemArchived(normalized, signal);
				} catch (error) {
					if (!isRemoteMutationSuccessKnown(error)) throw error;
					return remoteMutationPartialSuccessToolText(
						`GitHub accepted the request to ${normalized.action} project item ${normalized.itemId}, but IssueMe could not verify the returned archive state.`,
						error,
						{ repository: runtime.repository, creatorScope: issueCreatorScopeLabel(runtime.config), changedFields: ["archived"] },
						`${normalized.action}_project_item_response_partial_success`,
					);
				}
				const changed = result.status === "archived" || result.status === "unarchived";
				return toolText(formatArchiveText(result, normalized), buildMaintenanceDetails(runtime, result.issue, normalized, {
					status: `project_item_${result.status}`,
					changedFields: changed ? ["archived"] : [],
					isArchived: result.isArchived,
				}));
			},
		}),
	);
}

function normalizeProjectItemTarget(params: { projectId: string; itemId: string; issueNumber: number }): NormalizedProjectItemTarget {
	return {
		projectId: normalizeRequiredGitHubOpaqueId(params.projectId, "projectId"),
		itemId: normalizeRequiredGitHubOpaqueId(params.itemId, "itemId"),
		issueNumber: normalizePositiveSafeInteger(params.issueNumber, "issueNumber"),
	};
}

function normalizeRemoveIssueFromProjectParams(params: RemoveIssueFromProjectToolParams): NormalizedProjectItemTarget {
	if (params.confirmRemove !== true) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			"confirmRemove must be true to remove a project item; its board field values are discarded (the issue itself is not deleted or closed).",
			{ field: "confirmRemove" },
		);
	}
	return normalizeProjectItemTarget(params);
}

function normalizeClearProjectItemFieldParams(params: ClearProjectItemFieldToolParams): NormalizedProjectItemTarget & { fieldId: string } {
	return { ...normalizeProjectItemTarget(params), fieldId: normalizeRequiredGitHubOpaqueId(params.fieldId, "fieldId") };
}

function normalizeArchiveProjectItemParams(params: ArchiveProjectItemToolParams): NormalizedProjectItemTarget & { action: "archive" | "unarchive" } {
	if (params.action !== "archive" && params.action !== "unarchive") {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "action must be archive or unarchive.", { field: "action" });
	}
	return { ...normalizeProjectItemTarget(params), action: params.action };
}

function buildMaintenanceDetails(
	runtime: IssueMeRuntime,
	issue: GitHubIssueResponse,
	target: NormalizedProjectItemTarget,
	extra: { status: string; changedFields: string[]; isArchived?: boolean; removedPaths?: string[] },
): IssueMeToolDetails {
	const issueSummary = issueResponseToSafeSummary(runtime.repository, issue, target.issueNumber);
	const projectItem: ToolProjectItemSummary = { id: target.itemId };
	if (issueSummary) projectItem.issue = { number: issueSummary.number, title: issueSummary.title, state: issueSummary.state, html_url: issueSummary.html_url };
	if (extra.isArchived !== undefined) projectItem.isArchived = extra.isArchived;
	return {
		repository: runtime.repository,
		creatorScope: issueCreatorScopeLabel(runtime.config),
		status: extra.status,
		...(issueSummary ? { issue: issueSummary } : {}),
		projectItem,
		changedFields: extra.changedFields,
		counts: { changed: extra.changedFields.length > 0 ? 1 : 0 },
		cacheUpdated: false,
		needsSync: false,
		message: PROJECT_ONLY_POLICY_NOTE,
	};
}

function formatRemovalText(result: GitHubProjectV2ItemRemovalResult, target: NormalizedProjectItemTarget): string {
	const headline = result.status === "removed"
		? `Removed project item ${result.itemId} (issue #${target.issueNumber}) from project ${target.projectId}; its board field values are gone.`
		: `Project item ${result.itemId} is already absent from project ${target.projectId}; issue #${target.issueNumber} has no item there and nothing was changed.`;
	return [headline, "The issue, its comments, labels, and other project memberships were not changed; no local cache file was removed.", PROJECT_ONLY_POLICY_NOTE].join("\n");
}

function formatClearText(result: GitHubProjectV2ItemFieldClearResult, target: NormalizedProjectItemTarget & { fieldId: string }): string {
	const field = `${result.field.name} (${result.field.dataType}, ${result.field.id})`;
	const headline = result.status === "cleared"
		? `Cleared field ${field} on project item ${result.itemId} (issue #${target.issueNumber}); the read-back shows no value.`
		: `Field ${field} on project item ${result.itemId} (issue #${target.issueNumber}) was already clear; nothing was changed.`;
	return [headline, "Other project fields and the issue's labels, assignees, and milestone were not changed.", PROJECT_ONLY_POLICY_NOTE].join("\n");
}

function formatArchiveText(result: GitHubProjectV2ItemArchiveResult, target: NormalizedProjectItemTarget & { action: "archive" | "unarchive" }): string {
	const headlines: Record<GitHubProjectV2ItemArchiveResult["status"], string> = {
		archived: `Archived project item ${result.itemId} (issue #${target.issueNumber}); its field values are preserved.`,
		unarchived: `Unarchived project item ${result.itemId} (issue #${target.issueNumber}); it is active again with its field values intact.`,
		already_archived: `Project item ${result.itemId} (issue #${target.issueNumber}) is already archived; nothing was changed.`,
		already_active: `Project item ${result.itemId} (issue #${target.issueNumber}) is already active; nothing was changed.`,
	};
	return [headlines[result.status], `Archive state: ${result.isArchived ? "archived" : "active"}.`, PROJECT_ONLY_POLICY_NOTE].join("\n");
}
