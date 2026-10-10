import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_ISSUES } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError, isRemoteMutationSuccessKnown } from "../errors.ts";
import type { GitHubIssueDependencyListResult, GitHubIssueDependencyMutationResult } from "../github/client.ts";
import { normalizeContinuationTokenInput } from "../github/continuation.ts";
import { assertDependencyTargetIsIssue, assertDistinctDependencyNumbers, normalizeIssueDependencySummary } from "../github/issue-dependencies-client.ts";
import { issueResponseToSafeSummary } from "../github/issues-client.ts";
import type { GitHubIssueResponse, IssueDependencyDirection, IssueMeToolDetails, ToolContinuationSummary, ToolIssueDependencySummary, ToolIssueSummary } from "../types.ts";
import { mapSequentially } from "../utils/sequential.ts";
import { normalizeBoundedToolLimit, normalizePositiveSafeInteger } from "../utils/validation.ts";
import {
	appendContinuationLine,
	assertIssueCreatorAllowed,
	createIssueMeRuntime,
	issueCreatorMatchesConfig,
	issueCreatorScopeLabel,
	remoteMutationPartialSuccessToolText,
	safeToolError,
	toolText,
	type IssueMeRuntime,
	type IssueMeToolRegistrationOptions,
} from "./runtime.ts";

const DEFAULT_DEPENDENCY_LIMIT = 25;
const DEPENDENCY_SEMANTICS_NOTE = "Native dependencies are prerequisites (blocked by / blocking), distinct from sub-issue decomposition and related issues; IssueMe never parses or writes body-text blockers.";

const DependencyDirection = StringEnum(["blocked_by", "blocking", "both"] as const, { description: "Edge direction. Default both." });

const ListIssueDependenciesParams = Type.Object(
	{
		issueNumber: Type.Integer({ minimum: 1, description: "Issue number." }),
		direction: Type.Optional(DependencyDirection),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_ISSUES, description: `Max per direction. Default ${DEFAULT_DEPENDENCY_LIMIT}; max ${MAX_TOOL_ISSUES}.` })),
		after: Type.Optional(Type.String({ description: "Continuation token; single direction only." })),
	},
	{ additionalProperties: false },
);

const IssueDependencyMutationParams = Type.Object(
	{
		issueNumber: Type.Integer({ minimum: 1, description: "Blocked (dependent) open issue number." }),
		blockingIssueNumber: Type.Integer({ minimum: 1, description: "Blocking open issue number; must differ." }),
	},
	{ additionalProperties: false },
);

type ListIssueDependenciesToolParams = Static<typeof ListIssueDependenciesParams>;
type IssueDependencyMutationToolParams = Static<typeof IssueDependencyMutationParams>;

interface NormalizedListIssueDependenciesParams {
	issueNumber: number;
	direction: IssueDependencyDirection | "both";
	limit: number;
	after?: string;
}

interface NormalizedIssueDependencyMutationParams {
	issueNumber: number;
	blockingIssueNumber: number;
}

interface DependencyDirectionRead {
	direction: IssueDependencyDirection;
	dependencies: ToolIssueDependencySummary[];
	omittedOutOfScope: number;
	truncated: boolean;
	continuation?: ToolContinuationSummary;
}

export function registerIssueDependencyTools(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	registerListIssueDependenciesTool(pi, options);
	registerAddIssueDependencyTool(pi, options);
	registerRemoveIssueDependencyTool(pi, options);
}

export function registerListIssueDependenciesTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_list_issue_dependencies",
			label: "IssueMe List Issue Dependencies",
			description: "Inspect native blocked-by/blocking issue dependencies.",
			promptSnippet: "Inspect native issue dependencies.",
			promptGuidelines: [
				"Use issueme_list_issue_dependencies to find prerequisites or blocked work; native edges only, read-only, no body-text parsing.",
			],
			parameters: ListIssueDependenciesParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeListIssueDependenciesParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const issue = await fetchAllowedIssueAnyState(runtime, normalized.issueNumber, "list_issue_dependencies", signal);
				const directions: IssueDependencyDirection[] = normalized.direction === "both" ? ["blocked_by", "blocking"] : [normalized.direction];
				const reads = await mapSequentially(directions, (direction) => readDependencyDirection(runtime, normalized, direction, signal));
				const creatorScope = issueCreatorScopeLabel(runtime.config);
				const issueSummary = requireIssueSummary(runtime.repository, issue, normalized.issueNumber);
				const details = buildListDependenciesDetails(runtime.repository, creatorScope, issueSummary, reads, normalized);
				return toolText(formatListDependenciesText(runtime.repository, issueSummary, reads, normalized, creatorScope), details);
			},
		}),
	);
}

export function registerAddIssueDependencyTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_add_issue_dependency",
			label: "IssueMe Add Issue Dependency",
			description: "Mark an open issue as blocked by another open issue.",
			promptSnippet: "Add native blocked-by dependency.",
			promptGuidelines: [
				"Use issueme_add_issue_dependency only for real prerequisites between two open issues; use sub-issues for decomposition and never write body-text blockers.",
			],
			executionMode: "sequential",
			parameters: IssueDependencyMutationParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeIssueDependencyMutationParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const { issue, blockingIssue } = await fetchDependencyMutationTargets(runtime, normalized, "add_issue_dependency", signal);
				let result: GitHubIssueDependencyMutationResult;
				try {
					result = await runtime.client.addIssueDependencyByIssueResponses(issue, blockingIssue, signal);
				} catch (error) {
					if (isRemoteMutationSuccessKnown(error)) {
						return remoteMutationPartialSuccessToolText(
							`GitHub accepted the request to mark issue #${normalized.issueNumber} as blocked by #${normalized.blockingIssueNumber}, but IssueMe could not verify the dependency response.`,
							error,
							mutationBaseDetails(runtime, issue, normalized, ["blocked_by"]),
							"add_issue_dependency_response_partial_success",
						);
					}
					return handledDependencyRefusal(error, runtime, issue, normalized, "add") ?? throwError(error);
				}
				return dependencyMutationSuccessToolText(runtime, result, normalized);
			},
		}),
	);
}

export function registerRemoveIssueDependencyTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_remove_issue_dependency",
			label: "IssueMe Remove Issue Dependency",
			description: "Remove a native blocked-by dependency between open issues.",
			promptSnippet: "Remove native blocked-by dependency.",
			promptGuidelines: [
				"Use issueme_remove_issue_dependency to detach a prerequisite between two open issues; an already-absent edge is a safe no-op.",
			],
			executionMode: "sequential",
			parameters: IssueDependencyMutationParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeIssueDependencyMutationParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const { issue, blockingIssue } = await fetchDependencyMutationTargets(runtime, normalized, "remove_issue_dependency", signal);
				let result: GitHubIssueDependencyMutationResult;
				try {
					result = await runtime.client.removeIssueDependencyByIssueResponses(issue, blockingIssue, signal);
				} catch (error) {
					if (isRemoteMutationSuccessKnown(error)) {
						return remoteMutationPartialSuccessToolText(
							`GitHub accepted the request to remove the blocked-by dependency #${normalized.issueNumber} <- #${normalized.blockingIssueNumber}, but IssueMe could not verify the response.`,
							error,
							mutationBaseDetails(runtime, issue, normalized, ["blocked_by"]),
							"remove_issue_dependency_response_partial_success",
						);
					}
					return handledDependencyRefusal(error, runtime, issue, normalized, "remove") ?? throwError(error);
				}
				return dependencyMutationSuccessToolText(runtime, result, normalized);
			},
		}),
	);
}

function throwError(error: unknown): never {
	throw error;
}

function normalizeListIssueDependenciesParams(params: ListIssueDependenciesToolParams): NormalizedListIssueDependenciesParams {
	const direction = normalizeDirectionInput(params.direction);
	const after = normalizeContinuationTokenInput(params.after);
	if (after && direction === "both") {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "after requires direction blocked_by or blocking; a continuation token belongs to one dependency collection.", { field: "after" });
	}
	return {
		issueNumber: normalizePositiveSafeInteger(params.issueNumber, "issueNumber"),
		direction,
		limit: normalizeBoundedToolLimit(params.limit, { max: MAX_TOOL_ISSUES, defaultValue: DEFAULT_DEPENDENCY_LIMIT }),
		...(after ? { after } : {}),
	};
}

function normalizeDirectionInput(value: unknown): IssueDependencyDirection | "both" {
	if (value === undefined || value === "both") return "both";
	if (value === "blocked_by" || value === "blocking") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "direction must be blocked_by, blocking, or both.", { field: "direction" });
}

function normalizeIssueDependencyMutationParams(params: IssueDependencyMutationToolParams): NormalizedIssueDependencyMutationParams {
	const issueNumber = normalizePositiveSafeInteger(params.issueNumber, "issueNumber");
	const blockingIssueNumber = normalizePositiveSafeInteger(params.blockingIssueNumber, "blockingIssueNumber");
	assertDistinctDependencyNumbers(issueNumber, blockingIssueNumber);
	return { issueNumber, blockingIssueNumber };
}

async function fetchAllowedIssueAnyState(runtime: IssueMeRuntime, issueNumber: number, operation: string, signal?: AbortSignal): Promise<GitHubIssueResponse> {
	const issue = await runtime.client.getIssue(issueNumber, signal);
	assertDependencyTargetIsIssue(issue, "issueNumber");
	assertIssueCreatorAllowed(runtime.config, issue, { repository: runtime.repository, operation, issueNumber });
	return issue;
}

async function fetchAllowedOpenIssue(runtime: IssueMeRuntime, issueNumber: number, field: string, operation: string, signal?: AbortSignal): Promise<GitHubIssueResponse> {
	const issue = await runtime.client.ensureIssueOpen(issueNumber, signal);
	assertDependencyTargetIsIssue(issue, field);
	assertIssueCreatorAllowed(runtime.config, issue, { repository: runtime.repository, operation, issueNumber });
	return issue;
}

/** Both edge endpoints must be open, in-scope issues of the current repository; identities are revalidated immediately before mutation. */
async function fetchDependencyMutationTargets(
	runtime: IssueMeRuntime,
	params: NormalizedIssueDependencyMutationParams,
	operation: string,
	signal?: AbortSignal,
): Promise<{ issue: GitHubIssueResponse; blockingIssue: GitHubIssueResponse }> {
	const issue = await fetchAllowedOpenIssue(runtime, params.issueNumber, "issueNumber", operation, signal);
	const blockingIssue = await fetchAllowedOpenIssue(runtime, params.blockingIssueNumber, "blockingIssueNumber", `${operation}_blocker`, signal);
	return { issue, blockingIssue };
}

async function readDependencyDirection(
	runtime: IssueMeRuntime,
	params: NormalizedListIssueDependenciesParams,
	direction: IssueDependencyDirection,
	signal?: AbortSignal,
): Promise<DependencyDirectionRead> {
	const result = await runtime.client.listIssueDependencies(params.issueNumber, direction, { limit: params.limit, after: params.after }, signal);
	return summarizeDependencyDirection(runtime, result);
}

function summarizeDependencyDirection(runtime: IssueMeRuntime, result: GitHubIssueDependencyListResult): DependencyDirectionRead {
	const dependencies: ToolIssueDependencySummary[] = [];
	let omittedOutOfScope = 0;
	for (const issue of result.issues) {
		const summary = normalizeIssueDependencySummary(issue, result.direction, runtime.client.repository);
		if (!issueCreatorMatchesConfig(runtime.config, summary.creator)) {
			omittedOutOfScope += 1;
			continue;
		}
		dependencies.push(summary);
	}
	return {
		direction: result.direction,
		dependencies,
		omittedOutOfScope,
		truncated: result.truncated,
		...(result.continuation ? { continuation: result.continuation } : {}),
	};
}

function buildListDependenciesDetails(
	repository: string,
	creatorScope: string,
	issue: ToolIssueSummary,
	reads: DependencyDirectionRead[],
	params: NormalizedListIssueDependenciesParams,
): IssueMeToolDetails {
	const blockedBy = reads.find((read) => read.direction === "blocked_by");
	const blocking = reads.find((read) => read.direction === "blocking");
	const truncation: Record<string, unknown> = {};
	for (const read of reads) {
		if (read.truncated) truncation[read.direction] = { shown: read.dependencies.length, max: params.limit };
	}
	const single = reads.length === 1 ? reads[0] : undefined;
	return {
		repository,
		creatorScope,
		status: "list_issue_dependencies",
		issue,
		dependencies: reads.flatMap((read) => read.dependencies),
		counts: {
			blockedBy: blockedBy?.dependencies.length ?? 0,
			blocking: blocking?.dependencies.length ?? 0,
			omittedOutOfScope: reads.reduce((total, read) => total + read.omittedOutOfScope, 0),
			limit: params.limit,
		},
		cacheUpdated: false,
		needsSync: false,
		truncated: reads.some((read) => read.truncated),
		...(Object.keys(truncation).length > 0 ? { truncation } : {}),
		...(single?.continuation ? { continuation: single.continuation } : {}),
		message: DEPENDENCY_SEMANTICS_NOTE,
	};
}

function formatListDependenciesText(
	repository: string,
	issue: ToolIssueSummary,
	reads: DependencyDirectionRead[],
	params: NormalizedListIssueDependenciesParams,
	creatorScope: string,
): string {
	const lines: string[] = [
		`Native dependencies for ${repository}#${issue.number} [${issue.state}] ${issue.title}.`,
		`Creator scope: ${creatorScope}. This tool is read-only; it writes no local cache files.`,
	];
	for (const read of reads) lines.push(...formatDependencyDirectionLines(read, params));
	lines.push(`Semantics: ${DEPENDENCY_SEMANTICS_NOTE}`);
	const single = reads.length === 1 ? reads[0] : undefined;
	return appendContinuationLine(lines.join("\n"), single?.continuation);
}

function formatDependencyDirectionLines(read: DependencyDirectionRead, params: NormalizedListIssueDependenciesParams): string[] {
	const label = read.direction === "blocked_by" ? "Blocked by" : "Blocking";
	const lines = [`${label} (${read.dependencies.length}${read.truncated ? "+" : ""}):`];
	if (read.dependencies.length === 0) lines.push(`- none${read.truncated ? " in this page" : ""}`);
	for (const dependency of read.dependencies) lines.push(formatDependencyLine(dependency));
	if (read.omittedOutOfScope > 0) lines.push(`- ${read.omittedOutOfScope} dependency(ies) omitted: created outside the configured creator scope.`);
	if (read.truncated && params.direction === "both") lines.push(`- ${label} list truncated at ${params.limit}; rerun with direction ${read.direction} and the returned continuation token.`);
	return lines;
}

function formatDependencyLine(dependency: ToolIssueDependencySummary): string {
	const state = dependency.state ?? "unknown";
	const creator = dependency.creator ? `; by ${dependency.creator}` : "";
	const repositoryText = dependency.repository ? ` (${dependency.repository})` : "";
	return `- #${dependency.number} [${state}] ${dependency.title}${repositoryText}${creator}; ${dependency.html_url}`;
}

function mutationBaseDetails(runtime: IssueMeRuntime, issue: GitHubIssueResponse, params: NormalizedIssueDependencyMutationParams, changedFields: string[]): IssueMeToolDetails {
	return {
		repository: runtime.repository,
		creatorScope: issueCreatorScopeLabel(runtime.config),
		issue: requireIssueSummary(runtime.repository, issue, params.issueNumber),
		changedFields,
		cacheUpdated: false,
	};
}

function dependencyMutationSuccessToolText(runtime: IssueMeRuntime, result: GitHubIssueDependencyMutationResult, params: NormalizedIssueDependencyMutationParams) {
	const changed = result.status === "added" || result.status === "removed";
	const dependency = normalizeIssueDependencySummary(result.blockingIssue, "blocked_by", runtime.client.repository);
	const details: IssueMeToolDetails = {
		...mutationBaseDetails(runtime, result.issue, params, changed ? ["blocked_by"] : []),
		status: dependencyMutationStatus(result.status),
		dependency,
		counts: { changed: changed ? 1 : 0 },
		needsSync: false,
	};
	return toolText(formatDependencyMutationText(result, dependency, params), details);
}

function dependencyMutationStatus(status: GitHubIssueDependencyMutationResult["status"]): string {
	if (status === "added") return "dependency_added";
	if (status === "removed") return "dependency_removed";
	if (status === "already_present") return "dependency_already_present";
	return "dependency_already_absent";
}

function formatDependencyMutationText(result: GitHubIssueDependencyMutationResult, dependency: ToolIssueDependencySummary, params: NormalizedIssueDependencyMutationParams): string {
	const edge = `#${params.issueNumber} blocked by #${params.blockingIssueNumber} (${dependency.title})`;
	const lines = [formatDependencyMutationHeadline(result.status, edge)];
	if (result.inferred) lines.push("GitHub reported the dependency as not found during removal; no edge remains.");
	lines.push(`Blocking issue database id: ${result.blockingIssueId}.`);
	lines.push("No local cache files were changed; dependencies are not stored in issue cache records.");
	lines.push(`Semantics: ${DEPENDENCY_SEMANTICS_NOTE}`);
	return lines.join("\n");
}

function formatDependencyMutationHeadline(status: GitHubIssueDependencyMutationResult["status"], edge: string): string {
	if (status === "added") return `Added native dependency: ${edge}.`;
	if (status === "removed") return `Removed native dependency: ${edge}.`;
	if (status === "already_present") return `Native dependency already present: ${edge}; nothing was changed.`;
	return `Native dependency already absent: ${edge}; nothing was changed.`;
}

/** Documented GitHub refusals (validation/cycle or unavailable feature) are structured results; everything else keeps throwing. */
function handledDependencyRefusal(
	error: unknown,
	runtime: IssueMeRuntime,
	issue: GitHubIssueResponse,
	params: NormalizedIssueDependencyMutationParams,
	action: "add" | "remove",
): ReturnType<typeof toolText> | undefined {
	if (!(error instanceof GitHubApiError)) return undefined;
	if (error.code !== ISSUEME_ERROR_CODES.GITHUB_ISSUE_DEPENDENCY_REFUSED && error.code !== ISSUEME_ERROR_CODES.GITHUB_ISSUE_DEPENDENCIES_UNSUPPORTED) return undefined;
	const status = error.code === ISSUEME_ERROR_CODES.GITHUB_ISSUE_DEPENDENCY_REFUSED ? "dependency_refused" : "dependencies_unsupported";
	const verb = action === "add" ? "add" : "remove";
	const message = `GitHub did not ${verb} the dependency #${params.issueNumber} blocked by #${params.blockingIssueNumber}: ${error.message}`;
	return toolText(message, {
		...mutationBaseDetails(runtime, issue, params, []),
		status,
		needsSync: false,
		result: "error",
		message,
		error: safeToolError(error),
	});
}

function requireIssueSummary(repository: string, issue: GitHubIssueResponse, issueNumber: number): ToolIssueSummary {
	const summary = issueResponseToSafeSummary(repository, issue, issueNumber);
	if (summary) return summary;
	throw new GitHubApiError(`GitHub REST API returned issue #${issueNumber} without a valid open/closed state.`, { code: ISSUEME_ERROR_CODES.GITHUB_ISSUE_SHAPE_INVALID });
}
