import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_PROJECT_ITEM_VALUES, MAX_TOOL_PROJECT_ITEMS } from "../constants.ts";
import { ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { GitHubProjectV2ItemListResult, GitHubProjectV2ItemLookupResult, GitHubProjectV2Scope, ProjectV2ItemDetail } from "../github/client.ts";
import { normalizeContinuationTokenInput } from "../github/continuation.ts";
import type { IssueMeToolDetails, ToolProjectItemFieldValueSummary, ToolProjectItemSummary, ToolProjectSummary } from "../types.ts";
import { normalizeBoundedToolLimit, normalizeOptionalGitHubOpaqueId, normalizeOptionalTextFilter, normalizePositiveSafeInteger, normalizeRequiredGitHubOpaqueId } from "../utils/validation.ts";
import { appendContinuationLine, assertIssueCreatorAllowed, createIssueMeRuntime, issueCreatorMatchesConfig, issueCreatorScopeLabel, toolText, type IssueMeRuntime, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const DEFAULT_PROJECT_ITEM_LIMIT = Math.min(25, MAX_TOOL_PROJECT_ITEMS);
const DEFAULT_PROJECT_ITEM_VALUE_LIMIT = Math.min(25, MAX_TOOL_PROJECT_ITEM_VALUES);
const READ_ONLY_NOTE = "This tool is read-only; it does not change items, fields, issues, or local cache files. Absent fields have no current value.";

const ProjectScope = StringEnum(["repository", "organization", "user"] as const, { description: "Owner scope. Default repository." });

const ListProjectItemsParams = Type.Object(
	{
		projectId: Type.Optional(Type.String({ description: "ProjectV2 node ID; ignores scope/owner/projectNumber." })),
		scope: Type.Optional(ProjectScope),
		owner: Type.Optional(Type.String({ description: "Org/user login; only with organization/user scope." })),
		projectNumber: Type.Optional(Type.Integer({ minimum: 1, description: "Project number; ignored with projectId." })),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_PROJECT_ITEMS, description: `Max items. Default ${DEFAULT_PROJECT_ITEM_LIMIT}; max ${MAX_TOOL_PROJECT_ITEMS}.` })),
		valueLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_PROJECT_ITEM_VALUES, description: `Max field values per item. Default ${DEFAULT_PROJECT_ITEM_VALUE_LIMIT}; max ${MAX_TOOL_PROJECT_ITEM_VALUES}.` })),
		after: Type.Optional(Type.String({ description: "Continuation token; same project." })),
	},
	{ additionalProperties: false },
);

const GetProjectItemParams = Type.Object(
	{
		projectId: Type.String({ description: "ProjectV2 node ID." }),
		itemId: Type.Optional(Type.String({ description: "ProjectV2Item node ID; or use issueNumber." })),
		issueNumber: Type.Optional(Type.Integer({ minimum: 1, description: "Issue number on the project; or use itemId." })),
		valueLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_PROJECT_ITEM_VALUES, description: `Max field values. Default ${DEFAULT_PROJECT_ITEM_VALUE_LIMIT}; max ${MAX_TOOL_PROJECT_ITEM_VALUES}.` })),
		after: Type.Optional(Type.String({ description: "Field-value continuation token; same item." })),
	},
	{ additionalProperties: false },
);

type ListProjectItemsToolParams = Static<typeof ListProjectItemsParams>;
type GetProjectItemToolParams = Static<typeof GetProjectItemParams>;

interface NormalizedListProjectItemsParams {
	projectId?: string;
	scope?: GitHubProjectV2Scope;
	owner?: string;
	projectNumber?: number;
	limit: number;
	valueLimit: number;
	after?: string;
}

interface NormalizedGetProjectItemParams {
	projectId: string;
	itemId?: string;
	issueNumber?: number;
	valueLimit: number;
	after?: string;
}

type ProjectItemOmission = "pull_request" | "draft_issue" | "foreign_repository" | "out_of_scope" | "inaccessible";

interface ClassifiedProjectItems {
	included: ProjectV2ItemDetail[];
	omitted: Record<ProjectItemOmission, number>;
}

export function registerProjectItemTools(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	registerListProjectItemsTool(pi, options);
	registerGetProjectItemTool(pi, options);
}

export function registerListProjectItemsTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_list_project_items",
			label: "IssueMe List Project Items",
			description: "List Projects v2 items with current field values.",
			promptSnippet: "List Projects v2 items and values.",
			promptGuidelines: [
				"Use issueme_list_project_items to see which current-repository issues are on a board and their status/priority/iteration values; read-only, item IDs feed later project mutations.",
			],
			parameters: ListProjectItemsParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeListProjectItemsParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const result = await runtime.client.listProjectV2Items(normalized, signal);
				const classified = classifyProjectItems(runtime, result.items);
				const creatorScope = issueCreatorScopeLabel(runtime.config);
				const details = buildListProjectItemsDetails(runtime.repository, creatorScope, result, classified, normalized);
				return toolText(appendContinuationLine(formatListProjectItemsText(result, classified, normalized), result.continuation), details);
			},
		}),
	);
}

export function registerGetProjectItemTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_get_project_item",
			label: "IssueMe Get Project Item",
			description: "Read one Projects v2 item and its field values.",
			promptSnippet: "Read one Projects v2 item.",
			promptGuidelines: [
				"Use issueme_get_project_item with projectId plus itemId or issueNumber to get an item ID and current values before project mutations; read-only, no add-item call needed.",
			],
			parameters: GetProjectItemParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeGetProjectItemParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const result = await runtime.client.getProjectV2Item(normalized, signal);
				const creatorScope = issueCreatorScopeLabel(runtime.config);
				if (!result.item) return toolText(formatProjectItemNotFoundText(normalized, result), buildProjectItemNotFoundDetails(runtime.repository, creatorScope, normalized, result));
				assertProjectItemReadable(runtime, result.item, normalized);
				const details = buildGetProjectItemDetails(runtime.repository, creatorScope, result.item, result, normalized);
				return toolText(appendContinuationLine(formatGetProjectItemText(result.item, result, normalized), result.continuation), details);
			},
		}),
	);
}

function normalizeListProjectItemsParams(params: ListProjectItemsToolParams): NormalizedListProjectItemsParams {
	const projectId = normalizeOptionalGitHubOpaqueId(params.projectId, "projectId");
	const owner = normalizeOptionalTextFilter(params.owner, "owner");
	const after = normalizeContinuationTokenInput(params.after);
	return {
		...(projectId ? { projectId } : {}),
		...(params.scope !== undefined ? { scope: params.scope } : {}),
		...(owner ? { owner } : {}),
		...(params.projectNumber !== undefined ? { projectNumber: normalizePositiveSafeInteger(params.projectNumber, "projectNumber") } : {}),
		limit: normalizeBoundedToolLimit(params.limit, { max: MAX_TOOL_PROJECT_ITEMS, defaultValue: DEFAULT_PROJECT_ITEM_LIMIT }),
		valueLimit: normalizeBoundedToolLimit(params.valueLimit, { field: "valueLimit", max: MAX_TOOL_PROJECT_ITEM_VALUES, defaultValue: DEFAULT_PROJECT_ITEM_VALUE_LIMIT }),
		...(after ? { after } : {}),
	};
}

function normalizeGetProjectItemParams(params: GetProjectItemToolParams): NormalizedGetProjectItemParams {
	const itemId = normalizeOptionalGitHubOpaqueId(params.itemId, "itemId");
	const issueNumber = params.issueNumber === undefined ? undefined : normalizePositiveSafeInteger(params.issueNumber, "issueNumber");
	if ((itemId === undefined) === (issueNumber === undefined)) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Provide exactly one of itemId or issueNumber to look up a Projects v2 item.", { fields: ["itemId", "issueNumber"] });
	}
	const after = normalizeContinuationTokenInput(params.after);
	return {
		projectId: normalizeRequiredGitHubOpaqueId(params.projectId, "projectId"),
		...(itemId ? { itemId } : {}),
		...(issueNumber !== undefined ? { issueNumber } : {}),
		valueLimit: normalizeBoundedToolLimit(params.valueLimit, { field: "valueLimit", max: MAX_TOOL_PROJECT_ITEM_VALUES, defaultValue: DEFAULT_PROJECT_ITEM_VALUE_LIMIT }),
		...(after ? { after } : {}),
	};
}

/** Only issue-backed items of the current repository within creator scope expose content; everything else is counted, never guessed. */
function projectItemOmission(runtime: IssueMeRuntime, detail: ProjectV2ItemDetail): ProjectItemOmission | undefined {
	const content = detail.content;
	if (content.kind === "pull_request") return "pull_request";
	if (content.kind === "draft_issue") return "draft_issue";
	if (content.kind !== "issue" || !content.repository || !detail.item.issue) return "inaccessible";
	if (content.repository.toLowerCase() !== runtime.repository.toLowerCase()) return "foreign_repository";
	if (!issueCreatorMatchesConfig(runtime.config, content.creator)) return "out_of_scope";
	return undefined;
}

function classifyProjectItems(runtime: IssueMeRuntime, items: ProjectV2ItemDetail[]): ClassifiedProjectItems {
	const classified: ClassifiedProjectItems = { included: [], omitted: { pull_request: 0, draft_issue: 0, foreign_repository: 0, out_of_scope: 0, inaccessible: 0 } };
	for (const detail of items) {
		const omission = projectItemOmission(runtime, detail);
		if (omission) classified.omitted[omission] += 1;
		else classified.included.push(detail);
	}
	return classified;
}

function assertProjectItemReadable(runtime: IssueMeRuntime, detail: ProjectV2ItemDetail, params: NormalizedGetProjectItemParams): void {
	const omission = projectItemOmission(runtime, detail);
	if (omission === undefined) return;
	if (omission === "out_of_scope") {
		assertIssueCreatorAllowed(runtime.config, { creator: detail.content.creator, number: detail.content.issueNumber }, { repository: runtime.repository, operation: "get_project_item", issueNumber: detail.content.issueNumber });
	}
	throw new IssueMeError(
		ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
		projectItemRefusalMessage(omission),
		{ projectId: params.projectId, itemId: detail.item.id, contentKind: detail.content.kind, reason: omission, ...(detail.content.repository ? { actualRepository: detail.content.repository } : {}) },
		{ recoveryHint: "Use issueme_list_project_items to find issue-backed items of the current repository; IssueMe does not read pull request, draft, foreign-repository, or inaccessible project content." },
	);
}

function projectItemRefusalMessage(omission: ProjectItemOmission): string {
	if (omission === "pull_request") return "The project item represents a pull request; IssueMe reads issue-backed items only.";
	if (omission === "draft_issue") return "The project item is a draft issue; IssueMe reads issue-backed items only.";
	if (omission === "foreign_repository") return "The project item represents an issue outside the resolved current repository; refusing to read it.";
	return "The project item content is redacted or inaccessible to this token; refusing to guess its content.";
}

function buildListProjectItemsDetails(
	repository: string,
	creatorScope: string,
	result: GitHubProjectV2ItemListResult,
	classified: ClassifiedProjectItems,
	params: NormalizedListProjectItemsParams,
): IssueMeToolDetails {
	const items = classified.included.map((detail) => detail.item);
	const truncation: Record<string, unknown> = {};
	if (result.truncated) truncation.projectItems = { shown: result.items.length, max: params.limit, ...(result.totalCount !== undefined ? { total: result.totalCount } : {}) };
	const valueTruncatedItems = items.filter((item) => item.fieldValuesTruncated === true).length;
	if (valueTruncatedItems > 0) truncation.fieldValues = { affectedItems: valueTruncatedItems, maxPerItem: params.valueLimit };
	return {
		repository,
		creatorScope,
		status: "list_project_items",
		project: result.project,
		projectItems: items,
		counts: {
			returned: items.length,
			...(result.totalCount !== undefined ? { total: result.totalCount } : {}),
			archived: items.filter((item) => item.isArchived === true).length,
			omittedPullRequests: classified.omitted.pull_request,
			omittedDraftIssues: classified.omitted.draft_issue,
			omittedForeignRepository: classified.omitted.foreign_repository,
			omittedOutOfScope: classified.omitted.out_of_scope,
			omittedInaccessible: classified.omitted.inaccessible,
			limit: params.limit,
			valueLimit: params.valueLimit,
		},
		cacheUpdated: false,
		needsSync: false,
		truncated: result.truncated || valueTruncatedItems > 0,
		...(Object.keys(truncation).length > 0 ? { truncation } : {}),
		...(result.continuation ? { continuation: result.continuation } : {}),
	};
}

function buildGetProjectItemDetails(
	repository: string,
	creatorScope: string,
	detail: ProjectV2ItemDetail,
	result: GitHubProjectV2ItemLookupResult,
	params: NormalizedGetProjectItemParams,
): IssueMeToolDetails {
	const item = detail.item;
	const truncated = item.fieldValuesTruncated === true || result.searchTruncated === true;
	return {
		repository,
		creatorScope,
		status: "get_project_item",
		...(item.project ? { project: item.project } : {}),
		projectItem: item,
		counts: {
			fieldValues: item.fieldValues?.length ?? 0,
			...(item.fieldValuesCount !== undefined ? { fieldValuesTotal: item.fieldValuesCount } : {}),
			...(result.searchedItems !== undefined ? { searchedItems: result.searchedItems } : {}),
			valueLimit: params.valueLimit,
		},
		cacheUpdated: false,
		needsSync: false,
		truncated,
		...(item.fieldValuesTruncated ? { truncation: { fieldValues: { shown: item.fieldValues?.length ?? 0, max: params.valueLimit, ...(item.fieldValuesCount !== undefined ? { total: item.fieldValuesCount } : {}) } } } : {}),
		...(result.continuation ? { continuation: result.continuation } : {}),
	};
}

function buildProjectItemNotFoundDetails(repository: string, creatorScope: string, params: NormalizedGetProjectItemParams, result: GitHubProjectV2ItemLookupResult): IssueMeToolDetails {
	return {
		repository,
		creatorScope,
		status: "project_item_not_found",
		counts: { searchedItems: result.searchedItems ?? 0 },
		cacheUpdated: false,
		needsSync: false,
		truncated: result.searchTruncated === true,
		message: `Issue #${params.issueNumber} has no item on project ${params.projectId}${result.searchTruncated ? " among the first project items inspected" : ""}.`,
	};
}

function formatListProjectItemsText(result: GitHubProjectV2ItemListResult, classified: ClassifiedProjectItems, params: NormalizedListProjectItemsParams): string {
	const omitted = classified.omitted;
	const lines = [
		`Listed ${classified.included.length} issue item(s) on ${formatProjectLabel(result.project)}.`,
		`Limit: ${params.limit}; valueLimit: ${params.valueLimit}; omitted: ${omitted.pull_request} pull request(s), ${omitted.draft_issue} draft(s), ${omitted.foreign_repository} foreign-repository, ${omitted.out_of_scope} out-of-scope, ${omitted.inaccessible} inaccessible.`,
		READ_ONLY_NOTE,
		"",
		classified.included.length === 0 ? "No issue-backed items of the current repository were returned on this page." : undefined,
		...classified.included.flatMap((detail) => formatProjectItemLines(detail.item)),
		result.truncated ? `Results truncated at ${params.limit} item(s); continue with the returned token.` : undefined,
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatGetProjectItemText(detail: ProjectV2ItemDetail, result: GitHubProjectV2ItemLookupResult, params: NormalizedGetProjectItemParams): string {
	const item = detail.item;
	const totalValues = item.fieldValuesCount !== undefined ? ` of ${item.fieldValuesCount}` : "";
	const lines = [
		`Project item ${item.id} on ${formatProjectLabel(item.project)}: ${formatProjectItemIssue(item)} (${item.isArchived ? "archived" : "active"}).`,
		`Field values (${item.fieldValues?.length ?? 0}${totalValues}; valueLimit ${params.valueLimit}):`,
		...(item.fieldValues?.length ? item.fieldValues.map((value) => `- ${formatFieldValue(value)}`) : ["- none; every project field is unset for this item"]),
		item.fieldValuesTruncated ? "More field values exist; continue with the returned token." : undefined,
		result.searchTruncated ? "The issue has more project items than IssueMe inspected; the match came from the first page." : undefined,
		READ_ONLY_NOTE,
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatProjectItemNotFoundText(params: NormalizedGetProjectItemParams, result: GitHubProjectV2ItemLookupResult): string {
	const scope = result.searchTruncated ? " among the first project items inspected; the issue has more items than one lookup covers" : "";
	return [
		`Issue #${params.issueNumber} has no item on project ${params.projectId}${scope}.`,
		`Searched ${result.searchedItems ?? 0} project item(s) attached to the issue.`,
		"Use issueme_add_issue_to_project only if the issue should be added; this read made no changes.",
	].join("\n");
}

function formatProjectLabel(project: ToolProjectSummary | undefined): string {
	if (!project) return "the GitHub Projects v2 board";
	return `GitHub Projects v2 board #${project.number} ${project.title} (${project.ownerType}: ${project.owner})`;
}

function formatProjectItemIssue(item: ToolProjectItemSummary): string {
	if (!item.issue) return "issue content unavailable";
	const state = item.issue.state ?? "unknown";
	return `issue #${item.issue.number} [${state}] ${item.issue.title}`;
}

function formatProjectItemLines(item: ToolProjectItemSummary): string[] {
	const archived = item.isArchived ? " (archived)" : "";
	const values = item.fieldValues?.length ? item.fieldValues.map(formatFieldValueInline).join("; ") : "no field values";
	const lines = [`- ${item.id}: ${formatProjectItemIssue(item)}${archived} — ${values}`];
	if (item.fieldValuesTruncated) lines.push("  more field values exist; use issueme_get_project_item with itemId and after.");
	return lines;
}

function formatFieldValueInline(value: ToolProjectItemFieldValueSummary): string {
	return `${value.name}: ${formatFieldValueContent(value)}`;
}

function formatFieldValue(value: ToolProjectItemFieldValueSummary): string {
	const dataType = value.dataType ? ` (${value.dataType})` : "";
	return `${value.name}${dataType} id ${value.fieldId}: ${formatFieldValueContent(value)}`;
}

function formatFieldValueContent(value: ToolProjectItemFieldValueSummary): string {
	if (value.kind === "text") return value.text ?? "";
	if (value.kind === "number") return String(value.number);
	if (value.kind === "date") return value.date ?? "";
	if (value.kind === "single_select") {
		const optionId = value.optionId ? ` [optionId ${value.optionId}]` : "";
		return `${value.optionName ?? "option"}${optionId}`;
	}
	if (value.kind === "iteration") return formatIterationValueContent(value);
	return `set (${value.valueType ?? "unsupported value type"}; not exposed by IssueMe)`;
}

function formatIterationValueContent(value: ToolProjectItemFieldValueSummary): string {
	const startDate = value.startDate ? ` ${value.startDate}` : "";
	const duration = value.duration !== undefined ? `/${value.duration}d` : "";
	const iterationId = value.iterationId ? ` [iterationId ${value.iterationId}]` : "";
	return `${value.iterationTitle ?? "iteration"}${startDate}${duration}${iterationId}`;
}
