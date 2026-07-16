import { GITHUB_API_BASE_URL, MAX_TOOL_ISSUES } from "../constants.ts";
import { ClosedIssueMutationError, GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { GitHubIssueResponse, ToolIssueSummary } from "../types.ts";
import { normalizeGraphQLIssueCreator, normalizeGraphQLIssueState } from "./graphql-normalizers.ts";
import type { NativeSubIssueMutationResult, NativeSubIssueRelationshipResult, NativeSubIssueSummary } from "./client.ts";
export type { NativeSubIssueReorderResult } from "./client.ts";
import { connectionHasNextPage, extractConnectionNodes, isObject, normalizeConnectionTotalCount } from "./shared.ts";

interface SubIssueMutationData {
	addSubIssue?: unknown;
	removeSubIssue?: unknown;
	reprioritizeSubIssue?: unknown;
}

interface SubIssueRelationshipData {
	repository?: unknown;
}

export function buildSubIssueRelationshipsQuery(): string {
	return `query IssueMeListSubIssues($owner: String!, $repo: String!, $issueNumber: Int!, $first: Int!) {
		repository(owner: $owner, name: $repo) {
			issue(number: $issueNumber) {
				id
				number
				title
				state
				url
				author { login }
				parent {
					id
					number
					title
					state
					url
					author { login }
				}
				subIssues(first: $first) {
					totalCount
					nodes {
						id
						number
						title
						state
						url
						author { login }
					}
					pageInfo { hasNextPage }
				}
			}
		}
	}`;
}

export function normalizeSubIssueRelationshipLimit(value: number | undefined): number {
	return normalizeBoundedInteger(value, "limit", { max: 100, defaultValue: 25, message: "sub-issue relationship limit must be an integer between 1 and 100." });
}

export function normalizeSubIssueReorderNumbers(values: number[] | undefined, parentNumber: number): number[] {
	if (!Array.isArray(values) || values.length === 0) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "orderedChildNumbers must list the parent issue's native sub-issue numbers in the desired order.", { field: "orderedChildNumbers" });
	}
	if (values.length > MAX_TOOL_ISSUES) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `orderedChildNumbers can include at most ${MAX_TOOL_ISSUES} sub-issues.`, { field: "orderedChildNumbers", max: MAX_TOOL_ISSUES });
	}
	const seen = new Set<number>();
	const normalized: number[] = [];
	for (const [index, value] of values.entries()) {
		if (!Number.isSafeInteger(value) || value <= 0) {
			throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "orderedChildNumbers must contain only positive integer issue numbers.", { field: "orderedChildNumbers", index });
		}
		if (value === parentNumber) {
			throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "orderedChildNumbers must not include the parent issue number.", { field: "orderedChildNumbers", parentNumber });
		}
		if (seen.has(value)) {
			throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "orderedChildNumbers must not contain duplicate issue numbers.", { field: "orderedChildNumbers", duplicate: value });
		}
		seen.add(value);
		normalized.push(value);
	}
	return normalized;
}

export function assertReorderableSubIssueList(
	repository: string,
	parentNumber: number,
	desiredNumbers: number[],
	relationship: NativeSubIssueRelationshipResult,
): void {
	if (relationship.issue.state !== "open") {
		throw new ClosedIssueMutationError(parentNumber, relationship.issue.state, nativeSubIssueToSafeSummary(repository, relationship.issue));
	}
	if (relationship.truncated || relationship.subIssues.length !== relationship.subIssuesCount) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			`Cannot safely reorder native sub-issues for #${parentNumber} because GitHub reported ${relationship.subIssuesCount} child issue(s), but IssueMe can verify at most ${MAX_TOOL_ISSUES} at once.`,
			{ parentNumber, subIssuesShown: relationship.subIssues.length, subIssuesTotal: relationship.subIssuesCount, max: MAX_TOOL_ISSUES },
		);
	}
	const currentNumbers = relationship.subIssues.map((issue) => issue.number);
	const currentSet = new Set(currentNumbers);
	const desiredSet = new Set(desiredNumbers);
	const missing = currentNumbers.filter((number) => !desiredSet.has(number));
	const extra = desiredNumbers.filter((number) => !currentSet.has(number));
	if (desiredNumbers.length !== currentNumbers.length || missing.length > 0 || extra.length > 0) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			`orderedChildNumbers must include every current native sub-issue of #${parentNumber} exactly once before IssueMe can reorder them.`,
			{ parentNumber, currentChildNumbers: currentNumbers, requestedChildNumbers: desiredNumbers, missingChildNumbers: missing, extraChildNumbers: extra },
		);
	}
	const closedChild = relationship.subIssues.find((issue) => issue.state !== "open");
	if (closedChild) {
		throw new ClosedIssueMutationError(closedChild.number, closedChild.state, nativeSubIssueToSafeSummary(repository, closedChild));
	}
}

export function moveNativeSubIssue(
	currentOrder: NativeSubIssueSummary[],
	childNumber: number,
	position: { beforeNumber?: number; afterNumber?: number },
): NativeSubIssueSummary[] {
	const moving = currentOrder.find((issue) => issue.number === childNumber);
	if (!moving) return currentOrder;
	const withoutMoving = currentOrder.filter((issue) => issue.number !== childNumber);
	if (position.beforeNumber !== undefined) {
		const index = withoutMoving.findIndex((issue) => issue.number === position.beforeNumber);
		if (index < 0) return currentOrder;
		return [...withoutMoving.slice(0, index), moving, ...withoutMoving.slice(index)];
	}
	if (position.afterNumber !== undefined) {
		const index = withoutMoving.findIndex((issue) => issue.number === position.afterNumber);
		if (index < 0) return currentOrder;
		return [...withoutMoving.slice(0, index + 1), moving, ...withoutMoving.slice(index + 1)];
	}
	return currentOrder;
}

export function nativeSubIssueToSafeSummary(repository: string, issue: NativeSubIssueSummary): ToolIssueSummary {
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

export function requireIssueNodeId(issue: GitHubIssueResponse, label: string): string {
	if (typeof issue.node_id === "string" && issue.node_id.trim()) return issue.node_id;
	throw new GitHubApiError(`GitHub ${label} response did not include node_id required for native sub-issue GraphQL mutations.`, {
		code: ISSUEME_ERROR_CODES.GITHUB_ISSUE_SHAPE_INVALID,
		recoveryHint: "Retry after refreshing the issue from GitHub; if node_id is still absent, update IssueMe or verify GitHub issue API compatibility.",
	});
}

export function normalizeSubIssueMutationResult(data: SubIssueMutationData, field: "addSubIssue" | "removeSubIssue", repository: string): NativeSubIssueMutationResult {
	const payload = data[field];
	if (!isObject(payload)) {
		throw new GitHubApiError(`GitHub GraphQL ${field} mutation returned an unexpected response shape.`, { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql`, mutationSettlement: "remote_success_known" });
	}
	const parent = normalizeNativeSubIssueSummary(payload.issue, repository);
	const child = normalizeNativeSubIssueSummary(payload.subIssue, repository);
	if (!parent || !child) {
		throw new GitHubApiError(`GitHub GraphQL ${field} mutation returned incomplete issue data.`, { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql`, mutationSettlement: "remote_success_known" });
	}
	return { parent, child };
}

export function normalizeReprioritizeSubIssueResult(data: SubIssueMutationData, repository: string, child: NativeSubIssueSummary): NativeSubIssueMutationResult {
	const payload = data.reprioritizeSubIssue;
	if (!isObject(payload)) {
		throw new GitHubApiError("GitHub GraphQL reprioritizeSubIssue mutation returned an unexpected response shape.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql`, mutationSettlement: "remote_success_known" });
	}
	const parent = normalizeNativeSubIssueSummary(payload.issue, repository);
	if (!parent) {
		throw new GitHubApiError("GitHub GraphQL reprioritizeSubIssue mutation returned incomplete parent issue data.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql`, mutationSettlement: "remote_success_known" });
	}
	return { parent, child };
}

export function normalizeNativeSubIssueRelationshipResult(
	data: SubIssueRelationshipData,
	repository: string,
	issueNumber: number,
	limit: number,
): NativeSubIssueRelationshipResult {
	if (!isObject(data.repository)) {
		throw new GitHubApiError("GitHub GraphQL native sub-issue query returned an inaccessible repository or unexpected response shape.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	const issueNode = data.repository.issue;
	if (!isObject(issueNode)) {
		throw new GitHubApiError(`GitHub GraphQL native sub-issue query did not return issue #${issueNumber}.`, { code: ISSUEME_ERROR_CODES.GITHUB_API_ERROR, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	const issue = normalizeNativeSubIssueSummary(issueNode, repository);
	if (!issue) {
		throw new GitHubApiError("GitHub GraphQL native sub-issue query returned incomplete issue data.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	const rawParent = issueNode.parentIssue ?? issueNode.parent;
	let parentIssue: NativeSubIssueSummary | null = null;
	if (rawParent !== null && rawParent !== undefined) {
		const normalizedParent = normalizeNativeSubIssueSummary(rawParent, repository);
		if (!normalizedParent) {
			throw new GitHubApiError("GitHub GraphQL native sub-issue query returned incomplete parent issue data.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
		}
		parentIssue = normalizedParent;
	}
	const connection = issueNode.subIssues ?? issueNode.sub_issues;
	const rawSubIssues = extractConnectionNodes(connection);
	const subIssues = rawSubIssues.map((node) => normalizeNativeSubIssueSummary(node, repository)).filter((node): node is NativeSubIssueSummary => node !== undefined);
	if (rawSubIssues.length !== subIssues.length) {
		throw new GitHubApiError("GitHub GraphQL native sub-issue query returned incomplete child issue data.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	const subIssuesCount = normalizeConnectionTotalCount(connection) ?? subIssues.length;
	return {
		issue,
		parentIssue,
		subIssues,
		subIssuesCount,
		truncated: connectionHasNextPage(connection) || subIssuesCount > subIssues.length || subIssues.length >= limit && subIssuesCount > limit,
	};
}

export function normalizeNativeSubIssueSummary(value: unknown, repository: string): NativeSubIssueSummary | undefined {
	if (!isObject(value)) return undefined;
	const id = value.id;
	const number = value.number;
	const title = value.title;
	const state = normalizeGraphQLIssueState(value.state);
	const creator = normalizeGraphQLIssueCreator(value.author ?? value.user);
	const url = value.url ?? value.html_url;
	if (typeof id !== "string" || !id.trim()) return undefined;
	if (typeof number !== "number" || !Number.isSafeInteger(number) || number <= 0) return undefined;
	if (typeof title !== "string" || !title.trim()) return undefined;
	if (!state) return undefined;
	return {
		id,
		number,
		title,
		state,
		...(creator ? { creator } : {}),
		html_url: typeof url === "string" && url.trim() ? url : `https://github.com/${repository}/issues/${number}`,
	};
}

function normalizeBoundedInteger(value: number | undefined, field: string, options: { max: number; defaultValue: number; message: string }): number {
	if (value === undefined) return options.defaultValue;
	if (!Number.isSafeInteger(value) || value <= 0 || value > options.max) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, options.message, { field, max: options.max });
	}
	return value;
}
