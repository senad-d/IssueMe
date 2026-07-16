import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_ASSIGNEES, MAX_TOOL_ISSUES, MAX_TOOL_LABELS } from "../constants.ts";
import { IssueMeError, isRemoteMutationSuccessKnown, markMutationSettlement } from "../errors.ts";
import type { NativeSubIssueMutationResult, NativeSubIssueRelationshipResult, NativeSubIssueReorderResult, NativeSubIssueSummary } from "../github/client.ts";
import { applyIssueRelationshipMetadata, githubIssueToRecord, issueRecordToToolSummary, type IssueRelationshipMetadata } from "../issues/format.ts";
import type { GitHubIssueResponse, IssueMeToolDetails, IssueRecord, IssueRelationshipSummary, SafeToolError, ToolFileActionSummary, ToolIssueSummary } from "../types.ts";
import { normalizeBoundedInteger, normalizePositiveSafeInteger } from "../utils/validation.ts";
import {
	assertAuthenticatedUserAllowedForCreate,
	assertIssueCreatorAllowed,
	assertNotAborted,
	createIssueMeRuntime,
	isAbortError,
	issueCreatorScopeLabel,
	normalizeIssueBody,
	partialSuccessToolError,
	partialSuccessToolText,
	remoteMutationPartialSuccessToolText,
	refreshIssueRecord,
	requireNonEmptyTitle,
	safeToolError,
	sanitizeGitHubLoginList,
	sanitizeStringList,
	toolText,
	type IssueMeRuntime,
	type IssueMeToolRegistrationOptions,
	writeAndSummarizeIssue,
} from "./runtime.ts";

const CreateSubIssueParams = Type.Object(
	{
		parentNumber: Type.Integer({ minimum: 1, description: "Parent issue number." }),
		title: Type.String({ description: "Sub-issue title. Non-empty." }),
		body: Type.String({ description: "Markdown body. Empty only if intentional." }),
		labels: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_TOOL_LABELS, description: `Labels. Omit for defaults; [] for none. Max ${MAX_TOOL_LABELS}.` })),
		assignees: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_TOOL_ASSIGNEES, description: `Usernames. Omit for defaults; [] for none. Max ${MAX_TOOL_ASSIGNEES}.` })),
	},
	{ additionalProperties: false },
);

const AddSubIssueParams = Type.Object(
	{
		parentNumber: Type.Integer({ minimum: 1, description: "Parent issue number." }),
		childNumber: Type.Integer({ minimum: 1, description: "Child issue number." }),
	},
	{ additionalProperties: false },
);

const RemoveSubIssueParams = Type.Object(
	{
		parentNumber: Type.Integer({ minimum: 1, description: "Parent issue number." }),
		childNumber: Type.Integer({ minimum: 1, description: "Child issue number." }),
	},
	{ additionalProperties: false },
);

const ReorderSubIssuesParams = Type.Object(
	{
		parentNumber: Type.Integer({ minimum: 1, description: "Parent issue number." }),
		orderedChildNumbers: Type.Array(
			Type.Integer({ minimum: 1, description: "Child issue number." }),
			{ minItems: 1, maxItems: MAX_TOOL_ISSUES, description: `All current child issue numbers in desired order. Max ${MAX_TOOL_ISSUES}.` },
		),
	},
	{ additionalProperties: false },
);

const ListSubIssuesParams = Type.Object(
	{
		issueNumber: Type.Integer({ minimum: 1, description: "Issue number." }),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_ISSUES, description: `Max child issues. Default 25; max ${MAX_TOOL_ISSUES}.` })),
		refreshCache: Type.Optional(Type.Boolean({ description: "True refreshes relationship cache." })),
	},
	{ additionalProperties: false },
);

type ReorderSubIssuesToolParams = Static<typeof ReorderSubIssuesParams>;

interface NormalizedReorderSubIssuesParams {
	parentNumber: number;
	orderedChildNumbers: number[];
}

type ListSubIssuesToolParams = Static<typeof ListSubIssuesParams>;

interface NormalizedListSubIssuesParams {
	issueNumber: number;
	limit: number;
	refreshCache: boolean;
}

export function registerSubIssueTools(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	registerCreateSubIssueTool(pi, options);
	registerAddSubIssueTool(pi, options);
	registerRemoveSubIssueTool(pi, options);
	registerReorderSubIssuesTool(pi, options);
	registerListSubIssuesTool(pi, options);
}

export function registerCreateSubIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_create_sub_issue",
			label: "IssueMe Create Sub-Issue",
			description: "Create native sub-issue under a parent issue.",
			promptSnippet: "Create native sub-issue.",
			promptGuidelines: [
				"Use issueme_create_sub_issue for native sub-issues only; no body-only parent fallback; omit labels/assignees for defaults.",
			],
			executionMode: "sequential",
			parameters: CreateSubIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const title = requireNonEmptyTitle(params.title);
				const body = normalizeIssueBody(params.body, "create");
				const inputLabels = params.labels === undefined ? undefined : sanitizeStringList(params.labels, "labels");
				const inputAssignees = params.assignees === undefined ? undefined : sanitizeGitHubLoginList(params.assignees, "assignees");
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const labels = inputLabels ?? sanitizeStringList(runtime.config.defaultLabels, "labels");
				const assignees = inputAssignees ?? sanitizeGitHubLoginList(runtime.config.defaultAssignees, "assignees");
				const parentIssue = await fetchAllowedOpenIssue(runtime, params.parentNumber, "create_sub_issue_parent", signal);
				await assertAuthenticatedUserAllowedForCreate(runtime, signal);
				let childIssue: GitHubIssueResponse;
				try {
					childIssue = await runtime.client.createIssue({ title, body, labels, assignees }, signal);
				} catch (error) {
					if (!isRemoteMutationSuccessKnown(error)) throw error;
					return remoteMutationPartialSuccessToolText(
						`GitHub accepted the request to create a child issue for parent #${params.parentNumber}, but IssueMe could not verify the created issue response.`,
						error,
						{ repository: runtime.repository, creatorScope: issueCreatorScopeLabel(runtime.config), changedFields: ["title", "body", "labels", "assignees"] },
						"create_sub_issue_response_partial_success",
					);
				}
				let childRecord: IssueRecord;
				try {
					childRecord = githubIssueToRecord(runtime.client.repository, childIssue, []);
				} catch (error) {
					return remoteMutationPartialSuccessToolText(
						`GitHub accepted the request to create a child issue for parent #${params.parentNumber}, but IssueMe could not verify the created issue details.`,
						markMutationSettlement(error, "remote_success_known"),
						{ repository: runtime.repository, creatorScope: issueCreatorScopeLabel(runtime.config), changedFields: ["title", "body", "labels", "assignees"] },
						"create_sub_issue_response_partial_success",
					);
				}

				let relationship: NativeSubIssueMutationResult;
				try {
					relationship = await runtime.client.addSubIssueByIssueResponses(parentIssue, childIssue, signal);
				} catch (error) {
					return cacheCreatedIssueAfterAttachFailure(ctx, runtime, childRecord, params.parentNumber, error, signal);
				}

				return cacheRelationshipAfterSuccess(ctx, runtime, relationship, "add", signal, `Created native sub-issue #${relationship.child.number}: ${relationship.child.title}\nParent: #${relationship.parent.number} ${relationship.parent.title}`);
			},
		}),
	);
}

export function registerAddSubIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_add_sub_issue",
			label: "IssueMe Add Sub-Issue",
			description: "Attach existing issue as native sub-issue.",
			promptSnippet: "Attach existing native sub-issue.",
			promptGuidelines: [
				"Use issueme_add_sub_issue to attach an existing native child; never create body-only references.",
			],
			executionMode: "sequential",
			parameters: AddSubIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				requireDistinctIssueNumbers(params.parentNumber, params.childNumber);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const parentIssue = await fetchAllowedOpenIssue(runtime, params.parentNumber, "add_sub_issue_parent", signal);
				const childIssue = await fetchAllowedOpenIssue(runtime, params.childNumber, "add_sub_issue_child", signal);
				let relationship: NativeSubIssueMutationResult;
				try {
					relationship = await runtime.client.addSubIssueByIssueResponses(parentIssue, childIssue, signal);
				} catch (error) {
					if (isRemoteMutationSuccessKnown(error)) {
						return remoteMutationPartialSuccessToolText(
							`GitHub accepted the native sub-issue attachment for #${params.childNumber} under #${params.parentNumber}, but IssueMe could not verify the mutation response.`,
							error,
							{ repository: runtime.repository, creatorScope: issueCreatorScopeLabel(runtime.config), changedFields: ["sub_issues"] },
							"sub_issue_attach_response_partial_success",
						);
					}
					if (isExpectedSubIssueDomainFailure(error)) return subIssueMutationFailure(runtime, params.parentNumber, params.childNumber, "attach", error);
					throw error;
				}
				return cacheRelationshipAfterSuccess(ctx, runtime, relationship, "add", signal, `Attached issue #${relationship.child.number} as a native sub-issue of #${relationship.parent.number}.`);
			},
		}),
	);
}

export function registerRemoveSubIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_remove_sub_issue",
			label: "IssueMe Remove Sub-Issue",
			description: "Detach native sub-issue relationship.",
			promptSnippet: "Detach native sub-issue relationship.",
			promptGuidelines: [
				"Use issueme_remove_sub_issue only to detach native relationship; never close/delete issues.",
			],
			executionMode: "sequential",
			parameters: RemoveSubIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				requireDistinctIssueNumbers(params.parentNumber, params.childNumber);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const parentIssue = await fetchAllowedOpenIssue(runtime, params.parentNumber, "remove_sub_issue_parent", signal);
				const childIssue = await fetchAllowedOpenIssue(runtime, params.childNumber, "remove_sub_issue_child", signal);
				let relationship: NativeSubIssueMutationResult;
				try {
					relationship = await runtime.client.removeSubIssueByIssueResponses(parentIssue, childIssue, signal);
				} catch (error) {
					if (isRemoteMutationSuccessKnown(error)) {
						return remoteMutationPartialSuccessToolText(
							`GitHub accepted removal of the native sub-issue relationship for #${params.childNumber} under #${params.parentNumber}, but IssueMe could not verify the mutation response.`,
							error,
							{ repository: runtime.repository, creatorScope: issueCreatorScopeLabel(runtime.config), changedFields: ["sub_issues"] },
							"sub_issue_remove_response_partial_success",
						);
					}
					if (isExpectedSubIssueDomainFailure(error)) return subIssueMutationFailure(runtime, params.parentNumber, params.childNumber, "remove", error);
					throw error;
				}
				return cacheRelationshipAfterSuccess(ctx, runtime, relationship, "remove", signal, `Removed issue #${relationship.child.number} from the native sub-issues of #${relationship.parent.number}.`);
			},
		}),
	);
}

export function registerReorderSubIssuesTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_reorder_sub_issues",
			label: "IssueMe Reorder Sub-Issues",
			description: "Reorder native sub-issues under a parent issue.",
			promptSnippet: "Reorder native sub-issues.",
			promptGuidelines: [
				"Use issueme_reorder_sub_issues with every current child number exactly once; call issueme_list_sub_issues first if order is unknown.",
			],
			executionMode: "sequential",
			parameters: ReorderSubIssuesParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeReorderSubIssuesParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				let reorder: NativeSubIssueReorderResult;
				try {
					const parentIssue = await fetchAllowedOpenIssue(runtime, normalized.parentNumber, "reorder_sub_issues_parent", signal);
					const relationship = await runtime.client.listSubIssueRelationships(normalized.parentNumber, { limit: MAX_TOOL_ISSUES }, signal);
					assertRelationshipCreatorScopeAllowed(runtime, relationship, "reorder_sub_issues_relationship");
					reorder = await runtime.client.reorderSubIssuesByIssueResponseAndRelationship(parentIssue, relationship, normalized.orderedChildNumbers, signal);
					assertRelationshipCreatorScopeAllowed(runtime, reorder.relationship, "reorder_sub_issues_result");
				} catch (error) {
					if (isRemoteMutationSuccessKnown(error)) {
						return remoteMutationPartialSuccessToolText(
							`GitHub accepted at least one native sub-issue reorder mutation under #${normalized.parentNumber}, but IssueMe could not verify the final order.`,
							error,
							{ repository: runtime.repository, creatorScope: issueCreatorScopeLabel(runtime.config), changedFields: ["sub_issues"] },
							"sub_issue_reorder_response_partial_success",
						);
					}
					if (isExpectedSubIssueDomainFailure(error)) return subIssueReorderFailure(runtime, normalized.parentNumber, error);
					throw error;
				}
				const creatorScope = issueCreatorScopeLabel(runtime.config);
				try {
					const cache = await refreshRelationshipCache(ctx, runtime, reorder.relationship, MAX_TOOL_ISSUES, signal);
					return toolText(formatReorderSubIssuesText(runtime.repository, reorder, cache), buildReorderSubIssuesDetails(runtime.repository, reorder, normalized, creatorScope, cache));
				} catch (error) {
					return partialSuccessToolText(
						`${formatReorderSubIssuesText(runtime.repository, reorder, undefined)}\nNative sub-issue order changed on GitHub, but local cache refresh failed; run issueme_sync_issues before relying on local cache state.`,
						error,
						buildReorderSubIssuesDetails(runtime.repository, reorder, normalized, creatorScope),
						"sub_issue_cache_refresh_failed",
						"partial_success",
					);
				}
			},
		}),
	);
}

export function registerListSubIssuesTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_list_sub_issues",
			label: "IssueMe List Sub-Issues",
			description: "Inspect native parent/sub-issue relationships.",
			promptSnippet: "Inspect native sub-issue relationships.",
			promptGuidelines: [
				"Use issueme_list_sub_issues before native relationship changes; refreshCache true only when cache updates are intended.",
			],
			executionMode: "sequential",
			parameters: ListSubIssuesParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeListSubIssuesParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const creatorScope = issueCreatorScopeLabel(runtime.config);
				const result = await runtime.client.listSubIssueRelationships(normalized.issueNumber, { limit: normalized.limit }, signal);
				assertRelationshipCreatorScopeAllowed(runtime, result, "list_sub_issues");
				if (!normalized.refreshCache) {
					return toolText(formatListSubIssuesText(runtime.repository, result, normalized, undefined), buildListSubIssuesDetails(runtime.repository, result, normalized, creatorScope));
				}
				try {
					const cache = await refreshRelationshipCache(ctx, runtime, result, normalized.limit, signal);
					return toolText(formatListSubIssuesText(runtime.repository, result, normalized, cache), buildListSubIssuesDetails(runtime.repository, result, normalized, creatorScope, cache));
				} catch (error) {
					if (isAbortError(error)) throw error;
					return partialSuccessToolText(
						`${formatListSubIssuesText(runtime.repository, result, normalized, undefined)}\nLocal relationship inspection succeeded, but cache refresh failed; run issueme_sync_issues before relying on local cache metadata.`,
						error,
						buildListSubIssuesDetails(runtime.repository, result, normalized, creatorScope),
						"sub_issue_cache_refresh_failed",
						"partial_success",
					);
				}
			},
		}),
	);
}

function normalizeReorderSubIssuesParams(params: ReorderSubIssuesToolParams): NormalizedReorderSubIssuesParams {
	const parentNumber = normalizePositiveSafeInteger(params.parentNumber, "parentNumber");
	if (!Array.isArray(params.orderedChildNumbers) || params.orderedChildNumbers.length === 0) {
		throw new IssueMeError("invalid_tool_input", "orderedChildNumbers must list every current child issue number in the desired order.", { field: "orderedChildNumbers" });
	}
	if (params.orderedChildNumbers.length > MAX_TOOL_ISSUES) {
		throw new IssueMeError("invalid_tool_input", `orderedChildNumbers can include at most ${MAX_TOOL_ISSUES} child issue numbers.`, { field: "orderedChildNumbers", max: MAX_TOOL_ISSUES });
	}
	const seen = new Set<number>();
	const orderedChildNumbers: number[] = [];
	for (const [index, value] of params.orderedChildNumbers.entries()) {
		const childNumber = normalizePositiveSafeInteger(value, "orderedChildNumbers", {
			message: "orderedChildNumbers must contain only positive integer issue numbers.",
			details: { index },
		});
		if (childNumber === parentNumber) {
			throw new IssueMeError("invalid_tool_input", "orderedChildNumbers must not include parentNumber.", { field: "orderedChildNumbers", parentNumber });
		}
		if (seen.has(childNumber)) {
			throw new IssueMeError("invalid_tool_input", "orderedChildNumbers must not contain duplicates.", { field: "orderedChildNumbers", duplicate: childNumber });
		}
		seen.add(childNumber);
		orderedChildNumbers.push(childNumber);
	}
	return { parentNumber, orderedChildNumbers };
}

function normalizeListSubIssuesParams(params: ListSubIssuesToolParams): NormalizedListSubIssuesParams {
	const issueNumber = normalizePositiveSafeInteger(params.issueNumber, "issueNumber");
	return {
		issueNumber,
		limit: normalizeSubIssueLimit(params.limit),
		refreshCache: params.refreshCache === true,
	};
}

function normalizeSubIssueLimit(value: number | undefined): number {
	return normalizeBoundedInteger(value, "limit", { max: MAX_TOOL_ISSUES, defaultValue: 25 });
}

async function fetchAllowedOpenIssue(
	runtime: IssueMeRuntime,
	issueNumber: number,
	operation: string,
	signal?: AbortSignal,
): Promise<GitHubIssueResponse> {
	const issue = await runtime.client.ensureIssueOpen(issueNumber, signal);
	assertIssueCreatorAllowed(runtime.config, issue, { repository: runtime.repository, operation, issueNumber });
	return issue;
}

function assertRelationshipCreatorScopeAllowed(
	runtime: IssueMeRuntime,
	result: NativeSubIssueRelationshipResult,
	operation: string,
): void {
	assertNativeSubIssueSummaryCreatorAllowed(runtime, result.issue, operation);
	if (result.parentIssue) assertNativeSubIssueSummaryCreatorAllowed(runtime, result.parentIssue, `${operation}_parent`);
	for (const child of result.subIssues) assertNativeSubIssueSummaryCreatorAllowed(runtime, child, `${operation}_child`);
}

function assertNativeSubIssueSummaryCreatorAllowed(
	runtime: IssueMeRuntime,
	issue: NativeSubIssueSummary,
	operation: string,
): void {
	assertIssueCreatorAllowed(runtime.config, issue, { repository: runtime.repository, operation, issueNumber: issue.number });
}

function buildListSubIssuesDetails(
	repository: string,
	result: NativeSubIssueRelationshipResult,
	params: NormalizedListSubIssuesParams,
	creatorScope: string,
	cache?: RelationshipCacheRefreshResult,
): IssueMeToolDetails {
	const issue = relationshipResultToToolSummary(repository, result);
	return {
		repository,
		creatorScope,
		status: params.refreshCache ? "list_sub_issues_cache_refreshed" : "list_sub_issues",
		issue,
		issues: relationshipResultToRelatedSummaries(repository, result),
		counts: {
			parentIssues: result.parentIssue ? 1 : 0,
			subIssues: result.subIssues.length,
			subIssuesTotal: result.subIssuesCount,
			limit: params.limit,
			...(cache ? { cacheActions: cache.fileActions.length } : {}),
		},
		paths: cache?.paths ?? [],
		removedPaths: cache?.removedPaths ?? [],
		fileActions: cache?.fileActions ?? [],
		cacheUpdated: cache ? cache.cacheUpdated : false,
		needsSync: false,
		truncated: result.truncated,
		...(result.truncated ? { truncation: { subIssues: { shown: result.subIssues.length, total: result.subIssuesCount, max: params.limit } } } : {}),
	};
}

function relationshipResultToToolSummary(repository: string, result: NativeSubIssueRelationshipResult): ToolIssueSummary {
	return {
		...nativeIssueToToolSummary(repository, result.issue),
		parentIssue: result.parentIssue ? nativeIssueToRelationshipSummary(result.parentIssue) : null,
		subIssues: result.subIssues.map(nativeIssueToRelationshipSummary),
		subIssuesCount: result.subIssuesCount,
	};
}

function relationshipResultToRelatedSummaries(repository: string, result: NativeSubIssueRelationshipResult): ToolIssueSummary[] {
	const summaries = [relationshipResultToToolSummary(repository, result)];
	if (result.parentIssue) summaries.push(nativeIssueToToolSummary(repository, result.parentIssue));
	for (const child of result.subIssues) summaries.push(nativeIssueToToolSummary(repository, child));
	return summaries;
}

interface RelationshipCacheRefreshResult {
	paths: string[];
	removedPaths: string[];
	fileActions: ToolFileActionSummary[];
	cacheUpdated: boolean;
}

async function refreshRelationshipCache(
	ctx: ExtensionContext,
	runtime: IssueMeRuntime,
	result: NativeSubIssueRelationshipResult,
	limit: number,
	signal?: AbortSignal,
): Promise<RelationshipCacheRefreshResult> {
	assertRelationshipCreatorScopeAllowed(runtime, result, "relationship_cache_refresh");
	const targets = new Map<number, IssueRelationshipMetadata>();
	targets.set(result.issue.number, relationshipMetadataFromResult(result));
	if (result.parentIssue && result.parentIssue.number !== result.issue.number) {
		const parentResult = await runtime.client.listSubIssueRelationships(result.parentIssue.number, { limit }, signal);
		assertRelationshipCreatorScopeAllowed(runtime, parentResult, "relationship_cache_refresh_parent");
		targets.set(parentResult.issue.number, relationshipMetadataFromResult(parentResult));
	}
	for (const child of result.subIssues) {
		if (child.number === result.issue.number) continue;
		targets.set(child.number, { parent_issue: nativeIssueToRelationshipSummary(result.issue) });
	}

	const paths: string[] = [];
	const removedPaths: string[] = [];
	const fileActions: ToolFileActionSummary[] = [];
	for (const [issueNumber, relationships] of targets) {
		assertNotAborted(signal);
		const record = await refreshIssueRecordWithRelationship(runtime, issueNumber, relationships, signal);
		const cached = await writeAndSummarizeIssue(ctx, runtime, record, signal);
		if (cached.path) paths.push(cached.path);
		removedPaths.push(...cached.removedPaths);
		fileActions.push({
			action: cached.action,
			...(cached.path ? { path: cached.path } : {}),
			...(cached.removedPaths.length > 0 ? { removedPaths: cached.removedPaths } : {}),
			issue: cached.summary,
		});
	}
	return { paths, removedPaths, fileActions, cacheUpdated: fileActions.length > 0 };
}

function relationshipMetadataFromResult(result: NativeSubIssueRelationshipResult): IssueRelationshipMetadata {
	return {
		parent_issue: result.parentIssue ? nativeIssueToRelationshipSummary(result.parentIssue) : null,
		sub_issues: result.subIssues.map(nativeIssueToRelationshipSummary),
		sub_issues_count: result.subIssuesCount,
	};
}

function buildReorderSubIssuesDetails(
	repository: string,
	result: NativeSubIssueReorderResult,
	params: NormalizedReorderSubIssuesParams,
	creatorScope: string,
	cache?: RelationshipCacheRefreshResult,
): IssueMeToolDetails {
	const relationship = result.relationship;
	return {
		repository,
		creatorScope,
		status: result.mutations.length > 0 ? "reorder_sub_issues" : "reorder_sub_issues_noop",
		issue: relationshipResultToToolSummary(repository, relationship),
		issues: relationshipResultToRelatedSummaries(repository, relationship),
		counts: {
			subIssues: relationship.subIssues.length,
			subIssuesTotal: relationship.subIssuesCount,
			requestedSubIssues: params.orderedChildNumbers.length,
			mutations: result.mutations.length,
			...(cache ? { cacheActions: cache.fileActions.length } : {}),
		},
		paths: cache?.paths ?? [],
		removedPaths: cache?.removedPaths ?? [],
		fileActions: cache?.fileActions ?? [],
		changedFields: result.mutations.length > 0 ? ["sub_issues"] : [],
		cacheUpdated: cache ? cache.cacheUpdated : false,
		needsSync: false,
		truncated: relationship.truncated,
		...(relationship.truncated ? { truncation: { subIssues: { shown: relationship.subIssues.length, total: relationship.subIssuesCount, max: MAX_TOOL_ISSUES } } } : {}),
	};
}

function formatReorderSubIssuesText(repository: string, result: NativeSubIssueReorderResult, cache: RelationshipCacheRefreshResult | undefined): string {
	const relationship = result.relationship;
	const order = relationship.subIssues.length > 0
		? relationship.subIssues.map((issue) => `#${issue.number}`).join(", ")
		: "none";
	const lines = [
		`Native sub-issue order for ${repository}#${relationship.issue.number}: ${order}.`,
		result.mutations.length === 0
			? "Remote order already matched the requested order; no GitHub reorder mutation was needed."
			: `Applied ${result.mutations.length} GitHub reprioritizeSubIssue mutation(s).`,
		formatRelationshipCacheRefreshLine(cache, "Local cache was not refreshed yet."),
	];
	return lines.join("\n");
}

function formatListSubIssuesText(
	repository: string,
	result: NativeSubIssueRelationshipResult,
	params: NormalizedListSubIssuesParams,
	cache: RelationshipCacheRefreshResult | undefined,
): string {
	const parent = result.parentIssue ? formatNativeIssueLine(result.parentIssue) : "none";
	const subIssueHeader = formatSubIssueHeader(result);
	const lines = [
		`Native sub-issue relationships for ${repository}#${result.issue.number}.`,
		`Issue: ${formatNativeIssueLine(result.issue)}`,
		`Parent: ${parent}`,
		`Sub-issues: ${subIssueHeader}`,
		...result.subIssues.map((issue) => `- ${formatNativeIssueLine(issue)}`),
		result.truncated ? `Sub-issue list truncated at ${params.limit}; rerun with a narrower parent or higher limit up to ${MAX_TOOL_ISSUES}.` : undefined,
		formatRelationshipCacheRefreshLine(cache, "Local cache was not refreshed; pass refreshCache true to update relationship metadata intentionally."),
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatSubIssueHeader(result: NativeSubIssueRelationshipResult): string {
	const shownCount = result.subIssues.length;
	if (shownCount === 0) return "none";
	if (result.subIssuesCount > shownCount) return `${shownCount} shown of ${result.subIssuesCount}`;
	return `${shownCount}`;
}

function formatRelationshipCacheRefreshLine(cache: RelationshipCacheRefreshResult | undefined, missingCacheText: string): string {
	if (!cache) return missingCacheText;
	return `Local cache refreshed for ${cache.fileActions.length} issue(s); paths: ${formatCachePaths(cache.paths)}.`;
}

function formatCachePaths(paths: string[]): string {
	if (paths.length === 0) return "none";
	return paths.join(", ");
}

function formatNativeIssueLine(issue: NativeSubIssueSummary): string {
	return `#${issue.number} [${issue.state}] ${issue.title} — ${issue.html_url}`;
}

async function cacheRelationshipAfterSuccess(
	ctx: ExtensionContext,
	runtime: IssueMeRuntime,
	relationship: NativeSubIssueMutationResult,
	action: "add" | "remove",
	signal: AbortSignal | undefined,
	text: string,
) {
	const creatorScope = issueCreatorScopeLabel(runtime.config);
	try {
		const parentRelationship = await runtime.client.listSubIssueRelationships(relationship.parent.number, { limit: MAX_TOOL_ISSUES }, signal);
		assertRelationshipCreatorScopeAllowed(runtime, parentRelationship, `sub_issue_${action}_cache_refresh`);
		const parentRecord = await refreshIssueRecordWithRelationship(runtime, relationship.parent.number, relationshipMetadataFromResult(parentRelationship), signal);
		const childRecord = await refreshIssueRecordWithRelationship(runtime, relationship.child.number, childRelationshipMetadata(relationship, action), signal);
		const parentCached = await writeAndSummarizeIssue(ctx, runtime, parentRecord, signal);
		const childCached = await writeAndSummarizeIssue(ctx, runtime, childRecord, signal);
		const paths = [parentCached.path, childCached.path].filter((path): path is string => Boolean(path));
		const issues = [parentCached.summary, childCached.summary];
		return toolText(`${text}\nLocal files: ${paths.length ? paths.join(", ") : "none"}`, {
			repository: runtime.repository,
			creatorScope,
			issue: childCached.summary,
			issues,
			paths,
			removedPaths: [...parentCached.removedPaths, ...childCached.removedPaths],
			changedFields: ["sub_issues"],
			cacheUpdated: true,
			truncated: parentRelationship.truncated,
			...(parentRelationship.truncated ? { truncation: { subIssues: { shown: parentRelationship.subIssues.length, total: parentRelationship.subIssuesCount, max: MAX_TOOL_ISSUES } } } : {}),
		});
	} catch (error) {
		return partialSuccessToolText(
			`${text}\nNative sub-issue relationship changed on GitHub, but local cache refresh failed; run issueme_sync_issues before relying on cache state.`,
			error,
			{
				repository: runtime.repository,
				creatorScope,
				issue: nativeIssueToToolSummary(runtime.repository, relationship.child),
				issues: [nativeIssueToToolSummary(runtime.repository, relationship.parent), nativeIssueToToolSummary(runtime.repository, relationship.child)],
				changedFields: ["sub_issues"],
			},
			"sub_issue_cache_refresh_failed",
			"partial_success",
		);
	}
}

async function cacheCreatedIssueAfterAttachFailure(
	ctx: ExtensionContext,
	runtime: IssueMeRuntime,
	record: IssueRecord,
	parentNumber: number,
	attachError: unknown,
	signal?: AbortSignal,
) {
	const creatorScope = issueCreatorScopeLabel(runtime.config);
	const safeAttachError = subIssueAttachPartialSuccessError(attachError, record, parentNumber);
	const guidance = subIssueAttachPartialSuccessGuidance(parentNumber, record.number);
	const relationshipNeedsSync = isRemoteMutationSuccessKnown(attachError);
	const status = relationshipNeedsSync ? "sub_issue_attach_response_partial_success" : "sub_issue_attach_partial_success";
	try {
		const { summary, path } = await writeAndSummarizeIssue(ctx, runtime, record, signal);
		return toolText(
			`${formatCreatedSubIssueAttachFailure(record, parentNumber, relationshipNeedsSync)}\nURL: ${record.html_url}\nLocal file: ${path}\nRetry-safe guidance: ${guidance}\nError: ${safeAttachError.message}`,
			{
				repository: runtime.repository,
				creatorScope,
				result: "partial_success",
				issue: summary,
				issues: [summary],
				paths: path ? [path] : [],
				cacheUpdated: true,
				needsSync: relationshipNeedsSync,
				status,
				message: safeAttachError.message,
				error: safeAttachError,
			},
		);
	} catch (cacheError) {
		const safeCacheError = partialSuccessToolError(cacheError, "sub_issue_attach_partial_success_cache_failed");
		return toolText(
			`${formatCreatedSubIssueAttachFailure(record, parentNumber, relationshipNeedsSync)} Local cache update also failed; run issueme_sync_issues before relying on local cache state.\nURL: ${record.html_url}\nRetry-safe guidance: ${guidance}\nError: ${safeAttachError.message}`,
			{
				repository: runtime.repository,
				creatorScope,
				result: "partial_success",
				issue: issueRecordToToolSummary(record),
				issues: [issueRecordToToolSummary(record)],
				cacheUpdated: false,
				needsSync: true,
				status: "sub_issue_attach_partial_success_cache_failed",
				message: safeAttachError.message,
				error: {
					...safeAttachError,
					details: attachFailureDetailsWithCacheError(safeAttachError, safeCacheError),
				},
			},
		);
	}
}

function formatCreatedSubIssueAttachFailure(record: IssueRecord, parentNumber: number, relationshipNeedsSync: boolean): string {
	if (relationshipNeedsSync) {
		return `Created issue #${record.number}: ${record.title}. GitHub accepted the native attachment request for parent #${parentNumber}, but IssueMe could not verify the relationship response.`;
	}
	return `Created issue #${record.number}: ${record.title}, but failed to link it as a native sub-issue of #${parentNumber}. IssueMe did not fall back to body-only references.`;
}

function subIssueAttachPartialSuccessGuidance(parentNumber: number, childNumber: number): string {
	return `Do not rerun issueme_create_sub_issue blindly; after resolving the native attachment blocker, reuse the already-created issue with issueme_add_sub_issue using parentNumber ${parentNumber} and childNumber ${childNumber}.`;
}

function attachFailureDetailsWithCacheError(safeAttachError: SafeToolError, safeCacheError: SafeToolError): Record<string, unknown> {
	const details: Record<string, unknown> = {};
	if (safeAttachError.details) Object.assign(details, safeAttachError.details);
	details.cacheError = safeCacheError;
	return details;
}

function subIssueAttachPartialSuccessError(error: unknown, record: IssueRecord, parentNumber: number): SafeToolError {
	const safeError = partialSuccessToolError(error, "sub_issue_attach_partial_success");
	const recoveryHint = subIssueAttachPartialSuccessGuidance(parentNumber, record.number);
	return {
		...safeError,
		recoveryHint,
		details: subIssueAttachPartialSuccessDetails(safeError.details, record, parentNumber, recoveryHint),
	};
}

function subIssueAttachPartialSuccessDetails(safeErrorDetails: Record<string, unknown> | undefined, record: IssueRecord, parentNumber: number, recoveryHint: string): Record<string, unknown> {
	const details: Record<string, unknown> = {
		parentNumber,
		createdIssue: {
			number: record.number,
			title: record.title,
			html_url: record.html_url,
		},
		retrySafeGuidance: recoveryHint,
	};
	if (safeErrorDetails) Object.assign(details, safeErrorDetails);
	details.partialSuccessStatus = "sub_issue_attach_partial_success";
	details.partialSuccessRecoveryHint = recoveryHint;
	return details;
}

function subIssueMutationFailure(runtime: IssueMeRuntime, parentNumber: number, childNumber: number, action: "attach" | "remove", error: unknown) {
	const safeError = safeToolError(error);
	const verb = action === "attach" ? "attach issue as a native sub-issue" : "remove native sub-issue relationship";
	return toolText(`Failed to ${verb} (#${childNumber} under #${parentNumber}). IssueMe did not fall back to body-only references.\nError: ${safeError.message}`, {
		repository: runtime.repository,
		creatorScope: issueCreatorScopeLabel(runtime.config),
		cacheUpdated: false,
		needsSync: false,
		status: `sub_issue_${action}_failed`,
		message: safeError.message,
		error: safeError,
	});
}

function subIssueReorderFailure(runtime: IssueMeRuntime, parentNumber: number, error: unknown) {
	const safeError = safeToolError(error);
	return toolText(`Failed to reorder native sub-issues under #${parentNumber}. IssueMe did not fall back to body-only ordering.\nError: ${safeError.message}`, {
		repository: runtime.repository,
		creatorScope: issueCreatorScopeLabel(runtime.config),
		cacheUpdated: false,
		needsSync: false,
		status: "sub_issue_reorder_failed",
		message: safeError.message,
		error: safeError,
	});
}

async function refreshIssueRecordWithRelationship(
	runtime: IssueMeRuntime,
	issueNumber: number,
	relationships: IssueRelationshipMetadata,
	signal?: AbortSignal,
): Promise<IssueRecord> {
	const record = await refreshIssueRecord(runtime, issueNumber, signal);
	return applyIssueRelationshipMetadata(record, relationships);
}

function childRelationshipMetadata(relationship: NativeSubIssueMutationResult, action: "add" | "remove"): IssueRelationshipMetadata {
	return { parent_issue: action === "add" ? nativeIssueToRelationshipSummary(relationship.parent) : null };
}

function nativeIssueToRelationshipSummary(issue: NativeSubIssueSummary): IssueRelationshipSummary {
	return {
		number: issue.number,
		title: issue.title,
		state: issue.state,
		...(issue.creator ? { creator: issue.creator } : {}),
		html_url: issue.html_url,
	};
}

function nativeIssueToToolSummary(repository: string, issue: NativeSubIssueSummary): ToolIssueSummary {
	return {
		repository,
		number: issue.number,
		title: issue.title,
		state: issue.state,
		...(issue.creator ? { creator: issue.creator } : {}),
		labels: [],
		assignees: [],
		html_url: issue.html_url,
	};
}

function requireDistinctIssueNumbers(parentNumber: number, childNumber: number): void {
	if (parentNumber === childNumber) {
		throw new IssueMeError("invalid_tool_input", "parentNumber and childNumber must refer to different issues for native sub-issue relationships.", { parentNumber, childNumber });
	}
}

function isExpectedSubIssueDomainFailure(error: unknown): boolean {
	return error instanceof IssueMeError
		&& (error.code === "github_sub_issue_forbidden" || error.code === "github_sub_issue_unsupported");
}
