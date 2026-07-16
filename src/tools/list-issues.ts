import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_ISSUES, MAX_TOOL_LABELS } from "../constants.ts";
import { IssueMeError } from "../errors.ts";
import type { GitHubIssueListDirection, GitHubIssueListSort, GitHubIssueListState } from "../github/client.ts";
import { githubIssueToRecord, issueRecordToToolSummary } from "../issues/format.ts";
import type { GitHubIssueResponse, IssueMeConfig, IssueMeToolDetails, ToolIssueSummary } from "../types.ts";
import { assertNoNullBytes, normalizeBoundedToolLimit, normalizeOptionalIsoDateOrTimestamp, normalizeOptionalTextFilter } from "../utils/validation.ts";
import { createIssueMeRuntime, issueCreatorMatchesConfig, issueCreatorScopeLabel, sanitizeStringList, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const DEFAULT_ISSUE_LIST_LIMIT = 25;

const ListIssuesParams = Type.Object(
	{
		state: Type.Optional(StringEnum(["open", "closed", "all"] as const, { description: "Issue state. Default open." })),
		labels: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_TOOL_LABELS, description: `Required label names. Max ${MAX_TOOL_LABELS}.` })),
		assignee: Type.Optional(Type.String({ description: "Assigned login, none, or *." })),
		creator: Type.Optional(Type.String({ description: "Creator login; alias of author." })),
		author: Type.Optional(Type.String({ description: "Alias for creator; do not conflict." })),
		mentioned: Type.Optional(Type.String({ description: "Mentioned login." })),
		milestone: Type.Optional(Type.String({ description: "Milestone number/title, none, or *." })),
		since: Type.Optional(Type.String({ description: "Updated at/after ISO date (YYYY-MM-DD) or timestamp with timezone." })),
		sort: Type.Optional(StringEnum(["created", "updated", "comments"] as const, { description: "Sort field." })),
		direction: Type.Optional(StringEnum(["asc", "desc"] as const, { description: "Sort direction." })),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_ISSUES, description: `Max results. Default ${DEFAULT_ISSUE_LIST_LIMIT}; max ${MAX_TOOL_ISSUES}.` })),
		query: Type.Optional(Type.String({ description: "Text search; repo/is:issue are added." })),
	},
	{ additionalProperties: false },
);

type ListIssuesToolParams = Static<typeof ListIssuesParams>;

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
				const normalized = normalizeListIssuesParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const scoped = applyCreatorScope(normalized, runtime.config);
				const creatorScope = issueCreatorScopeLabel(runtime.config);
				const result = scoped.query
					? await runtime.client.searchIssues({ ...scoped, query: scoped.query }, signal)
					: await runtime.client.listIssues(scoped, signal);
				const summaries = summarizeIssues(runtime.repository, runtime.client.repository, result.issues, runtime.config);
				const truncation = buildListIssueTruncation(result.truncated, summaries.length, normalized.limit, result.totalCount);
				const details: IssueMeToolDetails = {
					repository: runtime.repository,
					creatorScope,
					status: result.mode,
					issues: summaries,
					counts: buildListIssueCounts(summaries.length, normalized.limit, result.totalCount, result.incompleteResults),
					cacheUpdated: false,
					truncated: result.truncated,
					...(truncation ? { truncation } : {}),
				};
				return toolText(formatListIssuesText(runtime.repository, scoped, result.mode, summaries, result.truncated, creatorScope), details);
			},
		}),
	);
}

function buildListIssueCounts(returned: number, limit: number, totalCount: number | undefined, incompleteResults: boolean | undefined): Record<string, number> {
	const counts: Record<string, number> = { returned, limit };
	if (typeof totalCount === "number") counts.total = totalCount;
	if (incompleteResults) counts.incompleteResults = 1;
	return counts;
}

function buildListIssueTruncation(truncated: boolean, shown: number, max: number, totalCount: number | undefined): Record<string, unknown> | undefined {
	if (truncated) {
		const issues: Record<string, number> = { shown, max };
		if (typeof totalCount === "number") issues.total = totalCount;
		return { issues };
	}
	return undefined;
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
	return normalizeOptionalIsoDateOrTimestamp(value, "since", {
		invalidMessage: "since must be a valid ISO YYYY-MM-DD date or ISO 8601 timestamp with timezone.",
	});
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

function applyCreatorScope(params: NormalizedListIssuesParams, config: IssueMeConfig): NormalizedListIssuesParams {
	const creatorScope = issueCreatorScopeLabel(config);
	if (creatorScope === "all") return params;
	assertSearchQueryCreatorScope(params.query, creatorScope);
	if (params.creator && params.creator.toLowerCase() !== creatorScope.toLowerCase()) {
		throw new IssueMeError(
			"invalid_tool_input",
			`Configured allowedIssueCreator is ${creatorScope}; creator/author filter ${params.creator} would be out of scope.`,
			{ field: "creator", allowedIssueCreator: creatorScope, requestedCreator: params.creator },
		);
	}
	return { ...params, creator: params.creator ?? creatorScope };
}

function assertSearchQueryCreatorScope(query: string | undefined, creatorScope: string): void {
	if (!query) return;
	for (const requestedCreator of extractSearchCreatorQualifiers(query)) {
		if (requestedCreator.toLowerCase() === creatorScope.toLowerCase()) continue;
		throw new IssueMeError(
			"invalid_tool_input",
			`Configured allowedIssueCreator is ${creatorScope}; search query author/creator filter ${requestedCreator} would be out of scope.`,
			{ field: "query", allowedIssueCreator: creatorScope, requestedCreator },
		);
	}
}

function extractSearchCreatorQualifiers(query: string): string[] {
	const values: string[] = [];
	const pattern = /\b(?:author|creator):(?:"([^"]+)"|(\S+))/gi;
	let match: RegExpExecArray | null;
	while ((match = pattern.exec(query)) !== null) {
		const value = (match[1] ?? match[2] ?? "").trim();
		if (value) values.push(value);
	}
	return values;
}

function summarizeIssues(repository: string, parsedRepository: Parameters<typeof githubIssueToRecord>[0], issues: GitHubIssueResponse[], config: IssueMeConfig): ToolIssueSummary[] {
	return issues
		.map((issue) => issueRecordToToolSummary(githubIssueToRecord(parsedRepository, issue, [])))
		.filter((summary) => summary.repository === repository && issueCreatorMatchesConfig(config, summary.creator));
}

function formatListIssuesText(
	repository: string,
	params: NormalizedListIssuesParams,
	mode: "list" | "search",
	summaries: ToolIssueSummary[],
	truncated: boolean,
	creatorScope: string,
): string {
	const lines = [
		`${mode === "search" ? "Searched" : "Listed"} ${summaries.length} issue(s) for ${repository}.`,
		`Mode: ${mode}; state: ${params.state}; limit: ${params.limit}; creator scope: ${creatorScope}.`,
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
	const creator = issue.creator ? `; by ${issue.creator}` : "";
	return `- #${issue.number} [${issue.state}] ${issue.title} — ${labels}; ${assignees}${creator}; ${issue.html_url}`;
}
