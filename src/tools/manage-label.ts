import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { ISSUEME_ERROR_CODES, GitHubApiError, IssueMeError } from "../errors.ts";
import type { GitHubRepositoryLabelCreateInput, GitHubRepositoryLabelUpdateInput } from "../github/client.ts";
import type { GitHubLabelResponse, IssueMeToolDetails, ToolLabelSummary } from "../types.ts";
import { assertMaxLength, assertNoNullBytes, assertOneLine, normalizeRequiredTrimmedText } from "../utils/validation.ts";
import { createIssueMeRuntime, safeToolError, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const MAX_LABEL_NAME_CHARS = 50;
const MAX_LABEL_DESCRIPTION_CHARS = 100;
const LABEL_COLOR_PATTERN = /^[0-9a-f]{6}$/i;

const ManageLabelParams = Type.Object(
	{
		action: StringEnum(["create", "update", "delete"] as const, { description: "Label action." }),
		name: Type.String({ description: "Label name; existing name for update/delete." }),
		newName: Type.Optional(Type.String({ description: "New name for update." })),
		color: Type.Optional(Type.String({ description: "Hex color; # accepted." })),
		description: Type.Optional(Type.String({ description: "Label description; '' clears on update." })),
		confirmDelete: Type.Optional(Type.Boolean({ description: "Required true to delete." })),
	},
	{ additionalProperties: false },
);

type ManageLabelToolParams = Static<typeof ManageLabelParams>;
type LabelManagementAction = ManageLabelToolParams["action"];
type LabelActionSpecificField = Exclude<keyof ManageLabelToolParams, "action" | "name">;

export const MANAGE_LABEL_COMMON_FIELDS = ["action", "name"] as const satisfies readonly (keyof ManageLabelToolParams)[];
export const MANAGE_LABEL_ACTION_FIELDS = {
	create: ["color", "description"],
	update: ["newName", "color", "description"],
	delete: ["confirmDelete"],
} as const satisfies Record<LabelManagementAction, readonly LabelActionSpecificField[]>;

interface NormalizedManageLabelParams {
	action: LabelManagementAction;
	name: string;
	newName?: string;
	color?: string;
	description?: string;
	changedFields: string[];
}

export function registerManageLabelTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_manage_label",
			label: "IssueMe Manage Repository Label",
			description: "Create, update, or delete repo labels.",
			promptSnippet: "Create/update/delete repo labels.",
			promptGuidelines: [
				"Use issueme_manage_label for label taxonomy, not issue assignment; delete requires explicit user intent, warning, and confirmDelete true.",
			],
			executionMode: "sequential",
			parameters: ManageLabelParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeManageLabelParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				try {
					if (normalized.action === "create") {
						const label = await runtime.client.createRepositoryLabel(buildCreateRepositoryLabelInput(normalized), signal);
						const summary = normalizeLabelSummary(label, normalized.name);
						return toolText(formatManagedLabelText("created", runtime.repository, summary, normalized), managedLabelDetails(runtime.repository, "label_created", summary, normalized.changedFields));
					}

					if (normalized.action === "update") {
						const label = await runtime.client.updateRepositoryLabel(normalized.name, buildUpdateRepositoryLabelInput(normalized), signal);
						const summary = normalizeLabelSummary(label, normalized.newName ?? normalized.name);
						return toolText(formatManagedLabelText("updated", runtime.repository, summary, normalized), managedLabelDetails(runtime.repository, "label_updated", summary, normalized.changedFields));
					}

					await runtime.client.deleteRepositoryLabel(normalized.name, signal);
					const summary = { name: normalized.name };
					return toolText(formatManagedLabelText("deleted", runtime.repository, summary, normalized), managedLabelDetails(runtime.repository, "label_deleted", summary, normalized.changedFields));
				} catch (error) {
					const handled = handledKnownLabelApiResult(error, runtime.repository, normalized);
					if (handled) return handled;
					throw error;
				}
			},
		}),
	);
}

function buildCreateRepositoryLabelInput(params: NormalizedManageLabelParams): GitHubRepositoryLabelCreateInput {
	const input: GitHubRepositoryLabelCreateInput = {
		name: params.name,
		color: requireNormalizedColor(params.color),
	};
	if (typeof params.description === "string") input.description = params.description;
	return input;
}

function buildUpdateRepositoryLabelInput(params: NormalizedManageLabelParams): GitHubRepositoryLabelUpdateInput {
	const input: GitHubRepositoryLabelUpdateInput = {};
	if (typeof params.newName === "string") input.new_name = params.newName;
	if (typeof params.color === "string") input.color = params.color;
	if (typeof params.description === "string") input.description = params.description;
	return input;
}

function normalizeManageLabelParams(params: ManageLabelToolParams): NormalizedManageLabelParams {
	const action = normalizeAction(params.action);
	const name = normalizeLabelName(params.name, "name");
	assertManageLabelActionFields(params, action);
	if (action === "create") return normalizeCreateLabelParams(params, name);
	if (action === "update") return normalizeUpdateLabelParams(params, name);
	return normalizeDeleteLabelParams(params, name);
}

function normalizeCreateLabelParams(params: ManageLabelToolParams, name: string): NormalizedManageLabelParams {
	const normalized: NormalizedManageLabelParams = {
		action: "create",
		name,
		color: normalizeLabelColor(params.color, true),
		changedFields: ["name", "color"],
	};
	assignNormalizedLabelDescription(normalized, params.description);
	return normalized;
}

function normalizeUpdateLabelParams(params: ManageLabelToolParams, name: string): NormalizedManageLabelParams {
	assertNoUpdateConfirmDelete(params);
	const normalized: NormalizedManageLabelParams = { action: "update", name, changedFields: [] };
	assignNormalizedLabelNewName(normalized, params.newName);
	assignNormalizedLabelColor(normalized, params.color);
	assignNormalizedLabelDescription(normalized, params.description);
	if (normalized.changedFields.length > 0) return normalized;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Label update requires at least one of newName, color, or description.", { action: "update", fields: ["newName", "color", "description"] });
}

function normalizeDeleteLabelParams(params: ManageLabelToolParams, name: string): NormalizedManageLabelParams {
	if (params.confirmDelete === true) return { action: "delete", name, changedFields: ["deleted"] };
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Label deletion requires confirmDelete: true after explicit user confirmation.", { action: "delete", field: "confirmDelete" });
}

function assertNoUpdateConfirmDelete(params: ManageLabelToolParams): void {
	if (typeof params.confirmDelete === "boolean") throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "confirmDelete is only valid for label deletion.", { field: "confirmDelete" });
}

function assignNormalizedLabelNewName(normalized: NormalizedManageLabelParams, value: string | undefined): void {
	const newName = normalizeOptionalLabelName(value, "newName");
	if (typeof newName === "string") {
		normalized.newName = newName;
		normalized.changedFields.push("name");
	}
}

function assignNormalizedLabelColor(normalized: NormalizedManageLabelParams, value: string | undefined): void {
	const color = normalizeOptionalLabelColor(value);
	if (typeof color === "string") {
		normalized.color = color;
		normalized.changedFields.push("color");
	}
}

function assignNormalizedLabelDescription(normalized: NormalizedManageLabelParams, value: string | undefined): void {
	const description = normalizeOptionalLabelDescription(value);
	if (typeof description === "string") {
		normalized.description = description;
		normalized.changedFields.push("description");
	}
}

function normalizeOptionalLabelName(value: string | undefined, field: string): string | undefined {
	if (typeof value === "string") return normalizeLabelName(value, field);
	return undefined;
}

function normalizeOptionalLabelColor(value: string | undefined): string | undefined {
	if (typeof value === "string") return normalizeLabelColor(value, false);
	return undefined;
}

function normalizeOptionalLabelDescription(value: string | undefined): string | undefined {
	if (typeof value === "string") return normalizeLabelDescription(value);
	return undefined;
}

function normalizeAction(value: LabelManagementAction | undefined): LabelManagementAction {
	if (value === "create" || value === "update" || value === "delete") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Label action must be create, update, or delete.", { field: "action" });
}

function assertManageLabelActionFields(params: ManageLabelToolParams, action: LabelManagementAction): void {
	const allowed = new Set([...MANAGE_LABEL_COMMON_FIELDS, ...MANAGE_LABEL_ACTION_FIELDS[action]]);
	const actionFields = Object.values(MANAGE_LABEL_ACTION_FIELDS).flat();
	const unexpected = actionFields.filter((field) => isUnexpectedManageLabelActionField(params, field, allowed));
	if (unexpected.length > 0) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			`Fields ${unexpected.join(", ")} do not apply to label action ${action}.`,
			{ fields: unexpected, action },
		);
	}
}

function isUnexpectedManageLabelActionField(params: ManageLabelToolParams, field: LabelActionSpecificField, allowed: ReadonlySet<keyof ManageLabelToolParams>): boolean {
	if (allowed.has(field)) return false;
	return hasManageLabelActionField(params, field);
}

function hasManageLabelActionField(params: ManageLabelToolParams, field: LabelActionSpecificField): boolean {
	if (typeof params[field] === "undefined") return false;
	return true;
}

function normalizeLabelName(value: string | undefined, field: string): string {
	return normalizeRequiredTrimmedText(value, field, { oneLine: true, maxLength: MAX_LABEL_NAME_CHARS });
}

function normalizeLabelColor(value: string | undefined, required: boolean): string | undefined {
	if (typeof value === "string") return normalizeLabelColorValue(value);
	if (required) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Label color is required for create.", { field: "color" });
	return undefined;
}

function normalizeLabelColorValue(value: string): string {
	const normalized = value.trim().replace(/^#/, "").toLowerCase();
	if (LABEL_COLOR_PATTERN.test(normalized)) return normalized;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Label color must be a six-character hex value such as d73a4a.", { field: "color" });
}

function requireNormalizedColor(value: string | undefined): string {
	if (typeof value === "string") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Label color is required for create.", { field: "color" });
}

function normalizeLabelDescription(value: string): string {
	const trimmed = value.trim();
	assertNoNullBytes(trimmed, "description");
	assertOneLine(trimmed, "description");
	assertMaxLength(trimmed, "description", MAX_LABEL_DESCRIPTION_CHARS);
	return trimmed;
}

function handledKnownLabelApiResult(error: unknown, repository: string, params: NormalizedManageLabelParams): ReturnType<typeof toolText> | undefined {
	if (error instanceof GitHubApiError) return handledKnownGitHubLabelApiResult(error, repository, params);
	return undefined;
}

function handledKnownGitHubLabelApiResult(error: GitHubApiError, repository: string, params: NormalizedManageLabelParams): ReturnType<typeof toolText> | undefined {
	if (params.action === "delete" && error.status === 404) {
		const summary = { name: params.name };
		return toolText(`Repository label "${params.name}" is already absent in ${repository}; no remote label was deleted.`, managedLabelDetails(repository, "label_already_absent", summary, params.changedFields));
	}
	if (params.action === "create" && error.status === 422) {
		return knownLabelApiError(repository, params, "label_create_conflict", `GitHub rejected creating repository label "${params.name}". If the label already exists, use issueme_manage_label with action "update" instead.`, error);
	}
	if (params.action === "update" && error.status === 404) {
		return knownLabelApiError(repository, params, "label_not_found", `Repository label "${params.name}" was not found in ${repository}; create it first or check the label name.`, error);
	}
	if (params.action === "update" && error.status === 422) {
		return knownLabelApiError(repository, params, "label_update_conflict", `GitHub rejected updating repository label "${params.name}". Check for duplicate target names or invalid remote label state.`, error);
	}
	return undefined;
}

function knownLabelApiError(
	repository: string,
	params: NormalizedManageLabelParams,
	status: string,
	message: string,
	error: GitHubApiError,
): ReturnType<typeof toolText> {
	return toolText(message, {
		repository,
		status,
		labels: [knownLabelApiErrorSummary(params)],
		changedFields: params.changedFields,
		cacheUpdated: false,
		needsSync: false,
		result: "error",
		message,
		error: safeToolError(error),
	});
}

function knownLabelApiErrorSummary(params: NormalizedManageLabelParams): ToolLabelSummary {
	const summary: ToolLabelSummary = { name: params.newName ?? params.name };
	if (params.color) summary.color = params.color;
	if (typeof params.description === "string") summary.description = params.description;
	return summary;
}

function managedLabelDetails(repository: string, status: string, label: ToolLabelSummary, changedFields: string[]): IssueMeToolDetails {
	return {
		repository,
		status,
		labels: [label],
		changedFields,
		cacheUpdated: false,
		needsSync: false,
	};
}

function normalizeLabelSummary(label: GitHubLabelResponse, fallbackName: string): ToolLabelSummary {
	const name = typeof label.name === "string" && label.name.trim() ? label.name.trim() : fallbackName;
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

function formatManagedLabelText(
	verb: "created" | "updated" | "deleted",
	repository: string,
	label: ToolLabelSummary,
	params: NormalizedManageLabelParams,
): string {
	if (verb === "deleted") {
		return `Deleted repository label "${label.name}" from ${repository}. This does not delete issues, but GitHub removes the label from repository taxonomy and existing issue associations.`;
	}
	const metadata = formatManagedLabelMetadata(label, params);
	const metadataText = formatManagedLabelMetadataText(metadata);
	const rename = formatManagedLabelRename(params);
	const actionText = formatManagedLabelActionText(verb);
	return `${actionText} repository label "${label.name}"${rename} for ${repository}${metadataText}.`;
}

function formatManagedLabelMetadata(label: ToolLabelSummary, params: NormalizedManageLabelParams): string {
	return [
		formatManagedLabelColor(label, params),
		formatManagedLabelDescription(label, params),
	].filter(isStringValue).join("; ");
}

function formatManagedLabelColor(label: ToolLabelSummary, params: NormalizedManageLabelParams): string | undefined {
	if (label.color) return `#${label.color}`;
	if (params.color) return `#${params.color}`;
	return undefined;
}

function formatManagedLabelDescription(label: ToolLabelSummary, params: NormalizedManageLabelParams): string | undefined {
	if (label.description) return `description: ${label.description}`;
	if (params.description === "") return "description cleared";
	return undefined;
}

function formatManagedLabelMetadataText(metadata: string): string {
	if (metadata) return ` (${metadata})`;
	return "";
}

function formatManagedLabelRename(params: NormalizedManageLabelParams): string {
	if (params.action === "create") return "";
	return formatUpdatedManagedLabelRename(params);
}

function formatUpdatedManagedLabelRename(params: NormalizedManageLabelParams): string {
	if (typeof params.newName === "string") return formatChangedManagedLabelName(params.name, params.newName);
	return "";
}

function formatChangedManagedLabelName(name: string, newName: string): string {
	if (newName === name) return "";
	return ` (renamed from "${name}")`;
}

function formatManagedLabelActionText(verb: "created" | "updated"): string {
	if (verb === "created") return "Created";
	return "Updated";
}

function isStringValue(value: string | undefined): value is string {
	return typeof value === "string";
}
