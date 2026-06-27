import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { createIssueMeRuntime, refreshIssueRecord, toolText, writeAndSummarizeIssue } from "./runtime.ts";

const CommentIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Open issue number to comment on." }),
		body: Type.String({ description: "Markdown comment body to add." }),
	},
	{ additionalProperties: false },
);

export function registerCommentIssueTool(pi: ExtensionAPI) {
	pi.registerTool(
		defineTool({
			name: "issueme_comment_issue",
			label: "IssueMe Comment Issue",
			description: "Add a comment to an open GitHub issue and refresh its local IssueMe JSON file.",
			promptSnippet: "Add progress notes or refinements as comments on open GitHub issues.",
			promptGuidelines: [
				"Use issueme_comment_issue for progress notes or refinements when the original issue body should not be rewritten.",
			],
			parameters: CommentIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const runtime = await createIssueMeRuntime(ctx);
				const comment = await runtime.client.addComment(params.number, params.body, signal);
				const record = await refreshIssueRecord(runtime, params.number, signal);
				const { summary, path } = await writeAndSummarizeIssue(ctx, runtime, record);
				const commentUrl = typeof comment.html_url === "string" ? comment.html_url : undefined;
				return toolText(
					`Added comment to issue #${params.number}.${commentUrl ? `\nComment: ${commentUrl}` : ""}`,
					{
						repository: runtime.repository,
						issue: summary,
						paths: path ? [path] : [],
					},
				);
			},
		}),
	);
}
