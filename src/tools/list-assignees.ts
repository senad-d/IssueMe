import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_ASSIGNEES } from "../constants.ts";
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
	return assignees.map(normalizeAssigneeSummary).filter((assignee): assignee is ToolAssigneeSummary => assignee !== undefined);
}

function normalizeAssigneeSummary(assignee: GitHubUserResponse): ToolAssigneeSummary | undefined {
	const login = typeof assignee.login === "string" ? assignee.login.trim() : "";
	if (!login) return undefined;
	const id = typeof assignee.id === "number" && Number.isSafeInteger(assignee.id) && assignee.id > 0 ? assignee.id : undefined;
	const type = typeof assignee.type === "string" && assignee.type.trim() ? assignee.type.trim() : undefined;
	const htmlUrl = typeof assignee.html_url === "string" && assignee.html_url.trim() ? assignee.html_url.trim() : undefined;
	const apiUrl = typeof assignee.url === "string" && assignee.url.trim() ? assignee.url.trim() : undefined;
	return {
		login,
		...(id !== undefined ? { id } : {}),
		...(type ? { type } : {}),
		...(htmlUrl ? { html_url: htmlUrl } : {}),
		...(apiUrl ? { url: apiUrl } : {}),
	};
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
	].filter((value): value is string => value !== undefined);
	const lines = [
		`Listed ${assignees.length} assignable user(s) for ${repository}.`,
		`Limit: ${params.limit}${filters.length ? `; filters: ${filters.join(", ")}` : ""}.`,
		"This tool is read-only; it does not assign users or write local issue cache files.",
		"",
		assignees.length ? undefined : "No assignable users matched the request.",
		...assignees.map(formatAssigneeLine),
		truncated ? `Results truncated at ${params.limit} assignable user(s); narrow filters or increase limit up to ${MAX_TOOL_ASSIGNEES}.` : undefined,
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatAssigneeLine(assignee: ToolAssigneeSummary): string {
	const metadata = [
		assignee.type,
		assignee.id !== undefined ? `id ${assignee.id}` : undefined,
	].filter((value): value is string => value !== undefined).join(", ");
	const url = assignee.html_url ?? assignee.url;
	return `- ${assignee.login}${metadata ? ` (${metadata})` : ""}${url ? ` — ${url}` : ""}`;
}
