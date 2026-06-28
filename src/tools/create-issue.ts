import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { githubIssueToRecord } from "../issues/format.ts";
import { createIssueMeRuntime, normalizeIssueBody, partialSuccessToolError, requireNonEmptyTitle, sanitizeGitHubLoginList, sanitizeStringList, toolText, type IssueMeToolRegistrationOptions, writeAndSummarizeIssue } from "./runtime.ts";

const CreateIssueParams = Type.Object(
	{
		title: Type.String({ description: "Issue title. Non-empty." }),
		body: Type.String({ description: "Markdown body. Empty only if intentional." }),
		labels: Type.Optional(Type.Array(Type.String(), { description: "Labels. Omit for defaults; [] for none." })),
		assignees: Type.Optional(Type.Array(Type.String(), { description: "Usernames. Omit for defaults; [] for none." })),
	},
	{ additionalProperties: false },
);

export function registerCreateIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_create_issue",
			label: "IssueMe Create Issue",
			description: "Create repo issue and local cache file.",
			promptSnippet: "Create repo issue and cache file.",
			promptGuidelines: [
				"Use issueme_create_issue for explicit new issues; omit labels/assignees for defaults, pass [] for none, and never put secrets in bodies.",
			],
			executionMode: "sequential",
			parameters: CreateIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const title = requireNonEmptyTitle(params.title);
				const body = normalizeIssueBody(params.body, "create");
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const labels = params.labels === undefined ? sanitizeStringList(runtime.config.defaultLabels, "labels") : sanitizeStringList(params.labels, "labels");
				const assignees = params.assignees === undefined ? sanitizeGitHubLoginList(runtime.config.defaultAssignees, "assignees") : sanitizeGitHubLoginList(params.assignees, "assignees");
				const issue = await runtime.client.createIssue({ title, body, labels, assignees }, signal);
				const record = githubIssueToRecord(runtime.client.repository, issue, []);
				try {
					const { summary, path } = await writeAndSummarizeIssue(ctx, runtime, record);
					return toolText(`Created issue #${record.number}: ${record.title}\nURL: ${record.html_url}\nLocal file: ${path}`, {
						repository: runtime.repository,
						issue: summary,
						paths: path ? [path] : [],
						cacheUpdated: true,
					});
				} catch (error) {
					const safeError = partialSuccessToolError(error);
					return toolText(
						`Created issue #${record.number}: ${record.title}\nURL: ${record.html_url}\nLocal cache update failed; run issueme_sync_issues before retrying local work.`,
						{
							repository: runtime.repository,
							issue: { repository: runtime.repository, number: record.number, title: record.title, state: record.state, labels: record.labels, assignees: record.assignees, html_url: record.html_url },
							cacheUpdated: false,
							needsSync: true,
							status: "partial_success",
							message: safeError.message,
							error: safeError,
						},
					);
				}
			},
		}),
	);
}
