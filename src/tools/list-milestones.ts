import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_MILESTONES } from "../constants.ts";
import { IssueMeError } from "../errors.ts";
import type { GitHubMilestoneListDirection, GitHubMilestoneListSort, GitHubMilestoneListState } from "../github/client.ts";
import { assertGitHubMilestoneDiscoveryResponse } from "../github/issues-client.ts";
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

type ListMilestonesToolParams = Static<typeof ListMilestonesParams>;

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
				const normalized = normalizeListMilestonesParams(params);
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

interface NormalizedMilestoneIdentity {
	number: number;
	title: string;
	state: "open" | "closed";
}

function summarizeMilestones(milestones: GitHubMilestoneResponse[]): ToolMilestoneSummary[] {
	return milestones.map(normalizeMilestoneSummary);
}

function isStringValue(value: string | undefined): value is string {
	return typeof value === "string";
}

function normalizeMilestoneSummary(milestone: GitHubMilestoneResponse): ToolMilestoneSummary {
	assertGitHubMilestoneDiscoveryResponse(milestone);
	return buildMilestoneSummary({
		number: milestone.number,
		title: milestone.title.trim(),
		state: milestone.state,
	}, milestone);
}

function normalizeMilestoneText(value: unknown): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed) return trimmed;
	}
	return undefined;
}

function buildMilestoneSummary(identity: NormalizedMilestoneIdentity, milestone: GitHubMilestoneResponse): ToolMilestoneSummary {
	const summary: ToolMilestoneSummary = { ...identity };
	assignMilestoneText(summary, "description", milestone.description);
	assignMilestoneText(summary, "due_on", milestone.due_on);
	assignMilestoneCount(summary, "open_issues", milestone.open_issues);
	assignMilestoneCount(summary, "closed_issues", milestone.closed_issues);
	assignMilestoneText(summary, "html_url", milestone.html_url);
	assignMilestoneText(summary, "url", milestone.url);
	return summary;
}

function assignMilestoneText(summary: ToolMilestoneSummary, field: "description" | "due_on" | "html_url" | "url", value: unknown): void {
	const normalized = normalizeMilestoneText(value);
	if (normalized) summary[field] = normalized;
}

function assignMilestoneCount(summary: ToolMilestoneSummary, field: "open_issues" | "closed_issues", value: unknown): void {
	const normalized = normalizeCount(value);
	if (typeof normalized === "number") summary[field] = normalized;
}

function normalizeCount(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
	return undefined;
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
	].filter(isStringValue);
	const sortText = formatMilestoneSortText(sortDetails);
	const lines = [
		`Listed ${milestones.length} milestone(s) for ${repository}.`,
		`State: ${params.state}; limit: ${params.limit}${sortText}.`,
		"This tool is read-only; it does not assign milestones or write local issue cache files.",
		"",
		milestones.length ? undefined : "No repository milestones matched the request.",
		...milestones.map(formatMilestoneLine),
		truncated ? `Results truncated at ${params.limit} milestone(s); narrow state filters or increase limit up to ${MAX_TOOL_MILESTONES}.` : undefined,
	].filter(isStringValue);
	return lines.join("\n");
}

function formatMilestoneSortText(sortDetails: string[]): string {
	if (sortDetails.length) return `; ${sortDetails.join("; ")}`;
	return "";
}

function formatMilestoneLine(milestone: ToolMilestoneSummary): string {
	const issueCounts = formatMilestoneIssueCounts(milestone);
	const metadata = formatMilestoneMetadata(milestone, issueCounts);
	const metadataText = formatMilestoneMetadataText(metadata);
	const url = milestone.html_url ?? milestone.url;
	return [
		`- #${milestone.number} [${milestone.state}] ${milestone.title}${metadataText}`,
		formatMilestoneDescriptionText(milestone.description),
		formatMilestoneUrlText(url),
	].join("");
}

function formatMilestoneIssueCounts(milestone: ToolMilestoneSummary): string {
	return [
		formatMilestoneOpenIssueCount(milestone.open_issues),
		formatMilestoneClosedIssueCount(milestone.closed_issues),
	].filter(isStringValue).join(", ");
}

function formatMilestoneOpenIssueCount(count: number | undefined): string | undefined {
	if (typeof count === "number") return `${count} open`;
	return undefined;
}

function formatMilestoneClosedIssueCount(count: number | undefined): string | undefined {
	if (typeof count === "number") return `${count} closed`;
	return undefined;
}

function formatMilestoneMetadata(milestone: ToolMilestoneSummary, issueCounts: string): string {
	return [
		formatMilestoneDueDate(milestone.due_on),
		issueCounts || undefined,
	].filter(isStringValue).join("; ");
}

function formatMilestoneDueDate(dueOn: string | undefined): string {
	if (dueOn) return `due ${dueOn}`;
	return "no due date";
}

function formatMilestoneMetadataText(metadata: string): string {
	if (metadata) return ` — ${metadata}`;
	return "";
}

function formatMilestoneDescriptionText(description: string | undefined): string {
	if (description) return ` — ${description}`;
	return "";
}

function formatMilestoneUrlText(url: string | undefined): string {
	if (url) return ` — ${url}`;
	return "";
}
