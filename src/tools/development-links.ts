import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { MAX_TOOL_DEVELOPMENT_LINKS } from "../constants.ts";
import { IssueMeError } from "../errors.ts";
import type { GitHubIssueDevelopmentLinksResult, NativeSubIssueSummary } from "../github/client.ts";
import type { IssueMeToolDetails, ToolIssueDevelopmentLinkSummary, ToolIssueSummary } from "../types.ts";
import { createIssueMeRuntime, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const DEFAULT_DEVELOPMENT_LINK_LIMIT = 25;
const DEVELOPMENT_LINK_LIMITATION = "GitHub development-link data comes from issue timeline events; standalone branches or private/cross-repository references may be absent unless GitHub exposes them to the token.";

const ListIssueDevelopmentLinksParams = Type.Object(
	{
		issueNumber: Type.Integer({ minimum: 1, description: "Issue number." }),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_DEVELOPMENT_LINKS, description: `Max timeline events. Default ${DEFAULT_DEVELOPMENT_LINK_LIMIT}; max ${MAX_TOOL_DEVELOPMENT_LINKS}.` })),
	},
	{ additionalProperties: false },
);

interface ListIssueDevelopmentLinksToolParams {
	issueNumber?: number;
	limit?: number;
}

interface NormalizedListIssueDevelopmentLinksParams {
	issueNumber: number;
	limit: number;
}

export function registerListIssueDevelopmentLinksTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(
		defineTool({
			name: "issueme_list_issue_development_links",
			label: "IssueMe List Issue Development Links",
			description: "Inspect linked PRs, branches, commits, and references.",
			promptSnippet: "Inspect linked PRs and references.",
			promptGuidelines: [
				"Use issueme_list_issue_development_links before implementation to avoid duplicate linked PR/commit work; read-only, bounded, no PR bodies.",
			],
			parameters: ListIssueDevelopmentLinksParams,
			async execute(_toolCallId, params, signal, _onUpdate, ctx) {
				const normalized = normalizeListIssueDevelopmentLinksParams(params as ListIssueDevelopmentLinksToolParams);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				const result = await runtime.client.listIssueDevelopmentLinks(normalized.issueNumber, { limit: normalized.limit }, signal);
				const details = buildDevelopmentLinksDetails(runtime.repository, result, normalized);
				return toolText(formatDevelopmentLinksText(runtime.repository, result, normalized), details);
			},
		}),
	);
}

function normalizeListIssueDevelopmentLinksParams(params: ListIssueDevelopmentLinksToolParams): NormalizedListIssueDevelopmentLinksParams {
	return {
		issueNumber: normalizePositiveInteger(params.issueNumber, "issueNumber"),
		limit: normalizeLimit(params.limit),
	};
}

function normalizePositiveInteger(value: number | undefined, field: string): number {
	if (Number.isSafeInteger(value) && value !== undefined && value > 0) return value;
	throw new IssueMeError("invalid_tool_input", `${field} must be a positive integer.`, { field });
}

function normalizeLimit(value: number | undefined): number {
	if (value === undefined) return DEFAULT_DEVELOPMENT_LINK_LIMIT;
	if (Number.isSafeInteger(value) && value >= 1 && value <= MAX_TOOL_DEVELOPMENT_LINKS) return value;
	throw new IssueMeError("invalid_tool_input", `limit must be an integer between 1 and ${MAX_TOOL_DEVELOPMENT_LINKS}.`, { field: "limit" });
}

function buildDevelopmentLinksDetails(
	repository: string,
	result: GitHubIssueDevelopmentLinksResult,
	params: NormalizedListIssueDevelopmentLinksParams,
): IssueMeToolDetails {
	const pullRequests = result.links.filter((link) => link.type === "pull_request").length;
	const commits = result.links.filter((link) => link.type === "commit").length;
	return {
		repository,
		status: "list_issue_development_links",
		issue: nativeIssueToToolSummary(repository, result.issue),
		developmentLinks: result.links,
		counts: {
			returned: result.links.length,
			pullRequests,
			commits,
			timelineEvents: result.timelineEventCount,
			limit: params.limit,
		},
		cacheUpdated: false,
		needsSync: false,
		truncated: result.truncated,
		message: DEVELOPMENT_LINK_LIMITATION,
		...(result.truncated ? { truncation: { developmentLinks: { shown: result.links.length, total: result.timelineEventCount, max: params.limit } } } : {}),
	};
}

function formatDevelopmentLinksText(
	repository: string,
	result: GitHubIssueDevelopmentLinksResult,
	params: NormalizedListIssueDevelopmentLinksParams,
): string {
	const lines = [
		`Development links for ${repository}#${result.issue.number}: ${result.links.length} linked item(s) returned.`,
		"This tool is read-only; it does not fetch pull-request bodies or write local IssueMe cache files.",
		result.links.length === 0 ? "No linked pull requests, commits, or development references were returned by GitHub for this issue." : undefined,
		...result.links.map(formatDevelopmentLinkLine),
		result.truncated ? `Development timeline inspection truncated at ${params.limit} event(s); rerun with a higher limit up to ${MAX_TOOL_DEVELOPMENT_LINKS} if needed.` : undefined,
		`Limitation: ${DEVELOPMENT_LINK_LIMITATION}`,
	].filter((line): line is string => line !== undefined);
	return lines.join("\n");
}

function formatDevelopmentLinkLine(link: ToolIssueDevelopmentLinkSummary): string {
	const references = link.referenceTypes.length ? link.referenceTypes.join(", ") : "reference";
	if (link.type === "pull_request") {
		const state = link.state ?? "unknown";
		const branch = link.branchName ? `; branch ${link.branchName}${link.baseBranchName ? ` -> ${link.baseBranchName}` : ""}` : "";
		const closing = link.willCloseTarget ? "; closes this issue" : link.closedBy ? "; closed this issue" : "";
		return `- PR #${link.number ?? "?"} [${state}] ${link.title ?? "Untitled pull request"}${branch}${closing}; ${references}; ${link.html_url ?? "no URL returned"}`;
	}
	if (link.type === "commit") {
		const oid = link.commitOid ? link.commitOid.slice(0, 12) : "unknown";
		const closing = link.closedBy ? "; closed this issue" : link.willCloseTarget ? "; closes this issue" : "";
		return `- Commit ${oid}${link.message ? ` ${link.message}` : ""}${closing}; ${references}; ${link.html_url ?? "no URL returned"}`;
	}
	return `- Development reference (${references}); ${link.html_url ?? link.title ?? "no URL returned"}`;
}

function nativeIssueToToolSummary(repository: string, issue: NativeSubIssueSummary): ToolIssueSummary {
	return {
		repository,
		number: issue.number,
		title: issue.title,
		state: issue.state,
		labels: [],
		assignees: [],
		html_url: issue.html_url,
	};
}
