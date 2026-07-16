import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { MAX_TOOL_ASSIGNEES, MAX_TOOL_LABELS } from "../constants.ts";
import { isRemoteMutationSuccessKnown, markMutationSettlement } from "../errors.ts";
import { githubIssueToRecord } from "../issues/format.ts";
import type { GitHubIssueResponse } from "../types.ts";
import { assertAuthenticatedUserAllowedForCreate, createIssueMeRuntime, issueCreatorScopeLabel, normalizeIssueBody, partialSuccessToolText, remoteMutationPartialSuccessToolText, requireNonEmptyTitle, sanitizeGitHubLoginList, sanitizeStringList, toolText, type IssueMeToolRegistrationOptions, writeAndSummarizeIssue } from "./runtime.ts";

const CreateIssueParams = Type.Object(
	{
		title: Type.String({ description: "Issue title. Non-empty." }),
		body: Type.String({ description: "Markdown body. Empty only if intentional." }),
		labels: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_TOOL_LABELS, description: `Labels. Omit for defaults; [] for none. Max ${MAX_TOOL_LABELS}.` })),
		assignees: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_TOOL_ASSIGNEES, description: `Usernames. Omit for defaults; [] for none. Max ${MAX_TOOL_ASSIGNEES}.` })),
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
				const inputLabels = params.labels === undefined ? undefined : sanitizeStringList(params.labels, "labels");
				const inputAssignees = params.assignees === undefined ? undefined : sanitizeGitHubLoginList(params.assignees, "assignees");
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const labels = inputLabels ?? sanitizeStringList(runtime.config.defaultLabels, "labels");
				const assignees = inputAssignees ?? sanitizeGitHubLoginList(runtime.config.defaultAssignees, "assignees");
				await assertAuthenticatedUserAllowedForCreate(runtime, signal);
				let issue: GitHubIssueResponse;
				try {
					issue = await runtime.client.createIssue({ title, body, labels, assignees }, signal);
				} catch (error) {
					if (!isRemoteMutationSuccessKnown(error)) throw error;
					return remoteMutationPartialSuccessToolText(
						`GitHub accepted the request to create issue "${title}", but IssueMe could not verify the created issue response.`,
						error,
						{ repository: runtime.repository, creatorScope: issueCreatorScopeLabel(runtime.config), changedFields: ["title", "body", "labels", "assignees"] },
						"create_issue_response_partial_success",
					);
				}
				let record: ReturnType<typeof githubIssueToRecord>;
				try {
					record = githubIssueToRecord(runtime.client.repository, issue, []);
				} catch (error) {
					return remoteMutationPartialSuccessToolText(
						`GitHub accepted the request to create issue "${title}", but IssueMe could not verify the created issue details.`,
						markMutationSettlement(error, "remote_success_known"),
						{ repository: runtime.repository, creatorScope: issueCreatorScopeLabel(runtime.config), changedFields: ["title", "body", "labels", "assignees"] },
						"create_issue_response_partial_success",
					);
				}
				try {
					const { summary, path } = await writeAndSummarizeIssue(ctx, runtime, record, signal);
					return toolText(`Created issue #${record.number}: ${record.title}\nURL: ${record.html_url}\nLocal file: ${path}`, {
						repository: runtime.repository,
						creatorScope: issueCreatorScopeLabel(runtime.config),
						issue: summary,
						paths: path ? [path] : [],
						cacheUpdated: true,
					});
				} catch (error) {
					return partialSuccessToolText(
						`Created issue #${record.number}: ${record.title}\nURL: ${record.html_url}\nLocal cache update failed; run issueme_sync_issues before retrying local work.`,
						error,
						{
							repository: runtime.repository,
							creatorScope: issueCreatorScopeLabel(runtime.config),
							issue: { repository: runtime.repository, number: record.number, title: record.title, state: record.state, ...(record.creator ? { creator: record.creator } : {}), labels: record.labels, assignees: record.assignees, html_url: record.html_url },
						},
					);
				}
			},
		}),
	);
}
