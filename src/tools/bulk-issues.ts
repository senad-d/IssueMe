import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { MAX_TOOL_ISSUES } from "../constants.ts";
import { ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { GitHubIssueCloseReason, GitHubProjectV2ItemMutationResult } from "../github/client.ts";
import { githubIssueToRecord, issueRecordToToolSummary } from "../issues/format.ts";
import { removeIssueByNumber, relativeIssuePath } from "../issues/store.ts";
import type { GitHubIssueResponse, IssueMeToolDetails, IssueMeToolResult, SafeToolError, ToolBulkIssueResultSummary, ToolIssueSummary } from "../types.ts";
import {
	createIssueMeRuntime,
	partialSuccessToolError,
	refreshIssueRecord,
	requireNonEmptyGitHubLogins,
	requireNonEmptyStrings,
	safeToolError,
	toolText,
	type IssueMeRuntime,
	type IssueMeToolRegistrationOptions,
	writeAndSummarizeIssue,
} from "./runtime.ts";

const BulkIssueAction = StringEnum(["add_labels", "assign", "set_milestone", "add_to_project", "close"] as const, {
	description: "Bulk action.",
});

const BulkCloseReason = StringEnum(["completed", "not_planned"] as const, {
	description: "Close reason for close; omit for default.",
});

const BulkIssueParams = Type.Object(
	{
		issueNumbers: Type.Array(
			Type.Integer({ minimum: 1, description: "Issue number." }),
			{ minItems: 1, maxItems: MAX_TOOL_ISSUES, description: "Explicit issue numbers. No search/query targets." },
		),
		action: BulkIssueAction,
		labels: Type.Optional(Type.Array(Type.String(), { description: "Label names for add_labels." })),
		assignees: Type.Optional(Type.Array(Type.String(), { description: "Usernames for assign." })),
		milestoneNumber: Type.Optional(Type.Integer({ minimum: 1, description: "Milestone number for set_milestone." })),
		projectId: Type.Optional(Type.String({ description: "ProjectV2 node ID for add_to_project." })),
		reason: Type.Optional(BulkCloseReason),
		continueOnError: Type.Optional(Type.Boolean({ description: "Default false; true allows partial bulk failure." })),
	},
	{ additionalProperties: false },
);

type BulkIssueActionName = "add_labels" | "assign" | "set_milestone" | "add_to_project" | "close";

type ActionSpecificField = "labels" | "assignees" | "milestoneNumber" | "projectId" | "reason";

interface BulkIssueToolParams {
	issueNumbers?: number[];
	action?: BulkIssueActionName;
	labels?: string[];
	assignees?: string[];
	milestoneNumber?: number;
	projectId?: string;
	reason?: GitHubIssueCloseReason;
	continueOnError?: boolean;
}

interface NormalizedBulkIssueParams {
	issueNumbers: number[];
	action: BulkIssueActionName;
	labels?: string[];
	assignees?: string[];
	milestoneNumber?: number;
	projectId?: string;
	reason?: GitHubIssueCloseReason;
	continueOnError: boolean;
	changedFields: string[];
}

interface BulkRunCounts {
	requested: number;
	succeeded: number;
	partial: number;
	failed: number;
	skipped: number;
}

export function registerBulkIssueOperationsTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_bulk_update_issues",
			label: "IssueMe Bulk Update Issues",
			description: "Apply one safe mutation to explicit issue numbers.",
			promptSnippet: "Bulk update explicit issue numbers.",
			promptGuidelines: [
				"Use issueme_bulk_update_issues only with explicit, confirmed issueNumbers; no search-query targets.",
				"With issueme_bulk_update_issues, leave continueOnError false unless the user accepts partial failures.",
			],
			executionMode: "sequential",
			parameters: BulkIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeBulkIssueParams(params as BulkIssueToolParams);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const run = await runBulkIssueOperation(ctx, runtime, normalized, signal);
				return toolText(formatBulkIssueText(runtime.repository, normalized, run.results, run.counts), buildBulkIssueDetails(runtime.repository, normalized, run));
			},
		}),
	);
}

async function runBulkIssueOperation(
	ctx: ExtensionContext,
	runtime: IssueMeRuntime,
	params: NormalizedBulkIssueParams,
	signal?: AbortSignal,
): Promise<{ results: ToolBulkIssueResultSummary[]; counts: BulkRunCounts; firstError?: SafeToolError }> {
	const results: ToolBulkIssueResultSummary[] = [];
	const counts: BulkRunCounts = {
		requested: params.issueNumbers.length,
		succeeded: 0,
		partial: 0,
		failed: 0,
		skipped: 0,
	};
	let firstError: SafeToolError | undefined;

	for (let index = 0; index < params.issueNumbers.length; index++) {
		const issueNumber = params.issueNumbers[index];
		try {
			const result = await applyBulkAction(ctx, runtime, params, issueNumber, signal);
			results.push(result);
			if (result.status === "success") counts.succeeded += 1;
			else if (result.status === "partial_success") {
				counts.partial += 1;
				firstError ??= result.error;
				if (!params.continueOnError) {
					appendSkippedResults(results, counts, params, index + 1, "Skipped because the previous issue had partial remote success and continueOnError is false.");
					break;
				}
			}
		} catch (error) {
			const safeError = safeToolError(error);
			firstError ??= safeError;
			counts.failed += 1;
			results.push({
				number: issueNumber,
				action: params.action,
				status: "failed",
				message: safeError.message,
				changedFields: params.changedFields,
				cacheUpdated: false,
				needsSync: true,
				error: safeError,
			});
			if (!params.continueOnError) {
				appendSkippedResults(results, counts, params, index + 1, "Skipped because the previous issue failed and continueOnError is false.");
				break;
			}
		}
	}

	return { results, counts, ...(firstError ? { firstError } : {}) };
}

function appendSkippedResults(
	results: ToolBulkIssueResultSummary[],
	counts: BulkRunCounts,
	params: NormalizedBulkIssueParams,
	startIndex: number,
	message: string,
): void {
	for (const number of params.issueNumbers.slice(startIndex)) {
		counts.skipped += 1;
		results.push({
			number,
			action: params.action,
			status: "skipped",
			message,
			changedFields: [],
			cacheUpdated: false,
			needsSync: counts.partial > 0 || counts.failed > 0,
		});
	}
}

async function applyBulkAction(
	ctx: ExtensionContext,
	runtime: IssueMeRuntime,
	params: NormalizedBulkIssueParams,
	issueNumber: number,
	signal?: AbortSignal,
): Promise<ToolBulkIssueResultSummary> {
	if (params.action === "add_labels") {
		await runtime.client.addLabels(issueNumber, params.labels ?? [], signal);
		return refreshIssueAfterRemoteSuccess(ctx, runtime, issueNumber, params, undefined, signal);
	}
	if (params.action === "assign") {
		const issue = await runtime.client.addAssignees(issueNumber, params.assignees ?? [], signal);
		return refreshIssueAfterRemoteSuccess(ctx, runtime, issueNumber, params, issue, signal);
	}
	if (params.action === "set_milestone") {
		const issue = await runtime.client.updateIssue(issueNumber, { milestone: params.milestoneNumber }, signal);
		return refreshIssueAfterRemoteSuccess(ctx, runtime, issueNumber, params, issue, signal);
	}
	if (params.action === "add_to_project") {
		const result = await runtime.client.addIssueToProjectV2({ issueNumber, projectId: params.projectId ?? "" }, signal);
		return projectItemBulkResult(issueNumber, params, result);
	}
	return closeIssueForBulk(runtime, params, issueNumber, signal);
}

async function refreshIssueAfterRemoteSuccess(
	ctx: ExtensionContext,
	runtime: IssueMeRuntime,
	issueNumber: number,
	params: NormalizedBulkIssueParams,
	updatedIssue: GitHubIssueResponse | undefined,
	signal?: AbortSignal,
): Promise<ToolBulkIssueResultSummary> {
	let updatedSummary: ToolIssueSummary | undefined;
	try {
		if (updatedIssue) updatedSummary = issueRecordToToolSummary(githubIssueToRecord(runtime.client.repository, updatedIssue, []));
		const record = await refreshIssueRecord(runtime, issueNumber, signal);
		const { summary, path, removedPaths } = await writeAndSummarizeIssue(ctx, runtime, record);
		return {
			number: issueNumber,
			action: params.action,
			status: "success",
			message: formatSuccessMessage(params.action, issueNumber),
			issue: summary,
			paths: path ? [path] : [],
			removedPaths,
			changedFields: params.changedFields,
			cacheUpdated: true,
			needsSync: false,
		};
	} catch (error) {
		const safeError = partialSuccessToolError(error);
		return {
			number: issueNumber,
			action: params.action,
			status: "partial_success",
			message: `${formatSuccessMessage(params.action, issueNumber)} remotely, but local cache refresh failed; run issueme_sync_issues before retrying local work.`,
			...(updatedSummary ? { issue: updatedSummary } : {}),
			changedFields: params.changedFields,
			cacheUpdated: false,
			needsSync: true,
			error: safeError,
		};
	}
}

function projectItemBulkResult(
	issueNumber: number,
	params: NormalizedBulkIssueParams,
	result: GitHubProjectV2ItemMutationResult,
): ToolBulkIssueResultSummary {
	return {
		number: issueNumber,
		action: params.action,
		status: "success",
		message: `Added or confirmed issue #${issueNumber} on the GitHub Projects v2 board.`,
		projectItem: result.item,
		changedFields: params.changedFields,
		cacheUpdated: false,
		needsSync: false,
	};
}

async function closeIssueForBulk(
	runtime: IssueMeRuntime,
	params: NormalizedBulkIssueParams,
	issueNumber: number,
	signal?: AbortSignal,
): Promise<ToolBulkIssueResultSummary> {
	const current = await runtime.client.getIssue(issueNumber, signal);
	const alreadyClosed = current.state === "closed";
	const issue = alreadyClosed ? current : await runtime.client.closeIssue(issueNumber, { reason: params.reason }, signal);
	const issueSummary = issueRecordToToolSummary(githubIssueToRecord(runtime.client.repository, issue, []));
	try {
		const removed = await removeIssueByNumber(runtime.projectRoot, runtime.config, issueNumber, runtime.repository);
		const removedPaths = removed.map((path) => relativeIssuePath(runtime.projectRoot, path) ?? path);
		return {
			number: issueNumber,
			action: params.action,
			status: "success",
			message: alreadyClosed ? `Issue #${issueNumber} was already closed; removed matching stale local cache files.` : `Closed issue #${issueNumber}${params.reason ? ` with reason ${params.reason}` : ""}.`,
			issue: issueSummary,
			removedPaths,
			changedFields: alreadyClosed ? [] : params.changedFields,
			cacheUpdated: true,
			needsSync: false,
		};
	} catch (error) {
		const safeError = partialSuccessToolError(error, alreadyClosed ? "already_closed_partial_success" : "closed_now_partial_success");
		return {
			number: issueNumber,
			action: params.action,
			status: "partial_success",
			message: `${alreadyClosed ? "Issue was already closed" : "Closed issue"} #${issueNumber}; local cache removal failed. Run issueme_sync_issues before relying on cache state.`,
			issue: issueSummary,
			changedFields: alreadyClosed ? [] : params.changedFields,
			cacheUpdated: false,
			needsSync: true,
			error: safeError,
		};
	}
}

function buildBulkIssueDetails(
	repository: string,
	params: NormalizedBulkIssueParams,
	run: { results: ToolBulkIssueResultSummary[]; counts: BulkRunCounts; firstError?: SafeToolError },
): IssueMeToolDetails {
	const successfulResults = run.results.filter((result) => result.status === "success");
	const issueSummaries = successfulResults.map((result) => result.issue).filter((issue): issue is ToolIssueSummary => issue !== undefined);
	const paths = run.results.flatMap((result) => result.paths ?? []);
	const removedPaths = run.results.flatMap((result) => result.removedPaths ?? []);
	const result = inferBulkToolResult(run.counts);
	return {
		result,
		repository,
		status: result === "success" ? "bulk_success" : result === "partial_success" ? "bulk_partial_success" : "bulk_failed",
		bulkResults: run.results,
		issues: issueSummaries,
		paths,
		removedPaths,
		changedFields: params.changedFields,
		counts: {
			requested: run.counts.requested,
			succeeded: run.counts.succeeded,
			partial: run.counts.partial,
			failed: run.counts.failed,
			skipped: run.counts.skipped,
		},
		cacheUpdated: run.results.some((item) => item.cacheUpdated === true),
		needsSync: result !== "success",
		...(run.firstError ? { message: run.firstError.message, error: run.firstError } : {}),
	};
}

function inferBulkToolResult(counts: BulkRunCounts): IssueMeToolResult {
	if (counts.failed === 0 && counts.partial === 0) return "success";
	if (counts.succeeded > 0 || counts.partial > 0) return "partial_success";
	return "error";
}

function formatBulkIssueText(
	repository: string,
	params: NormalizedBulkIssueParams,
	results: ToolBulkIssueResultSummary[],
	counts: BulkRunCounts,
): string {
	const lines = [
		`Bulk IssueMe action ${params.action} for ${counts.requested} explicit issue number(s) in ${repository}.`,
		`Safety: explicit issueNumbers only; executed sequentially; continueOnError=${params.continueOnError}.`,
		`Results: ${counts.succeeded} succeeded, ${counts.partial} partial, ${counts.failed} failed, ${counts.skipped} skipped.`,
		"",
		...results.map(formatBulkResultLine),
	];
	if (counts.partial > 0 || counts.failed > 0) {
		lines.push("", "Do not blindly rerun the whole bulk action after partial remote success; inspect bulkResults and run issueme_sync_issues when cache state is uncertain.");
	}
	return lines.join("\n");
}

function formatBulkResultLine(result: ToolBulkIssueResultSummary): string {
	const suffix = result.message ? ` — ${result.message}` : "";
	return `- #${result.number}: ${result.status}${suffix}`;
}

function formatSuccessMessage(action: BulkIssueActionName, issueNumber: number): string {
	if (action === "add_labels") return `Updated labels for issue #${issueNumber}`;
	if (action === "assign") return `Updated assignees for issue #${issueNumber}`;
	if (action === "set_milestone") return `Updated milestone for issue #${issueNumber}`;
	return `Updated issue #${issueNumber}`;
}

function normalizeBulkIssueParams(params: BulkIssueToolParams): NormalizedBulkIssueParams {
	const action = normalizeAction(params.action);
	const issueNumbers = normalizeIssueNumbers(params.issueNumbers);
	const continueOnError = params.continueOnError === true;
	if (action === "add_labels") {
		assertNoUnexpectedActionFields(params, ["labels"]);
		const labels = requireNonEmptyStrings(params.labels, "labels");
		return { issueNumbers, action, labels, continueOnError, changedFields: ["labels"] };
	}
	if (action === "assign") {
		assertNoUnexpectedActionFields(params, ["assignees"]);
		const assignees = requireNonEmptyGitHubLogins(params.assignees, "assignees");
		return { issueNumbers, action, assignees, continueOnError, changedFields: ["assignees"] };
	}
	if (action === "set_milestone") {
		assertNoUnexpectedActionFields(params, ["milestoneNumber"]);
		return { issueNumbers, action, milestoneNumber: normalizePositiveInteger(params.milestoneNumber, "milestoneNumber"), continueOnError, changedFields: ["milestone"] };
	}
	if (action === "add_to_project") {
		assertNoUnexpectedActionFields(params, ["projectId"]);
		return { issueNumbers, action, projectId: normalizeRequiredText(params.projectId, "projectId"), continueOnError, changedFields: ["project_item"] };
	}
	assertNoUnexpectedActionFields(params, ["reason"]);
	return { issueNumbers, action, ...(params.reason !== undefined ? { reason: normalizeCloseReason(params.reason) } : {}), continueOnError, changedFields: params.reason ? ["state", "state_reason"] : ["state"] };
}

function normalizeAction(value: BulkIssueActionName | undefined): BulkIssueActionName {
	if (value === "add_labels" || value === "assign" || value === "set_milestone" || value === "add_to_project" || value === "close") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "action must be add_labels, assign, set_milestone, add_to_project, or close.", { field: "action" });
}

function normalizeIssueNumbers(values: number[] | undefined): number[] {
	if (!Array.isArray(values) || values.length === 0) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "issueNumbers must include at least one explicit issue number.", { field: "issueNumbers" });
	}
	if (values.length > MAX_TOOL_ISSUES) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `issueNumbers supports at most ${MAX_TOOL_ISSUES} explicit issue numbers per bulk call.`, { field: "issueNumbers", max: MAX_TOOL_ISSUES });
	}
	const normalized = values.map((value) => normalizePositiveInteger(value, "issueNumbers"));
	const unique = new Set(normalized);
	if (unique.size !== normalized.length) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "issueNumbers must not contain duplicates; each issue should be mutated at most once per bulk call.", { field: "issueNumbers" });
	}
	return normalized;
}

function assertNoUnexpectedActionFields(params: BulkIssueToolParams, allowed: ActionSpecificField[]): void {
	const actionFields: ActionSpecificField[] = ["labels", "assignees", "milestoneNumber", "projectId", "reason"];
	const unexpected = actionFields.filter((field) => !allowed.includes(field) && params[field] !== undefined);
	if (unexpected.length > 0) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			`Fields ${unexpected.join(", ")} do not apply to bulk action ${params.action}.`,
			{ fields: unexpected, action: params.action },
		);
	}
}

function normalizeCloseReason(value: GitHubIssueCloseReason): GitHubIssueCloseReason {
	if (value === "completed" || value === "not_planned") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Close reason must be completed or not_planned when provided.", { field: "reason" });
}

function normalizeRequiredText(value: string | undefined, field: string): string {
	if (typeof value !== "string") throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `${field} is required for this bulk action.`, { field });
	const trimmed = value.trim();
	if (!trimmed) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `${field} must not be empty.`, { field });
	if (trimmed.includes("\0")) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `${field} must not contain null bytes.`, { field });
	return trimmed;
}

function normalizePositiveInteger(value: number | undefined, field: string): number {
	if (Number.isSafeInteger(value) && value !== undefined && value > 0) return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `${field} must be a positive integer.`, { field });
}
