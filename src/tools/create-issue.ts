import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { githubIssueToRecord } from "../issues/format.ts";
import { createIssueMeRuntime, toolText, writeAndSummarizeIssue } from "./runtime.ts";

const CreateIssueParams = Type.Object(
	{
		title: Type.String({ description: "GitHub issue title." }),
		body: Type.String({ description: "Markdown issue body." }),
		labels: Type.Optional(Type.Array(Type.String(), { description: "Labels to apply to the new issue." })),
		assignees: Type.Optional(Type.Array(Type.String(), { description: "GitHub usernames to assign." })),
	},
	{ additionalProperties: false },
);

export function registerCreateIssueTool(pi: ExtensionAPI) {
	pi.registerTool(
		defineTool({
			name: "issueme_create_issue",
			label: "IssueMe Create Issue",
			description: "Create a GitHub issue in the current repository and cache it as a local IssueMe JSON file.",
			promptSnippet: "Create GitHub issues in the current repository and write local IssueMe issue JSON files.",
			promptGuidelines: [
				"Use issueme_create_issue when the user explicitly asks to create a GitHub issue; never include secrets in issue bodies.",
			],
			parameters: CreateIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const runtime = await createIssueMeRuntime(ctx);
				const issue = await runtime.client.createIssue(
					{
						title: params.title,
						body: params.body,
						labels: params.labels?.length ? params.labels : runtime.config.defaultLabels,
						assignees: params.assignees?.length ? params.assignees : runtime.config.defaultAssignees,
					},
					signal,
				);
				const record = githubIssueToRecord(runtime.client.repository, issue, []);
				const { summary, path } = await writeAndSummarizeIssue(ctx, runtime, record);
				return toolText(`Created issue #${record.number}: ${record.title}\nURL: ${record.html_url}\nLocal file: ${path}`, {
					repository: runtime.repository,
					issue: summary,
					paths: path ? [path] : [],
				});
			},
		}),
	);
}
