import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { MAX_TOOL_MILESTONES } from "../constants.ts";
import { IssueMeError } from "../errors.ts";
import type { GitHubMilestoneListDirection, GitHubMilestoneListSort, GitHubMilestoneListState } from "../github/client.ts";
import type { GitHubMilestoneResponse, IssueMeToolDetails, ToolMilestoneSummary } from "../types.ts";
import { normalizeBoundedToolLimit } from "../utils/validation.ts";
import { createIssueMeRuntime, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const DEFAULT_MILESTONE_LIST_LIMIT = Math.min(25, MAX_TOOL_MILESTONES);

const ListMilestonesParams = Type.Object(
	{
		state: Type.Optional(StringEnum(["open", "closed", "all"] as const, { description: "Milestone state. Default open." })),
		sort: Type.Optional(StringEnum(["due_on", "completeness"] as const, { description: "Sort field." })),
		direction: Type.Optional(StringEnum(["asc", "desc"] as const, { description: "Sort direction." })),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_MILESTONES, description: `Max results. Default ${DEFAULT_MILESTONE_LIST_LIMIT}; max ${MAX_TOOL_MILESTONES}.` })),
	},
	{ additionalProperties: false },
);

interface ListMilestonesToolParams {
	state?: GitHubMilestoneListState;
	sort?: GitHubMilestoneListSort;
	direction?: GitHubMilestoneListDirection;
	limit?: number;
}

interface NormalizedListMilestonesParams {
	state: GitHubMilestoneListState;
	sort?: GitHubMilestoneListSort;
	direction?: GitHubMilestoneListDirection;
	limit: number;
}

export function registerListMilestonesTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_list_milestones",
			label: "IssueMe List Milestones",
			description: "List repo milestones with state, dates, and issue counts.",
			promptSnippet: "List repo milestones.",
			promptGuidelines: [
				"Use issueme_list_milestones before assigning/inspecting milestones when the milestone number is unknown.",
			],
			parameters: ListMilestonesParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeListMilestonesParams(params as ListMilestonesToolParams);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const result = await runtime.client.listMilestones(normalized, signal);
				const milestones = summarizeMilestones(result.milestones);
				const details: IssueMeToolDetails = {
					repository: runtime.repository,
					status: "list_milestones",
					milestones,
					counts: {
						returned: milestones.length,
						limit: normalized.limit,
					},
					cacheUpdated: false,
					truncated: result.truncated,
					...(result.truncated ? { truncation: { milestones: { shown: milestones.length, max: normalized.limit } } } : {}),
				};
				return toolText(formatListMilestonesText(runtime.repository, normalized, milestones, result.truncated), details);
			},
		}),
	);
}

function normalizeListMilestonesParams(params: ListMilestonesToolParams): NormalizedListMilestonesParams {
	const sort = normalizeSort(params.sort);
	const direction = normalizeDirection(params.direction);
	return {
		state: normalizeState(params.state),
		...(sort ? { sort } : {}),
		...(direction ? { direction } : {}),
		limit: normalizeLimit(params.limit),
	};
}

function normalizeState(value: GitHubMilestoneListState | undefined): GitHubMilestoneListState {
	if (value === undefined) return "open";
	if (value === "open" || value === "closed" || value === "all") return value;
	throw new IssueMeError("invalid_tool_input", "state must be open, closed, or all.", { field: "state" });
}

function normalizeSort(value: GitHubMilestoneListSort | undefined): GitHubMilestoneListSort | undefined {
	if (value === undefined) return undefined;
	if (value === "due_on" || value === "completeness") return value;
	throw new IssueMeError("invalid_tool_input", "sort must be due_on or completeness.", { field: "sort" });
}

function normalizeDirection(value: GitHubMilestoneListDirection | undefined): GitHubMilestoneListDirection | undefined {
	if (value === undefined) return undefined;
	if (value === "asc" || value === "desc") return value;
	throw new IssueMeError("invalid_tool_input", "direction must be asc or desc.", { field: "direction" });
}

function normalizeLimit(value: number | undefined): number {
	return normalizeBoundedToolLimit(value, { max: MAX_TOOL_MILESTONES, defaultValue: DEFAULT_MILESTONE_LIST_LIMIT });
}

function summarizeMilestones(milestones: GitHubMilestoneResponse[]): ToolMilestoneSummary[] {
	return milestones.map(normalizeMilestoneSummary).filter((milestone): milestone is ToolMilestoneSummary => milestone !== undefined);
}

function normalizeMilestoneSummary(milestone: GitHubMilestoneResponse): ToolMilestoneSummary | undefined {
	const number = typeof milestone.number === "number" && Number.isSafeInteger(milestone.number) && milestone.number > 0
		? milestone.number
		: undefined;
	const title = typeof milestone.title === "string" ? milestone.title.trim() : "";
	const state = milestone.state === "open" || milestone.state === "closed" ? milestone.state : undefined;
	if (number === undefined || !title || !state) return undefined;
	const description = typeof milestone.description === "string" && milestone.description.trim() ? milestone.description.trim() : undefined;
	const dueOn = typeof milestone.due_on === "string" && milestone.due_on.trim() ? milestone.due_on.trim() : undefined;
	const openIssues = normalizeCount(milestone.open_issues);
	const closedIssues = normalizeCount(milestone.closed_issues);
	const htmlUrl = typeof milestone.html_url === "string" && milestone.html_url.trim() ? milestone.html_url.trim() : undefined;
	const apiUrl = typeof milestone.url === "string" && milestone.url.trim() ? milestone.url.trim() : undefined;
	return {
		number,
		title,
		state,
		...(description ? { description } : {}),
		...(dueOn ? { due_on: dueOn } : {}),
		...(openIssues !== undefined ? { open_issues: openIssues } : {}),
		...(closedIssues !== undefined ? { closed_issues: closedIssues } : {}),
		...(htmlUrl ? { html_url: htmlUrl } : {}),
		...(apiUrl ? { url: apiUrl } : {}),
	};
}

function normalizeCount(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function formatListMilestonesText(
	repository: string,
	params: NormalizedListMilestonesParams,
	milestones: ToolMilestoneSummary[],
	truncated: boolean,
): string {
	const sortDetails = [
		params.sort ? `sort: ${params.sort}` : undefined,
		params.direction ? `direction: ${params.direction}` : undefined,
	].filter((value): value is string => value !== undefined);
	const lines = [
		`Listed ${milestones.length} milestone(s) for ${repository}.`,
		`State: ${params.state}; limit: ${params.limit}${sortDetails.length ? `; ${sortDetails.join("; ")}` : ""}.`,
		"This tool is read-only; it does not assign milestones or write local issue cache files.",
		"",
		milestones.length ? undefined : "No repository milestones matched the request.",
		...milestones.map(formatMilestoneLine),
		truncated ? `Results truncated at ${params.limit} milestone(s); narrow state filters or increase limit up to ${MAX_TOOL_MILESTONES}.` : undefined,
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatMilestoneLine(milestone: ToolMilestoneSummary): string {
	const issueCounts = [
		milestone.open_issues !== undefined ? `${milestone.open_issues} open` : undefined,
		milestone.closed_issues !== undefined ? `${milestone.closed_issues} closed` : undefined,
	].filter((value): value is string => value !== undefined).join(", ");
	const metadata = [
		milestone.due_on ? `due ${milestone.due_on}` : "no due date",
		issueCounts || undefined,
	].filter((value): value is string => value !== undefined).join("; ");
	const url = milestone.html_url ?? milestone.url;
	return [
		`- #${milestone.number} [${milestone.state}] ${milestone.title}${metadata ? ` — ${metadata}` : ""}`,
		milestone.description ? ` — ${milestone.description}` : "",
		url ? ` — ${url}` : "",
	].join("");
}
