import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_ASSIGNEES, MAX_TOOL_LABELS } from "../constants.ts";
import { isRemoteMutationSuccessKnown, markMutationSettlement, type IssueMeError } from "../errors.ts";
import type { IssueCreateInput } from "../github/client.ts";
import { issueTypeNameOf, issueTypeNotAppliedError, normalizeIssueTypeName } from "../github/issues-client.ts";
import { githubIssueToRecord } from "../issues/format.ts";
import type { GitHubIssueResponse } from "../types.ts";
import { assertAuthenticatedUserAllowedForCreate, createIssueMeRuntime, issueCreatorScopeLabel, normalizeIssueBody, partialSuccessToolText, remoteMutationPartialSuccessToolText, requireNonEmptyTitle, safeToolError, sanitizeGitHubLoginList, sanitizeStringList, toolText, type IssueMeToolRegistrationOptions, writeAndSummarizeIssue } from "./runtime.ts";

/** A dropped type is a partial success: the issue exists and is cached, but the requested classification was not persisted. */
export function issueTypeMismatch(requested: string | null, persisted: string | null | undefined): IssueMeError | undefined {
	if (persisted === requested) return undefined;
	return issueTypeNotAppliedError(requested, persisted);
}

const CreateIssueParams = Type.Object(
	{
		title: Type.String({ description: "Issue title. Non-empty." }),
		body: Type.String({ description: "Markdown body. Empty only if intentional." }),
		labels: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_TOOL_LABELS, description: `Labels. Omit for defaults; [] for none. Max ${MAX_TOOL_LABELS}.` })),
		assignees: Type.Optional(Type.Array(Type.String(), { maxItems: MAX_TOOL_ASSIGNEES, description: `Usernames. Omit for defaults; [] for none. Max ${MAX_TOOL_ASSIGNEES}.` })),
		type: Type.Optional(Type.String({ description: "Native issue type name from issueme_list_issue_types." })),
	},
	{ additionalProperties: false },
);

type CreateIssueToolParams = Static<typeof CreateIssueParams>;

function normalizeCreateIssueInput(params: CreateIssueToolParams): IssueCreateInput {
	return {
		title: requireNonEmptyTitle(params.title),
		body: normalizeIssueBody(params.body, "create"),
		labels: params.labels === undefined ? undefined : sanitizeStringList(params.labels, "labels"),
		assignees: params.assignees === undefined ? undefined : sanitizeGitHubLoginList(params.assignees, "assignees"),
		type: params.type === undefined ? undefined : normalizeIssueTypeName(params.type),
	};
}

export function registerCreateIssueTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_create_issue",
			label: "IssueMe Create Issue",
			description: "Create repo issue and local cache file.",
			promptSnippet: "Create repo issue and cache file.",
			promptGuidelines: [
				"Use issueme_create_issue for explicit new issues; omit labels/assignees for defaults, pass [] for none, never put secrets in bodies, and read issueme_list_issue_templates first when the repository has templates.",
			],
			executionMode: "sequential",
			parameters: CreateIssueParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const { title, body, labels: inputLabels, assignees: inputAssignees, type } = normalizeCreateIssueInput(params);
				const changedFields = type === undefined ? ["title", "body", "labels", "assignees"] : ["title", "body", "labels", "assignees", "type"];
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const labels = inputLabels ?? sanitizeStringList(runtime.config.defaultLabels, "labels");
				const assignees = inputAssignees ?? sanitizeGitHubLoginList(runtime.config.defaultAssignees, "assignees");
				await assertAuthenticatedUserAllowedForCreate(runtime, signal);
				let issue: GitHubIssueResponse;
				try {
					issue = await runtime.client.createIssue({ title, body, labels, assignees, ...(type === undefined ? {} : { type }) }, signal);
				} catch (error) {
					if (!isRemoteMutationSuccessKnown(error)) throw error;
					return remoteMutationPartialSuccessToolText(
						`GitHub accepted the request to create issue "${title}", but IssueMe could not verify the created issue response.`,
						error,
						{ repository: runtime.repository, creatorScope: issueCreatorScopeLabel(runtime.config), changedFields },
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
						{ repository: runtime.repository, creatorScope: issueCreatorScopeLabel(runtime.config), changedFields },
						"create_issue_response_partial_success",
					);
				}
				try {
					const { summary, path } = await writeAndSummarizeIssue(ctx, runtime, record, signal);
					const successText = `Created issue #${record.number}: ${record.title}\nURL: ${record.html_url}\nLocal file: ${path}`;
					const typeMismatch = type === undefined ? undefined : issueTypeMismatch(type, issueTypeNameOf(issue));
					if (typeMismatch) {
						return toolText(`${successText}\n${typeMismatch.message}`, {
							repository: runtime.repository,
							creatorScope: issueCreatorScopeLabel(runtime.config),
							issue: summary,
							changedFields,
							paths: path ? [path] : [],
							cacheUpdated: true,
							needsSync: false,
							result: "partial_success",
							status: "create_issue_type_not_applied",
							message: typeMismatch.message,
							error: safeToolError(typeMismatch),
						});
					}
					return toolText(successText, {
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
