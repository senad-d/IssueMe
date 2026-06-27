import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { loadIssueMeConfig } from "../config/config.ts";
import { formatIssueSummary, issueRecordToToolSummary } from "../issues/format.ts";
import { readIssueByLookup, readIssueByNumber, relativeIssuePath } from "../issues/store.ts";
import { resolveIssueFilePath } from "../utils/slug.ts";
import { createIssueMeRuntime, refreshIssueRecord, toolText, writeAndSummarizeIssue } from "./runtime.ts";

const GetIssueParams = Type.Object(
	{
		number: Type.Optional(Type.Integer({ minimum: 1, description: "Issue number to read." })),
		lookup: Type.Optional(Type.String({ description: "Issue number, local filename, title slug, or title fragment." })),
		refresh: Type.Optional(Type.Boolean({ description: "Refresh from GitHub before returning the issue. Defaults to false." })),
	},
	{ additionalProperties: false },
);

export function registerGetIssueTool(pi: ExtensionAPI) {
	pi.registerTool(
		defineTool({
			name: "issueme_get_issue",
			label: "IssueMe Get Issue",
			description: "Return one IssueMe issue from the local cache, optionally refreshing it from GitHub first.",
			promptSnippet: "Read one cached GitHub issue by number, filename, slug, or title fragment.",
			promptGuidelines: [
				"Use issueme_get_issue to inspect cached issue details; use refresh only when current GitHub state matters.",
			],
			parameters: GetIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				if (params.number === undefined && !params.lookup) {
					throw new Error("Provide number or lookup for issueme_get_issue.");
				}

				if (params.refresh) {
					if (params.number === undefined) throw new Error("Refreshing from GitHub requires an issue number.");
					const runtime = await createIssueMeRuntime(ctx);
					const record = await refreshIssueRecord(runtime, params.number, signal);
					const { path } = await writeAndSummarizeIssue(ctx, runtime, record);
					const formatted = formatIssueSummary(record);
					return toolText(`${formatted.text}\n\nLocal file: ${path ?? "removed (issue is closed)"}`, {
						repository: runtime.repository,
						issue: issueRecordToToolSummary(record, path),
						paths: path ? [path] : [],
						truncated: formatted.truncated,
					});
				}

				const config = await loadIssueMeConfig(ctx.cwd);
				const record = params.number !== undefined
					? await readIssueByNumber(ctx.cwd, config, params.number)
					: await readIssueByLookup(ctx.cwd, config, params.lookup ?? "");
				if (!record) throw new Error("Issue not found in local IssueMe cache. Run issueme_sync_issues or use refresh with a number.");

				const formatted = formatIssueSummary(record);
				const path = relativeIssuePath(ctx.cwd, resolveIssueFilePath(ctx.cwd, config.issueDirectory, record.number, record.title));
				return toolText(formatted.text, {
					repository: record.repository,
					issue: issueRecordToToolSummary(record, path),
					paths: path ? [path] : [],
					truncated: formatted.truncated,
				});
			},
		}),
	);
}
