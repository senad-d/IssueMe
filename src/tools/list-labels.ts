import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { MAX_TOOL_LABELS } from "../constants.ts";
import { IssueMeError } from "../errors.ts";
import type { GitHubLabelResponse, IssueMeToolDetails, ToolLabelSummary } from "../types.ts";
import { createIssueMeRuntime, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const DEFAULT_LABEL_LIST_LIMIT = Math.min(25, MAX_TOOL_LABELS);

const ListLabelsParams = Type.Object(
	{
		name: Type.Optional(Type.String({ description: "Name substring." })),
		query: Type.Optional(Type.String({ description: "Name/description search." })),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_LABELS, description: `Max results. Default ${DEFAULT_LABEL_LIST_LIMIT}; max ${MAX_TOOL_LABELS}.` })),
	},
	{ additionalProperties: false },
);

interface ListLabelsToolParams {
	name?: string;
	query?: string;
	limit?: number;
}

interface NormalizedListLabelsParams {
	name?: string;
	query?: string;
	limit: number;
}

export function registerListLabelsTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_list_labels",
			label: "IssueMe List Labels",
			description: "List/search repo labels with metadata.",
			promptSnippet: "List/search repo labels.",
			promptGuidelines: [
				"Use issueme_list_labels before applying or creating labels when taxonomy is unknown; filter with name/query.",
			],
			parameters: ListLabelsParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeListLabelsParams(params as ListLabelsToolParams);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const result = await runtime.client.listLabels(normalized, signal);
				const labels = summarizeLabels(result.labels);
				const details: IssueMeToolDetails = {
					repository: runtime.repository,
					status: "list_labels",
					labels,
					counts: {
						returned: labels.length,
						limit: normalized.limit,
					},
					cacheUpdated: false,
					truncated: result.truncated,
					...(result.truncated ? { truncation: { labels: { shown: labels.length, max: normalized.limit } } } : {}),
				};
				return toolText(formatListLabelsText(runtime.repository, normalized, labels, result.truncated), details);
			},
		}),
	);
}

function normalizeListLabelsParams(params: ListLabelsToolParams): NormalizedListLabelsParams {
	const name = normalizeOptionalFilter(params.name, "name");
	const query = normalizeOptionalFilter(params.query, "query");
	return {
		...(name ? { name } : {}),
		...(query ? { query } : {}),
		limit: normalizeLimit(params.limit),
	};
}

function normalizeLimit(value: number | undefined): number {
	if (value === undefined) return DEFAULT_LABEL_LIST_LIMIT;
	if (Number.isSafeInteger(value) && value >= 1 && value <= MAX_TOOL_LABELS) return value;
	throw new IssueMeError("invalid_tool_input", `limit must be an integer between 1 and ${MAX_TOOL_LABELS}.`, { field: "limit" });
}

function normalizeOptionalFilter(value: string | undefined, field: string): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (trimmed.includes("\0")) throw new IssueMeError("invalid_tool_input", `${field} must not contain null bytes.`, { field });
	return trimmed;
}

function summarizeLabels(labels: GitHubLabelResponse[]): ToolLabelSummary[] {
	return labels.map(normalizeLabelSummary).filter((label): label is ToolLabelSummary => label !== undefined);
}

function normalizeLabelSummary(label: GitHubLabelResponse): ToolLabelSummary | undefined {
	const name = typeof label.name === "string" ? label.name.trim() : "";
	if (!name) return undefined;
	const description = typeof label.description === "string" && label.description.trim() ? label.description.trim() : undefined;
	const color = typeof label.color === "string" && label.color.trim() ? label.color.trim() : undefined;
	const url = typeof label.url === "string" && label.url.trim() ? label.url.trim() : undefined;
	return {
		name,
		...(description ? { description } : {}),
		...(color ? { color } : {}),
		...(typeof label.default === "boolean" ? { default: label.default } : {}),
		...(url ? { url } : {}),
	};
}

function formatListLabelsText(
	repository: string,
	params: NormalizedListLabelsParams,
	labels: ToolLabelSummary[],
	truncated: boolean,
): string {
	const filters = [
		params.name ? `name: ${params.name}` : undefined,
		params.query ? `query: ${params.query}` : undefined,
	].filter((value): value is string => value !== undefined);
	const lines = [
		`Listed ${labels.length} label(s) for ${repository}.`,
		`Limit: ${params.limit}${filters.length ? `; filters: ${filters.join(", ")}` : ""}.`,
		"This tool is read-only; it does not apply labels or write local issue cache files.",
		"",
		labels.length ? undefined : "No repository labels matched the request.",
		...labels.map(formatLabelLine),
		truncated ? `Results truncated at ${params.limit} label(s); narrow filters or increase limit up to ${MAX_TOOL_LABELS}.` : undefined,
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatLabelLine(label: ToolLabelSummary): string {
	const metadata = [
		label.color ? `#${label.color}` : undefined,
		label.default === true ? "default" : label.default === false ? "custom" : undefined,
	].filter((value): value is string => value !== undefined).join(", ");
	return [
		`- ${label.name}${metadata ? ` (${metadata})` : ""}`,
		label.description ? ` — ${label.description}` : "",
		label.url ? ` — ${label.url}` : "",
	].join("");
}
