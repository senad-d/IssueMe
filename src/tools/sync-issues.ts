import { basename } from "node:path";

import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { MAX_CACHE_COMMENTS, MAX_TOOL_ISSUES } from "../constants.ts";
import { IssueMeError } from "../errors.ts";
import { issueRecordToToolSummary, isPullRequestIssue } from "../issues/format.ts";
import { issueFileDiagnosticReason, listIssueFileEntries, relativeIssuePath, removeClosedIssueFiles, writeIssueRecord } from "../issues/store.ts";
import type { InvalidIssueFileDiagnostic, IssueMeToolDetails, IssueWriteResult } from "../types.ts";
import { resolveIssueFilePath } from "../utils/slug.ts";
import { assertNotAborted, createIssueMeRuntime, fetchIssueRecord, ISSUEME_SHARED_PROMPT_GUIDELINE, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

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
				const before = beforeEntries.files;
				const invalidFiles = relativeInvalidFileDiagnostics(runtime.projectRoot, beforeEntries.invalidFiles);
				const issues = (await runtime.client.listOpenIssues(signal)).filter((issue) => !isPullRequestIssue(issue));
				const openNumbers = new Set<number>();
				const counts = { created: 0, updated: 0, renamed: 0, unchanged: 0, removed: 0, invalid: invalidFiles.length };
				const paths: string[] = [];
				const removedPaths: string[] = [];
				const fileActions: NonNullable<IssueMeToolDetails["fileActions"]> = [];
				const summaries = [];

				for (const issue of issues) {
					assertNotAborted(signal);
					const record = await fetchIssueRecord(runtime, issue, signal);
					openNumbers.add(record.number);
					let result: IssueWriteResult;
					try {
						assertNotAborted(signal);
						result = await writeIssueRecord(runtime.projectRoot, runtime.config, record, signal);
					} catch (error) {
						if (!isInvalidIssueFileError(error)) throw error;
						const targetPath = resolveIssueFilePath(runtime.projectRoot, runtime.config.issueDirectory, record.number, record.title);
						const localPath = relativeIssuePath(runtime.projectRoot, targetPath) ?? basename(targetPath);
						pushInvalidFileDiagnostic(invalidFiles, { path: localPath, fileName: basename(targetPath), reason: issueFileDiagnosticReason(error) });
						counts.invalid = invalidFiles.length;
						const summary = issueRecordToToolSummary(record, localPath);
						summaries.push(summary);
						fileActions.push({ action: "unchanged", path: localPath, issue: summary });
						continue;
					}
					if (result.action in counts) counts[result.action as keyof typeof counts] += 1;
					counts.removed += result.removedPaths.length;
					const localPath = relativeIssuePath(runtime.projectRoot, result.path);
					const removedActionPaths = result.removedPaths.map((path) => relativeIssuePath(runtime.projectRoot, path) ?? path);
					removedPaths.push(...removedActionPaths);
					if (localPath) paths.push(localPath);
					const summary = issueRecordToToolSummary(record, localPath);
					summaries.push(summary);
					fileActions.push({
						action: result.action,
						...(localPath ? { path: localPath } : {}),
						...(removedActionPaths.length ? { removedPaths: removedActionPaths } : {}),
						issue: summary,
					});
				}

				assertNotAborted(signal);
				const removed = await removeClosedIssueFiles(runtime.projectRoot, runtime.config, openNumbers, runtime.repository, signal);
				counts.removed += removed.length;
				const staleRemovedPaths = removed.map((path) => relativeIssuePath(runtime.projectRoot, path) ?? path);
				removedPaths.push(...staleRemovedPaths);
				for (const path of staleRemovedPaths) fileActions.push({ action: "removed", path });
				const commentTruncation = runtime.commentsTruncated ? commentTruncationDetails(runtime.truncatedCommentIssues) : undefined;
				const details: IssueMeToolDetails = {
					repository: runtime.repository,
					counts,
					paths,
					removedPaths,
					fileActions,
					invalidFiles,
					issues: summaries,
					cacheUpdated: true,
					truncated: runtime.commentsTruncated,
					...(commentTruncation ? { truncation: { comments: commentTruncation } } : {}),
				};
				const staleBefore = before.length - openNumbers.size;
				const text = [
					`Synced ${issues.length} open issue(s) for ${runtime.repository}.`,
					`Created: ${counts.created}, updated: ${counts.updated}, renamed: ${counts.renamed}, unchanged: ${counts.unchanged}, removed local files: ${counts.removed}.`,
					counts.invalid > 0 ? `Invalid local issue files: ${counts.invalid} left untouched with safe diagnostics in details.invalidFiles.` : undefined,
					runtime.commentsTruncated ? `Some issue comments were truncated in local cache according to the IssueMe comment policy (${MAX_CACHE_COMMENTS} comments per issue).` : undefined,
					staleBefore > 0 ? `Local cache had ${before.length} file(s) before sync.` : undefined,
				].filter(Boolean).join("\n");
				return toolText(text, details);
			},
		}),
	);
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
