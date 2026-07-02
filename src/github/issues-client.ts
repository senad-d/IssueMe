import { GITHUB_API_BASE_URL } from "../constants.ts";
import { ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { GitHubCommentResponse, GitHubIssueResponse, GitHubLabelResponse, GitHubRepository, GitHubUserResponse, ToolIssueSummary } from "../types.ts";
import { normalizeOptionalIsoDateOrTimestamp, normalizeOptionalLowercaseTextFilter, normalizeOptionalTrimmedText, normalizePositiveSafeInteger } from "../utils/validation.ts";
import { normalizeGraphQLIssueCreator } from "./graphql-normalizers.ts";
import type { GitHubIssueListDirection, GitHubIssueListFilters, GitHubIssueListSort, GitHubIssueListState, GitHubIssueSearchFilters, GitHubMilestoneListDirection, GitHubMilestoneListSort, GitHubMilestoneListState, GitHubRepositoryMilestoneListFilters, IssueUpdateInput } from "./client.ts";
import { isObject } from "./shared.ts";

interface GitHubIssueSearchResponse {
	total_count?: unknown;
	incomplete_results?: unknown;
	items?: unknown;
}

export interface NormalizedIssueSearchResponse {
	totalCount?: number;
	incompleteResults?: boolean;
	items: GitHubIssueResponse[];
}

export function buildIssueListQuery(filters: GitHubIssueListFilters, limit: number | undefined): Record<string, string> {
	const state = normalizeIssueListState(filters.state);
	return compactQuery({
		state,
		per_page: String(Math.min(limit ?? 100, 100)),
		labels: normalizeStringList(filters.labels).join(",") || undefined,
		assignee: normalizeOptionalQueryValue(filters.assignee),
		creator: normalizeOptionalQueryValue(filters.creator),
		mentioned: normalizeOptionalQueryValue(filters.mentioned),
		milestone: normalizeOptionalQueryValue(filters.milestone),
		since: normalizeIssueSinceFilter(filters.since),
		sort: normalizeIssueListSort(filters.sort),
		direction: normalizeIssueListDirection(filters.direction),
	});
}

export function buildIssueSearchRequestQuery(repository: string, filters: GitHubIssueSearchFilters, limit: number | undefined): Record<string, string> {
	const state = normalizeIssueListState(filters.state);
	const terms = [`repo:${repository}`, "is:issue"];
	const query = normalizeSearchText(filters.query);
	if (query) terms.push(query);
	if (state !== "all") terms.push(`state:${state}`);
	for (const label of normalizeStringList(filters.labels)) terms.push(`label:${quoteSearchQualifierValue(label)}`);
	const assignee = normalizeOptionalQueryValue(filters.assignee);
	if (assignee) terms.push(`assignee:${quoteSearchQualifierValue(assignee)}`);
	const creator = normalizeOptionalQueryValue(filters.creator);
	if (creator) terms.push(`author:${quoteSearchQualifierValue(creator)}`);
	const mentioned = normalizeOptionalQueryValue(filters.mentioned);
	if (mentioned) terms.push(`mentions:${quoteSearchQualifierValue(mentioned)}`);
	const milestone = normalizeOptionalQueryValue(filters.milestone);
	if (milestone) terms.push(`milestone:${quoteSearchQualifierValue(milestone)}`);
	const since = normalizeIssueSinceFilter(filters.since);
	if (since) terms.push(`updated:>=${since}`);
	return compactQuery({
		q: terms.join(" "),
		per_page: String(Math.min(limit ?? 100, 100)),
		sort: normalizeIssueListSort(filters.sort),
		order: normalizeIssueListDirection(filters.direction),
	});
}

export function buildLabelListQuery(limit: number | undefined): Record<string, string> {
	return { per_page: String(Math.min(limit ?? 100, 100)) };
}

export function buildMilestoneListQuery(filters: GitHubRepositoryMilestoneListFilters, limit: number | undefined): Record<string, string> {
	return compactQuery({
		state: normalizeMilestoneListState(filters.state),
		sort: normalizeMilestoneListSort(filters.sort),
		direction: normalizeMilestoneListDirection(filters.direction),
		per_page: String(Math.min(limit ?? 100, 100)),
	});
}

export function buildAssigneeListQuery(limit: number | undefined): Record<string, string> {
	return { per_page: String(Math.min(limit ?? 100, 100)) };
}

export function labelMatchesFilters(label: GitHubLabelResponse, nameFilter: string | undefined, queryFilter: string | undefined): boolean {
	const name = typeof label.name === "string" ? label.name.toLowerCase() : "";
	const description = typeof label.description === "string" ? label.description.toLowerCase() : "";
	if (nameFilter && !name.includes(nameFilter)) return false;
	if (queryFilter && !name.includes(queryFilter) && !description.includes(queryFilter)) return false;
	return true;
}

export function assigneeMatchesFilters(assignee: GitHubUserResponse, loginFilter: string | undefined, queryFilter: string | undefined): boolean {
	const login = typeof assignee.login === "string" ? assignee.login.toLowerCase() : "";
	const type = typeof assignee.type === "string" ? assignee.type.toLowerCase() : "";
	const profileUrl = typeof assignee.html_url === "string" ? assignee.html_url.toLowerCase() : "";
	const apiUrl = typeof assignee.url === "string" ? assignee.url.toLowerCase() : "";
	const id = typeof assignee.id === "number" && Number.isSafeInteger(assignee.id) ? String(assignee.id) : "";
	if (loginFilter && !login.includes(loginFilter)) return false;
	if (queryFilter && !login.includes(queryFilter) && !type.includes(queryFilter) && !profileUrl.includes(queryFilter) && !apiUrl.includes(queryFilter) && !id.includes(queryFilter)) return false;
	return true;
}

export function normalizeOptionalTextFilter(value: string | undefined, field: string): string | undefined {
	return normalizeOptionalLowercaseTextFilter(value, field);
}

export function normalizePaginationLimit(limit: number | undefined): number | undefined {
	if (limit === undefined) return undefined;
	return normalizePositiveSafeInteger(limit, "limit", { message: "Issue list limit must be a positive integer." });
}

function normalizeIssueListState(state: GitHubIssueListState | undefined): GitHubIssueListState {
	if (state === undefined) return "open";
	if (state === "open" || state === "closed" || state === "all") return state;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Issue state must be open, closed, or all.", { field: "state" });
}

function normalizeMilestoneListState(state: GitHubMilestoneListState | undefined): GitHubMilestoneListState {
	if (state === undefined) return "open";
	if (state === "open" || state === "closed" || state === "all") return state;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone state must be open, closed, or all.", { field: "state" });
}

function normalizeIssueListSort(sort: GitHubIssueListSort | undefined): GitHubIssueListSort | undefined {
	if (sort === undefined) return undefined;
	if (sort === "created" || sort === "updated" || sort === "comments") return sort;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Issue sort must be created, updated, or comments.", { field: "sort" });
}

function normalizeMilestoneListSort(sort: GitHubMilestoneListSort | undefined): GitHubMilestoneListSort | undefined {
	if (sort === undefined) return undefined;
	if (sort === "due_on" || sort === "completeness") return sort;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone sort must be due_on or completeness.", { field: "sort" });
}

function normalizeIssueListDirection(direction: GitHubIssueListDirection | undefined): GitHubIssueListDirection | undefined {
	if (direction === undefined) return undefined;
	if (direction === "asc" || direction === "desc") return direction;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Issue list direction must be asc or desc.", { field: "direction" });
}

function normalizeMilestoneListDirection(direction: GitHubMilestoneListDirection | undefined): GitHubMilestoneListDirection | undefined {
	if (direction === undefined) return undefined;
	if (direction === "asc" || direction === "desc") return direction;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone list direction must be asc or desc.", { field: "direction" });
}

function normalizeIssueSinceFilter(value: string | undefined): string | undefined {
	return normalizeOptionalIsoDateOrTimestamp(value, "since", {
		invalidMessage: "since must be a valid ISO YYYY-MM-DD date or ISO 8601 timestamp with timezone.",
	});
}

function normalizeOptionalQueryValue(value: string | undefined): string | undefined {
	return normalizeOptionalTrimmedText(value, "filter", { nullByteMessage: "Issue list filter values must not contain null bytes." });
}

function normalizeStringList(values: string[] | undefined): string[] {
	if (!Array.isArray(values)) return [];
	return [...new Set(values.map((value) => normalizeOptionalQueryValue(value)).filter((value): value is string => value !== undefined))];
}

function normalizeSearchText(value: string): string | undefined {
	const query = normalizeOptionalQueryValue(value);
	if (!query) return undefined;
	if (/\b(?:repo|org|user):|\b(?:is|type):(?:pr|pull-request|pullrequest)\b/i.test(query)) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			"Issue search query must not include repository, owner, or pull-request boundary qualifiers; IssueMe adds repo:<owner>/<repo> is:issue automatically.",
			{ field: "query" },
		);
	}
	return query;
}

function quoteSearchQualifierValue(value: string): string {
	const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
	return /[\s:]/.test(escaped) ? `"${escaped}"` : escaped;
}

function compactQuery(input: Record<string, string | undefined>): Record<string, string> {
	return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Record<string, string>;
}

export function isPullRequestIssueResponse(issue: GitHubIssueResponse): boolean {
	return issue.pull_request !== undefined && issue.pull_request !== null;
}

export function isIssueSearchResponse(value: unknown): value is GitHubIssueSearchResponse {
	if (!isObject(value)) return false;
	if (!Array.isArray(value.items)) return false;
	if (value.total_count !== undefined && typeof value.total_count !== "number") return false;
	if (value.incomplete_results !== undefined && typeof value.incomplete_results !== "boolean") return false;
	return true;
}

export function normalizeIssueSearchResponse(value: GitHubIssueSearchResponse): NormalizedIssueSearchResponse {
	return {
		items: Array.isArray(value.items) ? value.items as GitHubIssueResponse[] : [],
		...(typeof value.total_count === "number" && Number.isSafeInteger(value.total_count) && value.total_count >= 0 ? { totalCount: value.total_count } : {}),
		...(typeof value.incomplete_results === "boolean" ? { incompleteResults: value.incomplete_results } : {}),
	};
}

export function commentBelongsToIssue(
	repository: GitHubRepository,
	comment: GitHubCommentResponse,
	issueNumber: number,
	commentId: number,
): boolean {
	const issueUrlIssueNumber = parseGitHubApiIssueUrl(comment.issue_url, repository);
	if (issueUrlIssueNumber !== undefined) return issueUrlIssueNumber === issueNumber;
	const htmlIssueNumber = parseGitHubIssueCommentHtmlUrl(comment.html_url, repository, commentId);
	return htmlIssueNumber === issueNumber;
}

function parseGitHubApiIssueUrl(value: unknown, repository: GitHubRepository): number | undefined {
	if (typeof value !== "string") return undefined;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	const expectedBase = new URL(GITHUB_API_BASE_URL);
	if (url.protocol !== "https:" || url.host !== expectedBase.host) return undefined;
	const [repos, owner, repo, issues, number, ...rest] = url.pathname.split("/").filter(Boolean);
	if (repos !== "repos" || issues !== "issues" || rest.length > 0 || !ownerRepoMatches(repository, owner, repo)) return undefined;
	return parsePositiveIssueNumber(number);
}

function parseGitHubIssueCommentHtmlUrl(value: unknown, repository: GitHubRepository, commentId: number): number | undefined {
	if (typeof value !== "string") return undefined;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	if (url.protocol !== "https:" || url.hostname !== "github.com") return undefined;
	const [owner, repo, type, number, ...rest] = url.pathname.split("/").filter(Boolean);
	if (type !== "issues" || rest.length > 0 || !ownerRepoMatches(repository, owner, repo)) return undefined;
	if (url.hash !== `#issuecomment-${commentId}`) return undefined;
	return parsePositiveIssueNumber(number);
}

function ownerRepoMatches(repository: GitHubRepository, owner: string | undefined, repo: string | undefined): boolean {
	return owner?.toLowerCase() === repository.owner.toLowerCase() && repo?.toLowerCase() === repository.repo.toLowerCase();
}

function parsePositiveIssueNumber(value: string | undefined): number | undefined {
	if (!value || !/^\d+$/.test(value)) return undefined;
	const number = Number(value);
	return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function normalizeIssueUpdateInput(input: IssueUpdateInput): IssueUpdateInput {
	const normalized: IssueUpdateInput = { ...input };
	if (input.milestone !== undefined && input.milestone !== null) {
		normalized.milestone = normalizePositiveMilestoneNumber(input.milestone, "milestoneNumber");
	}
	return normalized;
}

export function normalizePositiveIssueNumber(value: number | undefined, field: string): number {
	return normalizePositiveSafeInteger(value, field, { message: `${field} must be a positive safe integer.` });
}

export function normalizePositiveCommentId(value: number | undefined, field: string): number {
	return normalizePositiveSafeInteger(value, field, { message: `${field} must be a positive safe integer.` });
}

export function normalizePositiveMilestoneNumber(value: number | undefined, field: string): number {
	return normalizePositiveSafeInteger(value, field, { message: `${field} must be a positive safe integer.` });
}

export function issueResponseToSafeSummary(repository: string, issue: GitHubIssueResponse, fallbackNumber: number): ToolIssueSummary | undefined {
	if (issue.state !== "open" && issue.state !== "closed") return undefined;
	const creator = normalizeGraphQLIssueCreator(issue.user);
	return {
		repository,
		number: typeof issue.number === "number" && Number.isSafeInteger(issue.number) ? issue.number : fallbackNumber,
		title: typeof issue.title === "string" ? issue.title : `#${fallbackNumber}`,
		state: issue.state,
		...(creator ? { creator } : {}),
		labels: [],
		assignees: [],
		html_url: typeof issue.html_url === "string" ? issue.html_url : `https://github.com/${repository}/issues/${fallbackNumber}`,
	};
}
