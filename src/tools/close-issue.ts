import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { removeIssueByNumber, relativeIssuePath } from "../issues/store.ts";
import { createIssueMeRuntime, toolText } from "./runtime.ts";

const CloseIssueParams = Type.Object(
	{
		number: Type.Integer({ minimum: 1, description: "Open issue number to close." }),
	},
	{ additionalProperties: false },
);

export function registerCloseIssueTool(pi: ExtensionAPI) {
	pi.registerTool(
		defineTool({
			name: "issueme_close_issue",
			label: "IssueMe Close Issue",
			description: "Close an open GitHub issue and remove its local IssueMe JSON file. This never deletes remote issues.",
			promptSnippet: "Close open GitHub issues and remove their local IssueMe cache files.",
			promptGuidelines: [
				"Use issueme_close_issue only when the user explicitly asks to close an issue; issueme_close_issue never deletes remote issues.",
			],
			parameters: CloseIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const runtime = await createIssueMeRuntime(ctx);
				const issue = await runtime.client.closeIssue(params.number, signal);
				const removed = await removeIssueByNumber(ctx.cwd, runtime.config, params.number);
				const removedPaths = removed.map((path) => relativeIssuePath(ctx.cwd, path) ?? path);
				const title = typeof issue.title === "string" ? issue.title : `#${params.number}`;
				return toolText(`Closed issue #${params.number}: ${title}\nRemoved local file(s): ${removedPaths.length || 0}`, {
					repository: runtime.repository,
					removedPaths,
					counts: { removed: removedPaths.length },
				});
			},
		}),
	);
}
