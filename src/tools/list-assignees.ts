import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_ASSIGNEES } from "../constants.ts";
import { assertGitHubAssigneeDiscoveryResponse } from "../github/issues-client.ts";
import type { GitHubUserResponse, IssueMeToolDetails, ToolAssigneeSummary } from "../types.ts";
import { normalizeBoundedToolLimit, normalizeOptionalTextFilter } from "../utils/validation.ts";
import { createIssueMeRuntime, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const DEFAULT_ASSIGNEE_LIST_LIMIT = Math.min(25, MAX_TOOL_ASSIGNEES);

const ListAssigneesParams = Type.Object(
	{
		login: Type.Optional(Type.String({ description: "Login substring." })),
		query: Type.Optional(Type.String({ description: "Login/ID/profile/type search." })),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_ASSIGNEES, description: `Max results. Default ${DEFAULT_ASSIGNEE_LIST_LIMIT}; max ${MAX_TOOL_ASSIGNEES}.` })),
	},
	{ additionalProperties: false },
);

type ListAssigneesToolParams = Static<typeof ListAssigneesParams>;

interface NormalizedListAssigneesParams {
	login?: string;
	query?: string;
	limit: number;
}

export function registerListAssigneesTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_list_assignees",
			label: "IssueMe List Assignees",
			description: "List users assignable to repo issues.",
			promptSnippet: "List assignable repo users.",
			promptGuidelines: [
				"Use issueme_list_assignees before assigning or creating issues when the correct username is unknown.",
			],
			parameters: ListAssigneesParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeListAssigneesParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const result = await runtime.client.listAssignees(normalized, signal);
				const assignees = summarizeAssignees(result.assignees);
				const details: IssueMeToolDetails = {
					repository: runtime.repository,
					status: "list_assignees",
					assignees,
					counts: {
						returned: assignees.length,
						limit: normalized.limit,
					},
					cacheUpdated: false,
					truncated: result.truncated,
					...(result.truncated ? { truncation: { assignees: { shown: assignees.length, max: normalized.limit } } } : {}),
				};
				return toolText(formatListAssigneesText(runtime.repository, normalized, assignees, result.truncated), details);
			},
		}),
	);
}

function normalizeListAssigneesParams(params: ListAssigneesToolParams): NormalizedListAssigneesParams {
	const login = normalizeOptionalTextFilter(params.login, "login");
	const query = normalizeOptionalTextFilter(params.query, "query");
	return {
		...(login ? { login } : {}),
		...(query ? { query } : {}),
		limit: normalizeBoundedToolLimit(params.limit, { max: MAX_TOOL_ASSIGNEES, defaultValue: DEFAULT_ASSIGNEE_LIST_LIMIT }),
	};
}

function summarizeAssignees(assignees: GitHubUserResponse[]): ToolAssigneeSummary[] {
	return assignees.map(normalizeAssigneeSummary);
}

function isStringValue(value: string | undefined): value is string {
	return typeof value === "string";
}

function normalizeAssigneeSummary(assignee: GitHubUserResponse): ToolAssigneeSummary {
	assertGitHubAssigneeDiscoveryResponse(assignee);
	return buildAssigneeSummary(assignee.login.trim(), assignee);
}

function normalizeAssigneeText(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed) return trimmed;
	}
	return undefined;
}

function normalizeAssigneeId(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
	return undefined;
}

function buildAssigneeSummary(login: string, assignee: GitHubUserResponse): ToolAssigneeSummary {
	const summary: ToolAssigneeSummary = { login };
	const id = normalizeAssigneeId(assignee.id);
	const type = normalizeAssigneeText(assignee.type);
	const htmlUrl = normalizeAssigneeText(assignee.html_url);
	const apiUrl = normalizeAssigneeText(assignee.url);
	if (typeof id === "number") summary.id = id;
	if (type) summary.type = type;
	if (htmlUrl) summary.html_url = htmlUrl;
	if (apiUrl) summary.url = apiUrl;
	return summary;
}

function formatListAssigneesText(
	repository: string,
	params: NormalizedListAssigneesParams,
	assignees: ToolAssigneeSummary[],
	truncated: boolean,
): string {
	const filters = [
		params.login ? `login: ${params.login}` : undefined,
		params.query ? `query: ${params.query}` : undefined,
	].filter(isStringValue);
	const filterText = formatListAssigneeFilterText(filters);
	const lines = [
		`Listed ${assignees.length} assignable user(s) for ${repository}.`,
		`Limit: ${params.limit}${filterText}.`,
		"This tool is read-only; it does not assign users or write local issue cache files.",
		"",
		assignees.length ? undefined : "No assignable users matched the request.",
		...assignees.map(formatAssigneeLine),
		truncated ? `Results truncated at ${params.limit} assignable user(s); narrow filters or increase limit up to ${MAX_TOOL_ASSIGNEES}.` : undefined,
	].filter(isStringValue);
	return lines.join("\n");
}

function formatListAssigneeFilterText(filters: string[]): string {
	if (filters.length) return `; filters: ${filters.join(", ")}`;
	return "";
}

function formatAssigneeLine(assignee: ToolAssigneeSummary): string {
	const metadata = formatAssigneeMetadata(assignee);
	const metadataText = formatAssigneeMetadataText(metadata);
	const urlText = formatAssigneeUrlText(assignee.html_url ?? assignee.url);
	return `- ${assignee.login}${metadataText}${urlText}`;
}

function formatAssigneeMetadata(assignee: ToolAssigneeSummary): string {
	return [
		assignee.type,
		formatAssigneeIdMetadata(assignee.id),
	].filter(isStringValue).join(", ");
}

function formatAssigneeIdMetadata(id: number | undefined): string | undefined {
	if (typeof id === "number") return `id ${id}`;
	return undefined;
}

function formatAssigneeMetadataText(metadata: string): string {
	if (metadata) return ` (${metadata})`;
	return "";
}

function formatAssigneeUrlText(url: string | undefined): string {
	if (url) return ` — ${url}`;
	return "";
}
