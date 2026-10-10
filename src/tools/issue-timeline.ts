import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_TIMELINE_EVENT_TYPES, MAX_TOOL_TIMELINE_EVENTS } from "../constants.ts";
import { ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { GitHubIssueTimelineResult } from "../github/client.ts";
import { normalizeContinuationTokenInput } from "../github/continuation.ts";
import { normalizeTimelineEventSummary, normalizeTimelineEventTypes } from "../github/issue-timeline-client.ts";
import { isPullRequestIssueResponse, issueResponseToSafeSummary } from "../github/issues-client.ts";
import type { GitHubIssueResponse, IssueMeToolDetails, ToolIssueSummary, ToolIssueTimelineEventSummary } from "../types.ts";
import { normalizeBoundedToolLimit, normalizePositiveSafeInteger } from "../utils/validation.ts";
import { appendContinuationLine, assertIssueCreatorAllowed, createIssueMeRuntime, issueCreatorScopeLabel, toolText, type IssueMeRuntime, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const DEFAULT_TIMELINE_LIMIT = Math.min(25, MAX_TOOL_TIMELINE_EVENTS);
const TIMELINE_NOTE = "Timeline completeness is about history events, not linked development; use issueme_list_issue_development_links for PR/commit links and issueme_get_comment for comment text. This tool is read-only and writes no cache files.";

const ListIssueTimelineParams = Type.Object(
	{
		issueNumber: Type.Integer({ minimum: 1, description: "Issue number; open or closed." }),
		eventTypes: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_TOOL_TIMELINE_EVENT_TYPES, description: `Only these GitHub event names (e.g. labeled, closed, renamed). Max ${MAX_TOOL_TIMELINE_EVENT_TYPES}.` })),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_TIMELINE_EVENTS, description: `Max events. Default ${DEFAULT_TIMELINE_LIMIT}; max ${MAX_TOOL_TIMELINE_EVENTS}.` })),
		after: Type.Optional(Type.String({ description: "Continuation token; same issue and eventTypes." })),
	},
	{ additionalProperties: false },
);

type ListIssueTimelineToolParams = Static<typeof ListIssueTimelineParams>;

interface NormalizedListIssueTimelineParams {
	issueNumber: number;
	eventTypes?: string[];
	limit: number;
	after?: string;
}

export function registerListIssueTimelineTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_list_issue_timeline",
			label: "IssueMe List Issue Timeline",
			description: "Inspect bounded issue history events with actors.",
			promptSnippet: "Inspect issue history events.",
			promptGuidelines: [
				"Use issueme_list_issue_timeline to learn who changed labels, assignees, milestones, titles, types, relationships, or state and when; read-only, bounded, continue with after.",
			],
			parameters: ListIssueTimelineParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeListIssueTimelineParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const issue = await fetchAllowedIssue(runtime, normalized.issueNumber, signal);
				const result = await runtime.client.listIssueTimeline(normalized.issueNumber, { eventTypes: normalized.eventTypes, limit: normalized.limit, after: normalized.after }, signal);
				const events = result.events.map(normalizeTimelineEventSummary);
				const issueSummary = requireIssueSummary(runtime.repository, issue, normalized.issueNumber);
				const details = buildTimelineDetails(runtime, issueSummary, events, result, normalized);
				return toolText(appendContinuationLine(formatTimelineText(runtime.repository, issueSummary, events, result, normalized), result.continuation), details);
			},
		}),
	);
}

function normalizeListIssueTimelineParams(params: ListIssueTimelineToolParams): NormalizedListIssueTimelineParams {
	const eventTypes = normalizeTimelineEventTypes(params.eventTypes);
	const after = normalizeContinuationTokenInput(params.after);
	return {
		issueNumber: normalizePositiveSafeInteger(params.issueNumber, "issueNumber"),
		...(eventTypes ? { eventTypes } : {}),
		limit: normalizeBoundedToolLimit(params.limit, { max: MAX_TOOL_TIMELINE_EVENTS, defaultValue: DEFAULT_TIMELINE_LIMIT }),
		...(after ? { after } : {}),
	};
}

async function fetchAllowedIssue(runtime: IssueMeRuntime, issueNumber: number, signal?: AbortSignal): Promise<GitHubIssueResponse> {
	const issue = await runtime.client.getIssue(issueNumber, signal);
	if (isPullRequestIssueResponse(issue)) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "issueNumber identifies a pull request, not a GitHub issue; IssueMe inspects issue timelines only.", { field: "issueNumber", issueNumber });
	}
	assertIssueCreatorAllowed(runtime.config, issue, { repository: runtime.repository, operation: "list_issue_timeline", issueNumber });
	return issue;
}

function requireIssueSummary(repository: string, issue: GitHubIssueResponse, issueNumber: number): ToolIssueSummary {
	const summary = issueResponseToSafeSummary(repository, issue, issueNumber);
	if (summary) return summary;
	throw new IssueMeError(ISSUEME_ERROR_CODES.GITHUB_ISSUE_SHAPE_INVALID, `GitHub REST API returned issue #${issueNumber} without a valid open/closed state.`, { issueNumber });
}

function buildTimelineDetails(
	runtime: IssueMeRuntime,
	issue: ToolIssueSummary,
	events: ToolIssueTimelineEventSummary[],
	result: GitHubIssueTimelineResult,
	params: NormalizedListIssueTimelineParams,
): IssueMeToolDetails {
	const unfamiliar = events.filter((event) => event.unfamiliar).length;
	const eventCounts: Record<string, number> = {};
	for (const event of events) eventCounts[event.event] = (eventCounts[event.event] ?? 0) + 1;
	return {
		repository: runtime.repository,
		creatorScope: issueCreatorScopeLabel(runtime.config),
		status: "list_issue_timeline",
		issue,
		timeline: events,
		counts: { returned: events.length, unfamiliar, deletedActors: events.filter((event) => event.actorDeleted).length, limit: params.limit, ...eventCounts },
		cacheUpdated: false,
		needsSync: false,
		truncated: result.truncated,
		...(result.truncated ? { truncation: { timeline: { shown: events.length, max: params.limit } } } : {}),
		...(result.continuation ? { continuation: result.continuation } : {}),
		message: TIMELINE_NOTE,
	};
}

function formatTimelineText(
	repository: string,
	issue: ToolIssueSummary,
	events: ToolIssueTimelineEventSummary[],
	result: GitHubIssueTimelineResult,
	params: NormalizedListIssueTimelineParams,
): string {
	const filter = params.eventTypes ? ` (events: ${params.eventTypes.join(", ")})` : "";
	const lines = [
		`Timeline for ${repository}#${issue.number} [${issue.state}] ${issue.title}: ${events.length} event(s) returned${filter}.`,
		`Limit: ${params.limit}. ${TIMELINE_NOTE}`,
		"",
		events.length === 0 ? "No timeline events were returned for this request." : undefined,
		...events.map(formatTimelineEventLine),
		result.truncated ? `More events exist beyond ${params.limit}; continue with the returned token.` : undefined,
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatTimelineEventLine(event: ToolIssueTimelineEventSummary): string {
	const actor = event.actor ?? (event.actorDeleted ? "deleted user" : "unknown actor");
	const when = event.createdAt ?? "unknown time";
	const metadata = event.metadata ? Object.entries(event.metadata).map(([key, value]) => `${key}=${String(value)}`).join(", ") : "";
	const suffix = event.unfamiliar ? " [unfamiliar event type; details omitted]" : metadata ? `: ${metadata}` : "";
	return `- ${when} ${event.event} by ${actor}${suffix}`;
}
