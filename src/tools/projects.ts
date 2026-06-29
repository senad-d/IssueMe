import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_PROJECT_FIELD_OPTIONS, MAX_TOOL_PROJECT_FIELDS, MAX_TOOL_PROJECT_ITERATIONS, MAX_TOOL_PROJECTS } from "../constants.ts";
import { IssueMeError } from "../errors.ts";
import type { GitHubProjectV2FieldValueInput, GitHubProjectV2FieldValueType, GitHubProjectV2Scope } from "../github/client.ts";
import type { IssueMeToolDetails, ToolProjectFieldSummary, ToolProjectItemSummary, ToolProjectSummary } from "../types.ts";
import { assertNoNullBytes, normalizeBoundedToolLimit, normalizeOptionalGitHubOpaqueId, normalizeOptionalTextFilter, normalizePositiveSafeInteger, normalizeRequiredGitHubOpaqueId, normalizeRequiredIsoDateOnly } from "../utils/validation.ts";
import { assertExistingIssueCreatorAllowed, createIssueMeRuntime, issueCreatorScopeLabel, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const DEFAULT_PROJECT_LIST_LIMIT = Math.min(10, MAX_TOOL_PROJECTS);
const DEFAULT_PROJECT_FIELD_LIMIT = Math.min(25, MAX_TOOL_PROJECT_FIELDS);
const DEFAULT_PROJECT_FIELD_OPTION_LIMIT = Math.min(25, MAX_TOOL_PROJECT_FIELD_OPTIONS);
const DEFAULT_PROJECT_ITERATION_LIMIT = Math.min(25, MAX_TOOL_PROJECT_ITERATIONS);

const ProjectScope = StringEnum(["repository", "organization", "user"] as const, {
	description: "Owner scope. Default repository.",
});

const ProjectFieldValueType = StringEnum(["single_select", "iteration", "date", "text", "number"] as const, {
	description: "Field value type; IDs required for select/iteration.",
});

const ListProjectsParams = Type.Object(
	{
		scope: Type.Optional(ProjectScope),
		owner: Type.Optional(Type.String({ description: "Org/user login; only valid when scope is organization or user; defaults repo owner." })),
		query: Type.Optional(Type.String({ description: "Projects v2 search text." })),
		includeClosed: Type.Optional(Type.Boolean({ description: "Include closed boards. Default false." })),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_PROJECTS, description: `Max results. Default ${DEFAULT_PROJECT_LIST_LIMIT}; max ${MAX_TOOL_PROJECTS}.` })),
	},
	{ additionalProperties: false },
);

const GetProjectFieldsParams = Type.Object(
	{
		projectId: Type.Optional(Type.String({ description: "ProjectV2 node ID; one-line and at most 512 characters. When provided, owner/scope/projectNumber are ignored." })),
		scope: Type.Optional(ProjectScope),
		owner: Type.Optional(Type.String({ description: "Org/user login; only valid when scope is organization or user; ignored with projectId." })),
		projectNumber: Type.Optional(Type.Integer({ minimum: 1, description: "Project number for scope; ignored with projectId." })),
		fieldLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_PROJECT_FIELDS, description: `Max fields. Default ${DEFAULT_PROJECT_FIELD_LIMIT}; max ${MAX_TOOL_PROJECT_FIELDS}.` })),
		optionLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_PROJECT_FIELD_OPTIONS, description: `Max options/field. Default ${DEFAULT_PROJECT_FIELD_OPTION_LIMIT}; max ${MAX_TOOL_PROJECT_FIELD_OPTIONS}.` })),
		iterationLimit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_PROJECT_ITERATIONS, description: `Max iterations/field. Default ${DEFAULT_PROJECT_ITERATION_LIMIT}; max ${MAX_TOOL_PROJECT_ITERATIONS}.` })),
	},
	{ additionalProperties: false },
);

const AddIssueToProjectParams = Type.Object(
	{
		issueNumber: Type.Integer({ minimum: 1, description: "Open issue number." }),
		projectId: Type.String({ description: "ProjectV2 node ID; one-line and at most 512 characters." }),
		scope: Type.Optional(ProjectScope),
		owner: Type.Optional(Type.String({ description: "Expected org/user login for Projects v2 add preflight; only valid when scope is organization or user. Defaults to repo owner for org/user scope." })),
	},
	{ additionalProperties: false },
);

const UpdateProjectItemParams = Type.Object(
	{
		projectId: Type.String({ description: "ProjectV2 node ID; one-line and at most 512 characters." }),
		itemId: Type.String({ description: "ProjectV2Item node ID; one-line and at most 512 characters." }),
		issueNumber: Type.Integer({ minimum: 1, description: "Open issue number represented by item." }),
		fieldId: Type.String({ description: "Project field node ID; one-line and at most 512 characters." }),
		valueType: ProjectFieldValueType,
		singleSelectOptionId: Type.Optional(Type.String({ description: "Single-select option ID; one-line and at most 512 characters." })),
		iterationId: Type.Optional(Type.String({ description: "Iteration ID; one-line and at most 512 characters." })),
		date: Type.Optional(Type.String({ description: "YYYY-MM-DD date." })),
		text: Type.Optional(Type.String({ description: "Text value." })),
		numberValue: Type.Optional(Type.Number({ description: "Finite number." })),
	},
	{ additionalProperties: false },
);

type ListProjectsToolParams = Static<typeof ListProjectsParams>;

interface NormalizedListProjectsParams {
	scope: GitHubProjectV2Scope;
	owner?: string;
	query?: string;
	includeClosed: boolean;
	limit: number;
}

type GetProjectFieldsToolParams = Static<typeof GetProjectFieldsParams>;

interface NormalizedGetProjectFieldsParams {
	projectId?: string;
	scope: GitHubProjectV2Scope;
	owner?: string;
	projectNumber?: number;
	fieldLimit: number;
	optionLimit: number;
	iterationLimit: number;
}

type AddIssueToProjectToolParams = Static<typeof AddIssueToProjectParams>;

interface NormalizedAddIssueToProjectParams {
	issueNumber: number;
	projectId: string;
	scope?: GitHubProjectV2Scope;
	owner?: string;
}

type UpdateProjectItemToolParams = Static<typeof UpdateProjectItemParams>;
type UpdateProjectItemValueField = Exclude<keyof UpdateProjectItemToolParams, "projectId" | "itemId" | "fieldId" | "issueNumber" | "valueType"> & string;

export const UPDATE_PROJECT_ITEM_COMMON_FIELDS = ["projectId", "itemId", "issueNumber", "fieldId", "valueType"] as const satisfies readonly (keyof UpdateProjectItemToolParams & string)[];
export const UPDATE_PROJECT_ITEM_VALUE_FIELDS = {
	single_select: ["singleSelectOptionId"],
	iteration: ["iterationId"],
	date: ["date"],
	text: ["text"],
	number: ["numberValue"],
} as const satisfies Record<GitHubProjectV2FieldValueType, readonly UpdateProjectItemValueField[]>;

interface NormalizedUpdateProjectItemParams {
	projectId: string;
	itemId: string;
	fieldId: string;
	issueNumber: number;
	valueType: GitHubProjectV2FieldValueType;
	value: GitHubProjectV2FieldValueInput;
}

export function registerProjectTools(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	registerListProjectsTool(pi, options);
	registerGetProjectFieldsTool(pi, options);
	registerAddIssueToProjectTool(pi, options);
	registerUpdateProjectItemTool(pi, options);
}

export function registerListProjectsTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_list_projects",
			label: "IssueMe List Projects",
			description: "Discover Projects v2 boards for repo/org/user.",
			promptSnippet: "Discover Projects v2 boards.",
			promptGuidelines: [
				"Use issueme_list_projects before project mutations when board ID/number is unknown; bound scope/query/limit and omit owner for repository scope.",
			],
			parameters: ListProjectsParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeListProjectsParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const result = await runtime.client.listProjectsV2(normalized, signal);
				const details: IssueMeToolDetails = {
					repository: runtime.repository,
					status: "list_projects",
					projects: result.projects,
					counts: {
						returned: result.projects.length,
						limit: normalized.limit,
					},
					cacheUpdated: false,
					truncated: result.truncated,
					...(result.truncated ? { truncation: { projects: { shown: result.projects.length, max: normalized.limit } } } : {}),
				};
				return toolText(formatListProjectsText(result.owner, normalized, result.projects, result.truncated), details);
			},
		}),
	);
}

export function registerGetProjectFieldsTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_get_project_fields",
			label: "IssueMe Get Project Fields",
			description: "List Projects v2 fields, options, and iterations.",
			promptSnippet: "List Projects v2 fields/options.",
			promptGuidelines: [
				"Use issueme_get_project_fields after issueme_list_projects and before issueme_update_project_item to get field/option/iteration IDs; projectId ignores scope/owner/projectNumber.",
			],
			parameters: GetProjectFieldsParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeGetProjectFieldsParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const result = await runtime.client.getProjectV2Fields(normalized, signal);
				const details: IssueMeToolDetails = {
					repository: runtime.repository,
					status: "get_project_fields",
					project: result.project,
					projectFields: result.fields,
					counts: {
						returned: result.fields.length,
						fieldLimit: normalized.fieldLimit,
						optionLimit: normalized.optionLimit,
						iterationLimit: normalized.iterationLimit,
					},
					cacheUpdated: false,
					truncated: result.truncated,
					...(result.truncated ? { truncation: { projectFields: { shown: result.fields.length, max: normalized.fieldLimit } } } : {}),
				};
				return toolText(formatProjectFieldsText(result.project, result.fields, normalized, result.truncated), details);
			},
		}),
	);
}

export function registerAddIssueToProjectTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_add_issue_to_project",
			label: "IssueMe Add Issue To Project",
			description: "Add an open issue to a Projects v2 board.",
			promptSnippet: "Add open issue to Projects v2 board.",
			promptGuidelines: [
				"Use issueme_add_issue_to_project only with an open issueNumber and discovered ProjectV2 projectId; pass matching scope/owner when the board is not under the current repository/default owner policy.",
			],
			executionMode: "sequential",
			parameters: AddIssueToProjectParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeAddIssueToProjectParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				await assertExistingIssueCreatorAllowed(runtime, normalized.issueNumber, "add_issue_to_project", signal);
				const result = await runtime.client.addIssueToProjectV2(normalized, signal);
				const details: IssueMeToolDetails = {
					repository: runtime.repository,
					creatorScope: issueCreatorScopeLabel(runtime.config),
					status: "add_issue_to_project",
					project: result.item.project,
					projectItem: result.item,
					counts: { changed: 1 },
					cacheUpdated: false,
				};
				return toolText(formatAddIssueToProjectText(result.item), details);
			},
		}),
	);
}

export function registerUpdateProjectItemTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_update_project_item",
			label: "IssueMe Update Project Item",
			description: "Update one Projects v2 item field.",
			promptSnippet: "Update one Projects v2 item field.",
			promptGuidelines: [
				"Use issueme_update_project_item only with discovered project/item/field IDs and exactly one value matching valueType.",
			],
			executionMode: "sequential",
			parameters: UpdateProjectItemParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeUpdateProjectItemParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				await assertExistingIssueCreatorAllowed(runtime, normalized.issueNumber, "update_project_item", signal);
				const result = await runtime.client.updateProjectV2ItemField({
					projectId: normalized.projectId,
					itemId: normalized.itemId,
					fieldId: normalized.fieldId,
					issueNumber: normalized.issueNumber,
					value: normalized.value,
				}, signal);
				const details: IssueMeToolDetails = {
					repository: runtime.repository,
					creatorScope: issueCreatorScopeLabel(runtime.config),
					status: "update_project_item",
					project: result.item.project,
					projectItem: result.item,
					changedFields: [normalized.fieldId],
					counts: { changed: 1 },
					cacheUpdated: false,
				};
				return toolText(formatUpdateProjectItemText(result.item, normalized), details);
			},
		}),
	);
}

function normalizeListProjectsParams(params: ListProjectsToolParams): NormalizedListProjectsParams {
	const scope = normalizeScope(params.scope);
	const owner = normalizeOptionalText(params.owner, "owner");
	const query = normalizeOptionalText(params.query, "query");
	assertProjectOwnerScope(scope, owner);
	return {
		scope,
		...(owner ? { owner } : {}),
		...(query ? { query } : {}),
		includeClosed: params.includeClosed === true,
		limit: normalizeLimit(params.limit, MAX_TOOL_PROJECTS, DEFAULT_PROJECT_LIST_LIMIT, "limit"),
	};
}

function normalizeGetProjectFieldsParams(params: GetProjectFieldsToolParams): NormalizedGetProjectFieldsParams {
	const scope = normalizeScope(params.scope);
	const projectId = normalizeOptionalProjectId(params.projectId, "projectId");
	const owner = normalizeOptionalText(params.owner, "owner");
	if (!projectId) assertProjectOwnerScope(scope, owner);
	if (!projectId && params.projectNumber === undefined) {
		throw new IssueMeError("invalid_tool_input", "projectNumber is required when projectId is not provided.", { field: "projectNumber" });
	}
	return {
		...(projectId ? { projectId } : {}),
		scope,
		...(owner ? { owner } : {}),
		...(params.projectNumber !== undefined ? { projectNumber: normalizePositiveInteger(params.projectNumber, "projectNumber") } : {}),
		fieldLimit: normalizeLimit(params.fieldLimit, MAX_TOOL_PROJECT_FIELDS, DEFAULT_PROJECT_FIELD_LIMIT, "fieldLimit"),
		optionLimit: normalizeLimit(params.optionLimit, MAX_TOOL_PROJECT_FIELD_OPTIONS, DEFAULT_PROJECT_FIELD_OPTION_LIMIT, "optionLimit"),
		iterationLimit: normalizeLimit(params.iterationLimit, MAX_TOOL_PROJECT_ITERATIONS, DEFAULT_PROJECT_ITERATION_LIMIT, "iterationLimit"),
	};
}

function normalizeAddIssueToProjectParams(params: AddIssueToProjectToolParams): NormalizedAddIssueToProjectParams {
	const scope = params.scope === undefined ? undefined : normalizeScope(params.scope);
	const owner = normalizeOptionalText(params.owner, "owner");
	if (scope === undefined && owner) {
		throw new IssueMeError("invalid_tool_input", "scope is required when owner is provided for Projects v2 add preflight.", { field: "scope" });
	}
	if (scope !== undefined) assertProjectOwnerScope(scope, owner);
	return {
		issueNumber: normalizePositiveInteger(params.issueNumber, "issueNumber"),
		projectId: normalizeRequiredProjectId(params.projectId, "projectId"),
		...(scope ? { scope } : {}),
		...(owner ? { owner } : {}),
	};
}

function normalizeUpdateProjectItemParams(params: UpdateProjectItemToolParams): NormalizedUpdateProjectItemParams {
	const valueType = normalizeProjectFieldValueType(params.valueType);
	return {
		projectId: normalizeRequiredProjectId(params.projectId, "projectId"),
		itemId: normalizeRequiredProjectId(params.itemId, "itemId"),
		fieldId: normalizeRequiredProjectId(params.fieldId, "fieldId"),
		issueNumber: normalizePositiveInteger(params.issueNumber, "issueNumber"),
		valueType,
		value: normalizeProjectFieldValue(params, valueType),
	};
}

function normalizeProjectFieldValueType(value: GitHubProjectV2FieldValueType | undefined): GitHubProjectV2FieldValueType {
	if (value === "single_select" || value === "iteration" || value === "date" || value === "text" || value === "number") return value;
	throw new IssueMeError("invalid_tool_input", "valueType must be single_select, iteration, date, text, or number.", { field: "valueType" });
}

function normalizeProjectFieldValue(params: UpdateProjectItemToolParams, valueType: GitHubProjectV2FieldValueType): GitHubProjectV2FieldValueInput {
	const valueFields = Object.values(UPDATE_PROJECT_ITEM_VALUE_FIELDS).flatMap((fields) => fields);
	const expectedField = UPDATE_PROJECT_ITEM_VALUE_FIELDS[valueType][0];
	const providedFields = valueFields.filter((field) => params[field] !== undefined);
	if (providedFields.length !== 1 || providedFields[0] !== expectedField) {
		throw new IssueMeError("invalid_tool_input", `valueType ${valueType} requires exactly ${expectedField}.`, { field: expectedField, providedFields });
	}
	if (valueType === "single_select") return { singleSelectOptionId: normalizeRequiredProjectId(params.singleSelectOptionId, "singleSelectOptionId") };
	if (valueType === "iteration") return { iterationId: normalizeRequiredProjectId(params.iterationId, "iterationId") };
	if (valueType === "date") return { date: normalizeDateValue(params.date) };
	if (valueType === "text") return { text: normalizeTextValue(params.text) };
	return { number: normalizeNumberValue(params.numberValue) };
}

function normalizeScope(value: GitHubProjectV2Scope | undefined): GitHubProjectV2Scope {
	if (value === undefined) return "repository";
	if (value === "repository" || value === "organization" || value === "user") return value;
	throw new IssueMeError("invalid_tool_input", "scope must be repository, organization, or user.", { field: "scope" });
}

function assertProjectOwnerScope(scope: GitHubProjectV2Scope, owner: string | undefined): void {
	if (scope === "repository" && owner) {
		throw new IssueMeError("invalid_tool_input", "owner is only supported when scope is organization or user; repository scope uses the resolved current repository.", { field: "owner", scope });
	}
}

function normalizeOptionalText(value: string | undefined, field: string): string | undefined {
	return normalizeOptionalTextFilter(value, field);
}

function normalizeOptionalProjectId(value: string | undefined, field: string): string | undefined {
	return normalizeOptionalGitHubOpaqueId(value, field);
}

function normalizeRequiredProjectId(value: string | undefined, field: string): string {
	return normalizeRequiredGitHubOpaqueId(value, field);
}

function normalizeDateValue(value: string | undefined): string {
	return normalizeRequiredIsoDateOnly(value, "date", { invalidMessage: "date must be a valid YYYY-MM-DD date for GitHub Projects v2 date fields." });
}

function normalizeTextValue(value: string | undefined): string {
	if (typeof value !== "string") throw new IssueMeError("invalid_tool_input", "text is required for text project fields.", { field: "text" });
	assertNoNullBytes(value, "text", "text project field value must not contain null bytes.");
	if (!value.trim()) throw new IssueMeError("invalid_tool_input", "text project field value must not be blank.", { field: "text" });
	return value;
}

function normalizeNumberValue(value: number | undefined): number {
	if (typeof value !== "number" || !Number.isFinite(value)) throw new IssueMeError("invalid_tool_input", "numberValue must be a finite number for number project fields.", { field: "numberValue" });
	return value;
}

function normalizeLimit(value: number | undefined, max: number, defaultValue: number, field: string): number {
	return normalizeBoundedToolLimit(value, { field, max, defaultValue });
}

function normalizePositiveInteger(value: number | undefined, field: string): number {
	return normalizePositiveSafeInteger(value, field);
}

function formatListProjectsText(
	owner: string,
	params: NormalizedListProjectsParams,
	projects: ToolProjectSummary[],
	truncated: boolean,
): string {
	const filters = [
		`scope: ${params.scope}`,
		params.owner ? `owner: ${params.owner}` : undefined,
		params.query ? `query: ${params.query}` : undefined,
		params.includeClosed ? "including closed projects" : "open projects only",
	].filter((value): value is string => value !== undefined);
	const lines = [
		`Listed ${projects.length} GitHub Projects v2 board(s) for ${owner}.`,
		`Limit: ${params.limit}; ${filters.join("; ")}.`,
		"This tool is read-only; it does not add issues to projects or update project fields.",
		"",
		projects.length ? undefined : "No GitHub Projects v2 boards matched the request.",
		...projects.map(formatProjectLine),
		truncated ? `Results truncated at ${params.limit} project(s); narrow query/scope filters or increase limit up to ${MAX_TOOL_PROJECTS}.` : undefined,
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatProjectFieldsText(
	project: ToolProjectSummary,
	fields: ToolProjectFieldSummary[],
	params: NormalizedGetProjectFieldsParams,
	truncated: boolean,
): string {
	const lookup = params.projectId ? `projectId: ${params.projectId}` : `scope: ${params.scope}; projectNumber: ${params.projectNumber}`;
	const lines = [
		`Listed ${fields.length} field(s) for GitHub Projects v2 board #${project.number} ${project.title}.`,
		`${lookup}; fieldLimit: ${params.fieldLimit}; optionLimit: ${params.optionLimit}; iterationLimit: ${params.iterationLimit}.`,
		"This tool is read-only; it does not add project items or update project fields.",
		"",
		fields.length ? undefined : "No fields were returned for this GitHub Projects v2 board.",
		...fields.flatMap(formatProjectFieldLines),
		truncated ? "Project field results were truncated; narrow limits only when you already know the needed field." : undefined,
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatAddIssueToProjectText(item: ToolProjectItemSummary): string {
	const issue = item.issue ? `issue #${item.issue.number} ${item.issue.title}` : "the requested issue";
	const project = item.project ? `GitHub Projects v2 board #${item.project.number} ${item.project.title}` : "the GitHub Projects v2 board";
	return [
		`Added or confirmed ${issue} on ${project}.`,
		`Project item ID: ${item.id}.`,
		"If the issue was already on the project, GitHub returns the existing item and no duplicate is created.",
	].join("\n");
}

function formatUpdateProjectItemText(item: ToolProjectItemSummary, params: NormalizedUpdateProjectItemParams): string {
	const project = item.project ? ` on GitHub Projects v2 board #${item.project.number} ${item.project.title}` : "";
	return [
		`Updated project item ${item.id}${project}.`,
		`Changed field: ${params.fieldId} (${params.valueType}).`,
		"Use issueme_get_project_fields to verify field IDs, single-select options, or iteration IDs before further updates.",
	].join("\n");
}

function formatProjectLine(project: ToolProjectSummary): string {
	const state = project.closed === true ? "closed" : "open";
	const visibility = project.public === true ? "public" : project.public === false ? "private" : undefined;
	const metadata = [state, visibility, `${project.ownerType}: ${project.owner}`].filter((value): value is string => value !== undefined).join(", ");
	return [
		`- #${project.number} ${project.title} (${metadata})`,
		` id: ${project.id}`,
		project.shortDescription ? ` — ${project.shortDescription}` : "",
		project.url ? ` — ${project.url}` : "",
	].join("");
}

function formatProjectFieldLines(field: ToolProjectFieldSummary): string[] {
	const lines = [`- ${field.name} (${field.dataType}${field.type ? `, ${field.type}` : ""}) id: ${field.id}`];
	if (field.options?.length) lines.push(`  options: ${field.options.map(formatProjectFieldOption).join(", ")}`);
	if (field.iterations?.length) lines.push(`  iterations: ${field.iterations.map(formatProjectIteration).join(", ")}`);
	if (field.completedIterations?.length) lines.push(`  completed iterations: ${field.completedIterations.map(formatProjectIteration).join(", ")}`);
	if (field.truncated) lines.push("  field metadata truncated; inspect details.truncation for counts.");
	return lines;
}

function formatProjectFieldOption(option: { name: string; color?: string }): string {
	return `${option.name}${option.color ? ` (${option.color})` : ""}`;
}

function formatProjectIteration(iteration: { title: string; startDate?: string; duration?: number }): string {
	const metadata = [iteration.startDate, iteration.duration !== undefined ? `${iteration.duration}d` : undefined]
		.filter((value): value is string => value !== undefined)
		.join("/");
	return `${iteration.title}${metadata ? ` (${metadata})` : ""}`;
}
