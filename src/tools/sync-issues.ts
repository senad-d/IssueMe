import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { issueRecordToToolSummary, isPullRequestIssue } from "../issues/format.ts";
import { listIssueFiles, relativeIssuePath, removeClosedIssueFiles, writeIssueRecord } from "../issues/store.ts";
import type { IssueMeToolDetails } from "../types.ts";
import { createIssueMeRuntime, fetchIssueRecord, toolText } from "./runtime.ts";

const SyncIssuesParams = Type.Object({}, { additionalProperties: false });

export function registerSyncIssuesTool(pi: ExtensionAPI) {
	pi.registerTool(
		defineTool({
			name: "issueme_sync_issues",
			label: "IssueMe Sync Issues",
			description: "Fetch open GitHub issues for the current repository, rewrite local IssueMe JSON files, and remove local files for closed issues.",
			promptSnippet: "Sync open GitHub issues into local issues/<number>-<title-slug>.json files.",
			promptGuidelines: [
				"Use issueme_sync_issues before editing local issue files directly or before planning work from GitHub issues.",
			],
			parameters: SyncIssuesParams,
			async execute(_toolCallId, _params, signal, _onUpdate, ctx) {
				const runtime = await createIssueMeRuntime(ctx);
				const before = await listIssueFiles(ctx.cwd, runtime.config);
				const issues = (await runtime.client.listOpenIssues(signal)).filter((issue) => !isPullRequestIssue(issue));
				const openNumbers = new Set<number>();
				const counts = { created: 0, updated: 0, unchanged: 0, removed: 0 };
				const paths: string[] = [];
				const summaries = [];

				for (const issue of issues) {
					const record = await fetchIssueRecord(runtime, issue, signal);
					openNumbers.add(record.number);
					const result = await writeIssueRecord(ctx.cwd, runtime.config, record);
					counts[result.action] += 1;
					counts.removed += result.removedPaths.length;
					const localPath = relativeIssuePath(ctx.cwd, result.path);
					if (localPath) paths.push(localPath);
					summaries.push(issueRecordToToolSummary(record, localPath));
				}

				const removed = await removeClosedIssueFiles(ctx.cwd, runtime.config, openNumbers);
				counts.removed += removed.length;
				const removedPaths = removed.map((path) => relativeIssuePath(ctx.cwd, path) ?? path);
				const details: IssueMeToolDetails = {
					repository: runtime.repository,
					counts,
					paths,
					removedPaths,
					issues: summaries.slice(0, 50),
					truncated: summaries.length > 50,
				};
				const staleBefore = before.length - openNumbers.size;
				const text = [
					`Synced ${issues.length} open issue(s) for ${runtime.repository}.`,
					`Created: ${counts.created}, updated: ${counts.updated}, unchanged: ${counts.unchanged}, removed local files: ${counts.removed}.`,
					staleBefore > 0 ? `Local cache had ${before.length} file(s) before sync.` : undefined,
				].filter(Boolean).join("\n");
				return toolText(text, details);
			},
		}),
	);
}
