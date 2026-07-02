import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { loadIssueMeConfig } from "../config/config.ts";
import { IssueMeError } from "../errors.ts";
import type { IssueLookupResult, IssueMeConfig } from "../types.ts";
import { resolveCurrentRepository } from "../github/repository.ts";
import { formatIssueSummary, issueRecordToToolSummary } from "../issues/format.ts";
import { findIssueByLookup, findIssueByNumber, relativeIssuePath } from "../issues/store.ts";
import { assertIssueCreatorAllowed, assertTrustedProject, createIssueMeRuntime, getIssueMeProjectRoot, issueCreatorScopeLabel, normalizeRuntimeRepository, refreshIssueRecord, resolveRuntimeOptions, toolText, type IssueMeRuntime, type IssueMeToolRegistrationOptions, writeAndSummarizeIssue } from "./runtime.ts";

const GetIssueParams = Type.Object(
	{
		number: Type.Optional(Type.Integer({ minimum: 1, description: "Issue number." })),
		lookup: Type.Optional(Type.String({ description: "Number, filename, slug, or title fragment." })),
		refresh: Type.Optional(Type.Boolean({ description: "True refreshes known issue from GitHub." })),
	},
	{ additionalProperties: false },
);

type GetIssueToolParams = Static<typeof GetIssueParams>;

interface NormalizedGetIssueRequest {
	number?: number;
	lookup?: string;
	refresh: boolean;
}

interface RefreshIssueTarget {
	issueNumber: number;
	previousPath?: string;
}

interface LocalLookupScope {
	projectRoot: string;
	config: IssueMeConfig;
	repository: string;
}

export function registerGetIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_get_issue",
			label: "IssueMe Get Issue",
			description: "Read cached issue or refresh known issue.",
			promptSnippet: "Read cached or refresh known issue.",
			promptGuidelines: [
				"Use issueme_get_issue for cached details; set refresh true only for current remote state or focused closed/open reconciliation.",
			],
			executionMode: "sequential",
			parameters: GetIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				return executeGetIssueTool(params, signal, ctx, options);
			},
		}),
	);
}

async function executeGetIssueTool(params: GetIssueToolParams, signal: AbortSignal | undefined, ctx: ExtensionContext, options: IssueMeToolRegistrationOptions) {
	const request = normalizeGetIssueRequest(params);
	if (request.refresh) return getRefreshedIssueToolText(ctx, options, request, signal);
	return getCachedIssueToolText(ctx, options, request);
}

function normalizeGetIssueRequest(params: GetIssueToolParams): NormalizedGetIssueRequest {
	const lookup = normalizeGetIssueLookup(params.lookup);
	const hasNumber = typeof params.number === "number";
	const hasLookup = typeof lookup === "string";
	if (hasNumber && hasLookup) throw new IssueMeError("invalid_tool_input", "Use number or lookup for issueme_get_issue, not both.", { fields: ["number", "lookup"] });
	if (hasNumber) return { number: params.number, refresh: params.refresh === true };
	if (hasLookup) return { lookup, refresh: params.refresh === true };
	throw new IssueMeError("invalid_tool_input", "Provide number or lookup for issueme_get_issue.");
}

function normalizeGetIssueLookup(lookup: string | undefined): string | undefined {
	if (typeof lookup === "string") {
		const trimmed = lookup.trim();
		if (trimmed.length > 0) return trimmed;
	}
	return undefined;
}

async function getRefreshedIssueToolText(ctx: ExtensionContext, options: IssueMeToolRegistrationOptions, request: NormalizedGetIssueRequest, signal: AbortSignal | undefined) {
	const runtime = await createIssueMeRuntime(ctx, options.runtime);
	const target = await resolveRefreshIssueTarget(runtime, request);
	const record = await refreshIssueRecord(runtime, target.issueNumber, signal);
	const { summary, path, removedPaths, action } = await writeAndSummarizeIssue(ctx, runtime, record, signal);
	const allRemovedPaths = removedPathsForRefresh(removedPaths, target.previousPath, path);
	const formatted = formatIssueSummary(record);
	return toolText(formatRefreshedIssueText(formatted.text, action, path), {
		repository: runtime.repository,
		creatorScope: issueCreatorScopeLabel(runtime.config),
		issue: summary,
		paths: path ? [path] : [],
		removedPaths: allRemovedPaths,
		fileActions: [{
			action,
			...(path ? { path } : {}),
			...(allRemovedPaths.length ? { removedPaths: allRemovedPaths } : {}),
			issue: summary,
		}],
		cacheUpdated: true,
		status: `cache_${action}`,
		truncated: formatted.truncated,
		...(formatted.truncation ? { truncation: formatted.truncation } : {}),
	});
}

async function resolveRefreshIssueTarget(runtime: IssueMeRuntime, request: NormalizedGetIssueRequest): Promise<RefreshIssueTarget> {
	if (typeof request.number === "number") return { issueNumber: request.number };
	if (request.lookup === undefined) throw new IssueMeError("invalid_tool_input", "Refreshing from GitHub requires an issue number or a local lookup that resolves to one.");
	const localLookup = await findIssueByLookup(runtime.projectRoot, runtime.config, request.lookup, runtime.repository);
	if (localLookup) return refreshIssueTargetFromLookup(runtime, localLookup);
	throw new IssueMeError("issue_not_found", "Issue not found in local IssueMe cache; provide a number to refresh directly from GitHub.");
}

function refreshIssueTargetFromLookup(runtime: IssueMeRuntime, localLookup: IssueLookupResult): RefreshIssueTarget {
	assertIssueCreatorAllowed(runtime.config, localLookup.record, { repository: runtime.repository, operation: "get_issue_refresh_lookup" });
	const previousPath = relativeIssuePath(runtime.projectRoot, localLookup.path);
	return {
		issueNumber: localLookup.record.number,
		...(previousPath ? { previousPath } : {}),
	};
}

function removedPathsForRefresh(removedPaths: string[], previousPath: string | undefined, path: string | undefined): string[] {
	if (previousPath === undefined) return uniquePaths(removedPaths);
	if (previousPath === path) return uniquePaths(removedPaths);
	return uniquePaths([...removedPaths, previousPath]);
}

function formatRefreshedIssueText(formattedText: string, action: string, path: string | undefined): string {
	return `${formattedText}\n\nLocal cache action: ${action}\nLocal file: ${path ?? "removed (issue is closed)"}`;
}

async function getCachedIssueToolText(ctx: ExtensionContext, options: IssueMeToolRegistrationOptions, request: NormalizedGetIssueRequest) {
	const localScope = await createLocalLookupScope(ctx, options);
	const localLookup = await findLocalIssue(localScope, request);
	if (localLookup === undefined) throw new IssueMeError("issue_not_found", "Issue not found in the current repository's local IssueMe cache. Run issueme_sync_issues or use refresh with a number.");
	assertIssueCreatorAllowed(localScope.config, localLookup.record, { repository: localScope.repository, operation: "get_issue_local_lookup" });
	const formatted = formatIssueSummary(localLookup.record);
	const path = relativeIssuePath(localScope.projectRoot, localLookup.path);
	return toolText(formatted.text, {
		repository: localLookup.record.repository,
		creatorScope: issueCreatorScopeLabel(localScope.config),
		issue: issueRecordToToolSummary(localLookup.record, path),
		paths: path ? [path] : [],
		truncated: formatted.truncated,
		...(formatted.truncation ? { truncation: formatted.truncation } : {}),
	});
}

function findLocalIssue(localScope: LocalLookupScope, request: NormalizedGetIssueRequest) {
	if (request.number === undefined) return findIssueByLookup(localScope.projectRoot, localScope.config, request.lookup ?? "", localScope.repository);
	return findIssueByNumber(localScope.projectRoot, localScope.config, request.number, localScope.repository);
}

async function createLocalLookupScope(ctx: ExtensionContext, options: IssueMeToolRegistrationOptions): Promise<LocalLookupScope> {
	assertTrustedProject(ctx, "issueme_get_issue requires project trust before reading local issue cache files.");
	const runtimeOptions = await resolveRuntimeOptions(ctx, options.runtime);
	const projectRoot = runtimeOptions.projectRoot ?? await getIssueMeProjectRoot(ctx.cwd);
	const config = runtimeOptions.config ?? await loadIssueMeConfig(projectRoot);
	if (runtimeOptions.client && runtimeOptions.repository) {
		const requestedRepository = normalizeRuntimeRepository(runtimeOptions.repository);
		assertRuntimeRepositoryMatches(runtimeOptions.client.repository.fullName, requestedRepository.fullName);
	}
	const repository = runtimeOptions.client?.repository
		?? (runtimeOptions.repository
			? normalizeRuntimeRepository(runtimeOptions.repository)
			: await resolveCurrentRepository(projectRoot, runtimeOptions.env ?? process.env, { allowGitConfig: true }));
	return { projectRoot, config, repository: repository.fullName };
}

function assertRuntimeRepositoryMatches(clientRepository: string, requestedRepository: string): void {
	if (clientRepository === requestedRepository) return;
	throw new IssueMeError("runtime_repository_mismatch", "Injected IssueMe runtime client repository does not match the requested repository.");
}

function uniquePaths(paths: string[]): string[] {
	return [...new Set(paths)];
}
