import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { ISSUEME_ERROR_CODES, GitHubApiError, IssueMeError, isRemoteMutationSuccessKnown } from "../errors.ts";
import type { GitHubRepositoryMilestoneCreateInput, GitHubRepositoryMilestoneUpdateInput } from "../github/client.ts";
import type { GitHubMilestoneResponse, IssueMeToolDetails, ToolMilestoneSummary } from "../types.ts";
import { assertMaxLength, assertNoNullBytes, normalizePositiveSafeInteger, normalizeRequiredTrimmedText } from "../utils/validation.ts";
import { createIssueMeRuntime, remoteMutationPartialSuccessToolText, safeToolError, toolText, type IssueMeRuntime, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const MAX_MILESTONE_TITLE_CHARS = 256;
const MAX_MILESTONE_DESCRIPTION_CHARS = 1000;
const ISO_DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

const ManageMilestoneParams = Type.Object(
	{
		action: StringEnum(["create", "update", "close", "reopen", "delete"] as const, { description: "Milestone action." }),
		number: Type.Optional(Type.Integer({ minimum: 1, description: "Milestone number." })),
		title: Type.Optional(Type.String({ description: "Milestone title; required for create." })),
		description: Type.Optional(Type.String({ description: "Milestone description; '' clears on update." })),
		dueOn: Type.Optional(Type.String({ description: "Due date: YYYY-MM-DD or ISO timestamp." })),
		clearDueOn: Type.Optional(Type.Boolean({ description: "True clears dueOn on update." })),
		confirmDelete: Type.Optional(Type.Boolean({ description: "Required true to delete." })),
	},
	{ additionalProperties: false },
);

type ManageMilestoneToolParams = Static<typeof ManageMilestoneParams>;
type MilestoneManagementAction = ManageMilestoneToolParams["action"];
type MilestoneState = "open" | "closed";
type MilestoneActionSpecificField = Exclude<keyof ManageMilestoneToolParams, "action">;

export const MANAGE_MILESTONE_COMMON_FIELDS = ["action"] as const satisfies readonly (keyof ManageMilestoneToolParams)[];
export const MANAGE_MILESTONE_ACTION_FIELDS = {
	create: ["title", "description", "dueOn"],
	update: ["number", "title", "description", "dueOn", "clearDueOn"],
	close: ["number"],
	reopen: ["number"],
	delete: ["number", "confirmDelete"],
} as const satisfies Record<MilestoneManagementAction, readonly MilestoneActionSpecificField[]>;

interface NormalizedManageMilestoneParams {
	action: MilestoneManagementAction;
	number?: number;
	title?: string;
	description?: string;
	dueOn?: string;
	clearDueOn?: boolean;
	state?: MilestoneState;
	changedFields: string[];
}

interface ManagedMilestoneIdentity {
	number: number;
	title: string;
	state: MilestoneState;
}

type ManagedMilestoneVerb = "created" | "updated" | "closed" | "reopened" | "deleted";
type ManagedMilestoneStatus = "milestone_created" | "milestone_updated" | "milestone_closed" | "milestone_reopened" | "milestone_deleted";

export function registerManageMilestoneTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_manage_milestone",
			label: "IssueMe Manage Repository Milestone",
			description: "Create, update, close, reopen, or delete milestones.",
			promptSnippet: "Create/update/close/reopen/delete milestones.",
			promptGuidelines: [
				"Use issueme_manage_milestone for milestone planning metadata, not issue assignment; delete needs explicit intent, warning, and confirmDelete true.",
			],
			executionMode: "sequential",
			parameters: ManageMilestoneParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeManageMilestoneParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				try {
					return await executeManageMilestoneAction(runtime, normalized, signal);
				} catch (error) {
					if (isRemoteMutationSuccessKnown(error)) {
						return remoteMutationPartialSuccessToolText(
							`GitHub accepted the repository milestone ${normalized.action} request, but IssueMe could not verify the mutation response.`,
							error,
							{ repository: runtime.repository, changedFields: normalized.changedFields },
							`milestone_${normalized.action}_response_partial_success`,
						);
					}
					const handled = handledKnownMilestoneApiResult(error, runtime.repository, normalized);
					if (handled) return handled;
					throw error;
				}
			},
		}),
	);
}

async function executeManageMilestoneAction(
	runtime: IssueMeRuntime,
	params: NormalizedManageMilestoneParams,
	signal: AbortSignal | undefined,
): Promise<ReturnType<typeof toolText>> {
	switch (params.action) {
		case "create":
			return createManagedMilestone(runtime, params, signal);
		case "update":
			return updateManagedMilestone(runtime, params, signal);
		case "close":
		case "reopen":
			return changeManagedMilestoneState(runtime, params, signal);
		case "delete":
			return deleteManagedMilestone(runtime, params, signal);
	}
}

async function createManagedMilestone(runtime: IssueMeRuntime, params: NormalizedManageMilestoneParams, signal: AbortSignal | undefined): Promise<ReturnType<typeof toolText>> {
	const milestone = await runtime.client.createRepositoryMilestone(buildCreateMilestoneInput(params), signal);
	return managedMilestoneResult("created", "milestone_created", runtime.repository, milestone, params);
}

function buildCreateMilestoneInput(params: NormalizedManageMilestoneParams): GitHubRepositoryMilestoneCreateInput {
	const input: GitHubRepositoryMilestoneCreateInput = { title: requireNormalizedTitle(params.title, "title") };
	if (typeof params.description === "string") input.description = params.description;
	if (typeof params.dueOn === "string") input.due_on = params.dueOn;
	return input;
}

async function updateManagedMilestone(runtime: IssueMeRuntime, params: NormalizedManageMilestoneParams, signal: AbortSignal | undefined): Promise<ReturnType<typeof toolText>> {
	const milestone = await runtime.client.updateRepositoryMilestone(requireMilestoneNumber(params.number), buildUpdateMilestoneInput(params), signal);
	return managedMilestoneResult("updated", "milestone_updated", runtime.repository, milestone, params);
}

function buildUpdateMilestoneInput(params: NormalizedManageMilestoneParams): GitHubRepositoryMilestoneUpdateInput {
	const input: GitHubRepositoryMilestoneUpdateInput = {};
	if (typeof params.title === "string") input.title = params.title;
	if (typeof params.description === "string") input.description = params.description;
	if (typeof params.dueOn === "string") input.due_on = params.dueOn;
	if (params.clearDueOn === true) input.due_on = null;
	return input;
}

async function changeManagedMilestoneState(runtime: IssueMeRuntime, params: NormalizedManageMilestoneParams, signal: AbortSignal | undefined): Promise<ReturnType<typeof toolText>> {
	const milestone = await runtime.client.updateRepositoryMilestone(requireMilestoneNumber(params.number), { state: requireMilestoneState(params.state) }, signal);
	const result = managedMilestoneStateResult(params.action);
	return managedMilestoneResult(result.verb, result.status, runtime.repository, milestone, params);
}

function managedMilestoneStateResult(action: MilestoneManagementAction): { verb: ManagedMilestoneVerb; status: ManagedMilestoneStatus } {
	if (action === "close") return { verb: "closed", status: "milestone_closed" };
	if (action === "reopen") return { verb: "reopened", status: "milestone_reopened" };
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone state action must be close or reopen.", { action });
}

async function deleteManagedMilestone(runtime: IssueMeRuntime, params: NormalizedManageMilestoneParams, signal: AbortSignal | undefined): Promise<ReturnType<typeof toolText>> {
	await runtime.client.deleteRepositoryMilestone(requireMilestoneNumber(params.number), signal);
	return toolText(formatManagedMilestoneText("deleted", runtime.repository, undefined, params), managedMilestoneDetails(runtime.repository, "milestone_deleted", undefined, params.changedFields));
}

function managedMilestoneResult(
	verb: ManagedMilestoneVerb,
	status: ManagedMilestoneStatus,
	repository: string,
	milestone: GitHubMilestoneResponse,
	params: NormalizedManageMilestoneParams,
): ReturnType<typeof toolText> {
	const summary = normalizeMilestoneSummary(milestone, params);
	return toolText(formatManagedMilestoneText(verb, repository, summary, params), managedMilestoneDetails(repository, status, summary, params.changedFields));
}

function normalizeManageMilestoneParams(params: ManageMilestoneToolParams): NormalizedManageMilestoneParams {
	const action = normalizeAction(params.action);
	assertManageMilestoneActionFields(params, action);
	switch (action) {
		case "create":
			return normalizeCreateManageMilestoneParams(params, action);
		case "update":
			return normalizeUpdateManageMilestoneParams(params, action);
		case "close":
		case "reopen":
			return normalizeStateManageMilestoneParams(params, action);
		case "delete":
			return normalizeDeleteManageMilestoneParams(params, action);
	}
}

function normalizeCreateManageMilestoneParams(params: ManageMilestoneToolParams, action: "create"): NormalizedManageMilestoneParams {
	const description = normalizeOptionalMilestoneDescription(params.description);
	const dueOn = normalizeOptionalMilestoneDueOn(params.dueOn);
	const normalized: NormalizedManageMilestoneParams = {
		action,
		title: normalizeMilestoneTitle(params.title, "title", true),
		changedFields: buildCreateMilestoneChangedFields(params),
	};
	if (typeof description === "string") normalized.description = description;
	if (typeof dueOn === "string") normalized.dueOn = dueOn;
	return normalized;
}

function normalizeUpdateManageMilestoneParams(params: ManageMilestoneToolParams, action: "update"): NormalizedManageMilestoneParams {
	assertSingleDueOnChange(params, action);
	const title = normalizeOptionalMilestoneTitle(params.title);
	const description = normalizeOptionalMilestoneDescription(params.description);
	const dueOn = normalizeOptionalMilestoneDueOn(params.dueOn);
	const changedFields = buildUpdateMilestoneChangedFields(title, description, dueOn, params.clearDueOn);
	assertUpdateMilestoneChangedFields(changedFields, action);
	const normalized: NormalizedManageMilestoneParams = {
		action,
		number: normalizeMilestoneNumber(params.number),
		changedFields,
	};
	if (typeof title === "string") normalized.title = title;
	if (typeof description === "string") normalized.description = description;
	if (typeof dueOn === "string") normalized.dueOn = dueOn;
	if (params.clearDueOn === true) normalized.clearDueOn = true;
	return normalized;
}

function normalizeStateManageMilestoneParams(params: ManageMilestoneToolParams, action: "close" | "reopen"): NormalizedManageMilestoneParams {
	return {
		action,
		number: normalizeMilestoneNumber(params.number),
		state: milestoneStateForAction(action),
		changedFields: ["state"],
	};
}

function normalizeDeleteManageMilestoneParams(params: ManageMilestoneToolParams, action: "delete"): NormalizedManageMilestoneParams {
	assertMilestoneDeleteConfirmed(params.confirmDelete, action);
	return {
		action,
		number: normalizeMilestoneNumber(params.number),
		changedFields: ["deleted"],
	};
}

function normalizeOptionalMilestoneTitle(value: string | undefined): string | undefined {
	if (typeof value === "string") return normalizeMilestoneTitle(value, "title", false);
	return undefined;
}

function normalizeOptionalMilestoneDescription(value: string | undefined): string | undefined {
	if (typeof value === "string") return normalizeMilestoneDescription(value);
	return undefined;
}

function normalizeOptionalMilestoneDueOn(value: string | undefined): string | undefined {
	if (typeof value === "string") return normalizeMilestoneDueOn(value);
	return undefined;
}

function buildCreateMilestoneChangedFields(params: ManageMilestoneToolParams): string[] {
	const fields = ["title"];
	if (typeof params.description === "string") fields.push("description");
	if (typeof params.dueOn === "string") fields.push("due_on");
	return fields;
}

function buildUpdateMilestoneChangedFields(title: string | undefined, description: string | undefined, dueOn: string | undefined, clearDueOn: boolean | undefined): string[] {
	const fields: string[] = [];
	if (typeof title === "string") fields.push("title");
	if (typeof description === "string") fields.push("description");
	if (typeof dueOn === "string" || clearDueOn === true) fields.push("due_on");
	return fields;
}

function assertSingleDueOnChange(params: ManageMilestoneToolParams, action: "update"): void {
	if (typeof params.dueOn === "string" && params.clearDueOn === true) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Use dueOn or clearDueOn, not both.", { action, fields: ["dueOn", "clearDueOn"] });
}

function assertUpdateMilestoneChangedFields(changedFields: string[], action: "update"): void {
	if (changedFields.length > 0) return;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone update requires at least one of title, description, dueOn, or clearDueOn.", { action, fields: ["title", "description", "dueOn", "clearDueOn"] });
}

function milestoneStateForAction(action: "close" | "reopen"): MilestoneState {
	if (action === "close") return "closed";
	return "open";
}

function assertMilestoneDeleteConfirmed(confirmDelete: boolean | undefined, action: "delete"): void {
	if (confirmDelete === true) return;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone deletion requires confirmDelete: true after explicit user confirmation.", { action, field: "confirmDelete" });
}

function normalizeAction(value: MilestoneManagementAction | undefined): MilestoneManagementAction {
	if (value === "create" || value === "update" || value === "close" || value === "reopen" || value === "delete") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone action must be create, update, close, reopen, or delete.", { field: "action" });
}

function assertManageMilestoneActionFields(params: ManageMilestoneToolParams, action: MilestoneManagementAction): void {
	const allowed = new Set([...MANAGE_MILESTONE_COMMON_FIELDS, ...MANAGE_MILESTONE_ACTION_FIELDS[action]]);
	const actionFields = Object.values(MANAGE_MILESTONE_ACTION_FIELDS).flat();
	const unexpected = actionFields.filter((field) => !allowed.has(field) && params[field] !== undefined);
	if (unexpected.length > 0) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			`Fields ${unexpected.join(", ")} do not apply to milestone action ${action}.`,
			{ fields: unexpected, action },
		);
	}
}

function normalizeMilestoneNumber(value: number | undefined): number {
	return normalizePositiveSafeInteger(value, "number", { message: "Milestone number must be a positive integer." });
}

function requireMilestoneNumber(value: number | undefined): number {
	return normalizeMilestoneNumber(value);
}

function normalizeMilestoneTitle(value: string | undefined, field: string, required: true): string;
function normalizeMilestoneTitle(value: string | undefined, field: string, required: false): string | undefined;
function normalizeMilestoneTitle(value: string | undefined, field: string, required: boolean): string | undefined {
	if (typeof value === "string" || required) return normalizeRequiredTrimmedText(value, field, { oneLine: true, maxLength: MAX_MILESTONE_TITLE_CHARS });
	return undefined;
}

function requireNormalizedTitle(value: string | undefined, field: string): string {
	return normalizeMilestoneTitle(value, field, true);
}

function normalizeMilestoneDescription(value: string): string {
	const trimmed = value.trim();
	assertNoNullBytes(trimmed, "description");
	assertMaxLength(trimmed, "description", MAX_MILESTONE_DESCRIPTION_CHARS);
	return trimmed;
}

function normalizeMilestoneDueOn(value: string): string {
	const trimmed = value.trim();
	assertDueOnNotEmpty(trimmed);
	assertNoNullBytes(trimmed, "dueOn");
	const dateOnly = ISO_DATE_ONLY_PATTERN.exec(trimmed);
	if (dateOnly) return normalizeDateOnlyDueOn(trimmed, dateOnly);
	const dateTime = ISO_DATE_TIME_PATTERN.exec(trimmed);
	if (dateTime) return normalizeDateTimeDueOn(trimmed, dateTime);
	throw invalidDueOnError();
}

function assertDueOnNotEmpty(value: string): void {
	if (value.length > 0) return;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "dueOn must not be empty. Use clearDueOn to remove an existing due date.", { field: "dueOn" });
}

function normalizeDateOnlyDueOn(trimmed: string, match: RegExpExecArray): string {
	const [, year, month, day] = match;
	if (isValidUtcDate(Number(year), Number(month), Number(day))) return `${trimmed}T00:00:00Z`;
	throw invalidDueOnError();
}

function normalizeDateTimeDueOn(trimmed: string, match: RegExpExecArray): string {
	const [, year, month, day] = match;
	if (isValidDateTimeDueOn(trimmed, Number(year), Number(month), Number(day))) return trimmed;
	throw invalidDueOnError();
}

function isValidDateTimeDueOn(value: string, year: number, month: number, day: number): boolean {
	return isValidUtcDate(year, month, day) && Number.isFinite(Date.parse(value));
}

function invalidDueOnError(): IssueMeError {
	return new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "dueOn must be a valid YYYY-MM-DD date or ISO 8601 timestamp accepted by GitHub.", { field: "dueOn" });
}

function isValidUtcDate(year: number, month: number, day: number): boolean {
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function requireMilestoneState(value: MilestoneState | undefined): MilestoneState {
	if (value === "open" || value === "closed") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone state must be open or closed.", { field: "state" });
}

function handledKnownMilestoneApiResult(error: unknown, repository: string, params: NormalizedManageMilestoneParams): ReturnType<typeof toolText> | undefined {
	if (error instanceof GitHubApiError) return handledKnownGitHubMilestoneApiResult(error, repository, params);
	return undefined;
}

function handledKnownGitHubMilestoneApiResult(error: GitHubApiError, repository: string, params: NormalizedManageMilestoneParams): ReturnType<typeof toolText> | undefined {
	if (params.action === "delete" && error.status === 404) {
		return toolText(`Repository milestone #${params.number} is already absent in ${repository}; no remote milestone was deleted.`, managedMilestoneDetails(repository, "milestone_already_absent", undefined, params.changedFields));
	}
	if (params.action === "create" && error.status === 422) {
		return knownMilestoneApiError(repository, params, "milestone_create_conflict", `GitHub rejected creating repository milestone "${params.title}". Check for a duplicate title or invalid milestone state.`, error);
	}
	if ((params.action === "update" || params.action === "close" || params.action === "reopen") && error.status === 404) {
		return knownMilestoneApiError(repository, params, "milestone_not_found", `Repository milestone #${params.number} was not found in ${repository}; list milestones and check the milestone number.`, error);
	}
	if ((params.action === "update" || params.action === "close" || params.action === "reopen") && error.status === 422) {
		return knownMilestoneApiError(repository, params, "milestone_update_conflict", `GitHub rejected updating repository milestone #${params.number}. Check title, state, due date, or remote milestone state.`, error);
	}
	return undefined;
}

function knownMilestoneApiError(
	repository: string,
	params: NormalizedManageMilestoneParams,
	status: string,
	message: string,
	error: GitHubApiError,
): ReturnType<typeof toolText> {
	return toolText(message, {
		repository,
		status,
		changedFields: params.changedFields,
		cacheUpdated: false,
		needsSync: false,
		result: "error",
		message,
		error: safeToolError(error),
	});
}

function managedMilestoneDetails(repository: string, status: string, milestone: ToolMilestoneSummary | undefined, changedFields: string[]): IssueMeToolDetails {
	return {
		repository,
		status,
		...(milestone ? { milestones: [milestone] } : {}),
		changedFields,
		cacheUpdated: false,
		needsSync: false,
	};
}

function normalizeMilestoneSummary(milestone: GitHubMilestoneResponse, fallback: NormalizedManageMilestoneParams): ToolMilestoneSummary | undefined {
	const identity = normalizeManagedMilestoneIdentity(milestone, fallback);
	if (identity) return buildManagedMilestoneSummary(identity, milestone, fallback);
	return undefined;
}

function normalizeManagedMilestoneIdentity(milestone: GitHubMilestoneResponse, fallback: NormalizedManageMilestoneParams): ManagedMilestoneIdentity | undefined {
	const number = normalizeManagedMilestoneNumber(milestone.number, fallback.number);
	const title = normalizeManagedMilestoneText(milestone.title, fallback.title);
	const state = normalizeManagedMilestoneState(milestone.state, fallback.state);
	if (typeof number === "number" && typeof title === "string" && typeof state === "string") return { number, title, state };
	return undefined;
}

function normalizeManagedMilestoneNumber(value: unknown, fallback: number | undefined): number | undefined {
	if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
	return fallback;
}

function normalizeManagedMilestoneText(value: unknown, fallback: string | undefined): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed) return trimmed;
	}
	return fallback;
}

function normalizeManagedMilestoneState(value: unknown, fallback: MilestoneState | undefined): MilestoneState | undefined {
	if (value === "open" || value === "closed") return value;
	return fallback;
}

function buildManagedMilestoneSummary(identity: ManagedMilestoneIdentity, milestone: GitHubMilestoneResponse, fallback: NormalizedManageMilestoneParams): ToolMilestoneSummary {
	const summary: ToolMilestoneSummary = { ...identity };
	assignManagedMilestoneText(summary, "description", milestone.description, fallback.description);
	assignManagedMilestoneText(summary, "due_on", milestone.due_on, fallback.dueOn);
	assignManagedMilestoneCount(summary, "open_issues", milestone.open_issues);
	assignManagedMilestoneCount(summary, "closed_issues", milestone.closed_issues);
	assignManagedMilestoneText(summary, "html_url", milestone.html_url, undefined);
	assignManagedMilestoneText(summary, "url", milestone.url, undefined);
	return summary;
}

function assignManagedMilestoneText(summary: ToolMilestoneSummary, field: "description" | "due_on" | "html_url" | "url", value: unknown, fallback: string | undefined): void {
	const normalized = normalizeManagedMilestoneText(value, fallback);
	if (typeof normalized === "string") summary[field] = normalized;
}

function assignManagedMilestoneCount(summary: ToolMilestoneSummary, field: "open_issues" | "closed_issues", value: unknown): void {
	const normalized = normalizeCount(value);
	if (typeof normalized === "number") summary[field] = normalized;
}

function normalizeCount(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function formatManagedMilestoneText(
	verb: ManagedMilestoneVerb,
	repository: string,
	milestone: ToolMilestoneSummary | undefined,
	params: NormalizedManageMilestoneParams,
): string {
	if (verb === "deleted") {
		return `Deleted repository milestone #${params.number} from ${repository}. This does not delete issues, but GitHub removes the milestone association from existing issues.`;
	}
	const number = milestone?.number ?? params.number;
	const title = milestone?.title ?? params.title ?? `#${number}`;
	const metadata = [
		formatMilestoneStateMetadata(milestone, params),
		formatMilestoneDueMetadata(milestone, params),
		formatMilestoneDescriptionMetadata(milestone, params),
	].filter((value): value is string => value !== undefined).join("; ");
	const numberText = formatMilestoneNumberText(number);
	const metadataText = formatMilestoneMetadataText(metadata);
	return `${capitalize(verb)} repository milestone${numberText} "${title}" for ${repository}${metadataText}.`;
}

function formatMilestoneStateMetadata(milestone: ToolMilestoneSummary | undefined, params: NormalizedManageMilestoneParams): string | undefined {
	if (milestone?.state) return `state: ${milestone.state}`;
	if (params.state) return `state: ${params.state}`;
	return undefined;
}

function formatMilestoneDueMetadata(milestone: ToolMilestoneSummary | undefined, params: NormalizedManageMilestoneParams): string | undefined {
	if (milestone?.due_on) return `due: ${milestone.due_on}`;
	if (params.clearDueOn) return "due date cleared";
	if (params.dueOn) return `due: ${params.dueOn}`;
	return undefined;
}

function formatMilestoneDescriptionMetadata(milestone: ToolMilestoneSummary | undefined, params: NormalizedManageMilestoneParams): string | undefined {
	if (milestone?.description) return `description: ${milestone.description}`;
	if (params.description === "") return "description cleared";
	return undefined;
}

function formatMilestoneNumberText(number: number | undefined): string {
	if (typeof number === "number") return ` #${number}`;
	return "";
}

function formatMilestoneMetadataText(metadata: string): string {
	if (metadata) return ` (${metadata})`;
	return "";
}

function capitalize(value: string): string {
	return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
