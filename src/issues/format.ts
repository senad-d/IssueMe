import { ISSUE_SCHEMA_VERSION, MAX_GET_BODY_CHARS, MAX_GET_COMMENT_CHARS, MAX_GET_COMMENTS } from "../constants.ts";
import { IssueMeError } from "../errors.ts";
import { isValidGitHubLogin } from "../utils/github-login.ts";
import type {
	GitHubCommentResponse,
	GitHubIssueResponse,
	GitHubLabelResponse,
	GitHubMilestoneResponse,
	GitHubRepository,
	GitHubUserResponse,
	IssueCommentRecord,
	IssueRecord,
	IssueRelationshipSummary,
	IssueState,
	ToolIssueSummary,
} from "../types.ts";

export interface IssueSummaryFormatOptions {
	maxBodyChars?: number;
	maxComments?: number;
	maxCommentChars?: number;
}

export interface FormattedIssueSummary {
	text: string;
	truncated: boolean;
	truncation?: Record<string, unknown>;
}

export interface CommentFetchMetadata {
	limit?: number;
	truncated?: boolean;
	totalCount?: number;
}

interface IssueSummaryLimits {
	maxBodyChars: number;
	maxComments: number;
	maxCommentChars: number;
}

interface IssueSummaryBuildState {
	truncated: boolean;
	truncation: Record<string, unknown>;
}

export interface IssueRelationshipMetadata {
	parent_issue?: IssueRelationshipSummary | null;
	sub_issues?: IssueRelationshipSummary[];
	sub_issues_count?: number;
}

export function githubIssueToRecord(
	repository: GitHubRepository,
	issue: GitHubIssueResponse,
	comments: GitHubCommentResponse[] = [],
	syncedAt = new Date().toISOString(),
	commentFetch: CommentFetchMetadata = {},
): IssueRecord {
	const number = requireNumber(issue.number, "issue.number");
	const title = requireString(issue.title, "issue.title");
	const state = normalizeIssueState(issue.state);
	const normalizedComments = comments.map(normalizeComment);
	const commentsCount = normalizeCommentCount(issue.comments, commentFetch.totalCount, normalizedComments.length);
	const commentsFetchLimit = commentFetch.limit ?? normalizedComments.length;
	const commentsTruncated = commentFetch.truncated ?? commentsCount > normalizedComments.length;
	const relationships = normalizeIssueRelationships(issue);
	const record: IssueRecord = {
		schemaVersion: ISSUE_SCHEMA_VERSION,
		repository: repository.fullName,
		number,
		title,
		state,
		body: typeof issue.body === "string" ? issue.body : "",
		labels: normalizeLabels(issue.labels),
		assignees: normalizeAssignees(issue.assignees),
		milestone: normalizeMilestone(issue.milestone),
		comments: normalizedComments,
		comments_truncated: commentsTruncated,
		comments_count: commentsCount,
		comments_fetch_limit: commentsFetchLimit,
		html_url: requireString(issue.html_url, "issue.html_url"),
		created_at: requireString(issue.created_at, "issue.created_at"),
		updated_at: requireString(issue.updated_at, "issue.updated_at"),
		closed_at: typeof issue.closed_at === "string" ? issue.closed_at : null,
		synced_at: syncedAt,
	};
	const creator = normalizeIssueCreator(issue.user);
	if (creator) record.creator = creator;
	if (relationships.parent_issue !== undefined) record.parent_issue = relationships.parent_issue;
	if (relationships.sub_issues !== undefined) record.sub_issues = relationships.sub_issues;
	if (relationships.sub_issues_count !== undefined) record.sub_issues_count = relationships.sub_issues_count;
	return record;
}

export function isPullRequestIssue(issue: GitHubIssueResponse): boolean {
	return issue.pull_request !== undefined && issue.pull_request !== null;
}

export function issueRecordToToolSummary(record: IssueRecord, localPath?: string): ToolIssueSummary {
	const summary: ToolIssueSummary = {
		repository: record.repository,
		number: record.number,
		title: record.title,
		state: record.state,
		labels: [...record.labels],
		assignees: [...record.assignees],
		html_url: record.html_url,
	};
	if (record.creator) summary.creator = record.creator;
	if (localPath) summary.localPath = localPath;
	if (record.parent_issue !== undefined) summary.parentIssue = record.parent_issue;
	if (record.sub_issues !== undefined) summary.subIssues = [...record.sub_issues];
	if (record.sub_issues_count !== undefined) summary.subIssuesCount = record.sub_issues_count;
	if (record.comments_truncated !== undefined) summary.commentsTruncated = record.comments_truncated;
	if (record.comments_count !== undefined) summary.commentsCount = record.comments_count;
	if (record.comments_fetch_limit !== undefined) summary.commentsFetchLimit = record.comments_fetch_limit;
	return summary;
}

export function applyIssueRelationshipMetadata(record: IssueRecord, relationships: IssueRelationshipMetadata): IssueRecord {
	return {
		...record,
		...(relationships.parent_issue !== undefined ? { parent_issue: relationships.parent_issue } : {}),
		...(relationships.sub_issues !== undefined ? { sub_issues: relationships.sub_issues } : {}),
		...(relationships.sub_issues_count !== undefined ? { sub_issues_count: relationships.sub_issues_count } : {}),
	};
}

export function formatIssueSummary(record: IssueRecord, options: IssueSummaryFormatOptions = {}): FormattedIssueSummary {
	const limits = issueSummaryLimits(options);
	const state: IssueSummaryBuildState = { truncated: false, truncation: {} };
	const bodySource = record.body || "(no body)";
	const body = truncateText(bodySource, limits.maxBodyChars);
	trackIssueBodyTruncation(state, body, bodySource, limits.maxBodyChars);
	const comments = record.comments.slice(0, limits.maxComments);
	trackIssueCommentListTruncation(state, comments.length, record.comments.length, limits.maxComments);
	const lines = issueSummaryHeaderLines(record, body.text);
	appendCachedCommentTruncation(lines, state, record);
	appendIssueSummaryComments(lines, state, comments, record.comments.length, limits.maxCommentChars);
	appendIssueSummaryTruncationNotice(lines, state.truncated);
	return { text: lines.join("\n"), truncated: state.truncated, ...(state.truncated ? { truncation: state.truncation } : {}) };
}

function issueSummaryLimits(options: IssueSummaryFormatOptions): IssueSummaryLimits {
	return {
		maxBodyChars: options.maxBodyChars ?? MAX_GET_BODY_CHARS,
		maxComments: options.maxComments ?? MAX_GET_COMMENTS,
		maxCommentChars: options.maxCommentChars ?? MAX_GET_COMMENT_CHARS,
	};
}

function trackIssueBodyTruncation(state: IssueSummaryBuildState, body: { text: string; truncated: boolean }, bodySource: string, maxBodyChars: number): void {
	if (!body.truncated) return;
	state.truncated = true;
	state.truncation.body = { maxChars: maxBodyChars, originalChars: bodySource.length, shownChars: body.text.length };
}

function trackIssueCommentListTruncation(state: IssueSummaryBuildState, shown: number, total: number, maxComments: number): void {
	if (shown >= total) return;
	state.truncated = true;
	state.truncation.comments = { shown, total, max: maxComments };
}

function issueSummaryHeaderLines(record: IssueRecord, bodyText: string): string[] {
	return [
		`#${record.number} ${record.title}`,
		`Repository: ${record.repository}`,
		`State: ${record.state}`,
		...(record.creator ? [`Creator: ${record.creator}`] : []),
		`URL: ${record.html_url}`,
		`Labels: ${record.labels.length ? record.labels.join(", ") : "none"}`,
		`Assignees: ${record.assignees.length ? record.assignees.join(", ") : "none"}`,
		...(record.parent_issue !== undefined ? [`Parent issue: ${record.parent_issue ? formatRelationshipSummary(record.parent_issue) : "none"}`] : []),
		...(record.sub_issues !== undefined || record.sub_issues_count !== undefined ? [`Sub-issues: ${formatSubIssueSummary(record)}`] : []),
		`Updated: ${record.updated_at}`,
		"",
		"Body:",
		bodyText,
	];
}

function appendCachedCommentTruncation(lines: string[], state: IssueSummaryBuildState, record: IssueRecord): void {
	if (!record.comments_truncated) return;
	state.truncated = true;
	state.truncation.cacheComments = {
		shown: record.comments.length,
		...(record.comments_count !== undefined ? { total: record.comments_count } : {}),
		limit: record.comments_fetch_limit ?? record.comments.length,
	};
	lines.push(
		"",
		`Comments fetched: ${record.comments.length}${record.comments_count !== undefined ? ` of ${record.comments_count}` : ""} (limit ${record.comments_fetch_limit ?? record.comments.length}; truncated).`,
	);
}

function appendIssueSummaryComments(lines: string[], state: IssueSummaryBuildState, comments: IssueCommentRecord[], totalComments: number, maxCommentChars: number): void {
	if (totalComments === 0) return;
	lines.push("", `Comments (${totalComments}):`);
	const truncatedCommentBodies = appendIssueSummaryCommentBodies(lines, state, comments, maxCommentChars);
	if (truncatedCommentBodies > 0) state.truncation.commentBodies = { affected: truncatedCommentBodies, maxChars: maxCommentChars };
}

function appendIssueSummaryCommentBodies(lines: string[], state: IssueSummaryBuildState, comments: IssueCommentRecord[], maxCommentChars: number): number {
	let truncatedCommentBodies = 0;
	for (const comment of comments) {
		const commentBody = truncateText(comment.body, maxCommentChars);
		if (commentBody.truncated) {
			state.truncated = true;
			truncatedCommentBodies += 1;
		}
		lines.push(`- ${comment.author} at ${comment.updated_at} (${comment.html_url})`, commentBody.text);
	}
	return truncatedCommentBodies;
}

function appendIssueSummaryTruncationNotice(lines: string[], truncated: boolean): void {
	if (truncated) lines.push("", "[IssueMe output truncated; local issue JSON may contain more detail.]");
}

export function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
	if (text.length <= maxChars) return { text, truncated: false };
	return { text: `${text.slice(0, Math.max(0, maxChars - 20))}\n… [truncated]`, truncated: true };
}

function normalizeIssueRelationships(issue: GitHubIssueResponse): IssueRelationshipMetadata {
	const rawParent = issue.parent_issue ?? issue.parent;
	const parentIssue = rawParent === null ? null : normalizeRelationshipSummary(rawParent);
	const subIssues = normalizeSubIssues(issue.sub_issues);
	const summaryCount = normalizeSubIssuesSummaryCount(issue.sub_issues_summary);
	const subIssuesCount = summaryCount ?? (subIssues ? subIssues.length : undefined);
	return {
		...(rawParent !== undefined ? { parent_issue: parentIssue ?? null } : {}),
		...(subIssues !== undefined ? { sub_issues: subIssues } : {}),
		...(subIssuesCount !== undefined ? { sub_issues_count: subIssuesCount } : {}),
	};
}

function normalizeRelationshipSummary(value: unknown): IssueRelationshipSummary | undefined {
	if (!isObject(value)) return undefined;
	const number = value.number;
	const title = value.title;
	const rawUrl = value.html_url ?? value.url;
	const creator = normalizeIssueCreator(value.user ?? value.author);
	if (typeof number !== "number" || !Number.isSafeInteger(number) || number <= 0) return undefined;
	if (typeof title !== "string" || !title.trim()) return undefined;
	if (typeof rawUrl !== "string" || !rawUrl.trim()) return undefined;
	const state = normalizeOptionalIssueState(value.state);
	return {
		number,
		title,
		...(state ? { state } : {}),
		...(creator ? { creator } : {}),
		html_url: rawUrl,
	};
}

function normalizeSubIssues(value: unknown): IssueRelationshipSummary[] | undefined {
	if (value === undefined) return undefined;
	const rawNodes = Array.isArray(value)
		? value
		: isObject(value) && Array.isArray(value.nodes)
			? value.nodes
			: undefined;
	if (!rawNodes) return undefined;
	return rawNodes.map(normalizeRelationshipSummary).filter((issue): issue is IssueRelationshipSummary => issue !== undefined);
}

function normalizeSubIssuesSummaryCount(value: unknown): number | undefined {
	if (!isObject(value)) return undefined;
	const total = value.total ?? value.total_count ?? value.totalCount;
	return typeof total === "number" && Number.isSafeInteger(total) && total >= 0 ? total : undefined;
}

function normalizeOptionalIssueState(value: unknown): IssueState | undefined {
	if (value === "open" || value === "OPEN") return "open";
	if (value === "closed" || value === "CLOSED") return "closed";
	return undefined;
}

function formatRelationshipSummary(issue: IssueRelationshipSummary): string {
	return `#${issue.number} ${issue.title}${issue.state ? ` (${issue.state})` : ""}`;
}

function formatSubIssueSummary(record: IssueRecord): string {
	const subIssues = record.sub_issues ?? [];
	if (subIssues.length === 0) return record.sub_issues_count === undefined ? "none" : `${record.sub_issues_count} total`;
	const total = record.sub_issues_count ?? subIssues.length;
	const shown = subIssues.map(formatRelationshipSummary).join(", ");
	return total > subIssues.length ? `${shown} (${subIssues.length} shown of ${total})` : shown;
}

function normalizeIssueCreator(value: unknown): string | undefined {
	if (!isObject(value)) return undefined;
	const login = value.login;
	return isValidGitHubLogin(login) ? login : undefined;
}

function normalizeCommentCount(value: unknown, fallback: number | undefined, minimum: number): number {
	const candidate = typeof value === "number" ? value : fallback;
	if (typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate >= minimum) return candidate;
	return minimum;
}

function normalizeLabels(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((label) => {
			if (typeof label === "string") return label;
			if (isObject(label)) {
				const named = label as GitHubLabelResponse;
				return typeof named.name === "string" ? named.name : undefined;
			}
			return undefined;
		})
		.filter((label): label is string => Boolean(label));
}

function normalizeAssignees(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((assignee) => {
			if (!isObject(assignee)) return undefined;
			const user = assignee as GitHubUserResponse;
			return typeof user.login === "string" ? user.login : undefined;
		})
		.filter((login): login is string => Boolean(login));
}

function normalizeMilestone(value: unknown): string | null {
	if (!isObject(value)) return null;
	const milestone = value as GitHubMilestoneResponse;
	return typeof milestone.title === "string" ? milestone.title : null;
}

function normalizeComment(comment: GitHubCommentResponse): IssueCommentRecord {
	const user = isObject(comment.user) ? (comment.user as GitHubUserResponse) : undefined;
	return {
		id: requireNumber(comment.id, "comment.id"),
		author: typeof user?.login === "string" ? user.login : "unknown",
		body: typeof comment.body === "string" ? comment.body : "",
		created_at: requireString(comment.created_at, "comment.created_at"),
		updated_at: requireString(comment.updated_at, "comment.updated_at"),
		html_url: requireString(comment.html_url, "comment.html_url"),
	};
}

function normalizeIssueState(value: unknown): IssueState {
	if (value === "open" || value === "closed") return value;
	throw new IssueMeError("github_issue_shape_invalid", "GitHub issue response has an unsupported issue state.");
}

function requireString(value: unknown, field: string): string {
	if (typeof value === "string") return value;
	throw new IssueMeError("github_issue_shape_invalid", `GitHub response field ${field} is missing or invalid.`);
}

function requireNumber(value: unknown, field: string): number {
	if (typeof value === "number" && Number.isSafeInteger(value)) return value;
	throw new IssueMeError("github_issue_shape_invalid", `GitHub response field ${field} is missing or invalid.`);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
