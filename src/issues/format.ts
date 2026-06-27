import { ISSUE_SCHEMA_VERSION } from "../constants.ts";
import { IssueMeError } from "../errors.ts";
import type {
	GitHubCommentResponse,
	GitHubIssueResponse,
	GitHubLabelResponse,
	GitHubMilestoneResponse,
	GitHubRepository,
	GitHubUserResponse,
	IssueCommentRecord,
	IssueRecord,
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
}

export function githubIssueToRecord(
	repository: GitHubRepository,
	issue: GitHubIssueResponse,
	comments: GitHubCommentResponse[] = [],
	syncedAt = new Date().toISOString(),
): IssueRecord {
	const number = requireNumber(issue.number, "issue.number");
	const title = requireString(issue.title, "issue.title");
	const state = normalizeIssueState(issue.state);
	return {
		schemaVersion: ISSUE_SCHEMA_VERSION,
		repository: repository.fullName,
		number,
		title,
		state,
		body: typeof issue.body === "string" ? issue.body : "",
		labels: normalizeLabels(issue.labels),
		assignees: normalizeAssignees(issue.assignees),
		milestone: normalizeMilestone(issue.milestone),
		comments: comments.map(normalizeComment),
		html_url: requireString(issue.html_url, "issue.html_url"),
		created_at: requireString(issue.created_at, "issue.created_at"),
		updated_at: requireString(issue.updated_at, "issue.updated_at"),
		closed_at: typeof issue.closed_at === "string" ? issue.closed_at : null,
		synced_at: syncedAt,
	};
}

export function isPullRequestIssue(issue: GitHubIssueResponse): boolean {
	return issue.pull_request !== undefined && issue.pull_request !== null;
}

export function issueRecordToToolSummary(record: IssueRecord, localPath?: string): ToolIssueSummary {
	return {
		repository: record.repository,
		number: record.number,
		title: record.title,
		state: record.state,
		labels: [...record.labels],
		assignees: [...record.assignees],
		html_url: record.html_url,
		...(localPath ? { localPath } : {}),
	};
}

export function formatIssueSummary(record: IssueRecord, options: IssueSummaryFormatOptions = {}): FormattedIssueSummary {
	const maxBodyChars = options.maxBodyChars ?? 4000;
	const maxComments = options.maxComments ?? 5;
	const maxCommentChars = options.maxCommentChars ?? 1200;
	let truncated = false;

	const body = truncateText(record.body || "(no body)", maxBodyChars);
	if (body.truncated) truncated = true;

	const comments = record.comments.slice(0, maxComments);
	if (comments.length < record.comments.length) truncated = true;

	const lines = [
		`#${record.number} ${record.title}`,
		`Repository: ${record.repository}`,
		`State: ${record.state}`,
		`URL: ${record.html_url}`,
		`Labels: ${record.labels.length ? record.labels.join(", ") : "none"}`,
		`Assignees: ${record.assignees.length ? record.assignees.join(", ") : "none"}`,
		`Updated: ${record.updated_at}`,
		"",
		"Body:",
		body.text,
	];

	if (record.comments.length > 0) {
		lines.push("", `Comments (${record.comments.length}):`);
		for (const comment of comments) {
			const commentBody = truncateText(comment.body, maxCommentChars);
			if (commentBody.truncated) truncated = true;
			lines.push(`- ${comment.author} at ${comment.updated_at} (${comment.html_url})`, commentBody.text);
		}
	}

	if (truncated) lines.push("", "[IssueMe output truncated; local issue JSON may contain more detail.]");
	return { text: lines.join("\n"), truncated };
}

export function truncateText(text: string, maxChars: number): { text: string; truncated: boolean } {
	if (text.length <= maxChars) return { text, truncated: false };
	return { text: `${text.slice(0, Math.max(0, maxChars - 20))}\n… [truncated]`, truncated: true };
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
