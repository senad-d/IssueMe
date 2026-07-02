import { basename } from "node:path";

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { MAX_CACHE_COMMENTS, MAX_TOOL_ISSUES } from "../constants.ts";
import { IssueMeError } from "../errors.ts";
import { issueRecordToToolSummary, isPullRequestIssue } from "../issues/format.ts";
import { issueFileDiagnosticReason, listIssueFileEntries, relativeIssuePath, removeClosedIssueFiles, writeIssueRecord } from "../issues/store.ts";
import type { GitHubIssueResponse, InvalidIssueFileDiagnostic, IssueMeToolDetails, IssueRecord, IssueWriteResult, ToolIssueSummary } from "../types.ts";
import { resolveIssueFilePath } from "../utils/slug.ts";
import { assertNotAborted, createIssueMeRuntime, fetchIssueRecord, ISSUEME_SHARED_PROMPT_GUIDELINE, issueCreatorMatchesConfig, issueCreatorScopeLabel, toolText, type IssueMeRuntime, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const SyncIssuesParams = Type.Object({}, { additionalProperties: false });

export function registerSyncIssuesTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_sync_issues",
			label: "IssueMe Sync Issues",
			description: "Sync open issues to local cache; remove stale closed issue files.",
			promptSnippet: "Sync open issues to local cache.",
			promptGuidelines: [
				ISSUEME_SHARED_PROMPT_GUIDELINE,
				"Use issueme_sync_issues before backlog planning or after partial cache-refresh failures.",
			],
			executionMode: "sequential",
			parameters: SyncIssuesParams,
			async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const beforeEntries = await listIssueFileEntries(runtime.projectRoot, runtime.config, { repository: runtime.repository });
				const creatorScope = issueCreatorScopeLabel(runtime.config);
				const issues = await listSyncableIssues(runtime, creatorScope, signal);
				const state = createSyncIssueState(beforeEntries.files.length, relativeInvalidFileDiagnostics(runtime.projectRoot, beforeEntries.invalidFiles));

				await syncIssueRecords(runtime, issues, state, signal);
				await removeStaleIssueFiles(runtime, state, signal);

				return toolText(
					buildSyncIssuesText(runtime, creatorScope, issues.length, state),
					buildSyncIssuesDetails(runtime, creatorScope, state),
				);
			},
		}),
	);
}

type SyncIssueCounts = Record<IssueWriteResult["action"] | "invalid", number>;
type SyncFileAction = NonNullable<IssueMeToolDetails["fileActions"]>[number];

interface SyncIssueState {
	beforeCount: number;
	invalidFiles: InvalidIssueFileDiagnostic[];
	openNumbers: Set<number>;
	counts: SyncIssueCounts;
	paths: string[];
	removedPaths: string[];
	fileActions: NonNullable<IssueMeToolDetails["fileActions"]>;
	summaries: ToolIssueSummary[];
}

async function listSyncableIssues(runtime: IssueMeRuntime, creatorScope: string, signal?: AbortSignal): Promise<GitHubIssueResponse[]> {
	const listResult = await runtime.client.listIssues(listIssueFilters(creatorScope), signal);
	return listResult.issues.filter((issue) => isSyncableIssue(runtime, issue));
}

function listIssueFilters(creatorScope: string): { state: "open"; creator?: string } {
	if (creatorScope === "all") return { state: "open" };
	return { state: "open", creator: creatorScope };
}

function isSyncableIssue(runtime: IssueMeRuntime, issue: GitHubIssueResponse): boolean {
	if (isPullRequestIssue(issue)) return false;
	return issueCreatorMatchesConfig(runtime.config, issue.user);
}

function createSyncIssueState(beforeCount: number, invalidFiles: InvalidIssueFileDiagnostic[]): SyncIssueState {
	return {
		beforeCount,
		invalidFiles,
		openNumbers: new Set<number>(),
		counts: { created: 0, updated: 0, renamed: 0, unchanged: 0, removed: 0, invalid: invalidFiles.length },
		paths: [],
		removedPaths: [],
		fileActions: [],
		summaries: [],
	};
}

async function syncIssueRecords(runtime: IssueMeRuntime, issues: GitHubIssueResponse[], state: SyncIssueState, signal?: AbortSignal): Promise<void> {
	for (const issue of issues) await syncIssueRecord(runtime, issue, state, signal);
}

async function syncIssueRecord(runtime: IssueMeRuntime, issue: GitHubIssueResponse, state: SyncIssueState, signal?: AbortSignal): Promise<void> {
	assertNotAborted(signal);
	const record = await fetchIssueRecord(runtime, issue, signal);
	state.openNumbers.add(record.number);
	try {
		assertNotAborted(signal);
		const result = await writeIssueRecord(runtime.projectRoot, runtime.config, record, signal);
		applyIssueWriteResult(runtime, state, record, result);
	} catch (error) {
		if (isInvalidIssueFileError(error)) {
			applyInvalidIssueFileResult(runtime, state, record, error);
			return;
		}
		throw error;
	}
}

function applyInvalidIssueFileResult(runtime: IssueMeRuntime, state: SyncIssueState, record: IssueRecord, error: unknown): void {
	const targetPath = resolveIssueFilePath(runtime.projectRoot, runtime.config.issueDirectory, record.number, record.title);
	const localPath = relativeIssuePath(runtime.projectRoot, targetPath) ?? basename(targetPath);
	pushInvalidFileDiagnostic(state.invalidFiles, { path: localPath, fileName: basename(targetPath), reason: issueFileDiagnosticReason(error) });
	state.counts.invalid = state.invalidFiles.length;
	const summary = issueRecordToToolSummary(record, localPath);
	state.summaries.push(summary);
	state.fileActions.push({ action: "unchanged", path: localPath, issue: summary });
}

function applyIssueWriteResult(runtime: IssueMeRuntime, state: SyncIssueState, record: IssueRecord, result: IssueWriteResult): void {
	state.counts[result.action] += 1;
	state.counts.removed += result.removedPaths.length;
	const localPath = relativeIssuePath(runtime.projectRoot, result.path);
	const removedActionPaths = result.removedPaths.map((path) => relativeIssuePath(runtime.projectRoot, path) ?? path);
	state.removedPaths.push(...removedActionPaths);
	if (localPath) state.paths.push(localPath);
	const summary = issueRecordToToolSummary(record, localPath);
	state.summaries.push(summary);
	state.fileActions.push(writeFileAction(result, summary, localPath, removedActionPaths));
}

function writeFileAction(result: IssueWriteResult, issue: ToolIssueSummary, localPath: string | undefined, removedPaths: string[]): SyncFileAction {
	const action: SyncFileAction = { action: result.action, issue };
	if (localPath) action.path = localPath;
	if (removedPaths.length) action.removedPaths = removedPaths;
	return action;
}

async function removeStaleIssueFiles(runtime: IssueMeRuntime, state: SyncIssueState, signal?: AbortSignal): Promise<void> {
	assertNotAborted(signal);
	const removed = await removeClosedIssueFiles(runtime.projectRoot, runtime.config, state.openNumbers, runtime.repository, signal);
	state.counts.removed += removed.length;
	const staleRemovedPaths = removed.map((path) => relativeIssuePath(runtime.projectRoot, path) ?? path);
	state.removedPaths.push(...staleRemovedPaths);
	for (const path of staleRemovedPaths) state.fileActions.push({ action: "removed", path });
}

function buildSyncIssuesDetails(runtime: IssueMeRuntime, creatorScope: string, state: SyncIssueState): IssueMeToolDetails {
	const details: IssueMeToolDetails = {
		repository: runtime.repository,
		creatorScope,
		counts: state.counts,
		paths: state.paths,
		removedPaths: state.removedPaths,
		fileActions: state.fileActions,
		invalidFiles: state.invalidFiles,
		issues: state.summaries,
		cacheUpdated: true,
		truncated: runtime.commentsTruncated,
	};
	if (runtime.commentsTruncated) details.truncation = { comments: commentTruncationDetails(runtime.truncatedCommentIssues) };
	return details;
}

function buildSyncIssuesText(runtime: IssueMeRuntime, creatorScope: string, issueCount: number, state: SyncIssueState): string {
	const lines = [
		`Synced ${issueCount} open issue(s) for ${runtime.repository}.`,
		`Creator scope: ${creatorScope}.`,
		`Created: ${state.counts.created}, updated: ${state.counts.updated}, renamed: ${state.counts.renamed}, unchanged: ${state.counts.unchanged}, removed local files: ${state.counts.removed}.`,
	];
	if (state.counts.invalid > 0) lines.push(`Invalid local issue files: ${state.counts.invalid} left untouched with safe diagnostics in details.invalidFiles.`);
	if (runtime.commentsTruncated) lines.push(`Some issue comments were truncated in local cache according to the IssueMe comment policy (${MAX_CACHE_COMMENTS} comments per issue).`);
	const staleBefore = state.beforeCount - state.openNumbers.size;
	if (staleBefore > 0) lines.push(`Local cache had ${state.beforeCount} file(s) before sync.`);
	return lines.join("\n");
}

function commentTruncationDetails(issueNumbers: number[]): Record<string, unknown> {
	const shownIssueNumbers = issueNumbers.slice(0, MAX_TOOL_ISSUES);
	return {
		policy: "bounded_per_issue",
		maxPerIssue: MAX_CACHE_COMMENTS,
		issueCount: issueNumbers.length,
		issueNumbers: shownIssueNumbers,
		...(shownIssueNumbers.length < issueNumbers.length ? { issueNumbersTruncated: true } : {}),
	};
}

function relativeInvalidFileDiagnostics(projectRoot: string, diagnostics: InvalidIssueFileDiagnostic[]): InvalidIssueFileDiagnostic[] {
	return diagnostics.map((diagnostic) => ({
		...diagnostic,
		path: relativeIssuePath(projectRoot, diagnostic.path) ?? diagnostic.fileName,
	}));
}

function pushInvalidFileDiagnostic(diagnostics: InvalidIssueFileDiagnostic[], diagnostic: InvalidIssueFileDiagnostic): void {
	if (diagnostics.some((existing) => existing.path === diagnostic.path)) return;
	diagnostics.push(diagnostic);
	diagnostics.sort((left, right) => left.fileName.localeCompare(right.fileName));
}

function isInvalidIssueFileError(error: unknown): boolean {
	return error instanceof IssueMeError && ["issue_file_parse_failed", "issue_file_invalid", "unsafe_issue_file"].includes(error.code);
}
