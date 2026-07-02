import { GITHUB_API_BASE_URL, MAX_TOOL_DEVELOPMENT_LINKS } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { ToolIssueDevelopmentLinkSummary } from "../types.ts";
import type { GitHubIssueDevelopmentLinksResult } from "./client.ts";
import { connectionHasNextPage, extractConnectionNodes, isObject, normalizeConnectionTotalCount } from "./shared.ts";
import { normalizeNativeSubIssueSummary } from "./sub-issues-client.ts";

interface IssueDevelopmentLinksData {
	repository?: unknown;
}

export function buildIssueDevelopmentLinksQuery(): string {
	return `query IssueMeListIssueDevelopmentLinks($owner: String!, $repo: String!, $issueNumber: Int!, $first: Int!) {
		repository(owner: $owner, name: $repo) {
			issue(number: $issueNumber) {
				id
				number
				title
				state
				url
				author { login }
				timelineItems(first: $first, itemTypes: [CONNECTED_EVENT, CROSS_REFERENCED_EVENT, REFERENCED_EVENT, CLOSED_EVENT]) {
					totalCount
					nodes {
						__typename
						... on ConnectedEvent {
							createdAt
							subject {
								__typename
								...IssueMeDevelopmentPullRequest
							}
						}
						... on CrossReferencedEvent {
							createdAt
							willCloseTarget
							source {
								__typename
								...IssueMeDevelopmentPullRequest
							}
						}
						... on ReferencedEvent {
							createdAt
							commit { ...IssueMeDevelopmentCommit }
						}
						... on ClosedEvent {
							createdAt
							closer {
								__typename
								...IssueMeDevelopmentPullRequest
								...IssueMeDevelopmentCommit
							}
						}
					}
					pageInfo { hasNextPage }
				}
			}
		}
	}
	fragment IssueMeDevelopmentPullRequest on PullRequest {
		id
		number
		title
		state
		merged
		url
		headRefName
		baseRefName
		isDraft
	}
	fragment IssueMeDevelopmentCommit on Commit {
		oid
		messageHeadline
		url
	}`;
}

export function normalizeIssueDevelopmentLinkLimit(value: number | undefined): number {
	return normalizeBoundedInteger(value, "limit", { max: MAX_TOOL_DEVELOPMENT_LINKS, defaultValue: 25, message: `development link limit must be an integer between 1 and ${MAX_TOOL_DEVELOPMENT_LINKS}.` });
}

export function normalizeIssueDevelopmentLinksResult(
	data: IssueDevelopmentLinksData,
	repository: string,
	issueNumber: number,
	limit: number,
): GitHubIssueDevelopmentLinksResult {
	if (!isObject(data.repository)) {
		throw new GitHubApiError("GitHub GraphQL issue development-links query returned an inaccessible repository or unexpected response shape.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	const issueNode = data.repository.issue;
	if (!isObject(issueNode)) {
		throw new GitHubApiError(`GitHub GraphQL issue development-links query did not return issue #${issueNumber}.`, { code: ISSUEME_ERROR_CODES.GITHUB_API_ERROR, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	const issue = normalizeNativeSubIssueSummary(issueNode, repository);
	if (!issue) {
		throw new GitHubApiError("GitHub GraphQL issue development-links query returned incomplete issue data.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	const connection = issueNode.timelineItems;
	if (!isObject(connection)) {
		throw new GitHubApiError("GitHub GraphQL issue development-links query returned no timelineItems connection.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	const rawEvents = extractConnectionNodes(connection);
	const links = collectIssueDevelopmentLinks(rawEvents, repository);
	const timelineEventCount = normalizeConnectionTotalCount(connection) ?? rawEvents.length;
	return {
		issue,
		links,
		timelineEventCount,
		truncated: connectionHasNextPage(connection) || timelineEventCount > rawEvents.length || rawEvents.length >= limit && timelineEventCount > limit,
	};
}

function collectIssueDevelopmentLinks(events: unknown[], repository: string): ToolIssueDevelopmentLinkSummary[] {
	const links = new Map<string, ToolIssueDevelopmentLinkSummary>();
	for (const event of events) {
		const link = normalizeIssueDevelopmentEvent(event, repository);
		if (!link) continue;
		mergeIssueDevelopmentLink(links, link);
	}
	return [...links.values()];
}

function normalizeIssueDevelopmentEvent(event: unknown, repository: string): ToolIssueDevelopmentLinkSummary | undefined {
	if (!isObject(event)) return undefined;
	const typeName = typeof event.__typename === "string" ? event.__typename : "";
	if (typeName === "ConnectedEvent") return normalizeIssueDevelopmentSource(event.subject, "connected", { repository });
	if (typeName === "CrossReferencedEvent") {
		const willCloseTarget = event.willCloseTarget === true;
		return normalizeIssueDevelopmentSource(event.source, willCloseTarget ? "closing_reference" : "cross_reference", { repository, willCloseTarget });
	}
	if (typeName === "ReferencedEvent") return normalizeIssueDevelopmentSource(event.commit, "commit_reference", { repository });
	if (typeName === "ClosedEvent") return normalizeIssueDevelopmentSource(event.closer, "closed_by", { repository, closedBy: true });
	return undefined;
}

function normalizeIssueDevelopmentSource(
	value: unknown,
	referenceType: string,
	metadata: { repository: string; willCloseTarget?: boolean; closedBy?: boolean },
): ToolIssueDevelopmentLinkSummary | undefined {
	if (!isObject(value)) return undefined;
	const typeName = typeof value.__typename === "string" ? value.__typename : "";
	if (typeName === "PullRequest") return normalizeDevelopmentPullRequest(value, referenceType, metadata);
	if (typeName === "Commit" || value.oid !== undefined) return normalizeDevelopmentCommit(value, referenceType, metadata);
	return undefined;
}

function normalizeDevelopmentPullRequest(
	value: Record<string, unknown>,
	referenceType: string,
	metadata: { repository: string; willCloseTarget?: boolean; closedBy?: boolean },
): ToolIssueDevelopmentLinkSummary | undefined {
	const summary = normalizeDevelopmentPullRequestBase(value, referenceType, metadata.repository);
	if (!summary) return undefined;
	applyDevelopmentPullRequestFields(summary, value, metadata);
	return summary;
}

function normalizeDevelopmentPullRequestBase(
	value: Record<string, unknown>,
	referenceType: string,
	repository: string,
): ToolIssueDevelopmentLinkSummary | undefined {
	const number = normalizePositiveSafeInteger(value.number);
	const title = normalizeNonBlankText(value.title);
	if (number === undefined || title === undefined) return undefined;
	return {
		type: "pull_request",
		referenceTypes: [referenceType],
		number,
		title,
		html_url: normalizeNonBlankText(value.url) ?? `https://github.com/${repository}/pull/${number}`,
	};
}

function applyDevelopmentPullRequestFields(
	summary: ToolIssueDevelopmentLinkSummary,
	value: Record<string, unknown>,
	metadata: { willCloseTarget?: boolean; closedBy?: boolean },
): void {
	const state = normalizeGraphQLPullRequestState(value.state, value.merged);
	const branchName = normalizeNonBlankText(value.headRefName);
	const baseBranchName = normalizeNonBlankText(value.baseRefName);
	if (state) summary.state = state;
	if (branchName) summary.branchName = branchName;
	if (baseBranchName) summary.baseBranchName = baseBranchName;
	if (typeof value.isDraft === "boolean") summary.isDraft = value.isDraft;
	applyIssueDevelopmentMetadata(summary, metadata);
}

function applyIssueDevelopmentMetadata(
	summary: ToolIssueDevelopmentLinkSummary,
	metadata: { willCloseTarget?: boolean; closedBy?: boolean },
): void {
	if (typeof metadata.willCloseTarget === "boolean") summary.willCloseTarget = metadata.willCloseTarget;
	if (typeof metadata.closedBy === "boolean") summary.closedBy = metadata.closedBy;
}

function normalizePositiveSafeInteger(value: unknown): number | undefined {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function normalizeNonBlankText(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeDevelopmentCommit(
	value: Record<string, unknown>,
	referenceType: string,
	metadata: { willCloseTarget?: boolean; closedBy?: boolean },
): ToolIssueDevelopmentLinkSummary | undefined {
	const oid = typeof value.oid === "string" && value.oid.trim() ? value.oid.trim() : undefined;
	const url = typeof value.url === "string" && value.url.trim() ? value.url.trim() : undefined;
	if (!oid && !url) return undefined;
	const message = typeof value.messageHeadline === "string" && value.messageHeadline.trim() ? value.messageHeadline.trim() : undefined;
	const summary: ToolIssueDevelopmentLinkSummary = {
		type: "commit",
		referenceTypes: [referenceType],
	};
	if (url) summary.html_url = url;
	if (oid) summary.commitOid = oid;
	if (message) summary.message = message;
	applyIssueDevelopmentMetadata(summary, metadata);
	return summary;
}

function mergeIssueDevelopmentLink(links: Map<string, ToolIssueDevelopmentLinkSummary>, link: ToolIssueDevelopmentLinkSummary): void {
	const key = issueDevelopmentLinkKey(link);
	const current = links.get(key);
	if (!current) {
		links.set(key, link);
		return;
	}
	for (const referenceType of link.referenceTypes) {
		if (!current.referenceTypes.includes(referenceType)) current.referenceTypes.push(referenceType);
	}
	current.willCloseTarget = current.willCloseTarget === true || link.willCloseTarget === true ? true : current.willCloseTarget ?? link.willCloseTarget;
	current.closedBy = current.closedBy === true || link.closedBy === true ? true : current.closedBy ?? link.closedBy;
	current.state ??= link.state;
	current.title ??= link.title;
	current.html_url ??= link.html_url;
	current.branchName ??= link.branchName;
	current.baseBranchName ??= link.baseBranchName;
	current.commitOid ??= link.commitOid;
	current.message ??= link.message;
	current.isDraft ??= link.isDraft;
}

function issueDevelopmentLinkKey(link: ToolIssueDevelopmentLinkSummary): string {
	if (link.type === "pull_request" && link.html_url) return `pull_request:${link.html_url}`;
	if (link.type === "pull_request" && link.number !== undefined) return `pull_request:${link.number}`;
	if (link.type === "commit" && link.commitOid) return `commit:${link.commitOid}`;
	if (link.html_url) return `${link.type}:${link.html_url}`;
	return `${link.type}:${link.referenceTypes.join(",")}:${link.title ?? "unknown"}`;
}

function normalizeGraphQLPullRequestState(stateValue: unknown, mergedValue: unknown): "open" | "closed" | "merged" | undefined {
	if (stateValue === "MERGED" || stateValue === "merged" || mergedValue === true) return "merged";
	if (stateValue === "OPEN" || stateValue === "open") return "open";
	if (stateValue === "CLOSED" || stateValue === "closed") return "closed";
	return undefined;
}

function normalizeBoundedInteger(value: number | undefined, field: string, options: { max: number; defaultValue: number; message: string }): number {
	if (value === undefined) return options.defaultValue;
	if (!Number.isSafeInteger(value) || value <= 0 || value > options.max) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, options.message, { field, max: options.max });
	}
	return value;
}
