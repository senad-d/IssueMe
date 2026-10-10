import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { MAX_TOOL_ISSUE_TYPES } from "../constants.ts";
import type { GitHubRepositoryIssueTypesResult } from "../github/client.ts";
import type { GitHubIssueTypeResponse, IssueMeToolDetails, ToolIssueTypeSummary } from "../types.ts";
import { createIssueMeRuntime, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const ListIssueTypesParams = Type.Object({}, { additionalProperties: false });

export function registerListIssueTypesTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_list_issue_types",
			label: "IssueMe List Issue Types",
			description: "List the organization's native issue types.",
			promptSnippet: "List native issue types.",
			promptGuidelines: [
				"Use issueme_list_issue_types before setting type on create/update; types are organization-defined, not labels, and user-owned repositories have none.",
			],
			parameters: ListIssueTypesParams,
			async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const result = await runtime.client.listRepositoryIssueTypes(signal);
				const issueTypes = summarizeIssueTypes(result.issueTypes);
				const details = buildIssueTypesDetails(runtime.repository, result, issueTypes);
				return toolText(formatIssueTypesText(runtime.repository, result, issueTypes), details);
			},
		}),
	);
}

export function summarizeIssueTypes(types: GitHubIssueTypeResponse[]): ToolIssueTypeSummary[] {
	return types.map(normalizeIssueTypeSummary);
}

function normalizeIssueTypeSummary(type: GitHubIssueTypeResponse): ToolIssueTypeSummary {
	const summary: ToolIssueTypeSummary = {
		id: typeof type.id === "number" ? type.id : 0,
		name: typeof type.name === "string" ? type.name.trim() : "",
	};
	if (typeof type.description === "string" && type.description.trim()) summary.description = type.description.trim();
	if (typeof type.color === "string" && type.color.trim()) summary.color = type.color.trim();
	if (typeof type.is_enabled === "boolean") summary.isEnabled = type.is_enabled;
	return summary;
}

function buildIssueTypesDetails(repository: string, result: GitHubRepositoryIssueTypesResult, issueTypes: ToolIssueTypeSummary[]): IssueMeToolDetails {
	const unavailable = result.ownerType !== "Organization";
	return {
		repository,
		status: unavailable ? "issue_types_unavailable" : "list_issue_types",
		issueTypes,
		counts: {
			returned: issueTypes.length,
			enabled: issueTypes.filter((type) => type.isEnabled !== false).length,
			disabled: issueTypes.filter((type) => type.isEnabled === false).length,
			limit: MAX_TOOL_ISSUE_TYPES,
		},
		cacheUpdated: false,
		needsSync: false,
		truncated: issueTypes.length > MAX_TOOL_ISSUE_TYPES,
		...(unavailable ? { message: `Repository ${repository} is owned by a ${result.ownerType.toLowerCase()} account; GitHub issue types are an organization feature, so none exist here.` } : {}),
	};
}

function formatIssueTypesText(repository: string, result: GitHubRepositoryIssueTypesResult, issueTypes: ToolIssueTypeSummary[]): string {
	if (result.ownerType !== "Organization") {
		return [
			`Issue types are unavailable for ${repository}: the repository owner is a ${result.ownerType.toLowerCase()} account and GitHub issue types are organization-defined.`,
			"Create and update issues without a type, or use labels for classification.",
		].join("\n");
	}
	const lines = [
		`Listed ${issueTypes.length} issue type(s) for organization ${repository.split("/")[0]} (repository ${repository}).`,
		"This tool is read-only; it does not create, update, or delete organization issue types.",
		"",
		issueTypes.length === 0 ? "The organization has not defined any issue types." : undefined,
		...issueTypes.map(formatIssueTypeLine),
		"Use the exact name with type on issueme_create_issue or issueme_update_issue; disabled types cannot be applied.",
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatIssueTypeLine(type: ToolIssueTypeSummary): string {
	const state = type.isEnabled === false ? "disabled" : "enabled";
	const color = type.color ? `, ${type.color}` : "";
	const description = type.description ? ` — ${type.description}` : "";
	return `- ${type.name} (${state}${color}) id: ${type.id}${description}`;
}
