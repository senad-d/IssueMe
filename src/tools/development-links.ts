import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { MAX_TOOL_DEVELOPMENT_LINKS } from "../constants.ts";
import type { GitHubIssueDevelopmentLinksResult, NativeSubIssueSummary } from "../github/client.ts";
import type { IssueMeToolDetails, ToolIssueDevelopmentLinkSummary, ToolIssueSummary } from "../types.ts";
import { normalizeBoundedInteger, normalizePositiveSafeInteger } from "../utils/validation.ts";
import { assertExistingIssueCreatorAllowed, createIssueMeRuntime, issueCreatorScopeLabel, toolText, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const DEFAULT_DEVELOPMENT_LINK_LIMIT = 25;
const DEVELOPMENT_LINK_LIMITATION = "GitHub development-link data comes from issue timeline events; standalone branches or private/cross-repository references may be absent unless GitHub exposes them to the token.";

const ListIssueDevelopmentLinksParams = Type.Object(
	{
		issueNumber: Type.Integer({ minimum: 1, description: "Issue number." }),
		limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_TOOL_DEVELOPMENT_LINKS, description: `Max timeline events. Default ${DEFAULT_DEVELOPMENT_LINK_LIMIT}; max ${MAX_TOOL_DEVELOPMENT_LINKS}.` })),
	},
	{ additionalProperties: false },
);

type ListIssueDevelopmentLinksToolParams = Static<typeof ListIssueDevelopmentLinksParams>;

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
				const normalized = normalizeListIssueDevelopmentLinksParams(params);
				const runtime = await createIssueMeRuntime(ctx, options.runtime);
				await assertExistingIssueCreatorAllowed(runtime, normalized.issueNumber, "list_issue_development_links", signal, { requireOpen: false });
				const result = await runtime.client.listIssueDevelopmentLinks(normalized.issueNumber, { limit: normalized.limit }, signal);
				const creatorScope = issueCreatorScopeLabel(runtime.config);
				const details = buildDevelopmentLinksDetails(runtime.repository, result, normalized, creatorScope);
				return toolText(formatDevelopmentLinksText(runtime.repository, result, normalized, creatorScope), details);
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
	return normalizePositiveSafeInteger(value, field);
}

function normalizeLimit(value: number | undefined): number {
	return normalizeBoundedInteger(value, "limit", { max: MAX_TOOL_DEVELOPMENT_LINKS, defaultValue: DEFAULT_DEVELOPMENT_LINK_LIMIT });
}

function buildDevelopmentLinksDetails(
	repository: string,
	result: GitHubIssueDevelopmentLinksResult,
	params: NormalizedListIssueDevelopmentLinksParams,
	creatorScope: string,
): IssueMeToolDetails {
	const pullRequests = result.links.filter((link) => link.type === "pull_request").length;
	const commits = result.links.filter((link) => link.type === "commit").length;
	return {
		repository,
		creatorScope,
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
	creatorScope: string,
): string {
	const lines = [
		`Development links for ${repository}#${result.issue.number}: ${result.links.length} linked item(s) returned.`,
		`Creator scope: ${creatorScope}.`,
		"This tool is read-only; it does not fetch pull-request bodies or write local IssueMe cache files.",
		result.links.length === 0 ? "No linked pull requests, commits, or development references were returned by GitHub for this issue." : undefined,
		...result.links.map(formatDevelopmentLinkLine),
		result.truncated ? `Development timeline inspection truncated at ${params.limit} event(s); rerun with a higher limit up to ${MAX_TOOL_DEVELOPMENT_LINKS} if needed.` : undefined,
		`Limitation: ${DEVELOPMENT_LINK_LIMITATION}`,
	].filter(isDevelopmentLinkTextLine);
	return lines.join("\n");
}

function isDevelopmentLinkTextLine(line: string | undefined): line is string {
	return typeof line === "string";
}

function formatDevelopmentLinkLine(link: ToolIssueDevelopmentLinkSummary): string {
	const references = formatDevelopmentReferences(link);
	if (link.type === "pull_request") return formatPullRequestDevelopmentLinkLine(link, references);
	if (link.type === "commit") return formatCommitDevelopmentLinkLine(link, references);
	return formatGenericDevelopmentLinkLine(link, references);
}

function formatDevelopmentReferences(link: ToolIssueDevelopmentLinkSummary): string {
	if (link.referenceTypes.length) return link.referenceTypes.join(", ");
	return "reference";
}

function formatPullRequestDevelopmentLinkLine(link: ToolIssueDevelopmentLinkSummary, references: string): string {
	const state = link.state ?? "unknown";
	const branch = formatPullRequestBranchText(link);
	const closing = formatDevelopmentClosingText(link);
	const title = link.title ?? "Untitled pull request";
	const url = link.html_url ?? "no URL returned";
	return `- PR #${link.number ?? "?"} [${state}] ${title}${branch}${closing}; ${references}; ${url}`;
}

function formatPullRequestBranchText(link: ToolIssueDevelopmentLinkSummary): string {
	if (link.branchName) return `; branch ${link.branchName}${formatBaseBranchText(link.baseBranchName)}`;
	return "";
}

function formatBaseBranchText(baseBranchName: string | undefined): string {
	if (baseBranchName) return ` -> ${baseBranchName}`;
	return "";
}

function formatDevelopmentClosingText(link: ToolIssueDevelopmentLinkSummary): string {
	if (link.willCloseTarget) return "; closes this issue";
	if (link.closedBy) return "; closed this issue";
	return "";
}

function formatCommitDevelopmentLinkLine(link: ToolIssueDevelopmentLinkSummary, references: string): string {
	const oid = link.commitOid ? link.commitOid.slice(0, 12) : "unknown";
	const message = formatCommitMessageText(link.message);
	const closing = formatDevelopmentClosingText(link);
	const url = link.html_url ?? "no URL returned";
	return `- Commit ${oid}${message}${closing}; ${references}; ${url}`;
}

function formatCommitMessageText(message: string | undefined): string {
	if (message) return ` ${message}`;
	return "";
}

function formatGenericDevelopmentLinkLine(link: ToolIssueDevelopmentLinkSummary, references: string): string {
	return `- Development reference (${references}); ${link.html_url ?? link.title ?? "no URL returned"}`;
}

function nativeIssueToToolSummary(repository: string, issue: NativeSubIssueSummary): ToolIssueSummary {
	return {
		repository,
		number: issue.number,
		title: issue.title,
		state: issue.state,
		...(issue.creator ? { creator: issue.creator } : {}),
		labels: [],
		assignees: [],
		html_url: issue.html_url,
	};
}
