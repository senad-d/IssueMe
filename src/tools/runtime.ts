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
import { assertIssueMeConfigCollectionLimits, loadIssueMeConfig } from "../config/config.ts";
import { getIssueMeErrorTaxonomy, ISSUEME_ERROR_CODES, IssueMeError, isNodeError, mutationSettlementOf } from "../errors.ts";
import { GitHubClient, type FetchLike } from "../github/client.ts";
import { parseGitHubRepository, resolveCurrentRepository } from "../github/repository.ts";
import { githubIssueToRecord, issueRecordToToolSummary } from "../issues/format.ts";
import { relativeIssuePath, writeIssueRecord } from "../issues/store.ts";
import type { GitHubIssueResponse, GitHubRepository, IssueMeConfig, IssueMeToolDetails, IssueMeToolResult, IssueRecord, IssueRelationshipSummary, IssueWriteResult, SafeToolError, ToolAssigneeSummary, ToolBulkIssueResultStatus, ToolBulkIssueResultSummary, ToolCommentSummary, ToolFileActionSummary, ToolIssueDevelopmentLinkSummary, ToolIssueSummary, ToolLabelSummary, ToolMilestoneSummary, ToolProjectFieldOptionSummary, ToolProjectFieldSummary, ToolProjectItemSummary, ToolProjectIterationSummary, ToolProjectSummary } from "../types.ts";
import { assertNotAborted } from "../utils/abort.ts";
import { ALL_ISSUE_CREATORS, GITHUB_LOGIN_PATTERN, isValidGitHubLogin, issueCreatorEquals, normalizeAllowedIssueCreatorForLoad } from "../utils/github-login.ts";
import { assertCollectionItemLimit } from "../utils/validation.ts";
import { resolveGitHubToken } from "../utils/env.ts";
import { resolveIssueMeProjectRoot } from "../utils/project-root.ts";

export const ISSUEME_SHARED_PROMPT_GUIDELINE = "IssueMe shared for issueme_sync_issues and all issueme_* tools: current repository is implicit; issue means GitHub issue; cache means local IssueMe JSON; list/discovery tools are read-only unless sync/refresh; existing-issue mutations require open issues except issueme_reopen_issue.";

export function issueMeResultPolicyPromptGuideline(toolName: string): string {
	return `${toolName}: check details.result, details.status, details.needsSync; partial_success/error may not throw.`;
}

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
	assertIssueMeConfigCollectionLimits(config);
	allowedIssueCreator(config);
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

export function allowedIssueCreator(config: Partial<IssueMeConfig>): string {
	return normalizeAllowedIssueCreatorForLoad(config.allowedIssueCreator, { fieldPresent: hasAllowedIssueCreator(config) });
}

export function isCreatorScopeRestricted(config: Partial<IssueMeConfig>): boolean {
	const creator = allowedIssueCreator(config);
	return creator !== ALL_ISSUE_CREATORS && isValidGitHubLogin(creator);
}

function hasAllowedIssueCreator(config: Partial<IssueMeConfig>): boolean {
	return Object.hasOwn(config, "allowedIssueCreator");
}

export function issueCreatorMatchesConfig(config: Partial<IssueMeConfig>, creator: unknown): boolean {
	if (!isCreatorScopeRestricted(config)) return true;
	const login = isValidGitHubLogin(creator) ? creator : extractIssueCreator(creator) ?? extractLoginFromUserNode(creator);
	return isValidGitHubLogin(login) && issueCreatorEquals(login, allowedIssueCreator(config));
}

export function issueCreatorScopeLabel(config: Partial<IssueMeConfig>): string {
	return isCreatorScopeRestricted(config) ? allowedIssueCreator(config) : ALL_ISSUE_CREATORS;
}

export function assertIssueCreatorAllowed(
	config: Partial<IssueMeConfig>,
	issueOrRecord: unknown,
	context: { repository?: string; operation?: string; issueNumber?: number } = {},
): void {
	if (!isCreatorScopeRestricted(config)) return;
	const allowed = allowedIssueCreator(config);
	const creator = extractIssueCreator(issueOrRecord);
	if (creator && issueCreatorEquals(creator, allowed)) return;
	const issueNumber = context.issueNumber ?? extractIssueNumber(issueOrRecord);
	const creatorText = creator ?? "unknown";
	const issueSubject = issueCreatorErrorSubject(issueNumber);
	throw new IssueMeError(
		ISSUEME_ERROR_CODES.ISSUE_CREATOR_NOT_ALLOWED,
		`${issueSubject} was created by ${creatorText}; IssueMe is configured to process only issues created by ${allowed}.`,
		issueCreatorErrorDetails(allowed, creatorText, issueNumber, context),
	);
}

function issueCreatorErrorSubject(issueNumber: number | undefined): string {
	if (issueNumber === undefined) return "Issue";
	return `Issue #${issueNumber}`;
}

function issueCreatorErrorDetails(
	allowedIssueCreator: string,
	creator: string,
	issueNumber: number | undefined,
	context: { repository?: string; operation?: string },
): Record<string, unknown> {
	const details: Record<string, unknown> = { allowedIssueCreator, creator };
	assignDefinedDetail(details, "issueNumber", issueNumber);
	assignOptionalTextDetail(details, "repository", context.repository);
	assignOptionalTextDetail(details, "operation", context.operation);
	return details;
}

function assignDefinedDetail(details: Record<string, unknown>, field: string, value: number | undefined): void {
	if (value === undefined) return;
	details[field] = value;
}

function assignOptionalTextDetail(details: Record<string, unknown>, field: string, value: string | undefined): void {
	if (value) details[field] = value;
}

export async function assertExistingIssueCreatorAllowed(
	runtime: IssueMeRuntime,
	issueNumber: number,
	operation: string,
	signal?: AbortSignal,
	options: { requireOpen?: boolean } = {},
): Promise<GitHubIssueResponse | undefined> {
	if (!isCreatorScopeRestricted(runtime.config)) return undefined;
	const issue = options.requireOpen === false
		? await runtime.client.getIssue(issueNumber, signal)
		: await runtime.client.ensureIssueOpen(issueNumber, signal);
	assertIssueCreatorAllowed(runtime.config, issue, { repository: runtime.repository, operation, issueNumber });
	return issue;
}

export async function assertAuthenticatedUserAllowedForCreate(runtime: IssueMeRuntime, signal?: AbortSignal): Promise<void> {
	if (!isCreatorScopeRestricted(runtime.config)) return;
	const allowed = allowedIssueCreator(runtime.config);
	const login = await runtime.client.getAuthenticatedUserLogin(signal);
	if (issueCreatorEquals(login, allowed)) return;
	throw new IssueMeError(
		ISSUEME_ERROR_CODES.ISSUE_CREATOR_NOT_ALLOWED,
		`Authenticated GitHub user ${login} does not match allowed issue creator ${allowed}; refusing to create an out-of-scope issue.`,
		{ repository: runtime.repository, allowedIssueCreator: allowed, authenticatedUser: login, operation: "create_issue" },
	);
}

export function extractIssueCreator(issueOrRecord: unknown): string | undefined {
	if (isRecord(issueOrRecord)) return extractIssueCreatorFromRecord(issueOrRecord);
	return undefined;
}

function extractIssueCreatorFromRecord(issueOrRecord: Record<string, unknown>): string | undefined {
	if (isValidGitHubLogin(issueOrRecord.creator)) return issueOrRecord.creator;
	return extractLoginFromUserNode(issueOrRecord.user) ?? extractLoginFromUserNode(issueOrRecord.author);
}

function extractLoginFromUserNode(value: unknown): string | undefined {
	if (isRecord(value)) return validGitHubLoginOrUndefined(value.login);
	return undefined;
}

function extractIssueNumber(issueOrRecord: unknown): number | undefined {
	if (isRecord(issueOrRecord)) return positiveIssueNumberOrUndefined(issueOrRecord.number);
	return undefined;
}

function validGitHubLoginOrUndefined(value: unknown): string | undefined {
	return isValidGitHubLogin(value) ? value : undefined;
}

function positiveIssueNumberOrUndefined(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export async function fetchIssueRecord(
	runtime: IssueMeRuntime,
	issue: GitHubIssueResponse,
	signal?: AbortSignal,
): Promise<IssueRecord> {
	assertIssueCreatorAllowed(runtime.config, issue, { repository: runtime.repository, operation: "fetch_issue_record" });
	const number = typeof issue.number === "number" ? issue.number : undefined;
	const comments = number ? await runtime.client.listComments(number, signal, { limit: MAX_CACHE_COMMENTS }) : [];
	const remoteCommentCount = typeof issue.comments === "number" && Number.isSafeInteger(issue.comments) && issue.comments >= comments.length
		? issue.comments
		: undefined;
	const commentsTruncated = remoteCommentCount === undefined ? comments.length >= MAX_CACHE_COMMENTS : remoteCommentCount > comments.length;
	if (commentsTruncated) {
		runtime.commentsTruncated = true;
		if (number !== undefined && !runtime.truncatedCommentIssues.includes(number)) runtime.truncatedCommentIssues.push(number);
	}
	const commentCacheOptions: { limit: number; truncated: boolean; totalCount?: number } = {
		limit: MAX_CACHE_COMMENTS,
		truncated: commentsTruncated,
	};
	assignDefinedProperty(commentCacheOptions, "totalCount", remoteCommentCount);
	return githubIssueToRecord(runtime.client.repository, issue, comments, new Date().toISOString(), commentCacheOptions);
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
	const detailsWithTruncation = withToolTextTruncation(details, content, text.length);
	return {
		content: [{ type: "text" as const, text: content.text }],
		details: boundToolDetails(detailsWithTruncation),
	};
}

function withToolTextTruncation(details: IssueMeToolDetails, content: { text: string; truncated: boolean }, totalChars: number): IssueMeToolDetails {
	if (content.truncated) {
		return {
			...details,
			truncated: true,
			truncation: mergeContentTruncation(details.truncation, { shownChars: content.text.length, totalChars, maxChars: MAX_TOOL_TEXT_CHARS }),
		};
	}
	return details;
}

function mergeContentTruncation(truncation: Record<string, unknown> | undefined, content: Record<string, number>): Record<string, unknown> {
	if (truncation) return { ...truncation, content };
	return { content };
}

export function boundToolDetails(details: IssueMeToolDetails): IssueMeToolDetails {
	const normalizedDetails = normalizeToolDetails(details);
	const bounds = buildToolDetailBounds(normalizedDetails);
	const truncation = buildToolTruncation(normalizedDetails, bounds);
	return buildBoundedToolDetails(normalizedDetails, bounds, truncation);
}

function buildToolDetailBounds(normalizedDetails: IssueMeToolDetails): ToolDetailBounds {
	const fileActions = limitArray(normalizedDetails.fileActions, MAX_TOOL_ISSUES);
	const issues = limitArray(normalizedDetails.issues, MAX_TOOL_ISSUES);
	const labels = limitArray(normalizedDetails.labels, MAX_TOOL_LABELS);
	const milestones = limitArray(normalizedDetails.milestones, MAX_TOOL_MILESTONES);
	const assignees = limitArray(normalizedDetails.assignees, MAX_TOOL_ASSIGNEES);
	const projects = limitArray(normalizedDetails.projects, MAX_TOOL_PROJECTS);
	const projectFields = limitArray(normalizedDetails.projectFields, MAX_TOOL_PROJECT_FIELDS);
	const developmentLinks = limitArray(normalizedDetails.developmentLinks, MAX_TOOL_DEVELOPMENT_LINKS);
	const bulkResults = limitArray(normalizedDetails.bulkResults, MAX_TOOL_ISSUES);
	return {
		paths: limitArray(normalizedDetails.paths, MAX_TOOL_PATHS),
		removedPaths: limitArray(normalizedDetails.removedPaths, MAX_TOOL_PATHS),
		changedFields: limitArray(normalizedDetails.changedFields, MAX_TOOL_CHANGED_FIELDS),
		fileActions,
		invalidFiles: limitArray(normalizedDetails.invalidFiles, MAX_TOOL_PATHS),
		issue: boundToolIssueSummary(normalizedDetails.issue),
		comment: boundToolCommentSummary(normalizedDetails.comment),
		error: boundSafeToolError(normalizedDetails.error),
		message: boundToolDetailMessage(normalizedDetails.message),
		issues,
		labels,
		milestones,
		assignees,
		project: boundToolProjectSummary(normalizedDetails.project),
		projects,
		projectFields,
		projectItem: boundToolProjectItemSummary(normalizedDetails.projectItem),
		developmentLinks,
		bulkResults,
		boundedIssues: issues.value?.map((summary) => boundToolIssueSummary(summary)),
		boundedFileActions: fileActions.value?.map(boundToolFileActionSummary),
		boundedLabels: labels.value?.map(boundToolLabelSummary),
		boundedMilestones: milestones.value?.map(boundToolMilestoneSummary),
		boundedAssignees: assignees.value?.map(boundToolAssigneeSummary),
		boundedProjects: projects.value?.map(boundToolProjectSummary),
		boundedProjectFields: projectFields.value?.map(boundToolProjectFieldSummary),
		boundedDevelopmentLinks: developmentLinks.value?.map(boundToolDevelopmentLinkSummary),
		boundedBulkResults: bulkResults.value?.map(boundToolBulkIssueResultSummary),
	};
}

function boundToolDetailMessage(message: string | undefined): string | undefined {
	if (typeof message === "string") return truncateSafeString(redactKnownSensitiveText(message), MAX_TOOL_ERROR_MESSAGE_CHARS);
	return undefined;
}

function buildBoundedToolDetails(normalizedDetails: IssueMeToolDetails, bounds: ToolDetailBounds, truncation: Record<string, unknown>): IssueMeToolDetails {
	const output: IssueMeToolDetails = { ...normalizedDetails };
	assignDefinedToolDetail(output, "issue", bounds.issue.value);
	assignDefinedToolDetail(output, "comment", bounds.comment);
	assignDefinedToolDetail(output, "error", bounds.error);
	assignDefinedToolDetail(output, "message", bounds.message);
	assignDefinedToolDetail(output, "paths", bounds.paths.value);
	assignDefinedToolDetail(output, "removedPaths", bounds.removedPaths.value);
	assignDefinedToolDetail(output, "changedFields", bounds.changedFields.value);
	assignDefinedToolDetail(output, "issues", collectBoundedValues(bounds.boundedIssues));
	assignDefinedToolDetail(output, "labels", collectBoundedValues(bounds.boundedLabels));
	assignDefinedToolDetail(output, "milestones", collectBoundedValues(bounds.boundedMilestones));
	assignDefinedToolDetail(output, "assignees", collectBoundedValues(bounds.boundedAssignees));
	assignDefinedToolDetail(output, "project", bounds.project.value);
	assignDefinedToolDetail(output, "projects", collectBoundedValues(bounds.boundedProjects));
	assignDefinedToolDetail(output, "projectFields", collectBoundedValues(bounds.boundedProjectFields));
	assignDefinedToolDetail(output, "projectItem", bounds.projectItem.value);
	assignDefinedToolDetail(output, "developmentLinks", collectBoundedValues(bounds.boundedDevelopmentLinks));
	assignDefinedToolDetail(output, "bulkResults", collectBoundedValues(bounds.boundedBulkResults));
	assignDefinedToolDetail(output, "fileActions", collectBoundedValues(bounds.boundedFileActions));
	assignDefinedToolDetail(output, "invalidFiles", bounds.invalidFiles.value);
	applyToolDetailsTruncation(output, normalizedDetails, truncation);
	return output;
}

function assignDefinedToolDetail<K extends keyof IssueMeToolDetails>(target: IssueMeToolDetails, key: K, value: IssueMeToolDetails[K] | undefined): void {
	if (value !== undefined) target[key] = value;
}

function collectBoundedValues<T>(values: Array<{ value?: T }> | undefined): T[] | undefined {
	if (values) return values.map((item) => item.value).filter((value): value is T => value !== undefined);
	return undefined;
}

function applyToolDetailsTruncation(target: IssueMeToolDetails, normalizedDetails: IssueMeToolDetails, truncation: Record<string, unknown>): void {
	if (normalizedDetails.truncated || Object.keys(truncation).length > 0) {
		target.truncated = true;
		target.truncation = truncation;
	}
}

export function listChangedFields(input: Record<string, unknown>): string[] {
	return Object.entries(input)
		.filter(([, value]) => value !== undefined)
		.map(([key]) => key);
}

export function sanitizeStringList(values: readonly string[] | undefined, fieldName = "values", maxItems = MAX_TOOL_LABELS): string[] {
	assertCollectionItemLimit(values, fieldName, maxItems);
	const normalized: string[] = [];
	for (const value of values ?? []) {
		const trimmed = value.trim();
		if (!trimmed) continue;
		if (trimmed.includes("\0")) {
			throw new IssueMeError("invalid_tool_input", `${fieldName} must not contain null bytes.`, { field: fieldName });
		}
		if (/[\r\n]/.test(trimmed)) {
			throw new IssueMeError("invalid_tool_input", `${fieldName} entries must fit on one line.`, { field: fieldName });
		}
		normalized.push(trimmed);
	}
	return [...new Set(normalized)];
}

export function sanitizeGitHubLoginList(values: readonly string[] | undefined, fieldName = "assignees"): string[] {
	const normalized = sanitizeStringList(values, fieldName, MAX_TOOL_ASSIGNEES);
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
		details: partialSuccessErrorDetails(safeError, partialSuccessStatus, taxonomy.recoveryHint),
	}) ?? safeError;
}

function partialSuccessErrorDetails(safeError: SafeToolError, partialSuccessStatus: string, recoveryHint: string): Record<string, unknown> {
	const details = cloneRecord(safeError.details);
	details.partialSuccessCode = ISSUEME_ERROR_CODES.PARTIAL_SUCCESS_CACHE_SYNC_REQUIRED;
	details.partialSuccessStatus = partialSuccessStatus;
	details.partialSuccessRecoveryHint = recoveryHint;
	return details;
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

export const REMOTE_MUTATION_RETRY_SAFE_GUIDANCE = "Do not repeat the mutation blindly; inspect GitHub remote state, run issueme_sync_issues when issue/cache state is involved, and retry only work confirmed missing.";

export function remoteMutationPartialSuccessToolText(
	text: string,
	error: unknown,
	details: IssueMeToolDetails = {},
	status = "remote_mutation_response_partial_success",
) {
	const safeError = partialSuccessToolError(error, status);
	const errorDetails = cloneRecord(safeError.details);
	errorDetails.mutationSettlement = mutationSettlementOf(error) ?? "remote_success_known";
	errorDetails.retrySafeGuidance = REMOTE_MUTATION_RETRY_SAFE_GUIDANCE;
	const settledError: SafeToolError = {
		...safeError,
		recoveryHint: REMOTE_MUTATION_RETRY_SAFE_GUIDANCE,
		details: errorDetails,
	};
	return toolText(`${text}\nRetry-safe guidance: ${REMOTE_MUTATION_RETRY_SAFE_GUIDANCE}`, {
		...details,
		result: "partial_success",
		cacheUpdated: false,
		needsSync: true,
		status,
		message: settledError.message,
		error: settledError,
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

type ToolInvalidFileDiagnostic = NonNullable<IssueMeToolDetails["invalidFiles"]>[number];

interface ToolDetailBounds {
	paths: LimitedArray<string>;
	removedPaths: LimitedArray<string>;
	changedFields: LimitedArray<string>;
	fileActions: LimitedArray<ToolFileActionSummary>;
	invalidFiles: LimitedArray<ToolInvalidFileDiagnostic>;
	issue: BoundedIssueSummary;
	comment?: ToolCommentSummary;
	error?: SafeToolError;
	message?: string;
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

interface BoundedProjectFieldParts {
	id: string;
	name: string;
	dataType: string;
	type?: string;
	options: LimitedArray<ToolProjectFieldOptionSummary>;
	iterations: LimitedArray<ToolProjectIterationSummary>;
	completedIterations: LimitedArray<ToolProjectIterationSummary>;
}

interface BoundedDevelopmentLinkParts {
	referenceTypes: LimitedArray<string>;
	number?: number;
	title?: string;
	state: ToolIssueDevelopmentLinkSummary["state"];
	htmlUrl?: string;
	branchName?: string;
	baseBranchName?: string;
	commitOid?: string;
	message?: string;
	willCloseTarget?: boolean;
	closedBy?: boolean;
	isDraft?: boolean;
}

interface BoundedBulkIssueResultSummary {
	value: ToolBulkIssueResultSummary;
	truncated: boolean;
	truncation: Record<string, unknown>;
}

interface BoundedBulkIssueResultParts {
	issue: BoundedIssueSummary;
	projectItem: BoundedProjectItemSummary;
	paths: LimitedArray<string>;
	removedPaths: LimitedArray<string>;
	changedFields: LimitedArray<string>;
	error?: SafeToolError;
	message?: string;
	action: string;
	status: ToolBulkIssueResultStatus;
}

function truncateToolText(text: string): { text: string; truncated: boolean } {
	if (text.length <= MAX_TOOL_TEXT_CHARS) return { text, truncated: false };
	const marker = "\n… [IssueMe tool output truncated]";
	const shownChars = Math.max(0, MAX_TOOL_TEXT_CHARS - marker.length);
	return { text: `${text.slice(0, shownChars)}${marker}`, truncated: true };
}

function hasTruncation(truncation: Record<string, unknown>): boolean {
	return Object.keys(truncation).length > 0;
}

function assignDefinedProperty<T extends object, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
	if (value === undefined) return;
	target[key] = value;
}

function assignDefinedRecordValue(target: Record<string, unknown>, key: string, value: unknown): void {
	if (value === undefined) return;
	target[key] = value;
}

function safeIntegerOrUndefined(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isSafeInteger(value)) return value;
	return undefined;
}

function booleanOrUndefined(value: unknown): boolean | undefined {
	if (typeof value === "boolean") return value;
	return undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
	if (typeof value === "string") return value;
	return undefined;
}

function truthyStringOrUndefined(value: string | undefined): string | undefined {
	if (value) return value;
	return undefined;
}

function redactAndTruncateOptionalString(value: string | undefined, maxChars: number): string | undefined {
	if (value === undefined) return undefined;
	return truncateSafeString(redactKnownSensitiveText(value), maxChars);
}

function truncateOptionalString(value: string | undefined, maxChars: number): string | undefined {
	if (value === undefined) return undefined;
	return truncateSafeString(value, maxChars);
}

function recordTruncationIfChanged(truncation: Record<string, unknown>, key: string, boundedValue: unknown, originalValue: unknown, maxChars: number): void {
	if (boundedValue === originalValue) return;
	truncation[key] = { maxChars };
}

function recordLimitedArrayTruncation<T>(truncation: Record<string, unknown>, key: string, values: LimitedArray<T>, total: number | undefined, max: number): void {
	if (values.truncated) truncation[key] = { shown: values.value?.length ?? 0, total: total ?? 0, max };
}

function countTruncatedSummaries(summaries: Array<{ truncated: boolean }> | undefined): number {
	if (summaries) return summaries.filter((summary) => summary.truncated).length;
	return 0;
}

function boundNullableIssueRelationshipSummary(issue: IssueRelationshipSummary | null | undefined): { value?: IssueRelationshipSummary | null; truncated: boolean; truncation: Record<string, unknown> } {
	if (issue === null) return { value: null, truncated: false, truncation: {} };
	return boundIssueRelationshipSummary(issue);
}

function buildSubIssuesTruncation(subIssues: LimitedArray<IssueRelationshipSummary>, childIssueTruncations: number, total: number | undefined): Record<string, unknown> | undefined {
	const truncation: Record<string, unknown> = {};
	if (subIssues.truncated) {
		truncation.shown = subIssues.value?.length ?? 0;
		truncation.total = total ?? 0;
		truncation.max = MAX_TOOL_ISSUES;
	}
	if (childIssueTruncations > 0) truncation.affectedSummaries = childIssueTruncations;
	if (hasTruncation(truncation)) return truncation;
	return undefined;
}

function boundToolIssueSummary(summary: ToolIssueSummary | undefined): BoundedIssueSummary {
	if (summary) return buildBoundToolIssueSummary(summary);
	return { truncated: false, truncation: {} };
}

function buildBoundToolIssueSummary(summary: ToolIssueSummary): BoundedIssueSummary {
	const labels = limitArray(summary.labels, MAX_TOOL_LABELS);
	const assignees = limitArray(summary.assignees, MAX_TOOL_ASSIGNEES);
	const parentIssue = boundNullableIssueRelationshipSummary(summary.parentIssue);
	const subIssues = limitArray(summary.subIssues, MAX_TOOL_ISSUES);
	const boundedSubIssues = subIssues.value?.map(boundIssueRelationshipSummary);
	const childIssueTruncations = countTruncatedSummaries(boundedSubIssues);
	const truncation: Record<string, unknown> = {};
	recordLimitedArrayTruncation(truncation, "labels", labels, summary.labels.length, MAX_TOOL_LABELS);
	recordLimitedArrayTruncation(truncation, "assignees", assignees, summary.assignees.length, MAX_TOOL_ASSIGNEES);
	assignDefinedRecordValue(truncation, "parentIssue", parentIssue.truncated ? parentIssue.truncation : undefined);
	assignDefinedRecordValue(truncation, "subIssues", buildSubIssuesTruncation(subIssues, childIssueTruncations, summary.subIssues?.length));
	const value: ToolIssueSummary = { ...summary, labels: labels.value ?? [], assignees: assignees.value ?? [] };
	assignDefinedProperty(value, "parentIssue", parentIssue.value);
	assignDefinedProperty(value, "subIssues", collectBoundedValues(boundedSubIssues));
	return {
		value,
		truncated: labels.truncated || assignees.truncated || parentIssue.truncated || subIssues.truncated || childIssueTruncations > 0,
		truncation,
	};
}

function boundToolCommentSummary(comment: ToolCommentSummary | undefined): ToolCommentSummary | undefined {
	if (comment === undefined) return undefined;
	const value: ToolCommentSummary = {};
	assignDefinedProperty(value, "id", safeIntegerOrUndefined(comment.id));
	assignDefinedProperty(value, "html_url", truncateOptionalString(stringOrUndefined(comment.html_url), MAX_TOOL_ERROR_DETAIL_STRING_CHARS));
	return value;
}

function boundToolLabelSummary(label: ToolLabelSummary): BoundedLabelSummary {
	const name = truncateSafeString(redactKnownSensitiveText(label.name), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const description = redactAndTruncateOptionalString(label.description, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const color = truncateOptionalString(label.color, 32);
	const url = truncateOptionalString(label.url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const truncation: Record<string, unknown> = {};
	recordTruncationIfChanged(truncation, "name", name, label.name, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "description", description, label.description, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "color", color, label.color, 32);
	recordTruncationIfChanged(truncation, "url", url, label.url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const value: ToolLabelSummary = { name };
	assignDefinedProperty(value, "description", description);
	assignDefinedProperty(value, "color", color);
	assignDefinedProperty(value, "default", booleanOrUndefined(label.default));
	assignDefinedProperty(value, "url", url);
	return {
		value,
		truncated: hasTruncation(truncation),
		truncation,
	};
}

function boundToolMilestoneSummary(milestone: ToolMilestoneSummary): BoundedMilestoneSummary {
	const title = truncateSafeString(redactKnownSensitiveText(milestone.title), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const description = redactAndTruncateOptionalString(milestone.description, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const dueOn = truncateOptionalString(milestone.due_on, 64);
	const htmlUrl = truncateOptionalString(milestone.html_url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const url = truncateOptionalString(milestone.url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const truncation: Record<string, unknown> = {};
	recordTruncationIfChanged(truncation, "title", title, milestone.title, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "description", description, milestone.description, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "due_on", dueOn, milestone.due_on, 64);
	recordTruncationIfChanged(truncation, "html_url", htmlUrl, milestone.html_url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "url", url, milestone.url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const value: ToolMilestoneSummary = { number: milestone.number, title, state: milestone.state };
	assignDefinedProperty(value, "description", description);
	assignDefinedProperty(value, "due_on", dueOn);
	assignDefinedProperty(value, "open_issues", safeIntegerOrUndefined(milestone.open_issues));
	assignDefinedProperty(value, "closed_issues", safeIntegerOrUndefined(milestone.closed_issues));
	assignDefinedProperty(value, "html_url", htmlUrl);
	assignDefinedProperty(value, "url", url);
	return {
		value,
		truncated: hasTruncation(truncation),
		truncation,
	};
}

function boundToolAssigneeSummary(assignee: ToolAssigneeSummary): BoundedAssigneeSummary {
	const login = truncateSafeString(redactKnownSensitiveText(assignee.login), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const type = redactAndTruncateOptionalString(assignee.type, 120);
	const htmlUrl = truncateOptionalString(assignee.html_url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const url = truncateOptionalString(assignee.url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const truncation: Record<string, unknown> = {};
	recordTruncationIfChanged(truncation, "login", login, assignee.login, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "type", type, assignee.type, 120);
	recordTruncationIfChanged(truncation, "html_url", htmlUrl, assignee.html_url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "url", url, assignee.url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const value: ToolAssigneeSummary = { login };
	assignDefinedProperty(value, "id", safeIntegerOrUndefined(assignee.id));
	assignDefinedProperty(value, "type", type);
	assignDefinedProperty(value, "html_url", htmlUrl);
	assignDefinedProperty(value, "url", url);
	return {
		value,
		truncated: hasTruncation(truncation),
		truncation,
	};
}

function boundToolProjectSummary(project: ToolProjectSummary | undefined): BoundedProjectSummary {
	if (project === undefined) return { truncated: false, truncation: {} };
	const id = truncateSafeString(redactKnownSensitiveText(project.id), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const title = truncateSafeString(redactKnownSensitiveText(project.title), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const owner = truncateSafeString(redactKnownSensitiveText(project.owner), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const url = truncateOptionalString(project.url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const shortDescription = redactAndTruncateOptionalString(project.shortDescription, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const truncation: Record<string, unknown> = {};
	recordTruncationIfChanged(truncation, "id", id, project.id, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "title", title, project.title, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "owner", owner, project.owner, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "url", url, project.url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "shortDescription", shortDescription, project.shortDescription, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const value: ToolProjectSummary = { id, title, number: project.number, owner, ownerType: project.ownerType };
	assignDefinedProperty(value, "url", url);
	assignDefinedProperty(value, "shortDescription", shortDescription);
	assignDefinedProperty(value, "closed", booleanOrUndefined(project.closed));
	assignDefinedProperty(value, "public", booleanOrUndefined(project.public));
	return {
		value,
		truncated: hasTruncation(truncation),
		truncation,
	};
}

function boundToolProjectFieldSummary(field: ToolProjectFieldSummary | undefined): BoundedProjectFieldSummary {
	if (field === undefined) return { truncated: false, truncation: {} };
	const parts = boundProjectFieldParts(field);
	const truncation = buildProjectFieldTruncation(field, parts);
	const truncated = Boolean(field.truncated || hasTruncation(truncation));
	return {
		value: buildProjectFieldValue(parts, truncated, truncation),
		truncated,
		truncation,
	};
}

function boundProjectFieldParts(field: ToolProjectFieldSummary): BoundedProjectFieldParts {
	return {
		id: truncateSafeString(redactKnownSensitiveText(field.id), MAX_TOOL_ERROR_DETAIL_STRING_CHARS),
		name: truncateSafeString(redactKnownSensitiveText(field.name), MAX_TOOL_ERROR_DETAIL_STRING_CHARS),
		dataType: truncateSafeString(redactKnownSensitiveText(field.dataType), 120),
		type: redactAndTruncateOptionalString(field.type, 120),
		options: limitArray(field.options?.map(boundToolProjectFieldOption), MAX_TOOL_PROJECT_FIELD_OPTIONS),
		iterations: limitArray(field.iterations?.map(boundToolProjectIteration), MAX_TOOL_PROJECT_ITERATIONS),
		completedIterations: limitArray(field.completedIterations?.map(boundToolProjectIteration), MAX_TOOL_PROJECT_ITERATIONS),
	};
}

function buildProjectFieldTruncation(field: ToolProjectFieldSummary, parts: BoundedProjectFieldParts): Record<string, unknown> {
	const truncation: Record<string, unknown> = cloneRecord(field.truncation);
	recordTruncationIfChanged(truncation, "id", parts.id, field.id, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "name", parts.name, field.name, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "dataType", parts.dataType, field.dataType, 120);
	recordTruncationIfChanged(truncation, "type", parts.type, field.type, 120);
	recordLimitedArrayTruncation(truncation, "options", parts.options, field.options?.length, MAX_TOOL_PROJECT_FIELD_OPTIONS);
	recordLimitedArrayTruncation(truncation, "iterations", parts.iterations, field.iterations?.length, MAX_TOOL_PROJECT_ITERATIONS);
	recordLimitedArrayTruncation(truncation, "completedIterations", parts.completedIterations, field.completedIterations?.length, MAX_TOOL_PROJECT_ITERATIONS);
	return truncation;
}

function buildProjectFieldValue(parts: BoundedProjectFieldParts, truncated: boolean, truncation: Record<string, unknown>): ToolProjectFieldSummary {
	const value: ToolProjectFieldSummary = { id: parts.id, name: parts.name, dataType: parts.dataType };
	assignDefinedProperty(value, "type", parts.type);
	assignDefinedProperty(value, "options", parts.options.value);
	assignDefinedProperty(value, "iterations", parts.iterations.value);
	assignDefinedProperty(value, "completedIterations", parts.completedIterations.value);
	if (!truncated) return value;
	value.truncated = true;
	value.truncation = truncation;
	return value;
}

function boundToolProjectItemSummary(item: ToolProjectItemSummary | undefined): BoundedProjectItemSummary {
	if (item === undefined) return { truncated: false, truncation: {} };
	const id = truncateSafeString(redactKnownSensitiveText(item.id), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const type = redactAndTruncateOptionalString(item.type, 120);
	const project = boundToolProjectSummary(item.project);
	const issue = boundIssueRelationshipSummary(item.issue);
	const truncation: Record<string, unknown> = {};
	recordTruncationIfChanged(truncation, "id", id, item.id, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "type", type, item.type, 120);
	assignDefinedRecordValue(truncation, "project", project.truncated ? project.truncation : undefined);
	assignDefinedRecordValue(truncation, "issue", issue.truncated ? issue.truncation : undefined);
	const value: ToolProjectItemSummary = { id };
	assignDefinedProperty(value, "type", type);
	assignDefinedProperty(value, "project", project.value);
	assignDefinedProperty(value, "issue", issue.value);
	return {
		value,
		truncated: hasTruncation(truncation),
		truncation,
	};
}

function boundToolDevelopmentLinkSummary(link: ToolIssueDevelopmentLinkSummary): BoundedDevelopmentLinkSummary {
	const parts = boundDevelopmentLinkParts(link);
	const truncation = buildDevelopmentLinkTruncation(link, parts);
	return {
		value: buildDevelopmentLinkValue(link, parts),
		truncated: hasTruncation(truncation),
		truncation,
	};
}

function boundDevelopmentLinkParts(link: ToolIssueDevelopmentLinkSummary): BoundedDevelopmentLinkParts {
	return {
		referenceTypes: limitArray(link.referenceTypes, MAX_TOOL_CHANGED_FIELDS),
		number: safeIntegerOrUndefined(link.number),
		title: redactAndTruncateOptionalString(link.title, MAX_TOOL_ERROR_DETAIL_STRING_CHARS),
		state: normalizedDevelopmentLinkState(link.state),
		htmlUrl: truncateOptionalString(link.html_url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS),
		branchName: redactAndTruncateOptionalString(link.branchName, 180),
		baseBranchName: redactAndTruncateOptionalString(link.baseBranchName, 180),
		commitOid: redactAndTruncateOptionalString(link.commitOid, 120),
		message: redactAndTruncateOptionalString(link.message, MAX_TOOL_ERROR_DETAIL_STRING_CHARS),
		willCloseTarget: booleanOrUndefined(link.willCloseTarget),
		closedBy: booleanOrUndefined(link.closedBy),
		isDraft: booleanOrUndefined(link.isDraft),
	};
}

function buildDevelopmentLinkTruncation(link: ToolIssueDevelopmentLinkSummary, parts: BoundedDevelopmentLinkParts): Record<string, unknown> {
	const truncation: Record<string, unknown> = {};
	recordLimitedArrayTruncation(truncation, "referenceTypes", parts.referenceTypes, link.referenceTypes.length, MAX_TOOL_CHANGED_FIELDS);
	recordTruncationIfChanged(truncation, "title", parts.title, link.title, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "html_url", parts.htmlUrl, link.html_url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "branchName", parts.branchName, link.branchName, 180);
	recordTruncationIfChanged(truncation, "baseBranchName", parts.baseBranchName, link.baseBranchName, 180);
	recordTruncationIfChanged(truncation, "commitOid", parts.commitOid, link.commitOid, 120);
	recordTruncationIfChanged(truncation, "message", parts.message, link.message, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	return truncation;
}

function buildDevelopmentLinkValue(link: ToolIssueDevelopmentLinkSummary, parts: BoundedDevelopmentLinkParts): ToolIssueDevelopmentLinkSummary {
	const value: ToolIssueDevelopmentLinkSummary = { type: link.type, referenceTypes: parts.referenceTypes.value ?? [] };
	assignDefinedProperty(value, "number", parts.number);
	assignDefinedProperty(value, "title", parts.title);
	assignDefinedProperty(value, "state", parts.state);
	assignDefinedProperty(value, "html_url", parts.htmlUrl);
	assignDefinedProperty(value, "branchName", parts.branchName);
	assignDefinedProperty(value, "baseBranchName", parts.baseBranchName);
	assignDefinedProperty(value, "commitOid", parts.commitOid);
	assignDefinedProperty(value, "message", parts.message);
	assignDefinedProperty(value, "willCloseTarget", parts.willCloseTarget);
	assignDefinedProperty(value, "closedBy", parts.closedBy);
	assignDefinedProperty(value, "isDraft", parts.isDraft);
	return value;
}

function normalizedDevelopmentLinkState(state: ToolIssueDevelopmentLinkSummary["state"] | undefined): ToolIssueDevelopmentLinkSummary["state"] | undefined {
	if (state === "open" || state === "closed" || state === "merged") return state;
	return undefined;
}

function boundIssueRelationshipSummary(issue: IssueRelationshipSummary | undefined): { value?: IssueRelationshipSummary; truncated: boolean; truncation: Record<string, unknown> } {
	if (issue === undefined) return { truncated: false, truncation: {} };
	const title = truncateSafeString(redactKnownSensitiveText(issue.title), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const htmlUrl = truncateSafeString(issue.html_url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const truncation: Record<string, unknown> = {};
	recordTruncationIfChanged(truncation, "title", title, issue.title, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	recordTruncationIfChanged(truncation, "html_url", htmlUrl, issue.html_url, MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const value: IssueRelationshipSummary = { number: issue.number, title, html_url: htmlUrl };
	assignDefinedProperty(value, "state", issue.state);
	assignDefinedProperty(value, "creator", truthyStringOrUndefined(issue.creator));
	return {
		value,
		truncated: hasTruncation(truncation),
		truncation,
	};
}

function boundToolProjectFieldOption(option: ToolProjectFieldOptionSummary): ToolProjectFieldOptionSummary {
	const description = option.description === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(option.description), MAX_TOOL_ERROR_DETAIL_STRING_CHARS);
	const color = option.color === undefined ? undefined : truncateSafeString(redactKnownSensitiveText(option.color), 64);
	const value: ToolProjectFieldOptionSummary = {
		id: truncateSafeString(redactKnownSensitiveText(option.id), MAX_TOOL_ERROR_DETAIL_STRING_CHARS),
		name: truncateSafeString(redactKnownSensitiveText(option.name), MAX_TOOL_ERROR_DETAIL_STRING_CHARS),
	};
	assignDefinedProperty(value, "color", color);
	assignDefinedProperty(value, "description", description);
	return value;
}

function boundToolProjectIteration(iteration: ToolProjectIterationSummary): ToolProjectIterationSummary {
	const value: ToolProjectIterationSummary = {
		id: truncateSafeString(redactKnownSensitiveText(iteration.id), MAX_TOOL_ERROR_DETAIL_STRING_CHARS),
		title: truncateSafeString(redactKnownSensitiveText(iteration.title), MAX_TOOL_ERROR_DETAIL_STRING_CHARS),
	};
	const startDate = iteration.startDate === undefined ? undefined : truncateSafeString(iteration.startDate, 64);
	const duration = typeof iteration.duration === "number" && Number.isSafeInteger(iteration.duration) ? iteration.duration : undefined;
	assignDefinedProperty(value, "startDate", startDate);
	assignDefinedProperty(value, "duration", duration);
	return value;
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
	const parts = boundBulkIssueResultParts(result);
	const truncation = buildBulkIssueResultTruncation(result, parts);
	return {
		value: buildBulkIssueResultValue(result, parts),
		truncated: hasTruncation(truncation),
		truncation,
	};
}

function boundBulkIssueResultParts(result: ToolBulkIssueResultSummary): BoundedBulkIssueResultParts {
	return {
		issue: boundToolIssueSummary(result.issue),
		projectItem: boundToolProjectItemSummary(result.projectItem),
		paths: limitArray(result.paths, MAX_TOOL_PATHS),
		removedPaths: limitArray(result.removedPaths, MAX_TOOL_PATHS),
		changedFields: limitArray(result.changedFields, MAX_TOOL_CHANGED_FIELDS),
		error: boundSafeToolError(result.error),
		message: typeof result.message === "string" ? truncateSafeString(redactKnownSensitiveText(result.message), MAX_TOOL_ERROR_MESSAGE_CHARS) : undefined,
		action: truncateSafeString(redactKnownSensitiveText(result.action), 120),
		status: normalizeBulkIssueResultStatus(result.status),
	};
}

function buildBulkIssueResultTruncation(result: ToolBulkIssueResultSummary, parts: BoundedBulkIssueResultParts): Record<string, unknown> {
	const truncation: Record<string, unknown> = {};
	if (parts.message !== result.message) truncation.message = { maxChars: MAX_TOOL_ERROR_MESSAGE_CHARS };
	if (parts.action !== result.action) truncation.action = { maxChars: 120 };
	if (parts.paths.truncated) truncation.paths = { shown: parts.paths.value?.length ?? 0, total: result.paths?.length ?? 0, max: MAX_TOOL_PATHS };
	if (parts.removedPaths.truncated) truncation.removedPaths = { shown: parts.removedPaths.value?.length ?? 0, total: result.removedPaths?.length ?? 0, max: MAX_TOOL_PATHS };
	if (parts.changedFields.truncated) truncation.changedFields = { shown: parts.changedFields.value?.length ?? 0, total: result.changedFields?.length ?? 0, max: MAX_TOOL_CHANGED_FIELDS };
	if (parts.issue.truncated) truncation.issue = parts.issue.truncation;
	if (parts.projectItem.truncated) truncation.projectItem = parts.projectItem.truncation;
	return truncation;
}

function buildBulkIssueResultValue(result: ToolBulkIssueResultSummary, parts: BoundedBulkIssueResultParts): ToolBulkIssueResultSummary {
	const value: ToolBulkIssueResultSummary = {
		number: positiveIssueNumberOrUndefined(result.number) ?? 0,
		action: parts.action,
		status: parts.status,
	};
	assignDefinedProperty(value, "message", truthyStringOrUndefined(parts.message));
	assignDefinedProperty(value, "issue", parts.issue.value);
	assignDefinedProperty(value, "projectItem", parts.projectItem.value);
	assignDefinedProperty(value, "paths", parts.paths.value);
	assignDefinedProperty(value, "removedPaths", parts.removedPaths.value);
	assignDefinedProperty(value, "changedFields", parts.changedFields.value);
	assignDefinedProperty(value, "cacheUpdated", booleanOrUndefined(result.cacheUpdated));
	assignDefinedProperty(value, "needsSync", booleanOrUndefined(result.needsSync));
	assignDefinedProperty(value, "error", parts.error);
	return value;
}

function normalizeBulkIssueResultStatus(status: ToolBulkIssueResultStatus): ToolBulkIssueResultStatus {
	if (status === "success" || status === "partial_success" || status === "failed" || status === "skipped") return status;
	return "failed";
}

function cloneRecord(value: Record<string, unknown> | undefined): Record<string, unknown> {
	if (value) return { ...value };
	return {};
}

function buildToolTruncation(details: IssueMeToolDetails, limits: ToolDetailBounds): Record<string, unknown> {
	const truncation: Record<string, unknown> = cloneRecord(details.truncation);
	addPrimaryToolTruncations(truncation, details, limits);
	addIssueToolTruncation(truncation, details, limits);
	addLabelToolTruncation(truncation, details, limits);
	addMilestoneToolTruncation(truncation, details, limits);
	addAssigneeToolTruncation(truncation, details, limits);
	addProjectToolTruncation(truncation, details, limits);
	addProjectFieldToolTruncation(truncation, details, limits);
	addDevelopmentLinkToolTruncation(truncation, details, limits);
	addBulkResultToolTruncation(truncation, details, limits);
	addFileActionIssueTruncation(truncation, limits);
	return truncation;
}

function addPrimaryToolTruncations(target: Record<string, unknown>, details: IssueMeToolDetails, limits: ToolDetailBounds): void {
	addLimitedToolTruncation(target, "paths", limits.paths, details.paths?.length, MAX_TOOL_PATHS);
	addLimitedToolTruncation(target, "removedPaths", limits.removedPaths, details.removedPaths?.length, MAX_TOOL_PATHS);
	addLimitedToolTruncation(target, "changedFields", limits.changedFields, details.changedFields?.length, MAX_TOOL_CHANGED_FIELDS);
	addLimitedToolTruncation(target, "fileActions", limits.fileActions, details.fileActions?.length, MAX_TOOL_ISSUES);
	addLimitedToolTruncation(target, "invalidFiles", limits.invalidFiles, details.invalidFiles?.length, MAX_TOOL_PATHS);
	addBoundedToolTruncation(target, "issue", limits.issue);
}

function addIssueToolTruncation(target: Record<string, unknown>, details: IssueMeToolDetails, limits: ToolDetailBounds): void {
	addToolArraySummaryTruncation(target, "issues", limits.issues, details.issues?.length, MAX_TOOL_ISSUES, collectIssueSummaryTruncation(limits.boundedIssues));
}

function addLabelToolTruncation(target: Record<string, unknown>, details: IssueMeToolDetails, limits: ToolDetailBounds): void {
	addToolArraySummaryTruncation(target, "labels", limits.labels, details.labels?.length, MAX_TOOL_LABELS, collectLabelSummaryTruncation(limits.boundedLabels));
}

function addMilestoneToolTruncation(target: Record<string, unknown>, details: IssueMeToolDetails, limits: ToolDetailBounds): void {
	addToolArraySummaryTruncation(target, "milestones", limits.milestones, details.milestones?.length, MAX_TOOL_MILESTONES, collectMilestoneSummaryTruncation(limits.boundedMilestones));
}

function addAssigneeToolTruncation(target: Record<string, unknown>, details: IssueMeToolDetails, limits: ToolDetailBounds): void {
	addToolArraySummaryTruncation(target, "assignees", limits.assignees, details.assignees?.length, MAX_TOOL_ASSIGNEES, collectAssigneeSummaryTruncation(limits.boundedAssignees));
}

function addProjectToolTruncation(target: Record<string, unknown>, details: IssueMeToolDetails, limits: ToolDetailBounds): void {
	addBoundedToolTruncation(target, "project", limits.project);
	addToolArraySummaryTruncation(target, "projects", limits.projects, details.projects?.length, MAX_TOOL_PROJECTS, collectProjectSummaryTruncation(limits.boundedProjects));
}

function addProjectFieldToolTruncation(target: Record<string, unknown>, details: IssueMeToolDetails, limits: ToolDetailBounds): void {
	addToolArraySummaryTruncation(target, "projectFields", limits.projectFields, details.projectFields?.length, MAX_TOOL_PROJECT_FIELDS, collectProjectFieldSummaryTruncation(limits.boundedProjectFields));
	addBoundedToolTruncation(target, "projectItem", limits.projectItem);
}

function addDevelopmentLinkToolTruncation(target: Record<string, unknown>, details: IssueMeToolDetails, limits: ToolDetailBounds): void {
	addToolArraySummaryTruncation(target, "developmentLinks", limits.developmentLinks, details.developmentLinks?.length, MAX_TOOL_DEVELOPMENT_LINKS, collectDevelopmentLinkSummaryTruncation(limits.boundedDevelopmentLinks));
}

function addBulkResultToolTruncation(target: Record<string, unknown>, details: IssueMeToolDetails, limits: ToolDetailBounds): void {
	addToolArraySummaryTruncation(target, "bulkResults", limits.bulkResults, details.bulkResults?.length, MAX_TOOL_ISSUES, collectBulkResultTruncation(limits.boundedBulkResults));
}

function addFileActionIssueTruncation(target: Record<string, unknown>, limits: ToolDetailBounds): void {
	mergeTruncationSectionWhenPresent(target, "fileActionIssues", collectIssueSummaryTruncation(limits.boundedFileActions));
}

function addToolArraySummaryTruncation<T>(
	target: Record<string, unknown>,
	key: string,
	values: LimitedArray<T>,
	total: number | undefined,
	max: number,
	summaryTruncation: Record<string, unknown>,
): void {
	mergeTruncationSectionWhenPresent(target, key, buildToolArraySummaryTruncation(values, total, max, summaryTruncation));
}

function buildToolArraySummaryTruncation<T>(values: LimitedArray<T>, total: number | undefined, max: number, summaryTruncation: Record<string, unknown>): Record<string, unknown> {
	return {
		...limitedToolArrayTruncation(values, total, max),
		...summaryTruncation,
	};
}

function addLimitedToolTruncation<T>(target: Record<string, unknown>, key: string, values: LimitedArray<T>, total: number | undefined, max: number): void {
	mergeTruncationSectionWhenPresent(target, key, limitedToolArrayTruncation(values, total, max));
}

function limitedToolArrayTruncation<T>(values: LimitedArray<T>, total: number | undefined, max: number): Record<string, unknown> {
	if (!values.truncated) return {};
	return { shown: values.value?.length ?? 0, total: total ?? 0, max };
}

function addBoundedToolTruncation(target: Record<string, unknown>, key: string, bounded: { truncated: boolean; truncation: Record<string, unknown> }): void {
	if (bounded.truncated) mergeTruncationSection(target, key, bounded.truncation);
}

function mergeTruncationSectionWhenPresent(target: Record<string, unknown>, key: string, value: Record<string, unknown>): void {
	if (hasTruncation(value)) mergeTruncationSection(target, key, value);
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
		.replace(/github_pat_\w+/g, "[REDACTED]")
		.replace(/gh[pousr]_\w+/g, "[REDACTED]");
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
