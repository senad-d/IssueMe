import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_ASSIGNEES, MAX_TOOL_ISSUES, MAX_TOOL_LABELS } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError, isRemoteMutationSuccessKnown, markMutationSettlement } from "../errors.ts";
import type { GitHubIssueCloseReason, GitHubIssueCollectionPreflight, GitHubProjectV2ItemMutationResult } from "../github/client.ts";
import { githubIssueToRecord, issueRecordToToolSummary } from "../issues/format.ts";
import { removeIssueByNumber, relativeIssuePath } from "../issues/store.ts";
import type { GitHubIssueResponse, IssueMeToolDetails, IssueMeToolResult, SafeToolError, ToolBulkIssueResultSummary, ToolIssueSummary } from "../types.ts";
import { normalizePositiveSafeInteger, normalizeRequiredGitHubOpaqueId } from "../utils/validation.ts";
import {
	assertIssueCreatorAllowed,
	assertNotAborted,
	createIssueMeRuntime,
	issueCreatorScopeLabel,
	partialSuccessToolError,
	REMOTE_MUTATION_RETRY_SAFE_GUIDANCE,
	refreshAndCacheIssue,
	requireNonEmptyGitHubLogins,
	requireNonEmptyStrings,
	safeToolError,
	toolText,
	type IssueMeRuntime,
	type IssueMeToolRegistrationOptions,
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
		labels: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_TOOL_LABELS, description: `Label names for add_labels. Max ${MAX_TOOL_LABELS}.` })),
		assignees: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_TOOL_ASSIGNEES, description: `Usernames for assign. Max ${MAX_TOOL_ASSIGNEES}.` })),
		milestoneNumber: Type.Optional(Type.Integer({ minimum: 1, description: "Milestone number for set_milestone." })),
		projectId: Type.Optional(Type.String({ description: "ProjectV2 node ID for add_to_project; one-line and at most 512 characters." })),
		reason: Type.Optional(BulkCloseReason),
		continueOnError: Type.Optional(Type.Boolean({ description: "Default false; true allows partial bulk failure." })),
	},
	{ additionalProperties: false },
);

type BulkIssueToolParams = Static<typeof BulkIssueParams>;
type BulkIssueActionName = BulkIssueToolParams["action"];
type ActionSpecificField = Exclude<keyof BulkIssueToolParams, "issueNumbers" | "action" | "continueOnError">;

export const BULK_ISSUE_COMMON_FIELDS = ["issueNumbers", "action", "continueOnError"] as const satisfies readonly (keyof BulkIssueToolParams)[];
export const BULK_ISSUE_ACTION_FIELDS = {
	add_labels: ["labels"],
	assign: ["assignees"],
	set_milestone: ["milestoneNumber"],
	add_to_project: ["projectId"],
	close: ["reason"],
} as const satisfies Record<BulkIssueActionName, readonly ActionSpecificField[]>;

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

interface BulkRunState {
	results: ToolBulkIssueResultSummary[];
	counts: BulkRunCounts;
	firstError?: SafeToolError;
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
				const normalized = normalizeBulkIssueParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const creatorScope = issueCreatorScopeLabel(runtime.config);
				const run = await runBulkIssueOperation(ctx, runtime, normalized, signal);
				return toolText(formatBulkIssueText(runtime.repository, normalized, run.results, run.counts, creatorScope), buildBulkIssueDetails(runtime.repository, normalized, run, creatorScope));
			},
		}),
	);
}

async function runBulkIssueOperation(
	ctx: ExtensionContext,
	runtime: IssueMeRuntime,
	params: NormalizedBulkIssueParams,
	signal?: AbortSignal,
): Promise<BulkRunState> {
	const state: BulkRunState = {
		results: [],
		counts: {
			requested: params.issueNumbers.length,
			succeeded: 0,
			partial: 0,
			failed: 0,
			skipped: 0,
		},
	};
	assertBulkMutationNotStarted(signal);
	const collectionPreflight = runtime.client.createIssueCollectionPreflight?.();

	for (let index = 0; index < params.issueNumbers.length; index++) {
		const skipMessage = await processBulkIssue(ctx, runtime, params, params.issueNumbers[index], state, signal, collectionPreflight);
		if (skipMessage === undefined) continue;
		appendSkippedResults(state.results, state.counts, params, index + 1, skipMessage);
		break;
	}

	return state;
}

async function processBulkIssue(
	ctx: ExtensionContext,
	runtime: IssueMeRuntime,
	params: NormalizedBulkIssueParams,
	issueNumber: number,
	state: BulkRunState,
	signal?: AbortSignal,
	collectionPreflight?: GitHubIssueCollectionPreflight,
): Promise<string | undefined> {
	try {
		assertBulkMutationNotStarted(signal);
		const result = await applyBulkAction(ctx, runtime, params, issueNumber, signal, collectionPreflight);
		return recordBulkActionResult(state, params, result);
	} catch (error) {
		return recordBulkActionError(state, params, issueNumber, error);
	}
}

function recordBulkActionResult(
	state: BulkRunState,
	params: NormalizedBulkIssueParams,
	result: ToolBulkIssueResultSummary,
): string | undefined {
	state.results.push(result);
	if (result.status === "success") {
		state.counts.succeeded += 1;
		return undefined;
	}
	if (result.status !== "partial_success") return undefined;
	state.counts.partial += 1;
	state.firstError ??= result.error;
	if (params.continueOnError && result.error?.code !== ISSUEME_ERROR_CODES.GITHUB_REQUEST_ABORTED) return undefined;
	return "Skipped because the previous issue had partial remote success or cancellation made later mutations unsafe.";
}

function recordBulkActionError(
	state: BulkRunState,
	params: NormalizedBulkIssueParams,
	issueNumber: number,
	error: unknown,
): string | undefined {
	if (isRemoteMutationSuccessKnown(error)) return recordBulkResponseProcessingError(state, params, issueNumber, error);
	const fatalPreSettlementFailure = isFatalBulkPreSettlementFailure(error);
	if (fatalPreSettlementFailure && state.counts.succeeded === 0 && state.counts.partial === 0) throw error;
	const safeError = safeToolError(error);
	state.firstError ??= safeError;
	state.counts.failed += 1;
	state.results.push({
		number: issueNumber,
		action: params.action,
		status: "failed",
		message: safeError.message,
		changedFields: params.changedFields,
		cacheUpdated: false,
		needsSync: true,
		error: safeError,
	});
	if (fatalPreSettlementFailure || !params.continueOnError) return "Skipped because the previous issue failed or cancellation made later mutations unsafe.";
	return undefined;
}

function recordBulkResponseProcessingError(
	state: BulkRunState,
	params: NormalizedBulkIssueParams,
	issueNumber: number,
	error: unknown,
): string | undefined {
	const partial = bulkResponseProcessingPartialResult(issueNumber, params, error);
	state.results.push(partial);
	state.counts.partial += 1;
	state.firstError ??= partial.error;
	if (params.continueOnError) return undefined;
	return "Skipped because the previous issue had accepted remote work with an unverifiable response.";
}

function assertBulkMutationNotStarted(signal: AbortSignal | undefined): void {
	try {
		assertNotAborted(signal);
	} catch (error) {
		throw markMutationSettlement(error, "not_started");
	}
}

function bulkResponseProcessingPartialResult(
	issueNumber: number,
	params: NormalizedBulkIssueParams,
	error: unknown,
): ToolBulkIssueResultSummary {
	const safeError = partialSuccessToolError(error, "bulk_mutation_response_partial_success");
	const settledError: SafeToolError = {
		...safeError,
		recoveryHint: REMOTE_MUTATION_RETRY_SAFE_GUIDANCE,
		details: {
			...safeError.details,
			mutationSettlement: "remote_success_known",
			retrySafeGuidance: REMOTE_MUTATION_RETRY_SAFE_GUIDANCE,
		},
	};
	return {
		number: issueNumber,
		action: params.action,
		status: "partial_success",
		message: `${formatSuccessMessage(params.action, issueNumber)} may have completed remotely, but IssueMe could not verify the mutation response. ${REMOTE_MUTATION_RETRY_SAFE_GUIDANCE}`,
		changedFields: params.changedFields,
		cacheUpdated: false,
		needsSync: true,
		error: settledError,
	};
}

function isFatalBulkPreSettlementFailure(error: unknown): boolean {
	return error instanceof GitHubApiError
		|| error instanceof IssueMeError && error.code === ISSUEME_ERROR_CODES.GITHUB_REQUEST_ABORTED;
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
	collectionPreflight?: GitHubIssueCollectionPreflight,
): Promise<ToolBulkIssueResultSummary> {
	if (params.action === "close") return closeIssueForBulk(runtime, params, issueNumber, signal);

	await assertBulkIssueAllowedForOpenMutation(runtime, issueNumber, params.action, signal);
	if (params.action === "add_labels") {
		await runtime.client.addLabels(issueNumber, params.labels ?? [], signal, collectionPreflight);
		return refreshIssueAfterRemoteSuccess(ctx, runtime, issueNumber, params, undefined, signal);
	}
	if (params.action === "assign") {
		const issue = await runtime.client.addAssignees(issueNumber, params.assignees ?? [], signal, collectionPreflight);
		return refreshIssueAfterRemoteSuccess(ctx, runtime, issueNumber, params, issue, signal);
	}
	if (params.action === "set_milestone") {
		const issue = await runtime.client.updateIssue(issueNumber, { milestone: params.milestoneNumber }, signal);
		return refreshIssueAfterRemoteSuccess(ctx, runtime, issueNumber, params, issue, signal);
	}
	const result = await runtime.client.addIssueToProjectV2({ issueNumber, projectId: params.projectId ?? "" }, signal);
	return projectItemBulkResult(issueNumber, params, result);
}

async function assertBulkIssueAllowedForOpenMutation(
	runtime: IssueMeRuntime,
	issueNumber: number,
	action: BulkIssueActionName,
	signal?: AbortSignal,
): Promise<GitHubIssueResponse> {
	const currentIssue = await runtime.client.ensureIssueOpen(issueNumber, signal);
	assertIssueCreatorAllowed(runtime.config, currentIssue, { repository: runtime.repository, operation: `bulk_${action}`, issueNumber });
	return currentIssue;
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
		const { summary, path, removedPaths } = await refreshAndCacheIssue(ctx, runtime, issueNumber, signal);
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
		const safeError = partialSuccessToolError(markMutationSettlement(error, "remote_success_known"));
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
	assertIssueCreatorAllowed(runtime.config, current, { repository: runtime.repository, operation: "bulk_close", issueNumber });
	const alreadyClosed = current.state === "closed";
	const issue = alreadyClosed ? current : await runtime.client.closeIssue(issueNumber, { reason: params.reason }, signal);
	let issueSummary: ToolIssueSummary;
	try {
		issueSummary = issueRecordToToolSummary(githubIssueToRecord(runtime.client.repository, issue, []));
	} catch (error) {
		if (!alreadyClosed) return bulkResponseProcessingPartialResult(issueNumber, params, markMutationSettlement(error, "remote_success_known"));
		throw error;
	}
	try {
		assertNotAborted(signal);
		const removed = await removeIssueByNumber(runtime.projectRoot, runtime.config, issueNumber, runtime.repository, signal);
		const removedPaths = removed.map((path) => relativeIssuePath(runtime.projectRoot, path) ?? path);
		return {
			number: issueNumber,
			action: params.action,
			status: "success",
			message: formatBulkCloseSuccessMessage(issueNumber, alreadyClosed, params.reason),
			issue: issueSummary,
			removedPaths,
			changedFields: alreadyClosed ? [] : params.changedFields,
			cacheUpdated: true,
			needsSync: false,
		};
	} catch (error) {
		const settledError = alreadyClosed ? error : markMutationSettlement(error, "remote_success_known");
		const safeError = partialSuccessToolError(settledError, alreadyClosed ? "already_closed_partial_success" : "closed_now_partial_success");
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

function formatBulkCloseSuccessMessage(issueNumber: number, alreadyClosed: boolean, reason: GitHubIssueCloseReason | undefined): string {
	if (alreadyClosed) return `Issue #${issueNumber} was already closed; removed matching stale local cache files.`;
	return `Closed issue #${issueNumber}${formatBulkCloseReason(reason)}.`;
}

function formatBulkCloseReason(reason: GitHubIssueCloseReason | undefined): string {
	if (reason === undefined) return "";
	return ` with reason ${reason}`;
}

function buildBulkIssueDetails(
	repository: string,
	params: NormalizedBulkIssueParams,
	run: { results: ToolBulkIssueResultSummary[]; counts: BulkRunCounts; firstError?: SafeToolError },
	creatorScope: string,
): IssueMeToolDetails {
	const successfulResults = run.results.filter((result) => result.status === "success");
	const issueSummaries = successfulResults.map((result) => result.issue).filter((issue): issue is ToolIssueSummary => issue !== undefined);
	const paths = run.results.flatMap((result) => result.paths ?? []);
	const removedPaths = run.results.flatMap((result) => result.removedPaths ?? []);
	const result = inferBulkToolResult(run.counts);
	return {
		result,
		repository,
		creatorScope,
		status: bulkToolStatus(result),
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

function bulkToolStatus(result: IssueMeToolResult): string {
	if (result === "success") return "bulk_success";
	if (result === "partial_success") return "bulk_partial_success";
	return "bulk_failed";
}

function formatBulkIssueText(
	repository: string,
	params: NormalizedBulkIssueParams,
	results: ToolBulkIssueResultSummary[],
	counts: BulkRunCounts,
	creatorScope: string,
): string {
	const lines = [
		`Bulk IssueMe action ${params.action} for ${counts.requested} explicit issue number(s) in ${repository}.`,
		`Safety: explicit issueNumbers only; executed sequentially; continueOnError=${params.continueOnError}; creator scope=${creatorScope}.`,
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
		assertNoUnexpectedActionFields(params, BULK_ISSUE_ACTION_FIELDS.add_labels);
		const labels = requireNonEmptyStrings(params.labels, "labels");
		return { issueNumbers, action, labels, continueOnError, changedFields: ["labels"] };
	}
	if (action === "assign") {
		assertNoUnexpectedActionFields(params, BULK_ISSUE_ACTION_FIELDS.assign);
		const assignees = requireNonEmptyGitHubLogins(params.assignees, "assignees");
		return { issueNumbers, action, assignees, continueOnError, changedFields: ["assignees"] };
	}
	if (action === "set_milestone") {
		assertNoUnexpectedActionFields(params, BULK_ISSUE_ACTION_FIELDS.set_milestone);
		return { issueNumbers, action, milestoneNumber: normalizePositiveInteger(params.milestoneNumber, "milestoneNumber"), continueOnError, changedFields: ["milestone"] };
	}
	if (action === "add_to_project") {
		assertNoUnexpectedActionFields(params, BULK_ISSUE_ACTION_FIELDS.add_to_project);
		return { issueNumbers, action, projectId: normalizeRequiredProjectId(params.projectId, "projectId"), continueOnError, changedFields: ["project_item"] };
	}
	assertNoUnexpectedActionFields(params, BULK_ISSUE_ACTION_FIELDS.close);
	return normalizeCloseBulkParams(issueNumbers, action, continueOnError, params.reason);
}

function normalizeCloseBulkParams(
	issueNumbers: number[],
	action: BulkIssueActionName,
	continueOnError: boolean,
	value: BulkIssueToolParams["reason"],
): NormalizedBulkIssueParams {
	const reason = normalizeOptionalCloseReason(value);
	const params: NormalizedBulkIssueParams = { issueNumbers, action, continueOnError, changedFields: bulkCloseChangedFields(reason) };
	if (reason !== undefined) params.reason = reason;
	return params;
}

function normalizeOptionalCloseReason(value: BulkIssueToolParams["reason"]): GitHubIssueCloseReason | undefined {
	if (value === undefined) return undefined;
	return normalizeCloseReason(value);
}

function bulkCloseChangedFields(reason: GitHubIssueCloseReason | undefined): string[] {
	if (reason === undefined) return ["state"];
	return ["state", "state_reason"];
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

function assertNoUnexpectedActionFields(params: BulkIssueToolParams, allowed: readonly ActionSpecificField[]): void {
	const actionFields = Object.values(BULK_ISSUE_ACTION_FIELDS).flat();
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

function normalizeRequiredProjectId(value: string | undefined, field: string): string {
	return normalizeRequiredGitHubOpaqueId(value, field, { requiredMessage: `${field} is required for this bulk action.` });
}

function normalizePositiveInteger(value: number | undefined, field: string): number {
	return normalizePositiveSafeInteger(value, field);
}
