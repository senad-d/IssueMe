import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import {
	MAX_CACHE_COMMENTS,
	MAX_TOOL_ASSIGNEES,
	MAX_TOOL_CHANGED_FIELDS,
	MAX_TOOL_DEVELOPMENT_LINKS,
	MAX_TOOL_ERROR_DETAIL_ITEMS,
	MAX_TOOL_ERROR_DETAIL_STRING_CHARS,
	MAX_TOOL_ERROR_MESSAGE_CHARS,
	MAX_TOOL_ISSUES,
	MAX_TOOL_LABELS,
	MAX_TOOL_MILESTONES,
	MAX_TOOL_PATHS,
	MAX_TOOL_PROJECT_FIELD_OPTIONS,
	MAX_TOOL_PROJECT_FIELDS,
	MAX_TOOL_PROJECT_ITERATIONS,
	MAX_TOOL_PROJECTS,
	MAX_TOOL_TEXT_CHARS,
	PROJECT_TRUST_REQUIREMENT,
} from "../constants.ts";
import { loadIssueMeConfig } from "../config/config.ts";
import { getIssueMeErrorTaxonomy, ISSUEME_ERROR_CODES, IssueMeError, isNodeError } from "../errors.ts";
import { GitHubClient, type FetchLike } from "../github/client.ts";
import { parseGitHubRepository, resolveCurrentRepository } from "../github/repository.ts";
import { githubIssueToRecord, issueRecordToToolSummary } from "../issues/format.ts";
import { relativeIssuePath, writeIssueRecord } from "../issues/store.ts";
import type { GitHubIssueResponse, GitHubRepository, IssueMeConfig, IssueMeToolDetails, IssueMeToolResult, IssueRecord, IssueRelationshipSummary, IssueWriteResult, SafeToolError, ToolAssigneeSummary, ToolBulkIssueResultStatus, ToolBulkIssueResultSummary, ToolCommentSummary, ToolFileActionSummary, ToolIssueDevelopmentLinkSummary, ToolIssueSummary, ToolLabelSummary, ToolMilestoneSummary, ToolProjectFieldOptionSummary, ToolProjectFieldSummary, ToolProjectItemSummary, ToolProjectIterationSummary, ToolProjectSummary } from "../types.ts";
import { assertNotAborted } from "../utils/abort.ts";
import { resolveGitHubToken } from "../utils/env.ts";
import { resolveIssueMeProjectRoot } from "../utils/project-root.ts";

export const ISSUEME_SHARED_PROMPT_GUIDELINE = "IssueMe shared for issueme_sync_issues and all issueme_* tools: current repository is implicit; issue means GitHub issue; cache means local IssueMe JSON; list/discovery tools are read-only unless sync/refresh; existing-issue mutations require open issues except issueme_reopen_issue.";

const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export interface IssueMeRuntime {
	projectRoot: string;
	config: IssueMeConfig;
	client: GitHubClient;
	repository: string;
	commentsTruncated: boolean;
	truncatedCommentIssues: number[];
}

export interface IssueMeRuntimeOptions {
	projectRoot?: string;
	config?: IssueMeConfig;
	repository?: GitHubRepository | string;
	token?: string;
	fetchFn?: FetchLike;
	client?: GitHubClient;
	env?: NodeJS.ProcessEnv;
}

export type IssueMeRuntimeOptionsProvider = IssueMeRuntimeOptions | ((ctx: ExtensionContext) => IssueMeRuntimeOptions | Promise<IssueMeRuntimeOptions>);

export interface IssueMeToolRegistrationOptions {
	runtime?: IssueMeRuntimeOptionsProvider;
}

export async function createIssueMeRuntime(ctx: ExtensionContext, optionsProvider?: IssueMeRuntimeOptionsProvider): Promise<IssueMeRuntime> {
	assertTrustedProject(ctx, `IssueMe tools require project trust. ${PROJECT_TRUST_REQUIREMENT}`);
	const options = await resolveRuntimeOptions(ctx, optionsProvider);
	const projectRoot = options.projectRoot ?? await getIssueMeProjectRoot(ctx.cwd);
	const config = options.config ?? await loadIssueMeConfig(projectRoot);
	const env = options.env ?? process.env;
	const client = options.client ?? await createRuntimeGitHubClient(projectRoot, env, options);
	const repository = options.repository ? normalizeRuntimeRepository(options.repository) : client.repository;
	if (client.repository.fullName !== repository.fullName) {
		throw new IssueMeError("runtime_repository_mismatch", "Injected IssueMe runtime client repository does not match the requested repository.");
	}
	return {
		projectRoot,
		config,
		client,
		repository: repository.fullName,
		commentsTruncated: false,
		truncatedCommentIssues: [],
	};
}

export async function resolveRuntimeOptions(ctx: ExtensionContext, optionsProvider?: IssueMeRuntimeOptionsProvider): Promise<IssueMeRuntimeOptions> {
	if (!optionsProvider) return {};
	return typeof optionsProvider === "function" ? await optionsProvider(ctx) : optionsProvider;
}

async function createRuntimeGitHubClient(
	projectRoot: string,
	env: NodeJS.ProcessEnv,
	options: IssueMeRuntimeOptions,
): Promise<GitHubClient> {
	const repository = options.repository
		? normalizeRuntimeRepository(options.repository)
		: await resolveCurrentRepository(projectRoot, env, { allowGitConfig: true });
	const token = options.token ?? (await resolveGitHubToken(projectRoot, env, { readProjectEnv: true })).token;
	return new GitHubClient({ repository, token, fetchFn: options.fetchFn });
}

export function normalizeRuntimeRepository(repository: GitHubRepository | string): GitHubRepository {
	const value = typeof repository === "string" ? repository : repository.fullName;
	const parsed = typeof value === "string" ? parseGitHubRepository(value) : undefined;
	if (!parsed) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_GITHUB_REPOSITORY, "Injected IssueMe runtime repository must be a valid GitHub owner/repo value.");
	}
	if (typeof repository !== "string" && (repository.owner !== parsed.owner || repository.repo !== parsed.repo || repository.fullName !== parsed.fullName)) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_GITHUB_REPOSITORY, "Injected IssueMe runtime repository fields must match the owner/repo fullName value.");
	}
	return parsed;
}

export async function getIssueMeProjectRoot(cwd: string): Promise<string> {
	return (await resolveIssueMeProjectRoot(cwd)).root;
}

export function isProjectTrusted(ctx: Pick<ExtensionContext, "isProjectTrusted">): boolean {
	return ctx.isProjectTrusted();
}

export function assertTrustedProject(ctx: Pick<ExtensionContext, "isProjectTrusted">, message: string): void {
	if (!isProjectTrusted(ctx)) throw new IssueMeError("project_untrusted", message);
}

export async function fetchIssueRecord(
	runtime: IssueMeRuntime,
	issue: GitHubIssueResponse,
	signal?: AbortSignal,
): Promise<IssueRecord> {
	const number = typeof issue.number === "number" ? issue.number : undefined;
	const comments = number ? await runtime.client.listComments(number, signal, { limit: MAX_CACHE_COMMENTS }) : [];
	const remoteCommentCount = typeof issue.comments === "number" && Number.isSafeInteger(issue.comments) && issue.comments >= comments.length
		? issue.comments
		: undefined;
	const commentsTruncated = remoteCommentCount !== undefined ? remoteCommentCount > comments.length : comments.length >= MAX_CACHE_COMMENTS;
	if (commentsTruncated) {
		runtime.commentsTruncated = true;
		if (number !== undefined && !runtime.truncatedCommentIssues.includes(number)) runtime.truncatedCommentIssues.push(number);
	}
	return githubIssueToRecord(runtime.client.repository, issue, comments, new Date().toISOString(), {
		limit: MAX_CACHE_COMMENTS,
		truncated: commentsTruncated,
		...(remoteCommentCount !== undefined ? { totalCount: remoteCommentCount } : {}),
	});
}

export async function refreshIssueRecord(
	runtime: IssueMeRuntime,
	issueNumber: number,
	signal?: AbortSignal,
): Promise<IssueRecord> {
	const issue = await runtime.client.getIssue(issueNumber, signal);
	return fetchIssueRecord(runtime, issue, signal);
}

export async function writeAndSummarizeIssue(
	_ctx: ExtensionContext,
	runtime: IssueMeRuntime,
	record: IssueRecord,
	signal?: AbortSignal,
): Promise<{ summary: ToolIssueSummary; path?: string; removedPaths: string[]; action: IssueWriteResult["action"] }> {
	assertNotAborted(signal);
	const writeResult = await writeIssueRecord(runtime.projectRoot, runtime.config, record, signal);
	const path = relativeIssuePath(runtime.projectRoot, writeResult.path);
	return {
		summary: issueRecordToToolSummary(record, path),
		path,
		removedPaths: writeResult.removedPaths.map((removedPath) => relativeIssuePath(runtime.projectRoot, removedPath) ?? removedPath),
		action: writeResult.action,
	};
}

export interface CachedIssueMutationResult {
	record: IssueRecord;
	summary: ToolIssueSummary;
	path?: string;
	removedPaths: string[];
	action: IssueWriteResult["action"];
}

export async function refreshAndCacheIssue(
	ctx: ExtensionContext,
	runtime: IssueMeRuntime,
	issueNumber: number,
	signal?: AbortSignal,
): Promise<CachedIssueMutationResult> {
	const record = await refreshIssueRecord(runtime, issueNumber, signal);
	const cached = await writeAndSummarizeIssue(ctx, runtime, record, signal);
	return { record, ...cached };
}

export { assertNotAborted };

export function isAbortError(error: unknown): boolean {
	return error instanceof IssueMeError && error.code === ISSUEME_ERROR_CODES.GITHUB_REQUEST_ABORTED;
}

/**
 * IssueMe tool-result policy:
 * - throw from execute() for Pi-level failures that should set tool isError=true;
 * - return details.result="success" for successful work and idempotent no-ops;
 * - return details.result="partial_success" when a remote mutation may have succeeded but cache/follow-up work failed;
 * - return details.result="error" only for documented, handled domain outcomes that are safer as structured results.
 * Pi itself only marks tool calls failed when execute() throws, so callers must inspect details.result/status too.
 */
export function toolText(text: string, details: IssueMeToolDetails = {}) {
	const content = truncateToolText(text);
	const normalizedDetails = normalizeToolDetails({
		...details,
		...(content.truncated
			? {
				truncated: true,
				truncation: {
					...(details.truncation ?? {}),
					content: { shownChars: content.text.length, totalChars: text.length, maxChars: MAX_TOOL_TEXT_CHARS },
				},
			}
			: {}),
	});
	return {
		content: [{ type: "text" as const, text: content.text }],
		details: boundToolDetails(normalizedDetails),
	};
}

export function boundToolDetails(details: IssueMeToolDetails): IssueMeToolDetails {
	const normalizedDetails = normalizeToolDetails(details);
	const paths = limitArray(normalizedDetails.paths, MAX_TOOL_PATHS);
	const removedPaths = limitArray(normalizedDetails.removedPaths, MAX_TOOL_PATHS);
	const changedFields = limitArray(normalizedDetails.changedFields, MAX_TOOL_CHANGED_FIELDS);
	const fileActions = limitArray(normalizedDetails.fileActions, MAX_TOOL_ISSUES);
	const boundedFileActions = fileActions.value?.map(boundToolFileActionSummary);
	const invalidFiles = limitArray(normalizedDetails.invalidFiles, MAX_TOOL_PATHS);
	const issue = boundToolIssueSummary(normalizedDetails.issue);
	const comment = boundToolCommentSummary(normalizedDetails.comment);
	const error = boundSafeToolError(normalizedDetails.error);
	const message = typeof normalizedDetails.message === "string" ? truncateSafeString(redactKnownSensitiveText(normalizedDetails.message), MAX_TOOL_ERROR_MESSAGE_CHARS) : undefined;
	const issues = limitArray(normalizedDetails.issues, MAX_TOOL_ISSUES);
	const boundedIssues = issues.value?.map((summary) => boundToolIssueSummary(summary));
	const labels = limitArray(normalizedDetails.labels, MAX_TOOL_LABELS);
	const boundedLabels = labels.value?.map(boundToolLabelSummary);
	const milestones = limitArray(normalizedDetails.milestones, MAX_TOOL_MILESTONES);
	const boundedMilestones = milestones.value?.map(boundToolMilestoneSummary);
	const assignees = limitArray(normalizedDetails.assignees, MAX_TOOL_ASSIGNEES);
	const boundedAssignees = assignees.value?.map(boundToolAssigneeSummary);
	const project = boundToolProjectSummary(normalizedDetails.project);
	const projects = limitArray(normalizedDetails.projects, MAX_TOOL_PROJECTS);
	const boundedProjects = projects.value?.map(boundToolProjectSummary);
	const projectFields = limitArray(normalizedDetails.projectFields, MAX_TOOL_PROJECT_FIELDS);
	const boundedProjectFields = projectFields.value?.map(boundToolProjectFieldSummary);
	const projectItem = boundToolProjectItemSummary(normalizedDetails.projectItem);
	const developmentLinks = limitArray(normalizedDetails.developmentLinks, MAX_TOOL_DEVELOPMENT_LINKS);
	const boundedDevelopmentLinks = developmentLinks.value?.map(boundToolDevelopmentLinkSummary);
	const bulkResults = limitArray(normalizedDetails.bulkResults, MAX_TOOL_ISSUES);
	const boundedBulkResults = bulkResults.value?.map(boundToolBulkIssueResultSummary);
	const truncation = buildToolTruncation(normalizedDetails, {
		paths,
		removedPaths,
		changedFields,
		fileActions,
		invalidFiles,
		issue,
		issues,
		labels,
		milestones,
		assignees,
		project,
		projects,
		projectFields,
		projectItem,
		developmentLinks,
		bulkResults,
		boundedIssues,
		boundedFileActions,
		boundedLabels,
		boundedMilestones,
		boundedAssignees,
		boundedProjects,
		boundedProjectFields,
		boundedDevelopmentLinks,
		boundedBulkResults,
	});
	const truncated = Boolean(normalizedDetails.truncated || Object.keys(truncation).length > 0);
	return {
		...normalizedDetails,
		...(issue.value ? { issue: issue.value } : {}),
		...(comment ? { comment } : {}),
		...(error ? { error } : {}),
		...(message ? { message } : {}),
		...(paths.value ? { paths: paths.value } : {}),
		...(removedPaths.value ? { removedPaths: removedPaths.value } : {}),
		...(changedFields.value ? { changedFields: changedFields.value } : {}),
		...(boundedIssues ? { issues: boundedIssues.map((summary) => summary.value).filter((value): value is ToolIssueSummary => value !== undefined) } : {}),
		...(boundedLabels ? { labels: boundedLabels.map((label) => label.value) } : {}),
		...(boundedMilestones ? { milestones: boundedMilestones.map((milestone) => milestone.value) } : {}),
		...(boundedAssignees ? { assignees: boundedAssignees.map((assignee) => assignee.value) } : {}),
		...(project.value ? { project: project.value } : {}),
		...(boundedProjects ? { projects: boundedProjects.map((summary) => summary.value).filter((value): value is ToolProjectSummary => value !== undefined) } : {}),
		...(boundedProjectFields ? { projectFields: boundedProjectFields.map((field) => field.value).filter((value): value is ToolProjectFieldSummary => value !== undefined) } : {}),
		...(projectItem.value ? { projectItem: projectItem.value } : {}),
		...(boundedDevelopmentLinks ? { developmentLinks: boundedDevelopmentLinks.map((link) => link.value) } : {}),
		...(boundedBulkResults ? { bulkResults: boundedBulkResults.map((result) => result.value) } : {}),
		...(boundedFileActions ? { fileActions: boundedFileActions.map((action) => action.value) } : {}),
		...(invalidFiles.value ? { invalidFiles: invalidFiles.value } : {}),
		...(truncated ? { truncated: true, truncation } : {}),
	};
}

export function listChangedFields(input: Record<string, unknown>): string[] {
	return Object.entries(input)
		.filter(([, value]) => value !== undefined)
		.map(([key]) => key);
}

export function sanitizeStringList(values: readonly string[] | undefined, fieldName = "values"): string[] {
	const normalized: string[] = [];
	for (const value of values ?? []) {
		const trimmed = value.trim();
		if (!trimmed) continue;
		if (trimmed.includes("\0")) {
			throw new IssueMeError("invalid_tool_input", `${fieldName} must not contain null bytes.`, { field: fieldName });
		}
		if (/\r|\n/.test(trimmed)) {
			throw new IssueMeError("invalid_tool_input", `${fieldName} entries must fit on one line.`, { field: fieldName });
		}
		normalized.push(trimmed);
	}
	return [...new Set(normalized)];
}

export function sanitizeGitHubLoginList(values: readonly string[] | undefined, fieldName = "assignees"): string[] {
	const normalized = sanitizeStringList(values, fieldName);
	for (const login of normalized) {
		if (!GITHUB_LOGIN_PATTERN.test(login)) {
			throw new IssueMeError("invalid_tool_input", `${fieldName} entries must be valid GitHub usernames.`, { field: fieldName });
		}
	}
	return normalized;
}

export function requireNonEmptyStrings(values: readonly string[] | undefined, fieldName: string): string[] {
	const normalized = sanitizeStringList(values, fieldName);
	if (normalized.length === 0) {
		throw new IssueMeError("invalid_tool_input", `${fieldName} must include at least one non-empty value.`, { field: fieldName });
	}
	return normalized;
}

export function requireNonEmptyGitHubLogins(values: readonly string[] | undefined, fieldName = "assignees"): string[] {
	const normalized = sanitizeGitHubLoginList(values, fieldName);
	if (normalized.length === 0) {
		throw new IssueMeError("invalid_tool_input", `${fieldName} must include at least one non-empty value.`, { field: fieldName });
	}
	return normalized;
}

export function requireNonEmptyTitle(title: string): string {
	const trimmed = title.trim();
	if (!trimmed) throw new IssueMeError("invalid_tool_input", "Issue title must not be empty.", { field: "title" });
	return trimmed;
}

export function safeToolError(error: unknown): SafeToolError {
	if (error instanceof IssueMeError) {
		return boundSafeToolError({
			code: error.code,
			category: error.category,
			message: error.message,
			recoveryHint: error.recoveryHint,
			details: error.safeDetails,
		}) ?? { code: error.code, message: "IssueMe operation failed.", recoveryHint: error.recoveryHint };
	}
	if (isNodeError(error) && typeof error.code === "string") {
		const taxonomy = getIssueMeErrorTaxonomy(ISSUEME_ERROR_CODES.LOCAL_CACHE_ERROR);
		return {
			code: `node_${error.code.toLowerCase()}`,
			category: taxonomy.category,
			message: "Local cache operation failed.",
			recoveryHint: taxonomy.recoveryHint,
			details: { nodeCode: error.code, category: taxonomy.category, recoveryHint: taxonomy.recoveryHint },
		};
	}
	const taxonomy = getIssueMeErrorTaxonomy(ISSUEME_ERROR_CODES.LOCAL_CACHE_ERROR);
	return {
		code: ISSUEME_ERROR_CODES.LOCAL_CACHE_ERROR,
		category: taxonomy.category,
		message: "Local cache operation failed.",
		recoveryHint: taxonomy.recoveryHint,
	};
}

export function partialSuccessToolError(error: unknown, partialSuccessStatus = "partial_success"): SafeToolError {
	const safeError = safeToolError(error);
	const taxonomy = getIssueMeErrorTaxonomy(ISSUEME_ERROR_CODES.PARTIAL_SUCCESS_CACHE_SYNC_REQUIRED);
	return boundSafeToolError({
		...safeError,
		recoveryHint: taxonomy.recoveryHint,
		details: {
			...(safeError.details ?? {}),
			partialSuccessCode: ISSUEME_ERROR_CODES.PARTIAL_SUCCESS_CACHE_SYNC_REQUIRED,
			partialSuccessStatus,
			partialSuccessRecoveryHint: taxonomy.recoveryHint,
		},
	}) ?? safeError;
}

export function partialSuccessToolText(
	text: string,
	error: unknown,
	details: IssueMeToolDetails = {},
	partialSuccessStatus = "partial_success",
	status = partialSuccessStatus,
) {
	const safeError = partialSuccessToolError(error, partialSuccessStatus);
	return toolText(text, {
		...details,
		cacheUpdated: false,
		needsSync: true,
		status,
		message: safeError.message,
		error: safeError,
	});
}

export function normalizeIssueBody(body: string, mode: "create" | "update"): string {
	if (body === "") return body;
	if (!body.trim()) {
		const message = mode === "update"
			? "Issue body cannot be blank whitespace. Use an explicit empty string to clear the body, or omit body to leave it unchanged."
			: "Issue body cannot be blank whitespace. Use an explicit empty string when the issue should have no body.";
		throw new IssueMeError("invalid_tool_input", message, { field: "body", mode });
	}
	return body;
}

function normalizeToolDetails(details: IssueMeToolDetails): IssueMeToolDetails {
	const result = inferToolResult(details);
	return {
		...details,
		result,
		paths: details.paths ?? [],
		removedPaths: details.removedPaths ?? [],
		changedFields: details.changedFields ?? [],
		cacheUpdated: details.cacheUpdated ?? false,
		needsSync: details.needsSync ?? result !== "success",
	};
}

function inferToolResult(details: IssueMeToolDetails): IssueMeToolResult {
	if (details.result) return details.result;
	if (details.error && (details.needsSync || details.status?.includes("partial_success") || details.status === "partial_success")) return "partial_success";
	if (details.error) return "error";
	if (details.status?.includes("partial_success") || details.status === "partial_success") return "partial_success";
	return "success";
}

interface LimitedArray<T> {
	value?: T[];
	truncated: boolean;
}

interface BoundedIssueSummary {
	value?: ToolIssueSummary;
	truncated: boolean;
	truncation: Record<string, unknown>;
}

interface BoundedFileActionSummary {
	value: ToolFileActionSummary;
	truncated: boolean;
	truncation: Record<string, unknown>;
}

interface BoundedLabelSummary {
	value: ToolLabelSummary;
	truncated: boolean;
	truncation: Record<string, unknown>;
}

interface BoundedMilestoneSummary {
	value: ToolMilestoneSummary;
	truncated: boolean;
	truncation: Record<string, unknown>;
}

interface BoundedAssigneeSummary {
	value: ToolAssigneeSummary;
	truncated: boolean;
	truncation: Record<string, unknown>;
}

interface BoundedProjectSummary {
	value?: ToolProjectSummary;
	truncated: boolean;
	truncation: Record<string, unknown>;
}

interface BoundedProjectFieldSummary {
	value?: ToolProjectFieldSummary;
	truncated: boolean;
	truncation: Record<string, unknown>;
}

interface BoundedProjectItemSummary {
	value?: ToolProjectItemSummary;
	truncated: boolean;
	truncation: Record<string, unknown>;
}

interface BoundedDevelopmentLinkSummary {
	value: ToolIssueDevelopmentLinkSummary;
	truncated: boolean;
	truncation: Record<string, unknown>;
}

interface BoundedBulkIssueResultSummary {
	value: ToolBulkIssueResultSummary;
	truncated: boolean;
	truncation: Record<string, unknown>;
}

function truncateToolText(text: string): { text: string; truncated: boolean } {
	if (text.length <= MAX_TOOL_TEXT_CHARS) return { text, truncated: false };
	const marker = "\n… [IssueMe tool output truncated]";
	const shownChars = Math.max(0, MAX_TOOL_TEXT_CHARS - marker.length);
	return { text: `${text.slice(0, shownChars)}${marker}`, truncated: true };
}

function boundToolIssueSummary(summary: ToolIssueSummary | undefined): BoundedIssueSummary {
	if (!summary) return { truncated: false, truncation: {} };
	const labels = limitArray(summary.labels, MAX_TOOL_LABELS);
	const assignees = limitArray(summary.assignees, MAX_TOOL_ASSIGNEES);
	const parentIssue = summary.parentIssue === null ? { value: null, truncated: false, truncation: {} } : boundIssueRelationshipSummary(summary.parentIssue);
	const subIssues = limitArray(summary.subIssues, MAX_TOOL_ISSUES);
	const boundedSubIssues = subIssues.value?.map(boundIssueRelationshipSummary);
	const childIssueTruncations = boundedSubIssues?.filter((issue) => issue.truncated).length ?? 0;
	const truncation: Record<string, unknown> = {};
	if (labels.truncated) truncation.labels = { shown: labels.value?.length ?? 0, total: summary.labels.length, max: MAX_TOOL_LABELS };
	if (assignees.truncated) truncation.assignees = { shown: assignees.value?.length ?? 0, total: summary.assignees.length, max: MAX_TOOL_ASSIGNEES };
	if (parentIssue.truncated) truncation.parentIssue = parentIssue.truncation;
	if (subIssues.truncated || childIssueTruncations > 0) {
		truncation.subIssues = {
			...(subIssues.truncated ? { shown: subIssues.value?.length ?? 0, total: summary.subIssues?.length ?? 0, max: MAX_TOOL_ISSUES } : {}),
			...(childIssueTruncations > 0 ? { affectedSummaries: childIssueTruncations } : {}),
		};
	}
	return {
		value: {
			...summary,
			labels: labels.value ?? [],
			assignees: assignees.value ?? [],
			...(summary.parentIssue !== undefined ? { parentIssue: parentIssue.value } : {}),
			...(boundedSubIssues ? { subIssues: boundedSubIssues.map((issue) => issue.value).filter((issue): issue is IssueRelationshipSummary => issue !== undefined) } : {}),
		},
		truncated: labels.truncated || assignees.truncated || parentIssue.truncated || subIssues.truncated || childIssueTruncations > 0,
		truncation,
	};
}

function boundToolCommentSummary(comment: ToolCommentSummary | undefined): ToolCommentSummary | undefined {
	if (!comment) return undefined;
	return {
		...(typeof comment.id === "number" && Number.isSafeInteger(comment.id) ? { id: comment.id } : {}),
		...(typeof comment.html_url === "string" ? { html_url: truncateSafeString(comment.html_url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS) } : {}),
	};
}

function boundToolLabelSummary(label: ToolLabelSummary): BoundedLabelSummary {
	const name = truncateSafeString(redactKnownSensitiveText(label.name), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const description = label.description === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(label.description), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const color = label.color === undefined ? undefined : truncateSafeString(label.color, 32);
	const url = label.url === undefined ? undefined : truncateSafeString(label.url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const truncation: Record<string, unknown> = {};
	if (name !== label.name) truncation.name = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (description !== label.description) truncation.description = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (color !== label.color) truncation.color = { maxChars: 32 };
	if (url !== label.url) truncation.url = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	return {
		value: {
			name,
			...(description !== undefined ? { description } : {}),
			...(color !== undefined ? { color } : {}),
			...(typeof label.default === "boolean" ? { default: label.default } : {}),
			...(url !== undefined ? { url } : {}),
		},
		truncated: Object.keys(truncation).length > 0,
		truncation,
	};
}

function boundToolMilestoneSummary(milestone: ToolMilestoneSummary): BoundedMilestoneSummary {
	const title = truncateSafeString(redactKnownSensitiveText(milestone.title), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const description = milestone.description === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(milestone.description), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const dueOn = milestone.due_on === undefined ? undefined : truncateSafeString(milestone.due_on, 64);
	const htmlUrl = milestone.html_url === undefined ? undefined : truncateSafeString(milestone.html_url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const url = milestone.url === undefined ? undefined : truncateSafeString(milestone.url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const truncation: Record<string, unknown> = {};
	if (title !== milestone.title) truncation.title = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (description !== milestone.description) truncation.description = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (dueOn !== milestone.due_on) truncation.due_on = { maxChars: 64 };
	if (htmlUrl !== milestone.html_url) truncation.html_url = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (url !== milestone.url) truncation.url = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	return {
		value: {
			number: milestone.number,
			title,
			state: milestone.state,
			...(description !== undefined ? { description } : {}),
			...(dueOn !== undefined ? { due_on: dueOn } : {}),
			...(typeof milestone.open_issues === "number" && Number.isSafeInteger(milestone.open_issues) ? { open_issues: milestone.open_issues } : {}),
			...(typeof milestone.closed_issues === "number" && Number.isSafeInteger(milestone.closed_issues) ? { closed_issues: milestone.closed_issues } : {}),
			...(htmlUrl !== undefined ? { html_url: htmlUrl } : {}),
			...(url !== undefined ? { url } : {}),
		},
		truncated: Object.keys(truncation).length > 0,
		truncation,
	};
}

function boundToolAssigneeSummary(assignee: ToolAssigneeSummary): BoundedAssigneeSummary {
	const login = truncateSafeString(redactKnownSensitiveText(assignee.login), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const type = assignee.type === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(assignee.type), 120);
	const htmlUrl = assignee.html_url === undefined ? undefined : truncateSafeString(assignee.html_url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const url = assignee.url === undefined ? undefined : truncateSafeString(assignee.url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const truncation: Record<string, unknown> = {};
	if (login !== assignee.login) truncation.login = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (type !== assignee.type) truncation.type = { maxChars: 120 };
	if (htmlUrl !== assignee.html_url) truncation.html_url = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (url !== assignee.url) truncation.url = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	return {
		value: {
			login,
			...(typeof assignee.id === "number" && Number.isSafeInteger(assignee.id) ? { id: assignee.id } : {}),
			...(type !== undefined ? { type } : {}),
			...(htmlUrl !== undefined ? { html_url: htmlUrl } : {}),
			...(url !== undefined ? { url } : {}),
		},
		truncated: Object.keys(truncation).length > 0,
		truncation,
	};
}

function boundToolProjectSummary(project: ToolProjectSummary | undefined): BoundedProjectSummary {
	if (!project) return { truncated: false, truncation: {} };
	const id = truncateSafeString(redactKnownSensitiveText(project.id), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const title = truncateSafeString(redactKnownSensitiveText(project.title), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const owner = truncateSafeString(redactKnownSensitiveText(project.owner), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const url = project.url === undefined ? undefined : truncateSafeString(project.url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const shortDescription = project.shortDescription === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(project.shortDescription), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const truncation: Record<string, unknown> = {};
	if (id !== project.id) truncation.id = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (title !== project.title) truncation.title = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (owner !== project.owner) truncation.owner = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (url !== project.url) truncation.url = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (shortDescription !== project.shortDescription) truncation.shortDescription = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	return {
		value: {
			id,
			title,
			number: project.number,
			owner,
			ownerType: project.ownerType,
			...(url !== undefined ? { url } : {}),
			...(shortDescription !== undefined ? { shortDescription } : {}),
			...(typeof project.closed === "boolean" ? { closed: project.closed } : {}),
			...(typeof project.public === "boolean" ? { public: project.public } : {}),
		},
		truncated: Object.keys(truncation).length > 0,
		truncation,
	};
}

function boundToolProjectFieldSummary(field: ToolProjectFieldSummary | undefined): BoundedProjectFieldSummary {
	if (!field) return { truncated: false, truncation: {} };
	const id = truncateSafeString(redactKnownSensitiveText(field.id), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const name = truncateSafeString(redactKnownSensitiveText(field.name), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const dataType = truncateSafeString(redactKnownSensitiveText(field.dataType), 120);
	const type = field.type === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(field.type), 120);
	const options = limitArray(field.options?.map(boundToolProjectFieldOption), MAX_TOOL_PROJECT_FIELD_OPTIONS);
	const iterations = limitArray(field.iterations?.map(boundToolProjectIteration), MAX_TOOL_PROJECT_ITERATIONS);
	const completedIterations = limitArray(field.completedIterations?.map(boundToolProjectIteration), MAX_TOOL_PROJECT_ITERATIONS);
	const truncation: Record<string, unknown> = { ...(field.truncation ?? {}) };
	if (id !== field.id) truncation.id = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (name !== field.name) truncation.name = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (dataType !== field.dataType) truncation.dataType = { maxChars: 120 };
	if (type !== field.type) truncation.type = { maxChars: 120 };
	if (options.truncated) truncation.options = { shown: options.value?.length ?? 0, total: field.options?.length ?? 0, max: MAX_TOOL_PROJECT_FIELD_OPTIONS };
	if (iterations.truncated) truncation.iterations = { shown: iterations.value?.length ?? 0, total: field.iterations?.length ?? 0, max: MAX_TOOL_PROJECT_ITERATIONS };
	if (completedIterations.truncated) truncation.completedIterations = { shown: completedIterations.value?.length ?? 0, total: field.completedIterations?.length ?? 0, max: MAX_TOOL_PROJECT_ITERATIONS };
	const truncated = Boolean(field.truncated || Object.keys(truncation).length > 0);
	return {
		value: {
			id,
			name,
			dataType,
			...(type !== undefined ? { type } : {}),
			...(options.value ? { options: options.value } : {}),
			...(iterations.value ? { iterations: iterations.value } : {}),
			...(completedIterations.value ? { completedIterations: completedIterations.value } : {}),
			...(truncated ? { truncated: true, truncation } : {}),
		},
		truncated,
		truncation,
	};
}

function boundToolProjectItemSummary(item: ToolProjectItemSummary | undefined): BoundedProjectItemSummary {
	if (!item) return { truncated: false, truncation: {} };
	const id = truncateSafeString(redactKnownSensitiveText(item.id), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const type = item.type === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(item.type), 120);
	const project = boundToolProjectSummary(item.project);
	const issue = boundIssueRelationshipSummary(item.issue);
	const truncation: Record<string, unknown> = {};
	if (id !== item.id) truncation.id = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (type !== item.type) truncation.type = { maxChars: 120 };
	if (project.truncated) truncation.project = project.truncation;
	if (issue.truncated) truncation.issue = issue.truncation;
	return {
		value: {
			id,
			...(type !== undefined ? { type } : {}),
			...(project.value ? { project: project.value } : {}),
			...(issue.value ? { issue: issue.value } : {}),
		},
		truncated: Object.keys(truncation).length > 0,
		truncation,
	};
}

function boundToolDevelopmentLinkSummary(link: ToolIssueDevelopmentLinkSummary): BoundedDevelopmentLinkSummary {
	const referenceTypes = limitArray(link.referenceTypes, MAX_TOOL_CHANGED_FIELDS);
	const title = link.title === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(link.title), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const htmlUrl = link.html_url === undefined ? undefined : truncateSafeString(link.html_url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const branchName = link.branchName === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(link.branchName), 180);
	const baseBranchName = link.baseBranchName === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(link.baseBranchName), 180);
	const commitOid = link.commitOid === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(link.commitOid), 120);
	const message = link.message === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(link.message), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const truncation: Record<string, unknown> = {};
	if (referenceTypes.truncated) truncation.referenceTypes = { shown: referenceTypes.value?.length ?? 0, total: link.referenceTypes.length, max: MAX_TOOL_CHANGED_FIELDS };
	if (title !== link.title) truncation.title = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (htmlUrl !== link.html_url) truncation.html_url = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (branchName !== link.branchName) truncation.branchName = { maxChars: 180 };
	if (baseBranchName !== link.baseBranchName) truncation.baseBranchName = { maxChars: 180 };
	if (commitOid !== link.commitOid) truncation.commitOid = { maxChars: 120 };
	if (message !== link.message) truncation.message = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	return {
		value: {
			type: link.type,
			referenceTypes: referenceTypes.value ?? [],
			...(typeof link.number === "number" && Number.isSafeInteger(link.number) ? { number: link.number } : {}),
			...(title !== undefined ? { title } : {}),
			...(link.state === "open" || link.state === "closed" || link.state === "merged" ? { state: link.state } : {}),
			...(htmlUrl !== undefined ? { html_url: htmlUrl } : {}),
			...(branchName !== undefined ? { branchName } : {}),
			...(baseBranchName !== undefined ? { baseBranchName } : {}),
			...(commitOid !== undefined ? { commitOid } : {}),
			...(message !== undefined ? { message } : {}),
			...(typeof link.willCloseTarget === "boolean" ? { willCloseTarget: link.willCloseTarget } : {}),
			...(typeof link.closedBy === "boolean" ? { closedBy: link.closedBy } : {}),
			...(typeof link.isDraft === "boolean" ? { isDraft: link.isDraft } : {}),
		},
		truncated: Object.keys(truncation).length > 0,
		truncation,
	};
}

function boundIssueRelationshipSummary(issue: IssueRelationshipSummary | undefined): { value?: IssueRelationshipSummary; truncated: boolean; truncation: Record<string, unknown> } {
	if (!issue) return { truncated: false, truncation: {} };
	const title = truncateSafeString(redactKnownSensitiveText(issue.title), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const htmlUrl = truncateSafeString(issue.html_url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const truncation: Record<string, unknown> = {};
	if (title !== issue.title) truncation.title = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	if (htmlUrl !== issue.html_url) truncation.html_url = { maxChars: MAX_TOOL_ERROR_DETAIL_STRING_CHARS };
	return {
		value: {
			number: issue.number,
			title,
			...(issue.state ? { state: issue.state } : {}),
			html_url: htmlUrl,
		},
		truncated: Object.keys(truncation).length > 0,
		truncation,
	};
}

function boundToolProjectFieldOption(option: ToolProjectFieldOptionSummary): ToolProjectFieldOptionSummary {
	const description = option.description === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(option.description), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const color = option.color === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(option.color), 64);
	return {
		id: truncateSafeString(redactKnownSensitiveText(option.id), MAX_TOOL_ERROR_DETAIL_STRING_CHARS),
		name: truncateSafeString(redactKnownSensitiveText(option.name), MAX_TOOL_ERROR_DETAIL_STRING_CHARS),
		...(color !== undefined ? { color } : {}),
		...(description !== undefined ? { description } : {}),
	};
}

function boundToolProjectIteration(iteration: ToolProjectIterationSummary): ToolProjectIterationSummary {
	return {
		id: truncateSafeString(redactKnownSensitiveText(iteration.id), MAX_TOOL_ERROR_DETAIL_STRING_CHARS),
		title: truncateSafeString(redactKnownSensitiveText(iteration.title), MAX_TOOL_ERROR_DETAIL_STRING_CHARS),
		...(iteration.startDate !== undefined ? { startDate: truncateSafeString(iteration.startDate, 64) } : {}),
		...(typeof iteration.duration === "number" && Number.isSafeInteger(iteration.duration) ? { duration: iteration.duration } : {}),
	};
}

function boundSafeToolError(error: SafeToolError | undefined): SafeToolError | undefined {
	if (!error) return undefined;
	const details = sanitizeSafeDetailValue(error.details);
	const category = typeof error.category === "string" ? sanitizeErrorCode(error.category) : undefined;
	const recoveryHint = typeof error.recoveryHint === "string"
		? truncateSafeString(redactKnownSensitiveText(error.recoveryHint), MAX_TOOL_ERROR_MESSAGE_CHARS)
		: undefined;
	return {
		code: sanitizeErrorCode(error.code),
		...(category ? { category } : {}),
		message: truncateSafeString(redactKnownSensitiveText(error.message), MAX_TOOL_ERROR_MESSAGE_CHARS),
		...(recoveryHint ? { recoveryHint } : {}),
		...(isRecord(details) ? { details } : {}),
	};
}

function boundToolFileActionSummary(action: ToolFileActionSummary): BoundedFileActionSummary {
	const issue = boundToolIssueSummary(action.issue);
	return {
		value: {
			...action,
			...(issue.value ? { issue: issue.value } : {}),
		},
		truncated: issue.truncated,
		truncation: issue.truncation,
	};
}

function boundToolBulkIssueResultSummary(result: ToolBulkIssueResultSummary): BoundedBulkIssueResultSummary {
	const issue = boundToolIssueSummary(result.issue);
	const projectItem = boundToolProjectItemSummary(result.projectItem);
	const paths = limitArray(result.paths, MAX_TOOL_PATHS);
	const removedPaths = limitArray(result.removedPaths, MAX_TOOL_PATHS);
	const changedFields = limitArray(result.changedFields, MAX_TOOL_CHANGED_FIELDS);
	const error = boundSafeToolError(result.error);
	const message = typeof result.message === "string" ? truncateSafeString(redactKnownSensitiveText(result.message), MAX_TOOL_ERROR_MESSAGE_CHARS) : undefined;
	const action = truncateSafeString(redactKnownSensitiveText(result.action), 120);
	const status = normalizeBulkIssueResultStatus(result.status);
	const truncation: Record<string, unknown> = {};
	if (message !== result.message) truncation.message = { maxChars: MAX_TOOL_ERROR_MESSAGE_CHARS };
	if (action !== result.action) truncation.action = { maxChars: 120 };
	if (paths.truncated) truncation.paths = { shown: paths.value?.length ?? 0, total: result.paths?.length ?? 0, max: MAX_TOOL_PATHS };
	if (removedPaths.truncated) truncation.removedPaths = { shown: removedPaths.value?.length ?? 0, total: result.removedPaths?.length ?? 0, max: MAX_TOOL_PATHS };
	if (changedFields.truncated) truncation.changedFields = { shown: changedFields.value?.length ?? 0, total: result.changedFields?.length ?? 0, max: MAX_TOOL_CHANGED_FIELDS };
	if (issue.truncated) truncation.issue = issue.truncation;
	if (projectItem.truncated) truncation.projectItem = projectItem.truncation;
	return {
		value: {
			number: Number.isSafeInteger(result.number) && result.number > 0 ? result.number : 0,
			action,
			status,
			...(message ? { message } : {}),
			...(issue.value ? { issue: issue.value } : {}),
			...(projectItem.value ? { projectItem: projectItem.value } : {}),
			...(paths.value ? { paths: paths.value } : {}),
			...(removedPaths.value ? { removedPaths: removedPaths.value } : {}),
			...(changedFields.value ? { changedFields: changedFields.value } : {}),
			...(typeof result.cacheUpdated === "boolean" ? { cacheUpdated: result.cacheUpdated } : {}),
			...(typeof result.needsSync === "boolean" ? { needsSync: result.needsSync } : {}),
			...(error ? { error } : {}),
		},
		truncated: Object.keys(truncation).length > 0,
		truncation,
	};
}

function normalizeBulkIssueResultStatus(status: ToolBulkIssueResultStatus): ToolBulkIssueResultStatus {
	if (status === "success" || status === "partial_success" || status === "failed" || status === "skipped") return status;
	return "failed";
}

function buildToolTruncation(
	details: IssueMeToolDetails,
	limits: {
		paths: LimitedArray<string>;
		removedPaths: LimitedArray<string>;
		changedFields: LimitedArray<string>;
		fileActions: LimitedArray<ToolFileActionSummary>;
		invalidFiles: LimitedArray<unknown>;
		issue: BoundedIssueSummary;
		issues: LimitedArray<ToolIssueSummary>;
		labels: LimitedArray<ToolLabelSummary>;
		milestones: LimitedArray<ToolMilestoneSummary>;
		assignees: LimitedArray<ToolAssigneeSummary>;
		project: BoundedProjectSummary;
		projects: LimitedArray<ToolProjectSummary>;
		projectFields: LimitedArray<ToolProjectFieldSummary>;
		projectItem: BoundedProjectItemSummary;
		developmentLinks: LimitedArray<ToolIssueDevelopmentLinkSummary>;
		bulkResults: LimitedArray<ToolBulkIssueResultSummary>;
		boundedIssues?: BoundedIssueSummary[];
		boundedFileActions?: BoundedFileActionSummary[];
		boundedLabels?: BoundedLabelSummary[];
		boundedMilestones?: BoundedMilestoneSummary[];
		boundedAssignees?: BoundedAssigneeSummary[];
		boundedProjects?: BoundedProjectSummary[];
		boundedProjectFields?: BoundedProjectFieldSummary[];
		boundedDevelopmentLinks?: BoundedDevelopmentLinkSummary[];
		boundedBulkResults?: BoundedBulkIssueResultSummary[];
	},
): Record<string, unknown> {
	const truncation: Record<string, unknown> = { ...(details.truncation ?? {}) };
	if (limits.paths.truncated) mergeTruncationSection(truncation, "paths", { shown: limits.paths.value?.length ?? 0, total: details.paths?.length ?? 0, max: MAX_TOOL_PATHS });
	if (limits.removedPaths.truncated) mergeTruncationSection(truncation, "removedPaths", { shown: limits.removedPaths.value?.length ?? 0, total: details.removedPaths?.length ?? 0, max: MAX_TOOL_PATHS });
	if (limits.changedFields.truncated) mergeTruncationSection(truncation, "changedFields", { shown: limits.changedFields.value?.length ?? 0, total: details.changedFields?.length ?? 0, max: MAX_TOOL_CHANGED_FIELDS });
	if (limits.fileActions.truncated) mergeTruncationSection(truncation, "fileActions", { shown: limits.fileActions.value?.length ?? 0, total: details.fileActions?.length ?? 0, max: MAX_TOOL_ISSUES });
	if (limits.invalidFiles.truncated) mergeTruncationSection(truncation, "invalidFiles", { shown: limits.invalidFiles.value?.length ?? 0, total: details.invalidFiles?.length ?? 0, max: MAX_TOOL_PATHS });
	if (limits.issue.truncated) mergeTruncationSection(truncation, "issue", limits.issue.truncation);

	const issueSummaryTruncation = collectIssueSummaryTruncation(limits.boundedIssues);
	const issueSection = {
		...(limits.issues.truncated ? { shown: limits.issues.value?.length ?? 0, total: details.issues?.length ?? 0, max: MAX_TOOL_ISSUES } : {}),
		...issueSummaryTruncation,
	};
	if (Object.keys(issueSection).length > 0) mergeTruncationSection(truncation, "issues", issueSection);

	const labelSummaryTruncation = collectLabelSummaryTruncation(limits.boundedLabels);
	const labelSection = {
		...(limits.labels.truncated ? { shown: limits.labels.value?.length ?? 0, total: details.labels?.length ?? 0, max: MAX_TOOL_LABELS } : {}),
		...labelSummaryTruncation,
	};
	if (Object.keys(labelSection).length > 0) mergeTruncationSection(truncation, "labels", labelSection);

	const milestoneSummaryTruncation = collectMilestoneSummaryTruncation(limits.boundedMilestones);
	const milestoneSection = {
		...(limits.milestones.truncated ? { shown: limits.milestones.value?.length ?? 0, total: details.milestones?.length ?? 0, max: MAX_TOOL_MILESTONES } : {}),
		...milestoneSummaryTruncation,
	};
	if (Object.keys(milestoneSection).length > 0) mergeTruncationSection(truncation, "milestones", milestoneSection);

	const assigneeSummaryTruncation = collectAssigneeSummaryTruncation(limits.boundedAssignees);
	const assigneeSection = {
		...(limits.assignees.truncated ? { shown: limits.assignees.value?.length ?? 0, total: details.assignees?.length ?? 0, max: MAX_TOOL_ASSIGNEES } : {}),
		...assigneeSummaryTruncation,
	};
	if (Object.keys(assigneeSection).length > 0) mergeTruncationSection(truncation, "assignees", assigneeSection);

	if (limits.project.truncated) mergeTruncationSection(truncation, "project", limits.project.truncation);
	const projectSummaryTruncation = collectProjectSummaryTruncation(limits.boundedProjects);
	const projectSection = {
		...(limits.projects.truncated ? { shown: limits.projects.value?.length ?? 0, total: details.projects?.length ?? 0, max: MAX_TOOL_PROJECTS } : {}),
		...projectSummaryTruncation,
	};
	if (Object.keys(projectSection).length > 0) mergeTruncationSection(truncation, "projects", projectSection);

	const projectFieldSummaryTruncation = collectProjectFieldSummaryTruncation(limits.boundedProjectFields);
	const projectFieldSection = {
		...(limits.projectFields.truncated ? { shown: limits.projectFields.value?.length ?? 0, total: details.projectFields?.length ?? 0, max: MAX_TOOL_PROJECT_FIELDS } : {}),
		...projectFieldSummaryTruncation,
	};
	if (Object.keys(projectFieldSection).length > 0) mergeTruncationSection(truncation, "projectFields", projectFieldSection);
	if (limits.projectItem.truncated) mergeTruncationSection(truncation, "projectItem", limits.projectItem.truncation);

	const developmentLinkSummaryTruncation = collectDevelopmentLinkSummaryTruncation(limits.boundedDevelopmentLinks);
	const developmentLinkSection = {
		...(limits.developmentLinks.truncated ? { shown: limits.developmentLinks.value?.length ?? 0, total: details.developmentLinks?.length ?? 0, max: MAX_TOOL_DEVELOPMENT_LINKS } : {}),
		...developmentLinkSummaryTruncation,
	};
	if (Object.keys(developmentLinkSection).length > 0) mergeTruncationSection(truncation, "developmentLinks", developmentLinkSection);

	const bulkResultTruncation = collectBulkResultTruncation(limits.boundedBulkResults);
	const bulkResultSection = {
		...(limits.bulkResults.truncated ? { shown: limits.bulkResults.value?.length ?? 0, total: details.bulkResults?.length ?? 0, max: MAX_TOOL_ISSUES } : {}),
		...bulkResultTruncation,
	};
	if (Object.keys(bulkResultSection).length > 0) mergeTruncationSection(truncation, "bulkResults", bulkResultSection);

	const fileActionIssueTruncation = collectIssueSummaryTruncation(limits.boundedFileActions);
	if (Object.keys(fileActionIssueTruncation).length > 0) mergeTruncationSection(truncation, "fileActionIssues", fileActionIssueTruncation);
	return truncation;
}

function collectIssueSummaryTruncation(summaries: Array<{ truncation: Record<string, unknown> }> | undefined): Record<string, unknown> {
	if (!summaries) return {};
	const labelAffected = summaries.filter((summary) => summary.truncation.labels !== undefined).length;
	const assigneeAffected = summaries.filter((summary) => summary.truncation.assignees !== undefined).length;
	const parentIssueAffected = summaries.filter((summary) => summary.truncation.parentIssue !== undefined).length;
	const subIssueAffected = summaries.filter((summary) => summary.truncation.subIssues !== undefined).length;
	return {
		...(labelAffected ? { labels: { affectedIssues: labelAffected, maxPerIssue: MAX_TOOL_LABELS } } : {}),
		...(assigneeAffected ? { assignees: { affectedIssues: assigneeAffected, maxPerIssue: MAX_TOOL_ASSIGNEES } } : {}),
		...(parentIssueAffected ? { parentIssue: { affectedIssues: parentIssueAffected } } : {}),
		...(subIssueAffected ? { subIssues: { affectedIssues: subIssueAffected, maxPerIssue: MAX_TOOL_ISSUES } } : {}),
	};
}

function collectLabelSummaryTruncation(summaries: BoundedLabelSummary[] | undefined): Record<string, unknown> {
	if (!summaries) return {};
	const fields = ["name", "description", "color", "url"];
	return Object.fromEntries(fields
		.map((field) => [field, summaries.filter((summary) => summary.truncation[field] !== undefined).length] as const)
		.filter(([, count]) => count > 0)
		.map(([field, count]) => [field, { affectedLabels: count }]));
}

function collectMilestoneSummaryTruncation(summaries: BoundedMilestoneSummary[] | undefined): Record<string, unknown> {
	if (!summaries) return {};
	const fields = ["title", "description", "due_on", "html_url", "url"];
	return Object.fromEntries(fields
		.map((field) => [field, summaries.filter((summary) => summary.truncation[field] !== undefined).length] as const)
		.filter(([, count]) => count > 0)
		.map(([field, count]) => [field, { affectedMilestones: count }]));
}

function collectAssigneeSummaryTruncation(summaries: BoundedAssigneeSummary[] | undefined): Record<string, unknown> {
	if (!summaries) return {};
	const fields = ["login", "type", "html_url", "url"];
	return Object.fromEntries(fields
		.map((field) => [field, summaries.filter((summary) => summary.truncation[field] !== undefined).length] as const)
		.filter(([, count]) => count > 0)
		.map(([field, count]) => [field, { affectedAssignees: count }]));
}

function collectProjectSummaryTruncation(summaries: BoundedProjectSummary[] | undefined): Record<string, unknown> {
	if (!summaries) return {};
	const fields = ["id", "title", "owner", "url", "shortDescription"];
	return Object.fromEntries(fields
		.map((field) => [field, summaries.filter((summary) => summary.truncation[field] !== undefined).length] as const)
		.filter(([, count]) => count > 0)
		.map(([field, count]) => [field, { affectedProjects: count }]));
}

function collectProjectFieldSummaryTruncation(summaries: BoundedProjectFieldSummary[] | undefined): Record<string, unknown> {
	if (!summaries) return {};
	const fields = ["id", "name", "dataType", "type", "options", "iterations", "completedIterations"];
	return Object.fromEntries(fields
		.map((field) => [field, summaries.filter((summary) => summary.truncation[field] !== undefined).length] as const)
		.filter(([, count]) => count > 0)
		.map(([field, count]) => [field, { affectedFields: count }]));
}

function collectDevelopmentLinkSummaryTruncation(summaries: BoundedDevelopmentLinkSummary[] | undefined): Record<string, unknown> {
	if (!summaries) return {};
	const fields = ["referenceTypes", "title", "html_url", "branchName", "baseBranchName", "commitOid", "message"];
	return Object.fromEntries(fields
		.map((field) => [field, summaries.filter((summary) => summary.truncation[field] !== undefined).length] as const)
		.filter(([, count]) => count > 0)
		.map(([field, count]) => [field, { affectedDevelopmentLinks: count }]));
}

function collectBulkResultTruncation(summaries: BoundedBulkIssueResultSummary[] | undefined): Record<string, unknown> {
	if (!summaries) return {};
	const fields = ["action", "message", "paths", "removedPaths", "changedFields", "issue", "projectItem"];
	return Object.fromEntries(fields
		.map((field) => [field, summaries.filter((summary) => summary.truncation[field] !== undefined).length] as const)
		.filter(([, count]) => count > 0)
		.map(([field, count]) => [field, { affectedBulkResults: count }]));
}

function mergeTruncationSection(target: Record<string, unknown>, key: string, value: Record<string, unknown>): void {
	const current = target[key];
	target[key] = isRecord(current) ? { ...current, ...value } : value;
}

function sanitizeSafeDetailValue(value: unknown): unknown {
	if (value === undefined) return undefined;
	if (value === null || typeof value === "number" || typeof value === "boolean") return value;
	if (typeof value === "string") return truncateSafeString(redactKnownSensitiveText(value), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	if (Array.isArray(value)) return value.slice(0, MAX_TOOL_ERROR_DETAIL_ITEMS).map((item) => sanitizeSafeDetailValue(item));
	if (!isRecord(value)) return undefined;
	const output: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value).slice(0, MAX_TOOL_ERROR_DETAIL_ITEMS)) {
		if (isSensitiveDetailKey(key)) {
			output[key] = "[REDACTED]";
			continue;
		}
		const sanitized = sanitizeSafeDetailValue(child);
		if (sanitized !== undefined) output[key] = sanitized;
	}
	if (Object.keys(value).length > MAX_TOOL_ERROR_DETAIL_ITEMS) {
		output.truncated = true;
		output.truncation = { shown: MAX_TOOL_ERROR_DETAIL_ITEMS, total: Object.keys(value).length, max: MAX_TOOL_ERROR_DETAIL_ITEMS };
	}
	return output;
}

function isSensitiveDetailKey(key: string): boolean {
	return /(token|secret|password|credential|api[_-]?key|env|body|comment|comments|config)/i.test(key);
}

function sanitizeErrorCode(code: string): string {
	return code.replace(/[^a-z0-9_.-]/gi, "_").slice(0, 120) || "issueme_error";
}

function redactKnownSensitiveText(text: string): string {
	return text
		.replace(/github_pat_[A-Za-z0-9_]+/g, "[REDACTED]")
		.replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[REDACTED]");
}

function truncateSafeString(value: string, maxChars: number): string {
	if (value.length <= maxChars) return value;
	return `${value.slice(0, Math.max(0, maxChars - 16))}… [truncated]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function limitArray<T>(values: T[] | undefined, limit: number): LimitedArray<T> {
	if (values === undefined) return { truncated: false };
	return { value: values.slice(0, limit), truncated: values.length > limit };
}
