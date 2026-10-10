import { GITHUB_API_BASE_URL, MAX_TOOL_TIMELINE_EVENT_TYPES } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { ToolIssueTimelineEventSummary } from "../types.ts";
import { assertCollectionItemLimit, normalizeOptionalTrimmedText } from "../utils/validation.ts";
import { isObject } from "./shared.ts";

/**
 * Bounded summaries for GitHub's REST issue timeline.
 *
 * Each event becomes event name, actor, timestamp, and a small typed metadata map for the
 * event kinds IssueMe understands. Unfamiliar events keep only the common fields and are
 * flagged, so raw payloads are never dumped into tool output. Comment events carry the
 * comment ID and URL but never the body; use issueme_get_comment for text.
 */

const METADATA_TEXT_LIMIT = 200;
const EVENT_NAME_PATTERN = /^[a-z0-9_]{1,64}$/;

export interface GitHubTimelineEventResponse {
	event?: unknown;
	id?: unknown;
	actor?: unknown;
	created_at?: unknown;
	[key: string]: unknown;
}

export function timelineEventPath(issueNumber: number): string {
	return `/issues/${issueNumber}/timeline`;
}

export function normalizeTimelineEventTypes(values: readonly string[] | undefined): string[] | undefined {
	if (values === undefined) return undefined;
	assertCollectionItemLimit(values, "eventTypes", MAX_TOOL_TIMELINE_EVENT_TYPES);
	const normalized = new Set<string>();
	for (const value of values) {
		const text = normalizeOptionalTrimmedText(value, "eventTypes", { oneLine: true, maxLength: 64 });
		if (!text) continue;
		const event = text.toLowerCase();
		if (!EVENT_NAME_PATTERN.test(event)) {
			throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "eventTypes entries must be GitHub timeline event names such as labeled, closed, or renamed.", { field: "eventTypes" });
		}
		normalized.add(event);
	}
	return normalized.size > 0 ? [...normalized].sort(compareTimelineEventTypes) : undefined;
}

function compareTimelineEventTypes(left: string, right: string): number {
	return left.localeCompare(right, "en");
}

export function assertGitHubTimelineEventResponse(value: unknown, path = GITHUB_API_BASE_URL): asserts value is GitHubTimelineEventResponse & { event: string } {
	if (isObject(value) && typeof value.event === "string" && value.event.trim()) return;
	throw new GitHubApiError("GitHub REST API returned a malformed issue timeline event.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path });
}

export function timelineEventMatches(event: GitHubTimelineEventResponse, eventTypes: string[] | undefined): boolean {
	if (!eventTypes) return true;
	return typeof event.event === "string" && eventTypes.includes(event.event.toLowerCase());
}

export function normalizeTimelineEventSummary(value: GitHubTimelineEventResponse): ToolIssueTimelineEventSummary {
	assertGitHubTimelineEventResponse(value);
	const event = value.event.trim().toLowerCase();
	const summary: ToolIssueTimelineEventSummary = { event };
	const id = value.id;
	if (typeof id === "number" && Number.isSafeInteger(id) && id > 0) summary.id = id;
	const actor = actorLogin(value.actor ?? value.user);
	if (actor) summary.actor = actor;
	else if (value.actor === null || value.user === null) summary.actorDeleted = true;
	const createdAt = text(value.created_at ?? value.submitted_at);
	if (createdAt) summary.createdAt = createdAt;
	const metadata = eventMetadata(event, value);
	if (metadata === undefined) summary.unfamiliar = true;
	else if (Object.keys(metadata).length > 0) summary.metadata = metadata;
	return summary;
}

type MetadataValue = string | number | boolean | null;

function eventMetadata(event: string, value: Record<string, unknown>): Record<string, MetadataValue> | undefined {
	switch (event) {
		case "labeled":
		case "unlabeled":
			return compact({ label: nestedText(value.label, "name") });
		case "milestoned":
		case "demilestoned":
			return compact({ milestone: nestedText(value.milestone, "title") });
		case "renamed":
			return compact({ from: nestedText(value.rename, "from"), to: nestedText(value.rename, "to") });
		case "assigned":
		case "unassigned":
			return compact({ assignee: actorLogin(value.assignee) ?? null });
		case "closed":
		case "reopened":
			return compact({ stateReason: text(value.state_reason) ?? null, commitId: text(value.commit_id) ?? null });
		case "commented":
			return compact({ commentId: integer(value.id) ?? null, commentUrl: text(value.html_url) ?? null });
		case "cross-referenced":
			return crossReferenceMetadata(value);
		case "connected":
		case "disconnected":
		case "mentioned":
		case "subscribed":
		case "unsubscribed":
		case "pinned":
		case "unpinned":
		case "transferred":
		case "converted_to_discussion":
		case "automatic_base_change_succeeded":
		case "automatic_base_change_failed":
			return {};
		case "locked":
			return compact({ lockReason: text(value.lock_reason) ?? null });
		case "unlocked":
			return {};
		case "issue_type_added":
		case "issue_type_changed":
		case "issue_type_removed":
			return compact({ issueType: nestedText(value.issue_type, "name") ?? null, previousIssueType: nestedText(value.prev_issue_type, "name") ?? null });
		case "sub_issue_added":
		case "sub_issue_removed":
			return compact({ subIssue: nestedInteger(value.sub_issue, "number") ?? null });
		case "parent_issue_added":
		case "parent_issue_removed":
			return compact({ parentIssue: nestedInteger(value.parent_issue, "number") ?? null });
		case "blocked_by_added":
		case "blocked_by_removed":
			return compact({ blockedBy: nestedInteger(value.blocked_by, "number") ?? null });
		case "blocking_added":
		case "blocking_removed":
			return compact({ blocking: nestedInteger(value.blocking, "number") ?? null });
		// Live-verified 2026-10-10: GitHub emits these for relates_to changes with no related-issue payload.
		case "relates_to_added":
		case "relates_to_removed":
			return {};
		case "committed":
			return compact({ sha: text(value.sha) ?? null, message: firstLine(text(value.message)) ?? null });
		case "referenced":
			return compact({ commitId: text(value.commit_id) ?? null });
		case "review_requested":
		case "review_request_removed":
			return compact({ reviewer: actorLogin(value.requested_reviewer) ?? nestedText(value.requested_team, "name") ?? null });
		case "reviewed":
			return compact({ state: text(value.state) ?? null });
		case "added_to_project":
		case "moved_columns_in_project":
		case "removed_from_project":
		case "converted_note_to_issue":
			return compact({ column: nestedText(value.project_card, "column_name") ?? null });
		default:
			return undefined;
	}
}

function crossReferenceMetadata(value: Record<string, unknown>): Record<string, MetadataValue> {
	const source = isObject(value.source) ? value.source : undefined;
	const issue = source && isObject(source.issue) ? source.issue : undefined;
	const repository = issue && isObject(issue.repository) ? issue.repository : undefined;
	return compact({
		sourceType: text(source?.type) ?? null,
		sourceNumber: integer(issue?.number) ?? null,
		sourceRepository: text(repository?.full_name) ?? null,
		sourceIsPullRequest: issue ? issue.pull_request !== undefined && issue.pull_request !== null : null,
	});
}

function compact(values: Record<string, MetadataValue | undefined>): Record<string, MetadataValue> {
	const output: Record<string, MetadataValue> = {};
	for (const [key, item] of Object.entries(values)) {
		if (item !== undefined) output[key] = item;
	}
	return output;
}

function actorLogin(value: unknown): string | undefined {
	if (!isObject(value)) return undefined;
	return text(value.login);
}

function nestedText(value: unknown, key: string): string | undefined {
	if (!isObject(value)) return undefined;
	return text(value[key]);
}

function nestedInteger(value: unknown, key: string): number | undefined {
	if (!isObject(value)) return undefined;
	return integer(value[key]);
}

function text(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	return trimmed.length > METADATA_TEXT_LIMIT ? `${trimmed.slice(0, METADATA_TEXT_LIMIT - 1)}…` : trimmed;
}

function firstLine(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	return text(value.split(/\r?\n/, 1)[0]);
}

function integer(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
