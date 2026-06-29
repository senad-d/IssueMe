import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { MAX_TOOL_ISSUES } from "../constants.ts";
import { IssueMeError } from "../errors.ts";
import type { GitHubIssueListDirection, GitHubIssueListSort, GitHubIssueListState } from "../github/client.ts";
import { githubIssueToRecord, issueRecordToToolSummary } from "../issues/format.ts";
import type { GitHubIssueResponse, IssueMeToolDetails, ToolIssueSummary } from "../types.ts";
import { assertNoNullBytes, normalizeBoundedToolLimit, normalizeOptionalTextFilter } from "../utils/validation.ts";
import { createIssueMeRuntime, sanitizeStringList, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const DEFAULT_ISSUE_LIST_LIMIT = 25;

const ListIssuesParams = Type.Object(
	{
		state: Type.Optional(StringEnum(["open", "closed", "all"] as const, { description: "Issue state. Default open." })),
		labels: Type.Optional(Type.Array(Type.String(), { description: "Required label names." })),
		assignee: Type.Optional(Type.String({ description: "Assigned login, none, or *." })),
		creator: Type.Optional(Type.String({ description: "Creator login; alias of author." })),
		author: Type.Optional(Type.String({ description: "Alias for creator; do not conflict." })),
		mentioned: Type.Optional(Type.String({ description: "Mentioned login." })),
		milestone: Type.Optional(Type.String({ description: "Milestone number/title, none, or *." })),
		since: Type.Optional(Type.String({ description: "Updated at/after ISO date." })),
		sort: Type.Optional(StringEnum(["created", "updated", "comments"] as const, { description: "Sort field." })),
		direction: Type.Optional(StringEnum(["asc", "desc"] as const, { description: "Sort direction." })),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_ISSUES, description: `Max results. Default ${DEFAULT_ISSUE_LIST_LIMIT}; max ${MAX_TOOL_ISSUES}.` })),
		query: Type.Optional(Type.String({ description: "Text search; repo/is:issue are added." })),
	},
	{ additionalProperties: false },
);

interface ListIssuesToolParams {
	state?: GitHubIssueListState;
	labels?: string[];
	assignee?: string;
	creator?: string;
	author?: string;
	mentioned?: string;
	milestone?: string;
	since?: string;
	sort?: GitHubIssueListSort;
	direction?: GitHubIssueListDirection;
	limit?: number;
	query?: string;
}

interface NormalizedListIssuesParams {
	state: GitHubIssueListState;
	labels: string[];
	assignee?: string;
	creator?: string;
	mentioned?: string;
	milestone?: string;
	since?: string;
	sort?: GitHubIssueListSort;
	direction?: GitHubIssueListDirection;
	limit: number;
	query?: string;
}

export function registerListIssuesTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_list_issues",
			label: "IssueMe List Issues",
			description: "List/search repo issues with filters; read-only summaries.",
			promptSnippet: "List/search repo issues.",
			promptGuidelines: [
				"Use issueme_list_issues when issue numbers are unknown; put free text in query and structured filters in fields.",
			],
			parameters: ListIssuesParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeListIssuesParams(params as ListIssuesToolParams);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const result = normalized.query
					? await runtime.client.searchIssues({ ...normalized, query: normalized.query }, signal)
					: await runtime.client.listIssues(normalized, signal);
				const summaries = summarizeIssues(runtime.repository, runtime.client.repository, result.issues);
				const details: IssueMeToolDetails = {
					repository: runtime.repository,
					status: result.mode,
					issues: summaries,
					counts: {
						returned: summaries.length,
						limit: normalized.limit,
						...(result.totalCount !== undefined ? { total: result.totalCount } : {}),
						...(result.incompleteResults ? { incompleteResults: 1 } : {}),
					},
					cacheUpdated: false,
					truncated: result.truncated,
					...(result.truncated ? { truncation: { issues: { shown: summaries.length, max: normalized.limit, ...(result.totalCount !== undefined ? { total: result.totalCount } : {}) } } } : {}),
				};
				return toolText(formatListIssuesText(runtime.repository, normalized, result.mode, summaries, result.truncated), details);
			},
		}),
	);
}

function normalizeListIssuesParams(params: ListIssuesToolParams): NormalizedListIssuesParams {
	const assignee = normalizeLoginLikeFilter(params.assignee, "assignee");
	const creator = normalizeCreator(params.creator, params.author);
	const mentioned = normalizeLoginLikeFilter(params.mentioned, "mentioned");
	const milestone = normalizeOptionalFilter(params.milestone, "milestone");
	const since = normalizeSince(params.since);
	const sort = normalizeSort(params.sort);
	const direction = normalizeDirection(params.direction);
	const query = normalizeQuery(params.query);
	return {
		state: normalizeState(params.state),
		labels: normalizeLabels(params.labels),
		...(assignee ? { assignee } : {}),
		...(creator ? { creator } : {}),
		...(mentioned ? { mentioned } : {}),
		...(milestone ? { milestone } : {}),
		...(since ? { since } : {}),
		...(sort ? { sort } : {}),
		...(direction ? { direction } : {}),
		limit: normalizeLimit(params.limit),
		...(query ? { query } : {}),
	};
}

function normalizeState(value: GitHubIssueListState | undefined): GitHubIssueListState {
	if (value === undefined) return "open";
	if (value === "open" || value === "closed" || value === "all") return value;
	throw new IssueMeError("invalid_tool_input", "state must be open, closed, or all.", { field: "state" });
}

function normalizeSort(value: GitHubIssueListSort | undefined): GitHubIssueListSort | undefined {
	if (value === undefined) return undefined;
	if (value === "created" || value === "updated" || value === "comments") return value;
	throw new IssueMeError("invalid_tool_input", "sort must be created, updated, or comments.", { field: "sort" });
}

function normalizeDirection(value: GitHubIssueListDirection | undefined): GitHubIssueListDirection | undefined {
	if (value === undefined) return undefined;
	if (value === "asc" || value === "desc") return value;
	throw new IssueMeError("invalid_tool_input", "direction must be asc or desc.", { field: "direction" });
}

function normalizeLimit(value: number | undefined): number {
	return normalizeBoundedToolLimit(value, { max: MAX_TOOL_ISSUES, defaultValue: DEFAULT_ISSUE_LIST_LIMIT });
}

function normalizeCreator(creatorValue: string | undefined, authorValue: string | undefined): string | undefined {
	const creator = normalizeLoginLikeFilter(creatorValue, "creator");
	const author = normalizeLoginLikeFilter(authorValue, "author");
	if (creator && author && creator !== author) {
		throw new IssueMeError("invalid_tool_input", "Use creator or author, not both with different values.", { fields: ["creator", "author"] });
	}
	return author ?? creator;
}

function normalizeLabels(values: string[] | undefined): string[] {
	const labels = sanitizeStringList(values, "labels");
	for (const label of labels) assertSafeFilterValue(label, "labels");
	return labels;
}

function normalizeLoginLikeFilter(value: string | undefined, field: string): string | undefined {
	const normalized = normalizeOptionalFilter(value, field);
	if (!normalized) return undefined;
	if (/\s/.test(normalized)) throw new IssueMeError("invalid_tool_input", `${field} must be one GitHub login or supported special value, not whitespace-separated text.`, { field });
	return normalized;
}

function normalizeOptionalFilter(value: string | undefined, field: string): string | undefined {
	return normalizeOptionalTextFilter(value, field);
}

function normalizeSince(value: string | undefined): string | undefined {
	const since = normalizeOptionalFilter(value, "since");
	if (!since) return undefined;
	if (Number.isNaN(Date.parse(since))) {
		throw new IssueMeError("invalid_tool_input", "since must be a valid ISO 8601 timestamp or date.", { field: "since" });
	}
	return since;
}

function normalizeQuery(value: string | undefined): string | undefined {
	const query = normalizeOptionalFilter(value, "query");
	if (!query) return undefined;
	if (/\b(?:repo|org|user):|\b(?:is|type):(?:pr|pull-request|pullrequest)\b/i.test(query)) {
		throw new IssueMeError("invalid_tool_input", "query must not include repository, owner, or pull-request boundary qualifiers; IssueMe enforces repo:<owner>/<repo> is:issue automatically.", { field: "query" });
	}
	return query;
}

function assertSafeFilterValue(value: string, field: string): void {
	assertNoNullBytes(value, field);
}

function summarizeIssues(repository: string, parsedRepository: Parameters<typeof githubIssueToRecord>[0], issues: GitHubIssueResponse[]): ToolIssueSummary[] {
	return issues.map((issue) => issueRecordToToolSummary(githubIssueToRecord(parsedRepository, issue, []))).filter((summary) => summary.repository === repository);
}

function formatListIssuesText(
	repository: string,
	params: NormalizedListIssuesParams,
	mode: "list" | "search",
	summaries: ToolIssueSummary[],
	truncated: boolean,
): string {
	const lines = [
		`${mode === "search" ? "Searched" : "Listed"} ${summaries.length} issue(s) for ${repository}.`,
		`Mode: ${mode}; state: ${params.state}; limit: ${params.limit}.`,
		params.query ? `Query: ${params.query}` : undefined,
		"This tool is read-only; local issue cache files were not refreshed or written.",
		"",
		...summaries.map(formatIssueLine),
		truncated ? `Results truncated at ${params.limit} issue(s); narrow filters or increase limit up to ${MAX_TOOL_ISSUES}.` : undefined,
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatIssueLine(issue: ToolIssueSummary): string {
	const labels = issue.labels.length ? issue.labels.join(", ") : "no labels";
	const assignees = issue.assignees.length ? issue.assignees.join(", ") : "unassigned";
	return `- #${issue.number} [${issue.state}] ${issue.title} — ${labels}; ${assignees}; ${issue.html_url}`;
}
