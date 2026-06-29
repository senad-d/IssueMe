import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { loadIssueMeConfig } from "../config/config.ts";
import { IssueMeError } from "../errors.ts";
import type { IssueMeConfig } from "../types.ts";
import { resolveCurrentRepository } from "../github/repository.ts";
import { formatIssueSummary, issueRecordToToolSummary } from "../issues/format.ts";
import { findIssueByLookup, findIssueByNumber, relativeIssuePath } from "../issues/store.ts";
import { assertIssueCreatorAllowed, assertTrustedProject, createIssueMeRuntime, getIssueMeProjectRoot, issueCreatorScopeLabel, normalizeRuntimeRepository, refreshIssueRecord, resolveRuntimeOptions, toolText, type IssueMeToolRegistrationOptions, writeAndSummarizeIssue } from "./runtime.ts";

const GetIssueParams = Type.Object(
	{
		number: Type.Optional(Type.Integer({ minimum: 1, description: "Issue number." })),
		lookup: Type.Optional(Type.String({ description: "Number, filename, slug, or title fragment." })),
		refresh: Type.Optional(Type.Boolean({ description: "True refreshes known issue from GitHub." })),
	},
	{ additionalProperties: false },
);

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
				const lookup = typeof params.lookup === "string" ? params.lookup.trim() : undefined;
				const hasLookup = lookup !== undefined && lookup.length > 0;
				if (params.number === undefined && !hasLookup) {
					throw new IssueMeError("invalid_tool_input", "Provide number or lookup for issueme_get_issue.");
				}
				if (params.number !== undefined && hasLookup) {
					throw new IssueMeError("invalid_tool_input", "Use number or lookup for issueme_get_issue, not both.", { fields: ["number", "lookup"] });
				}

				if (params.refresh) {
					const runtime = await createIssueMeRuntime(ctx, options.runtime);
					let issueNumber = params.number;
					let previousPath: string | undefined;
					if (issueNumber === undefined && hasLookup) {
						const localLookup = await findIssueByLookup(runtime.projectRoot, runtime.config, lookup, runtime.repository);
						if (!localLookup) throw new IssueMeError("issue_not_found", "Issue not found in local IssueMe cache; provide a number to refresh directly from GitHub.");
						assertIssueCreatorAllowed(runtime.config, localLookup.record, { repository: runtime.repository, operation: "get_issue_refresh_lookup" });
						issueNumber = localLookup.record.number;
						previousPath = relativeIssuePath(runtime.projectRoot, localLookup.path);
					}
					if (issueNumber === undefined) throw new IssueMeError("invalid_tool_input", "Refreshing from GitHub requires an issue number or a local lookup that resolves to one.");
					const record = await refreshIssueRecord(runtime, issueNumber, signal);
					const { summary, path, removedPaths, action } = await writeAndSummarizeIssue(ctx, runtime, record, signal);
					const allRemovedPaths = uniquePaths([
						...removedPaths,
						...(previousPath && previousPath !== path ? [previousPath] : []),
					]);
					const formatted = formatIssueSummary(record);
					return toolText(`${formatted.text}\n\nLocal cache action: ${action}\nLocal file: ${path ?? "removed (issue is closed)"}`, {
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

				const localScope = await createLocalLookupScope(ctx, options);
				const localLookup = params.number !== undefined
					? await findIssueByNumber(localScope.projectRoot, localScope.config, params.number, localScope.repository)
					: await findIssueByLookup(localScope.projectRoot, localScope.config, lookup ?? "", localScope.repository);
				if (!localLookup) throw new IssueMeError("issue_not_found", "Issue not found in the current repository's local IssueMe cache. Run issueme_sync_issues or use refresh with a number.");
				assertIssueCreatorAllowed(localScope.config, localLookup.record, { repository: localScope.repository, operation: "get_issue_local_lookup" });

				const { projectRoot } = localScope;

				const formatted = formatIssueSummary(localLookup.record);
				const path = relativeIssuePath(projectRoot, localLookup.path);
				return toolText(formatted.text, {
					repository: localLookup.record.repository,
					creatorScope: issueCreatorScopeLabel(localScope.config),
					issue: issueRecordToToolSummary(localLookup.record, path),
					paths: path ? [path] : [],
					truncated: formatted.truncated,
					...(formatted.truncation ? { truncation: formatted.truncation } : {}),
				});
			},
		}),
	);
}

async function createLocalLookupScope(ctx: ExtensionContext, options: IssueMeToolRegistrationOptions): Promise<{
	projectRoot: string;
	config: IssueMeConfig;
	repository: string;
}> {
	assertTrustedProject(ctx, "issueme_get_issue requires project trust before reading local issue cache files.");
	const runtimeOptions = await resolveRuntimeOptions(ctx, options.runtime);
	const projectRoot = runtimeOptions.projectRoot ?? await getIssueMeProjectRoot(ctx.cwd);
	const config = runtimeOptions.config ?? await loadIssueMeConfig(projectRoot);
	if (runtimeOptions.client && runtimeOptions.repository) {
		const requestedRepository = normalizeRuntimeRepository(runtimeOptions.repository);
		if (runtimeOptions.client.repository.fullName !== requestedRepository.fullName) {
			throw new IssueMeError("runtime_repository_mismatch", "Injected IssueMe runtime client repository does not match the requested repository.");
		}
	}
	const repository = runtimeOptions.client?.repository
		?? (runtimeOptions.repository
			? normalizeRuntimeRepository(runtimeOptions.repository)
			: await resolveCurrentRepository(projectRoot, runtimeOptions.env ?? process.env, { allowGitConfig: true }));
	return { projectRoot, config, repository: repository.fullName };
}

function uniquePaths(paths: string[]): string[] {
	return [...new Set(paths)];
}
