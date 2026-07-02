import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_LABELS } from "../constants.ts";
import type { GitHubLabelResponse, IssueMeToolDetails, ToolLabelSummary } from "../types.ts";
import { normalizeBoundedToolLimit, normalizeOptionalTextFilter } from "../utils/validation.ts";
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

type ListLabelsToolParams = Static<typeof ListLabelsParams>;

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
				const normalized = normalizeListLabelsParams(params);
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
	const name = normalizeOptionalTextFilter(params.name, "name");
	const query = normalizeOptionalTextFilter(params.query, "query");
	return {
		...(name ? { name } : {}),
		...(query ? { query } : {}),
		limit: normalizeBoundedToolLimit(params.limit, { max: MAX_TOOL_LABELS, defaultValue: DEFAULT_LABEL_LIST_LIMIT }),
	};
}

function summarizeLabels(labels: GitHubLabelResponse[]): ToolLabelSummary[] {
	return labels.map(normalizeLabelSummary).filter(isToolLabelSummary);
}

function isToolLabelSummary(label: ToolLabelSummary | undefined): label is ToolLabelSummary {
	if (label) return true;
	return false;
}

function isStringValue(value: string | undefined): value is string {
	return typeof value === "string";
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
	].filter(isStringValue);
	const filterText = formatListLabelFilterText(filters);
	const lines = [
		`Listed ${labels.length} label(s) for ${repository}.`,
		`Limit: ${params.limit}${filterText}.`,
		"This tool is read-only; it does not apply labels or write local issue cache files.",
		"",
		labels.length ? undefined : "No repository labels matched the request.",
		...labels.map(formatLabelLine),
		truncated ? `Results truncated at ${params.limit} label(s); narrow filters or increase limit up to ${MAX_TOOL_LABELS}.` : undefined,
	].filter(isStringValue);
	return lines.join("\n");
}

function formatListLabelFilterText(filters: string[]): string {
	if (filters.length) return `; filters: ${filters.join(", ")}`;
	return "";
}

function formatLabelLine(label: ToolLabelSummary): string {
	const metadata = formatLabelMetadata(label);
	const metadataText = formatLabelMetadataText(metadata);
	return [
		`- ${label.name}${metadataText}`,
		formatLabelDescriptionText(label.description),
		formatLabelUrlText(label.url),
	].join("");
}

function formatLabelMetadata(label: ToolLabelSummary): string {
	return [
		formatLabelColorMetadata(label.color),
		formatLabelDefaultMetadata(label.default),
	].filter(isStringValue).join(", ");
}

function formatLabelColorMetadata(color: string | undefined): string | undefined {
	if (color) return `#${color}`;
	return undefined;
}

function formatLabelDefaultMetadata(defaultValue: boolean | undefined): string | undefined {
	if (defaultValue === true) return "default";
	if (defaultValue === false) return "custom";
	return undefined;
}

function formatLabelMetadataText(metadata: string): string {
	if (metadata) return ` (${metadata})`;
	return "";
}

function formatLabelDescriptionText(description: string | undefined): string {
	if (description) return ` — ${description}`;
	return "";
}

function formatLabelUrlText(url: string | undefined): string {
	if (url) return ` — ${url}`;
	return "";
}
