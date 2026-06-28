import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { ISSUEME_ERROR_CODES, GitHubApiError, IssueMeError } from "../errors.ts";
import type { GitHubMilestoneResponse, IssueMeToolDetails, ToolMilestoneSummary } from "../types.ts";
import { createIssueMeRuntime, safeToolError, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

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

type MilestoneManagementAction = "create" | "update" | "close" | "reopen" | "delete";
type MilestoneState = "open" | "closed";

interface ManageMilestoneToolParams {
	action?: MilestoneManagementAction;
	number?: number;
	title?: string;
	description?: string;
	dueOn?: string;
	clearDueOn?: boolean;
	confirmDelete?: boolean;
}

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
				const normalized = normalizeManageMilestoneParams(params as ManageMilestoneToolParams);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				try {
					if (normalized.action === "create") {
						const milestone = await runtime.client.createRepositoryMilestone({
							title: requireNormalizedTitle(normalized.title, "title"),
							...(normalized.description !== undefined ? { description: normalized.description } : {}),
							...(normalized.dueOn !== undefined ? { due_on: normalized.dueOn } : {}),
						}, signal);
						const summary = normalizeMilestoneSummary(milestone, normalized);
						return toolText(formatManagedMilestoneText("created", runtime.repository, summary, normalized), managedMilestoneDetails(runtime.repository, "milestone_created", summary, normalized.changedFields));
					}

					if (normalized.action === "update") {
						const milestone = await runtime.client.updateRepositoryMilestone(requireMilestoneNumber(normalized.number), {
							...(normalized.title !== undefined ? { title: normalized.title } : {}),
							...(normalized.description !== undefined ? { description: normalized.description } : {}),
							...(normalized.dueOn !== undefined ? { due_on: normalized.dueOn } : {}),
							...(normalized.clearDueOn ? { due_on: null } : {}),
						}, signal);
						const summary = normalizeMilestoneSummary(milestone, normalized);
						return toolText(formatManagedMilestoneText("updated", runtime.repository, summary, normalized), managedMilestoneDetails(runtime.repository, "milestone_updated", summary, normalized.changedFields));
					}

					if (normalized.action === "close" || normalized.action === "reopen") {
						const milestone = await runtime.client.updateRepositoryMilestone(requireMilestoneNumber(normalized.number), { state: requireMilestoneState(normalized.state) }, signal);
						const summary = normalizeMilestoneSummary(milestone, normalized);
						const verb = normalized.action === "close" ? "closed" : "reopened";
						const status = normalized.action === "close" ? "milestone_closed" : "milestone_reopened";
						return toolText(formatManagedMilestoneText(verb, runtime.repository, summary, normalized), managedMilestoneDetails(runtime.repository, status, summary, normalized.changedFields));
					}

					await runtime.client.deleteRepositoryMilestone(requireMilestoneNumber(normalized.number), signal);
					return toolText(formatManagedMilestoneText("deleted", runtime.repository, undefined, normalized), managedMilestoneDetails(runtime.repository, "milestone_deleted", undefined, normalized.changedFields));
				} catch (error) {
					const handled = handledKnownMilestoneApiResult(error, runtime.repository, normalized);
					if (handled) return handled;
					throw error;
				}
			},
		}),
	);
}

function normalizeManageMilestoneParams(params: ManageMilestoneToolParams): NormalizedManageMilestoneParams {
	const action = normalizeAction(params.action);
	if (action === "create") {
		if (params.number !== undefined || params.clearDueOn !== undefined || params.confirmDelete !== undefined) {
			throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone create accepts only action, title, description, and dueOn.", { action, fields: ["action", "title", "description", "dueOn"] });
		}
		return {
			action,
			title: normalizeMilestoneTitle(params.title, "title", true),
			...(params.description !== undefined ? { description: normalizeMilestoneDescription(params.description) } : {}),
			...(params.dueOn !== undefined ? { dueOn: normalizeMilestoneDueOn(params.dueOn) } : {}),
			changedFields: ["title", params.description !== undefined ? "description" : undefined, params.dueOn !== undefined ? "due_on" : undefined].filter((field): field is string => field !== undefined),
		};
	}

	const number = normalizeMilestoneNumber(params.number);
	if (action === "update") {
		if (params.confirmDelete !== undefined) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "confirmDelete is only valid for milestone deletion.", { action, field: "confirmDelete" });
		if (params.dueOn !== undefined && params.clearDueOn) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Use dueOn or clearDueOn, not both.", { action, fields: ["dueOn", "clearDueOn"] });
		const title = params.title === undefined ? undefined : normalizeMilestoneTitle(params.title, "title", false);
		const description = params.description === undefined ? undefined : normalizeMilestoneDescription(params.description);
		const dueOn = params.dueOn === undefined ? undefined : normalizeMilestoneDueOn(params.dueOn);
		const changedFields = [title !== undefined ? "title" : undefined, description !== undefined ? "description" : undefined, dueOn !== undefined || params.clearDueOn ? "due_on" : undefined]
			.filter((field): field is string => field !== undefined);
		if (changedFields.length === 0) {
			throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone update requires at least one of title, description, dueOn, or clearDueOn.", { action, fields: ["title", "description", "dueOn", "clearDueOn"] });
		}
		return {
			action,
			number,
			...(title !== undefined ? { title } : {}),
			...(description !== undefined ? { description } : {}),
			...(dueOn !== undefined ? { dueOn } : {}),
			...(params.clearDueOn ? { clearDueOn: true } : {}),
			changedFields,
		};
	}

	if (action === "close" || action === "reopen") {
		if (params.title !== undefined || params.description !== undefined || params.dueOn !== undefined || params.clearDueOn !== undefined || params.confirmDelete !== undefined) {
			throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `Milestone ${action} accepts only action and number.`, { action, fields: ["action", "number"] });
		}
		return {
			action,
			number,
			state: action === "close" ? "closed" : "open",
			changedFields: ["state"],
		};
	}

	if (params.title !== undefined || params.description !== undefined || params.dueOn !== undefined || params.clearDueOn !== undefined) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone deletion accepts only action, number, and confirmDelete.", { action, fields: ["action", "number", "confirmDelete"] });
	}
	if (params.confirmDelete !== true) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone deletion requires confirmDelete: true after explicit user confirmation.", { action, field: "confirmDelete" });
	}
	return { action, number, changedFields: ["deleted"] };
}

function normalizeAction(value: MilestoneManagementAction | undefined): MilestoneManagementAction {
	if (value === "create" || value === "update" || value === "close" || value === "reopen" || value === "delete") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone action must be create, update, close, reopen, or delete.", { field: "action" });
}

function normalizeMilestoneNumber(value: number | undefined): number {
	if (Number.isSafeInteger(value) && value !== undefined && value > 0) return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone number must be a positive integer.", { field: "number" });
}

function requireMilestoneNumber(value: number | undefined): number {
	return normalizeMilestoneNumber(value);
}

function normalizeMilestoneTitle(value: string | undefined, field: string, required: true): string;
function normalizeMilestoneTitle(value: string | undefined, field: string, required: false): string | undefined;
function normalizeMilestoneTitle(value: string | undefined, field: string, required: boolean): string | undefined {
	if (typeof value !== "string") {
		if (!required) return undefined;
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `${field} is required.`, { field });
	}
	const trimmed = value.trim();
	if (!trimmed) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `${field} must not be empty.`, { field });
	if (trimmed.includes("\0")) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `${field} must not contain null bytes.`, { field });
	if (/\r|\n/.test(trimmed)) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `${field} must fit on one line.`, { field });
	if (trimmed.length > MAX_MILESTONE_TITLE_CHARS) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `${field} must be ${MAX_MILESTONE_TITLE_CHARS} characters or fewer.`, { field, maxLength: MAX_MILESTONE_TITLE_CHARS });
	}
	return trimmed;
}

function requireNormalizedTitle(value: string | undefined, field: string): string {
	return normalizeMilestoneTitle(value, field, true);
}

function normalizeMilestoneDescription(value: string): string {
	const trimmed = value.trim();
	if (trimmed.includes("\0")) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "description must not contain null bytes.", { field: "description" });
	if (trimmed.length > MAX_MILESTONE_DESCRIPTION_CHARS) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `description must be ${MAX_MILESTONE_DESCRIPTION_CHARS} characters or fewer.`, { field: "description", maxLength: MAX_MILESTONE_DESCRIPTION_CHARS });
	}
	return trimmed;
}

function normalizeMilestoneDueOn(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "dueOn must not be empty. Use clearDueOn to remove an existing due date.", { field: "dueOn" });
	if (trimmed.includes("\0")) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "dueOn must not contain null bytes.", { field: "dueOn" });
	const dateOnly = trimmed.match(ISO_DATE_ONLY_PATTERN);
	if (dateOnly) {
		const [, year, month, day] = dateOnly;
		if (!isValidUtcDate(Number(year), Number(month), Number(day))) throw invalidDueOnError();
		return `${trimmed}T00:00:00Z`;
	}
	const dateTime = trimmed.match(ISO_DATE_TIME_PATTERN);
	if (!dateTime) throw invalidDueOnError();
	const [, year, month, day] = dateTime;
	if (!isValidUtcDate(Number(year), Number(month), Number(day)) || Number.isNaN(Date.parse(trimmed))) throw invalidDueOnError();
	return trimmed;
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
	if (!(error instanceof GitHubApiError)) return undefined;
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
	const number = typeof milestone.number === "number" && Number.isSafeInteger(milestone.number) && milestone.number > 0
		? milestone.number
		: fallback.number;
	const title = typeof milestone.title === "string" && milestone.title.trim()
		? milestone.title.trim()
		: fallback.title;
	const state = milestone.state === "open" || milestone.state === "closed"
		? milestone.state
		: fallback.state;
	if (number === undefined || !title || state === undefined) return undefined;
	const description = typeof milestone.description === "string" && milestone.description.trim() ? milestone.description.trim() : fallback.description;
	const dueOn = typeof milestone.due_on === "string" && milestone.due_on.trim() ? milestone.due_on.trim() : fallback.dueOn;
	const openIssues = normalizeCount(milestone.open_issues);
	const closedIssues = normalizeCount(milestone.closed_issues);
	const htmlUrl = typeof milestone.html_url === "string" && milestone.html_url.trim() ? milestone.html_url.trim() : undefined;
	const apiUrl = typeof milestone.url === "string" && milestone.url.trim() ? milestone.url.trim() : undefined;
	return {
		number,
		title,
		state,
		...(description !== undefined ? { description } : {}),
		...(dueOn !== undefined ? { due_on: dueOn } : {}),
		...(openIssues !== undefined ? { open_issues: openIssues } : {}),
		...(closedIssues !== undefined ? { closed_issues: closedIssues } : {}),
		...(htmlUrl ? { html_url: htmlUrl } : {}),
		...(apiUrl ? { url: apiUrl } : {}),
	};
}

function normalizeCount(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function formatManagedMilestoneText(
	verb: "created" | "updated" | "closed" | "reopened" | "deleted",
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
		milestone?.state ? `state: ${milestone.state}` : params.state ? `state: ${params.state}` : undefined,
		milestone?.due_on ? `due: ${milestone.due_on}` : params.clearDueOn ? "due date cleared" : params.dueOn ? `due: ${params.dueOn}` : undefined,
		milestone?.description ? `description: ${milestone.description}` : params.description === "" ? "description cleared" : undefined,
	].filter((value): value is string => value !== undefined).join("; ");
	const numberText = number !== undefined ? ` #${number}` : "";
	return `${capitalize(verb)} repository milestone${numberText} "${title}" for ${repository}${metadata ? ` (${metadata})` : ""}.`;
}

function capitalize(value: string): string {
	return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
