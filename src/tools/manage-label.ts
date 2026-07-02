import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { ISSUEME_ERROR_CODES, GitHubApiError, IssueMeError } from "../errors.ts";
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
						const label = await runtime.client.createRepositoryLabel({
							name: normalized.name,
							color: requireNormalizedColor(normalized.color),
							...(normalized.description !== undefined ? { description: normalized.description } : {}),
						}, signal);
						const summary = normalizeLabelSummary(label, normalized.name);
						return toolText(formatManagedLabelText("created", runtime.repository, summary, normalized), managedLabelDetails(runtime.repository, "label_created", summary, normalized.changedFields));
					}

					if (normalized.action === "update") {
						const label = await runtime.client.updateRepositoryLabel(normalized.name, {
							...(normalized.newName !== undefined ? { new_name: normalized.newName } : {}),
							...(normalized.color !== undefined ? { color: normalized.color } : {}),
							...(normalized.description !== undefined ? { description: normalized.description } : {}),
						}, signal);
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

function normalizeManageLabelParams(params: ManageLabelToolParams): NormalizedManageLabelParams {
	const action = normalizeAction(params.action);
	const name = normalizeLabelName(params.name, "name");
	assertManageLabelActionFields(params, action);
	if (action === "create") {
		return {
			action,
			name,
			color: normalizeLabelColor(params.color, true),
			...(params.description !== undefined ? { description: normalizeLabelDescription(params.description) } : {}),
			changedFields: params.description !== undefined ? ["name", "color", "description"] : ["name", "color"],
		};
	}
	if (action === "update") {
		if (params.confirmDelete !== undefined) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "confirmDelete is only valid for label deletion.", { field: "confirmDelete" });
		const newName = params.newName === undefined ? undefined : normalizeLabelName(params.newName, "newName");
		const color = params.color === undefined ? undefined : normalizeLabelColor(params.color, false);
		const description = params.description === undefined ? undefined : normalizeLabelDescription(params.description);
		const changedFields = [newName !== undefined ? "name" : undefined, color !== undefined ? "color" : undefined, description !== undefined ? "description" : undefined]
			.filter((field): field is string => field !== undefined);
		if (changedFields.length === 0) {
			throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Label update requires at least one of newName, color, or description.", { action, fields: ["newName", "color", "description"] });
		}
		return {
			action,
			name,
			...(newName !== undefined ? { newName } : {}),
			...(color !== undefined ? { color } : {}),
			...(description !== undefined ? { description } : {}),
			changedFields,
		};
	}
	if (params.color !== undefined || params.newName !== undefined || params.description !== undefined) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Label deletion accepts only action, name, and confirmDelete.", { action, fields: ["action", "name", "confirmDelete"] });
	}
	if (params.confirmDelete !== true) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Label deletion requires confirmDelete: true after explicit user confirmation.", { action, field: "confirmDelete" });
	}
	return { action, name, changedFields: ["deleted"] };
}

function normalizeAction(value: LabelManagementAction | undefined): LabelManagementAction {
	if (value === "create" || value === "update" || value === "delete") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Label action must be create, update, or delete.", { field: "action" });
}

function assertManageLabelActionFields(params: ManageLabelToolParams, action: LabelManagementAction): void {
	const allowed = new Set([...MANAGE_LABEL_COMMON_FIELDS, ...MANAGE_LABEL_ACTION_FIELDS[action]]);
	const actionFields = Object.values(MANAGE_LABEL_ACTION_FIELDS).flat();
	const unexpected = actionFields.filter((field) => !allowed.has(field) && params[field] !== undefined);
	if (unexpected.length > 0) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			`Fields ${unexpected.join(", ")} do not apply to label action ${action}.`,
			{ fields: unexpected, action },
		);
	}
}

function normalizeLabelName(value: string | undefined, field: string): string {
	return normalizeRequiredTrimmedText(value, field, { oneLine: true, maxLength: MAX_LABEL_NAME_CHARS });
}

function normalizeLabelColor(value: string | undefined, required: boolean): string | undefined {
	if (typeof value !== "string") {
		if (!required) return undefined;
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Label color is required for create.", { field: "color" });
	}
	const normalized = value.trim().replace(/^#/, "").toLowerCase();
	if (!LABEL_COLOR_PATTERN.test(normalized)) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Label color must be a six-character hex value such as d73a4a.", { field: "color" });
	}
	return normalized;
}

function requireNormalizedColor(value: string | undefined): string {
	if (value !== undefined) return value;
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
	if (!(error instanceof GitHubApiError)) return undefined;
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
		labels: [{ name: params.newName ?? params.name, ...(params.color ? { color: params.color } : {}), ...(params.description !== undefined ? { description: params.description } : {}) }],
		changedFields: params.changedFields,
		cacheUpdated: false,
		needsSync: false,
		result: "error",
		message,
		error: safeToolError(error),
	});
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
	const metadata = [
		label.color ? `#${label.color}` : params.color ? `#${params.color}` : undefined,
		label.description ? `description: ${label.description}` : params.description === "" ? "description cleared" : undefined,
	].filter((value): value is string => value !== undefined).join("; ");
	const rename = params.action === "update" && params.newName && params.newName !== params.name ? ` (renamed from "${params.name}")` : "";
	return `${verb === "created" ? "Created" : "Updated"} repository label "${label.name}"${rename} for ${repository}${metadata ? ` (${metadata})` : ""}.`;
}
