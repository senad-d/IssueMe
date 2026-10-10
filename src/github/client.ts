import { GITHUB_API_BASE_URL, MAX_TOOL_ASSIGNEES, MAX_TOOL_ISSUES, MAX_TOOL_ISSUE_TEMPLATES, MAX_TOOL_LABELS, MAX_TOOL_PROJECT_ITEMS } from "../constants.ts";
import { ClosedIssueMutationError, GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError, markMutationSettlement } from "../errors.ts";
import type { GitHubCommentResponse, GitHubIssueResponse, GitHubIssueTypeResponse, GitHubLabelListResponse, GitHubLabelResponse, GitHubMilestoneResponse, GitHubRepository, GitHubUserResponse, IssueDependencyDirection, ProjectV2OwnerType, ToolProjectFieldSummary, ToolProjectItemSummary, ToolProjectSummary, ToolIssueTemplateConfigSummary, ToolIssueTemplateSummary } from "../types.ts";
import { isValidGitHubLogin } from "../utils/github-login.ts";
import { mapSequentially } from "../utils/sequential.ts";
import { assertCollectionItemLimit, normalizeOptionalIsoDateOrTimestamp } from "../utils/validation.ts";
import { buildContinuation, consumeConnectionNodes, decodeContinuationToken, graphqlConnectionNextPosition, graphqlContinuationStart, graphqlNextPosition, restContinuationStart, restNextPosition, type ContinuationBinding, type GitHubContinuation, type GraphQLContinuationPosition } from "./continuation.ts";
import { buildDeleteIssueMutation, normalizeDeleteIssueMutationResult, requireDeletableIssueNodeId } from "./delete-issue-client.ts";
import { buildIssueDevelopmentLinksQuery, isInaccessibleCloserError, normalizeIssueDevelopmentLinkLimit, normalizeIssueDevelopmentLinksResult } from "./development-links-client.ts";
import { RELATED_ISSUE_PREFLIGHT_PAGE_CAP, assertDistinctRelatedNumbers, isRelatedIssueMember, isRelatedIssueRemovalNotFound, mapRelatedIssueMutationError, mapRelatedIssueReadError, relatedIssueRemovalPath, relatedIssuesPath } from "./related-issues-client.ts";
import { assertGitHubTimelineEventResponse, normalizeTimelineEventTypes, timelineEventMatches, timelineEventPath, type GitHubTimelineEventResponse } from "./issue-timeline-client.ts";
import { assertGitHubContentsDirectoryResponse, assertGitHubContentsFileResponse, classifyTemplateFilename, decodeContentsFile, ISSUE_TEMPLATE_DIRECTORY, isTemplateFileTooLarge, LEGACY_ISSUE_TEMPLATE_PATHS, normalizeTemplateFilename, parseTemplateConfig, summarizeIssueTemplate, type GitHubContentsEntry, type GitHubContentsFile } from "./issue-templates-client.ts";
import { ISSUE_DEPENDENCY_PREFLIGHT_PAGE_CAP, assertDependencyTargetIsIssue, assertDistinctDependencyNumbers, assertIssueDependencyMember, isIssueDependencyMember, isIssueDependencyRemovalNotFound, issueDependencyPath, issueDependencyRemovalPath, mapIssueDependencyMutationError, mapIssueDependencyReadError, normalizeIssueDependencyDirection, requireIssueDatabaseId } from "./issue-dependencies-client.ts";
import { mapGitHubGraphQLError } from "./graphql-errors.ts";
import { assertGitHubAssigneeDiscoveryResponse, assertGitHubCommentDiscoveryResponse, assertGitHubIssueTypeDiscoveryResponse, assertGitHubLabelDiscoveryResponse, assertGitHubMilestoneDiscoveryResponse, assigneeMatchesFilters, buildAssigneeListQuery, buildIssueListQuery, buildIssueSearchRequestQuery, buildLabelListQuery, buildMilestoneListQuery, commentBelongsToIssue, isIssueSearchResponse, isPullRequestIssueResponse, issueResponseToSafeSummary, labelMatchesFilters, normalizeIssueSearchResponse, normalizeIssueUpdateInput, normalizeOptionalTextFilter, normalizePaginationLimit, normalizePositiveCommentId, normalizePositiveIssueNumber, normalizePositiveMilestoneNumber } from "./issues-client.ts";
import { PROJECTS_V2_LIST_PAGE_CAP, assertProjectV2AllowedForAdd, assertProjectV2FieldClearable, assertProjectV2ItemBelongsToProject, assertProjectV2ItemLookupSelector, assertProjectV2ItemTargetsIssue, buildAddIssueToProjectV2Mutation, isProjectV2NodeNotFoundError, PROJECT_V2_ITEM_ISSUE_STATE_POLICY, type ProjectV2ItemIssueStatePolicy, assertProjectV2AnchorItem, buildMoveProjectV2ItemMutation, normalizeMoveProjectV2ItemResult, buildArchiveProjectV2ItemMutation, buildClearProjectV2ItemFieldValueMutation, buildDeleteProjectV2ItemMutation, buildProjectV2AddValidationQuery, buildProjectV2FieldValidationQuery, buildProjectV2FieldsByIdQuery, buildProjectV2FieldsByNumberQuery, buildProjectV2ItemByIdQuery, buildProjectV2ItemByIssueQuery, buildProjectV2ItemFieldValueValidationQuery, buildProjectV2ItemValidationQuery, buildProjectV2ItemsByIdQuery, buildProjectV2ItemsByNumberQuery, buildProjectsV2ListQuery, buildUpdateProjectV2ItemFieldValueMutation, extractProjectV2Connection, extractProjectV2FieldProject, normalizeArchiveProjectV2ItemResult, normalizeClearProjectV2ItemFieldValueResult, normalizeDeleteProjectV2ItemResult, normalizeProjectV2AddValidationPolicy, normalizeProjectV2FieldLimit, normalizeProjectV2FieldSummary, normalizeProjectV2FieldValueInput, normalizeProjectV2Id, normalizeProjectV2IdRequired, normalizeProjectV2ItemArchiveAction, normalizeProjectV2ItemLimit, normalizeProjectV2ItemValueLimit, normalizeProjectV2IterationLimit, normalizeProjectV2ItemMutationResult, normalizeProjectV2ListLimit, normalizeProjectV2OptionLimit, normalizeProjectV2Owner, normalizeProjectV2ProjectNumber, normalizeProjectV2Query, normalizeProjectV2Scope, normalizeProjectV2Summary, projectV2ArchiveOperationName, projectV2ItemArchivedState, projectV2ItemHasNamedFieldValue, requireProjectV2ItemDetail, requireProjectV2Summary, type ProjectV2FieldIdentity, type ProjectV2ItemArchiveAction, type ProjectV2ItemDetail } from "./projects-client.ts";
import { compactObject, connectionEndCursor, connectionHasNextPage, extractConnectionNodes, isObject, normalizeConnectionTotalCount } from "./shared.ts";
import { assertReorderableSubIssueList, buildSubIssueRelationshipsQuery, moveNativeSubIssue, normalizeNativeSubIssueRelationshipResult, normalizeReprioritizeSubIssueResult, normalizeSubIssueMutationResult, normalizeSubIssueRelationshipLimit, normalizeSubIssueReorderNumbers, requireIssueNodeId } from "./sub-issues-client.ts";
import { GitHubTransport, normalizeMaxPages, parseNextLink } from "./transport.ts";
import type { GitHubClientOptions, PaginatedCollection, PaginationOptions, PaginationPage } from "./transport.ts";

export type { FetchLike, GitHubClientOptions, PaginationOptions } from "./transport.ts";
export type { GitHubContinuation } from "./continuation.ts";

/** Read options for continuation-aware readers: `after` is an opaque token from a previous result. */
export interface GitHubContinuationReadOptions extends PaginationOptions {
	after?: string;
}

export interface IssueCreateInput {
	title: string;
	body?: string;
	labels?: string[];
	assignees?: string[];
	/** Native issue type name; GitHub silently drops it without push access, so callers verify the response. */
	type?: string;
}

export type GitHubRepositoryOwnerType = "Organization" | "User";

export interface GitHubRepositoryIssueTypesResult {
	ownerType: GitHubRepositoryOwnerType;
	issueTypes: GitHubIssueTypeResponse[];
}

export interface GitHubIssueTemplateFile {
	template: ToolIssueTemplateSummary;
	/** Decoded file text; undefined when the file was not read (too large or unsupported format). */
	text?: string;
}

export interface GitHubIssueTemplatesResult {
	source: "directory" | "legacy_file" | "none";
	sourcePath?: string;
	templates: GitHubIssueTemplateFile[];
	config?: ToolIssueTemplateConfigSummary;
	/** True when the directory held more template files than the read limit. */
	truncated: boolean;
}

export interface GitHubIssueCollectionPreflight {
	readonly labels: ReadonlySet<string>;
	readonly assignees: ReadonlySet<string>;
}

interface MutableGitHubIssueCollectionPreflight {
	labels: Set<string>;
	assignees: Set<string>;
}

export type GitHubIssueCloseReason = "completed" | "not_planned";

export interface IssueUpdateInput {
	title?: string;
	body?: string;
	labels?: string[];
	assignees?: string[];
	milestone?: number | null;
	state?: "open" | "closed";
	state_reason?: GitHubIssueCloseReason | "reopened" | null;
	/** Native issue type name, or null to clear; verified from the response because GitHub may ignore it. */
	type?: string | null;
}

export interface IssueCloseInput {
	reason?: GitHubIssueCloseReason;
}

export type GitHubIssueListState = "open" | "closed" | "all";
export type GitHubIssueListSort = "created" | "updated" | "comments";
export type GitHubIssueListDirection = "asc" | "desc";

export interface GitHubIssueListFilters extends GitHubContinuationReadOptions {
	state?: GitHubIssueListState;
	labels?: string[];
	assignee?: string;
	creator?: string;
	mentioned?: string;
	milestone?: string;
	since?: string;
	sort?: GitHubIssueListSort;
	direction?: GitHubIssueListDirection;
	/** Issue type name; list mode also accepts `*` (any type) and `none` (untyped). */
	type?: string;
}

export interface GitHubIssueSearchFilters extends GitHubIssueListFilters {
	query: string;
}

export interface GitHubIssueListResult {
	mode: "list" | "search";
	issues: GitHubIssueResponse[];
	truncated: boolean;
	totalCount?: number;
	incompleteResults?: boolean;
	continuation?: GitHubContinuation;
}

export interface GitHubRepositoryLabelListFilters extends GitHubContinuationReadOptions {
	name?: string;
	query?: string;
}

export interface GitHubRepositoryLabelListResult {
	labels: GitHubLabelResponse[];
	truncated: boolean;
	continuation?: GitHubContinuation;
}

export type GitHubMilestoneListState = "open" | "closed" | "all";
export type GitHubMilestoneListSort = "due_on" | "completeness";
export type GitHubMilestoneListDirection = "asc" | "desc";

export interface GitHubRepositoryMilestoneListFilters extends GitHubContinuationReadOptions {
	state?: GitHubMilestoneListState;
	sort?: GitHubMilestoneListSort;
	direction?: GitHubMilestoneListDirection;
}

export interface GitHubRepositoryMilestoneListResult {
	milestones: GitHubMilestoneResponse[];
	truncated: boolean;
	continuation?: GitHubContinuation;
}

export interface GitHubRepositoryAssigneeListFilters extends GitHubContinuationReadOptions {
	login?: string;
	query?: string;
}

export type GitHubProjectV2Scope = ProjectV2OwnerType;

export interface GitHubProjectV2ListFilters extends GitHubContinuationReadOptions {
	scope?: GitHubProjectV2Scope;
	owner?: string;
	query?: string;
	includeClosed?: boolean;
}

export interface GitHubProjectV2ListResult {
	scope: GitHubProjectV2Scope;
	owner: string;
	projects: ToolProjectSummary[];
	truncated: boolean;
	continuation?: GitHubContinuation;
}

export interface GitHubProjectV2FieldListFilters {
	projectId?: string;
	scope?: GitHubProjectV2Scope;
	owner?: string;
	projectNumber?: number;
	fieldLimit?: number;
	optionLimit?: number;
	iterationLimit?: number;
	after?: string;
}

export interface GitHubProjectV2FieldListResult {
	project: ToolProjectSummary;
	fields: ToolProjectFieldSummary[];
	truncated: boolean;
	continuation?: GitHubContinuation;
}

export type { ProjectV2ItemDetail } from "./projects-client.ts";

export interface GitHubProjectV2ItemListFilters {
	projectId?: string;
	scope?: GitHubProjectV2Scope;
	owner?: string;
	projectNumber?: number;
	limit?: number;
	valueLimit?: number;
	after?: string;
}

export interface GitHubProjectV2ItemListResult {
	project: ToolProjectSummary;
	items: ProjectV2ItemDetail[];
	totalCount?: number;
	truncated: boolean;
	continuation?: GitHubContinuation;
}

export interface GitHubProjectV2ItemLookupInput {
	projectId: string;
	itemId?: string;
	issueNumber?: number;
	valueLimit?: number;
	/** Field-value continuation token from an earlier read of the same item. */
	after?: string;
}

export interface GitHubProjectV2ItemLookupResult {
	item?: ProjectV2ItemDetail;
	/** Items inspected on the issue when looking up by issue number; absent for item-ID lookups. */
	searchedItems?: number;
	/** True when the issue has more project items than the bounded lookup inspected. */
	searchTruncated?: boolean;
	continuation?: GitHubContinuation;
}

export interface GitHubProjectV2AddIssueInput {
	projectId: string;
	issueNumber: number;
	scope?: GitHubProjectV2Scope;
	owner?: string;
}

export type GitHubProjectV2FieldValueType = "single_select" | "iteration" | "date" | "text" | "number";

export interface GitHubProjectV2FieldValueInput {
	singleSelectOptionId?: string;
	iterationId?: string;
	date?: string;
	text?: string;
	number?: number;
}

export interface GitHubProjectV2UpdateItemFieldInput {
	projectId: string;
	itemId: string;
	fieldId: string;
	issueNumber: number;
	value: GitHubProjectV2FieldValueInput;
}

export interface GitHubProjectV2ItemMutationResult {
	item: ToolProjectItemSummary;
}

export interface GitHubProjectV2ItemTarget {
	projectId: string;
	itemId: string;
	issueNumber: number;
}

export interface GitHubProjectV2ItemRemovalResult {
	status: "removed" | "already_absent";
	itemId: string;
	issue: GitHubIssueResponse;
	deletedItemId?: string;
}

export interface GitHubProjectV2ItemFieldClearInput extends GitHubProjectV2ItemTarget {
	fieldId: string;
}

export interface GitHubProjectV2ItemFieldClearResult {
	status: "cleared" | "already_clear";
	itemId: string;
	issue: GitHubIssueResponse;
	field: ProjectV2FieldIdentity;
}

export interface GitHubProjectV2ItemArchiveInput extends GitHubProjectV2ItemTarget {
	action: ProjectV2ItemArchiveAction;
}

export interface GitHubProjectV2ItemArchiveResult {
	status: "archived" | "unarchived" | "already_archived" | "already_active";
	itemId: string;
	issue: GitHubIssueResponse;
	isArchived: boolean;
}

export interface GitHubProjectV2ItemMoveInput extends GitHubProjectV2ItemTarget {
	/** Anchor item on the same board; omitted means move to the top. */
	afterItemId?: string;
}

export interface GitHubProjectV2ItemMoveResult {
	status: "moved";
	itemId: string;
	issue: GitHubIssueResponse;
	afterItemId?: string;
	/** Zero-based position inside the order GitHub returned. */
	position: number;
	/** Size of the returned order window the position was verified against. */
	inspected: number;
}

export interface GitHubRepositoryAssigneeListResult {
	assignees: GitHubUserResponse[];
	truncated: boolean;
	continuation?: GitHubContinuation;
}

export interface GitHubRepositoryMilestoneCreateInput {
	title: string;
	state?: "open" | "closed";
	description?: string;
	due_on?: string;
}

export interface GitHubRepositoryMilestoneUpdateInput {
	title?: string;
	state?: "open" | "closed";
	description?: string;
	due_on?: string | null;
}

export interface GitHubRepositoryLabelCreateInput {
	name: string;
	color: string;
	description?: string;
}

export interface GitHubRepositoryLabelUpdateInput {
	new_name?: string;
	color?: string;
	description?: string;
}

export interface NativeSubIssueSummary {
	id: string;
	number: number;
	title: string;
	state: "open" | "closed";
	creator?: string;
	html_url: string;
}

export interface NativeSubIssueMutationResult {
	parent: NativeSubIssueSummary;
	child: NativeSubIssueSummary;
}

export interface NativeSubIssueRelationshipResult {
	issue: NativeSubIssueSummary;
	parentIssue: NativeSubIssueSummary | null;
	subIssues: NativeSubIssueSummary[];
	subIssuesCount: number;
	truncated: boolean;
	continuation?: GitHubContinuation;
}

export interface NativeSubIssueReorderResult {
	relationship: NativeSubIssueRelationshipResult;
	mutations: NativeSubIssueMutationResult[];
}

interface ReprioritizeSubIssueStepResult {
	currentOrder: NativeSubIssueSummary[];
	mutation?: NativeSubIssueMutationResult;
}

type IssueSearchPageReadResult = PaginationPage<GitHubIssueResponse>;

export interface GitHubIssueDevelopmentLinksResult {
	issue: NativeSubIssueSummary;
	links: import("../types.ts").ToolIssueDevelopmentLinkSummary[];
	timelineEventCount: number;
	truncated: boolean;
	continuation?: GitHubContinuation;
}

export interface GitHubIssueCommentListFilters extends GitHubContinuationReadOptions {
	/** ISO 8601 timestamp; GitHub returns comments updated at or after it. */
	since?: string;
}

export interface GitHubIssueCommentListResult {
	comments: GitHubCommentResponse[];
	truncated: boolean;
	continuation?: GitHubContinuation;
}

export interface GitHubIssueCommentLookupResult {
	issue: GitHubIssueResponse;
	comment: GitHubCommentResponse;
}

export interface GitHubIssueTimelineFilters extends GitHubContinuationReadOptions {
	/** Lowercase GitHub event names to keep; omitted returns every event kind. */
	eventTypes?: string[];
}

export interface GitHubIssueTimelineResult {
	events: GitHubTimelineEventResponse[];
	truncated: boolean;
	continuation?: GitHubContinuation;
}

export interface GitHubRelatedIssueListResult {
	issues: GitHubIssueResponse[];
	truncated: boolean;
	continuation?: GitHubContinuation;
}

export type GitHubRelatedIssueMutationStatus = "added" | "already_present" | "removed" | "already_absent";

export interface GitHubRelatedIssueMutationResult {
	status: GitHubRelatedIssueMutationStatus;
	issue: GitHubIssueResponse;
	relatedIssue: GitHubIssueResponse;
	relatedIssueId: number;
	inferred?: boolean;
}

export interface GitHubIssueDependencyListResult {
	direction: IssueDependencyDirection;
	issues: GitHubIssueResponse[];
	truncated: boolean;
	continuation?: GitHubContinuation;
}

export interface GitHubIssueDependencyLookup {
	issue?: GitHubIssueResponse;
	/** False when the bounded preflight scan ended before the whole collection was inspected. */
	complete: boolean;
}

export type GitHubIssueDependencyMutationStatus = "added" | "already_present" | "removed" | "already_absent";

export interface GitHubIssueDependencyMutationResult {
	status: GitHubIssueDependencyMutationStatus;
	/** The dependent (blocked) issue. */
	issue: GitHubIssueResponse;
	blockingIssue: GitHubIssueResponse;
	blockingIssueId: number;
	/** True when the outcome was inferred from GitHub's not-found answer rather than a verified preflight. */
	inferred?: boolean;
}

export class GitHubClient {
	readonly repository: GitHubRepository;
	private readonly transport: GitHubTransport;
	private readonly issueCollectionPreflights = new WeakSet<GitHubIssueCollectionPreflight>();

	constructor(options: GitHubClientOptions) {
		this.repository = options.repository;
		this.transport = new GitHubTransport(options);
	}

	createIssueCollectionPreflight(): GitHubIssueCollectionPreflight {
		const preflight: MutableGitHubIssueCollectionPreflight = { labels: new Set(), assignees: new Set() };
		this.issueCollectionPreflights.add(preflight);
		return preflight;
	}

	async listOpenIssues(signal?: AbortSignal): Promise<GitHubIssueResponse[]> {
		return (await this.listIssues({ state: "open" }, signal)).issues;
	}

	async listIssues(filters: GitHubIssueListFilters = {}, signal?: AbortSignal): Promise<GitHubIssueListResult> {
		const limit = normalizePaginationLimit(filters.limit);
		const query = buildIssueListQuery(filters, limit);
		const binding = this.continuationBinding("issues", withoutPageSize(query));
		const start = decodeContinuationToken(filters.after, binding, "rest");
		const result = await this.paginateFiltered<GitHubIssueResponse>(this.repoPath("/issues"), query, signal, {
			limit,
			maxPages: filters.maxPages,
			start: restContinuationStart(start),
			filter: (issue) => !isPullRequestIssueResponse(issue),
		});
		return { mode: "list", issues: result.items, truncated: result.truncated, continuation: restContinuation(binding, result, start !== undefined) };
	}

	async searchIssues(filters: GitHubIssueSearchFilters, signal?: AbortSignal): Promise<GitHubIssueListResult> {
		const limit = normalizePaginationLimit(filters.limit);
		const query = buildIssueSearchRequestQuery(this.repository.fullName, filters, limit);
		const binding = this.continuationBinding("issue_search", withoutPageSize(query));
		const start = decodeContinuationToken(filters.after, binding, "rest");
		const result = await this.paginateSearchIssues(query, signal, { limit, maxPages: filters.maxPages, start: restContinuationStart(start) });
		const searchResult: GitHubIssueListResult = {
			mode: "search",
			issues: result.items,
			truncated: result.truncated,
			continuation: buildContinuation(binding, restNextPosition(result.next), result.pagesRead, start !== undefined, !result.truncated),
		};
		if (typeof result.totalCount === "number") searchResult.totalCount = result.totalCount;
		if (typeof result.incompleteResults === "boolean") searchResult.incompleteResults = result.incompleteResults;
		return searchResult;
	}

	async listLabels(filters: GitHubRepositoryLabelListFilters = {}, signal?: AbortSignal): Promise<GitHubRepositoryLabelListResult> {
		const limit = normalizePaginationLimit(filters.limit);
		const nameFilter = normalizeOptionalTextFilter(filters.name, "label name");
		const queryFilter = normalizeOptionalTextFilter(filters.query, "label query");
		const binding = this.continuationBinding("labels", { name: nameFilter, query: queryFilter });
		const start = decodeContinuationToken(filters.after, binding, "rest");
		const result = await this.paginateFiltered<GitHubLabelResponse>(this.repoPath("/labels"), buildLabelListQuery(limit), signal, {
			limit,
			maxPages: filters.maxPages,
			start: restContinuationStart(start),
			assertItem: assertGitHubLabelDiscoveryResponse,
			filter: (label) => labelMatchesFilters(label, nameFilter, queryFilter),
		});
		return { labels: result.items, truncated: result.truncated, continuation: restContinuation(binding, result, start !== undefined) };
	}

	async listMilestones(filters: GitHubRepositoryMilestoneListFilters = {}, signal?: AbortSignal): Promise<GitHubRepositoryMilestoneListResult> {
		const limit = normalizePaginationLimit(filters.limit);
		const query = buildMilestoneListQuery(filters, limit);
		const binding = this.continuationBinding("milestones", withoutPageSize(query));
		const start = decodeContinuationToken(filters.after, binding, "rest");
		const result = await this.paginateFiltered<GitHubMilestoneResponse>(this.repoPath("/milestones"), query, signal, {
			limit,
			maxPages: filters.maxPages,
			start: restContinuationStart(start),
			assertItem: assertGitHubMilestoneDiscoveryResponse,
		});
		return { milestones: result.items, truncated: result.truncated, continuation: restContinuation(binding, result, start !== undefined) };
	}

	async listAssignees(filters: GitHubRepositoryAssigneeListFilters = {}, signal?: AbortSignal): Promise<GitHubRepositoryAssigneeListResult> {
		const limit = normalizePaginationLimit(filters.limit);
		const loginFilter = normalizeOptionalTextFilter(filters.login, "assignee login");
		const queryFilter = normalizeOptionalTextFilter(filters.query, "assignee query");
		const binding = this.continuationBinding("assignees", { login: loginFilter, query: queryFilter });
		const start = decodeContinuationToken(filters.after, binding, "rest");
		const result = await this.paginateFiltered<GitHubUserResponse>(this.repoPath("/assignees"), buildAssigneeListQuery(limit), signal, {
			limit,
			maxPages: filters.maxPages,
			start: restContinuationStart(start),
			assertItem: assertGitHubAssigneeDiscoveryResponse,
			filter: (assignee) => assigneeMatchesFilters(assignee, loginFilter, queryFilter),
		});
		return { assignees: result.items, truncated: result.truncated, continuation: restContinuation(binding, result, start !== undefined) };
	}

	async listProjectsV2(filters: GitHubProjectV2ListFilters = {}, signal?: AbortSignal): Promise<GitHubProjectV2ListResult> {
		const scope = normalizeProjectV2Scope(filters.scope);
		const owner = normalizeProjectV2Owner(scope, filters.owner, this.repository);
		const limit = normalizeProjectV2ListLimit(filters.limit);
		const query = normalizeProjectV2Query(filters.query);
		const includeClosed = filters.includeClosed === true;
		const maxPages = Math.min(normalizeMaxPages(filters.maxPages) ?? PROJECTS_V2_LIST_PAGE_CAP, PROJECTS_V2_LIST_PAGE_CAP);
		const binding = this.continuationBinding("projects", { scope, owner, query, includeClosed });
		const start = graphqlContinuationStart(decodeContinuationToken(filters.after, binding, "graphql"));
		const projects: ToolProjectSummary[] = [];
		let after = start.cursor;
		let skip = start.skip;
		let truncated = false;
		let next: GraphQLContinuationPosition | undefined;
		let pagesRead = 0;

		while (projects.length < limit) {
			const listVariables = scope === "repository"
				? compactObject({ owner, repo: this.repository.repo, first: limit, after, query })
				: compactObject({ owner, first: limit, after, query });
			const data = await this.graphqlRequest<Record<string, unknown>>(
				"IssueMeListProjectsV2",
				buildProjectsV2ListQuery(scope),
				listVariables,
				signal,
			);
			pagesRead += 1;
			const connection = extractProjectV2Connection(data, scope);
			const rawProjects = extractConnectionNodes(connection);
			const consumed = consumeConnectionNodes(rawProjects, skip, limit - projects.length, (node) => visibleProjectV2Summary(node, includeClosed));
			projects.push(...consumed.items);
			const hasNextPage = connectionHasNextPage(connection);
			const endCursor = connectionEndCursor(connection);
			if (consumed.stoppedAt !== undefined) {
				truncated = true;
				next = graphqlNextPosition(after, consumed.stoppedAt);
				break;
			}
			if (!hasNextPage) break;
			if (projects.length >= limit || pagesRead >= maxPages || !endCursor) {
				truncated = true;
				next = endCursor ? graphqlNextPosition(endCursor, consumed.carriedSkip) : undefined;
				break;
			}
			after = endCursor;
			skip = consumed.carriedSkip;
		}

		return {
			scope,
			owner: scope === "repository" ? this.repository.fullName : owner,
			projects,
			truncated,
			continuation: buildContinuation(binding, next, pagesRead, filters.after !== undefined && filters.after.trim() !== "", !truncated),
		};
	}

	async getProjectV2Fields(filters: GitHubProjectV2FieldListFilters, signal?: AbortSignal): Promise<GitHubProjectV2FieldListResult> {
		const fieldLimit = normalizeProjectV2FieldLimit(filters.fieldLimit);
		const optionLimit = normalizeProjectV2OptionLimit(filters.optionLimit);
		const iterationLimit = normalizeProjectV2IterationLimit(filters.iterationLimit);
		const projectId = normalizeProjectV2Id(filters.projectId);
		const scope = projectId ? "repository" : normalizeProjectV2Scope(filters.scope);
		const owner = projectId ? this.repository.owner : normalizeProjectV2Owner(scope, filters.owner, this.repository);
		const projectNumber = projectId ? undefined : normalizeProjectV2ProjectNumber(filters.projectNumber);
		const operationName = projectId ? "IssueMeGetProjectV2FieldsById" : "IssueMeGetProjectV2FieldsByNumber";
		const binding = this.continuationBinding("project_fields", { projectId, scope, owner, projectNumber });
		const start = graphqlContinuationStart(decodeContinuationToken(filters.after, binding, "graphql"));
		let fieldVariables: Record<string, unknown>;
		if (projectId) {
			fieldVariables = compactObject({ projectId, fieldsFirst: fieldLimit, fieldsAfter: start.cursor });
		} else if (scope === "repository") {
			fieldVariables = compactObject({ owner, repo: this.repository.repo, projectNumber, fieldsFirst: fieldLimit, fieldsAfter: start.cursor });
		} else {
			fieldVariables = compactObject({ owner, projectNumber, fieldsFirst: fieldLimit, fieldsAfter: start.cursor });
		}
		const data = await this.graphqlRequest<Record<string, unknown>>(
			operationName,
			projectId ? buildProjectV2FieldsByIdQuery() : buildProjectV2FieldsByNumberQuery(scope),
			fieldVariables,
			signal,
		);
		const projectNode = extractProjectV2FieldProject(data, { projectId, scope });
		const project = normalizeProjectV2Summary(projectNode);
		if (!project) {
			throw new GitHubApiError("GitHub GraphQL Projects v2 field query returned an incomplete or inaccessible project.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
		}
		const fieldsConnection = isObject(projectNode) ? projectNode.fields : undefined;
		const rawFields = extractConnectionNodes(fieldsConnection);
		const consumed = consumeConnectionNodes(rawFields, start.skip, fieldLimit, (field) => normalizeProjectV2FieldSummary(field, { optionLimit, iterationLimit }));
		const fields = consumed.items;
		const hasNextPage = connectionHasNextPage(fieldsConnection);
		const next = graphqlConnectionNextPosition(start.cursor, consumed.stoppedAt, hasNextPage, connectionEndCursor(fieldsConnection));
		return {
			project,
			fields,
			truncated: hasNextPage || consumed.stoppedAt !== undefined || fields.some((field) => field.truncated === true),
			continuation: buildContinuation(binding, next, 1, start.cursor !== undefined || start.skip > 0, !hasNextPage && consumed.stoppedAt === undefined),
		};
	}

	async listProjectV2Items(filters: GitHubProjectV2ItemListFilters, signal?: AbortSignal): Promise<GitHubProjectV2ItemListResult> {
		const limit = normalizeProjectV2ItemLimit(filters.limit);
		const valueLimit = normalizeProjectV2ItemValueLimit(filters.valueLimit);
		const projectId = normalizeProjectV2Id(filters.projectId);
		const scope = projectId ? "repository" : normalizeProjectV2Scope(filters.scope);
		const owner = projectId ? this.repository.owner : normalizeProjectV2Owner(scope, filters.owner, this.repository);
		const projectNumber = projectId ? undefined : normalizeProjectV2ProjectNumber(filters.projectNumber);
		const binding = this.continuationBinding("project_items", { projectId, scope, owner, projectNumber });
		const start = graphqlContinuationStart(decodeContinuationToken(filters.after, binding, "graphql"));
		let variables: Record<string, unknown>;
		if (projectId) {
			variables = compactObject({ projectId, first: limit, after: start.cursor, valuesFirst: valueLimit });
		} else if (scope === "repository") {
			variables = compactObject({ owner, repo: this.repository.repo, projectNumber, first: limit, after: start.cursor, valuesFirst: valueLimit });
		} else {
			variables = compactObject({ owner, projectNumber, first: limit, after: start.cursor, valuesFirst: valueLimit });
		}
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeListProjectV2Items",
			projectId ? buildProjectV2ItemsByIdQuery() : buildProjectV2ItemsByNumberQuery(scope),
			variables,
			signal,
		);
		const projectNode = extractProjectV2FieldProject(data, { projectId, scope });
		const project = normalizeProjectV2Summary(projectNode);
		if (!project) {
			throw new GitHubApiError("GitHub GraphQL Projects v2 item query returned an incomplete or inaccessible project.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
		}
		const connection = isObject(projectNode) ? projectNode.items : undefined;
		const rawItems = extractConnectionNodes(connection);
		const consumed = consumeConnectionNodes(rawItems, start.skip, limit, (node) => requireProjectV2ItemDetail(node, this.repository.fullName));
		const hasNextPage = connectionHasNextPage(connection);
		const truncated = hasNextPage || consumed.stoppedAt !== undefined;
		const next = graphqlConnectionNextPosition(start.cursor, consumed.stoppedAt, hasNextPage, connectionEndCursor(connection));
		const totalCount = normalizeConnectionTotalCount(connection);
		return {
			project,
			items: consumed.items,
			...(totalCount !== undefined ? { totalCount } : {}),
			truncated,
			continuation: buildContinuation(binding, next, 1, start.cursor !== undefined || start.skip > 0, !truncated),
		};
	}

	async getProjectV2Item(input: GitHubProjectV2ItemLookupInput, signal?: AbortSignal): Promise<GitHubProjectV2ItemLookupResult> {
		const projectId = normalizeProjectV2IdRequired(input.projectId, "projectId");
		const itemId = normalizeProjectV2Id(input.itemId);
		const issueNumber = input.issueNumber === undefined ? undefined : normalizePositiveIssueNumber(input.issueNumber, "issueNumber");
		assertProjectV2ItemLookupSelector(itemId, issueNumber);
		const valueLimit = normalizeProjectV2ItemValueLimit(input.valueLimit);
		const binding = this.continuationBinding("project_item_field_values", { projectId, itemId, issueNumber });
		const start = graphqlContinuationStart(decodeContinuationToken(input.after, binding, "graphql"));
		if (itemId) return this.readProjectV2ItemById(projectId, itemId, valueLimit, start.cursor, binding, signal);
		// A field-value cursor belongs to one item's connection, so a resumed issue lookup resolves the item first, then reads by ID.
		const located = await this.locateProjectV2ItemByIssue(projectId, issueNumber as number, start.cursor ? 1 : valueLimit, signal);
		if (!located.item) return { searchedItems: located.searched, searchTruncated: located.truncated };
		if (start.cursor) {
			const resumed = await this.readProjectV2ItemById(projectId, located.item.item.id, valueLimit, start.cursor, binding, signal);
			return { ...resumed, searchedItems: located.searched, searchTruncated: located.truncated };
		}
		const next = graphqlConnectionNextPosition(undefined, undefined, located.item.valuesHasNextPage, located.item.valuesEndCursor);
		return {
			item: located.item,
			searchedItems: located.searched,
			searchTruncated: located.truncated,
			continuation: buildContinuation(binding, next, 1, false, !located.item.valuesHasNextPage),
		};
	}

	private async readProjectV2ItemById(
		projectId: string,
		itemId: string,
		valueLimit: number,
		valuesAfter: string | undefined,
		binding: ContinuationBinding,
		signal?: AbortSignal,
	): Promise<GitHubProjectV2ItemLookupResult> {
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeGetProjectV2Item",
			buildProjectV2ItemByIdQuery(),
			compactObject({ itemId, valuesFirst: valueLimit, valuesAfter }),
			signal,
			false,
			isProjectV2NodeNotFoundError,
		);
		const node = isObject(data) && isObject(data.node) ? data.node : undefined;
		const detail = node ? requireProjectV2ItemDetail(node, this.repository.fullName) : undefined;
		assertProjectV2ItemBelongsToProject(detail, { projectId, itemId });
		const next = graphqlConnectionNextPosition(valuesAfter, undefined, detail.valuesHasNextPage, detail.valuesEndCursor);
		return { item: detail, continuation: buildContinuation(binding, next, 1, valuesAfter !== undefined, !detail.valuesHasNextPage) };
	}

	private async locateProjectV2ItemByIssue(projectId: string, issueNumber: number, valueLimit: number, signal?: AbortSignal): Promise<{ item?: ProjectV2ItemDetail; searched: number; truncated: boolean }> {
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeGetProjectV2ItemByIssue",
			buildProjectV2ItemByIssueQuery(),
			{ owner: this.repository.owner, repo: this.repository.repo, issueNumber, itemsFirst: MAX_TOOL_PROJECT_ITEMS, valuesFirst: valueLimit },
			signal,
		);
		if (!isObject(data.repository)) {
			throw new GitHubApiError("GitHub GraphQL Projects v2 item lookup returned an inaccessible repository or unexpected response shape.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
		}
		const issueNode = data.repository.issue;
		if (!isObject(issueNode)) {
			throw new GitHubApiError(`GitHub GraphQL Projects v2 item lookup did not return issue #${issueNumber}.`, { code: ISSUEME_ERROR_CODES.GITHUB_API_ERROR, path: `${GITHUB_API_BASE_URL}/graphql` });
		}
		const connection = issueNode.projectItems;
		const details = extractConnectionNodes(connection).map((node) => requireProjectV2ItemDetail(node, this.repository.fullName));
		const item = details.find((detail) => detail.item.project?.id === projectId);
		return { ...(item ? { item } : {}), searched: details.length, truncated: connectionHasNextPage(connection) };
	}

	async addIssueToProjectV2(input: GitHubProjectV2AddIssueInput, signal?: AbortSignal): Promise<GitHubProjectV2ItemMutationResult> {
		const projectId = normalizeProjectV2IdRequired(input.projectId, "projectId");
		const issueNumber = normalizePositiveIssueNumber(input.issueNumber, "issueNumber");
		const projectPolicy = normalizeProjectV2AddValidationPolicy(input, this.repository);
		const issue = await this.ensureIssueOpen(issueNumber, signal);
		const contentId = requireIssueNodeId(issue, "issue");
		await this.ensureProjectV2AllowedForAdd(projectId, projectPolicy, signal);
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeAddIssueToProjectV2",
			buildAddIssueToProjectV2Mutation(),
			{ projectId, contentId },
			signal,
			true,
		);
		return normalizeProjectV2ItemMutationResult(data, "addProjectV2ItemById", this.repository.fullName);
	}

	async updateProjectV2ItemField(input: GitHubProjectV2UpdateItemFieldInput, signal?: AbortSignal): Promise<GitHubProjectV2ItemMutationResult> {
		const projectId = normalizeProjectV2IdRequired(input.projectId, "projectId");
		const itemId = normalizeProjectV2IdRequired(input.itemId, "itemId");
		const fieldId = normalizeProjectV2IdRequired(input.fieldId, "fieldId");
		const issueNumber = normalizePositiveIssueNumber(input.issueNumber, "issueNumber");
		await this.ensureIssueForProjectItemMutation(issueNumber, PROJECT_V2_ITEM_ISSUE_STATE_POLICY.update_field, signal);
		await this.ensureProjectV2ItemTargetsIssue({ projectId, itemId, issueNumber }, PROJECT_V2_ITEM_ISSUE_STATE_POLICY.update_field, signal);
		const value = normalizeProjectV2FieldValueInput(input.value);
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeUpdateProjectV2ItemFieldValue",
			buildUpdateProjectV2ItemFieldValueMutation(),
			{ projectId, itemId, fieldId, value },
			signal,
			true,
		);
		return normalizeProjectV2ItemMutationResult(data, "updateProjectV2ItemFieldValue", this.repository.fullName);
	}

	/** Removes one board item after revalidating project, repository, issue (open or closed), and identity; the issue itself is never touched. */
	async removeProjectV2Item(input: GitHubProjectV2ItemTarget, signal?: AbortSignal): Promise<GitHubProjectV2ItemRemovalResult> {
		const target = this.normalizeProjectV2ItemTarget(input);
		const issue = await this.ensureIssueForProjectItemMutation(target.issueNumber, PROJECT_V2_ITEM_ISSUE_STATE_POLICY.remove_item, signal);
		const validation = await this.readProjectV2ItemValidation(target.itemId, signal);
		if (!isObject(validation.node)) return this.verifyProjectV2ItemAbsence(target, issue, signal);
		assertProjectV2ItemTargetsIssue(validation, target, this.repository.fullName, PROJECT_V2_ITEM_ISSUE_STATE_POLICY.remove_item);
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeDeleteProjectV2Item",
			buildDeleteProjectV2ItemMutation(),
			{ projectId: target.projectId, itemId: target.itemId },
			signal,
			true,
		);
		return { status: "removed", itemId: target.itemId, issue, deletedItemId: normalizeDeleteProjectV2ItemResult(data, target.itemId) };
	}

	/** Clears one project-owned field value after validating the field's project and type and reading the value back. */
	async clearProjectV2ItemField(input: GitHubProjectV2ItemFieldClearInput, signal?: AbortSignal): Promise<GitHubProjectV2ItemFieldClearResult> {
		const target = this.normalizeProjectV2ItemTarget(input);
		const fieldId = normalizeProjectV2IdRequired(input.fieldId, "fieldId");
		const issue = await this.ensureIssueForProjectItemMutation(target.issueNumber, PROJECT_V2_ITEM_ISSUE_STATE_POLICY.clear_field, signal);
		const fieldData = await this.graphqlRequest<Record<string, unknown>>("IssueMeValidateProjectV2Field", buildProjectV2FieldValidationQuery(), { fieldId }, signal);
		const field = assertProjectV2FieldClearable(fieldData, { projectId: target.projectId, fieldId });
		const itemData = await this.graphqlRequest<Record<string, unknown>>("IssueMeValidateProjectV2ItemField", buildProjectV2ItemFieldValueValidationQuery(), { itemId: target.itemId, fieldName: field.name }, signal, false, isProjectV2NodeNotFoundError);
		assertProjectV2ItemTargetsIssue(itemData, target, this.repository.fullName, PROJECT_V2_ITEM_ISSUE_STATE_POLICY.clear_field);
		if (!projectV2ItemHasNamedFieldValue(itemData)) return { status: "already_clear", itemId: target.itemId, issue, field };
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeClearProjectV2ItemFieldValue",
			buildClearProjectV2ItemFieldValueMutation(),
			{ projectId: target.projectId, itemId: target.itemId, fieldId: field.id, fieldName: field.name },
			signal,
			true,
		);
		normalizeClearProjectV2ItemFieldValueResult(data, target.itemId);
		return { status: "cleared", itemId: target.itemId, issue, field };
	}

	/** Archives or restores one board item; values are preserved and already-matching states are no-ops. */
	async setProjectV2ItemArchived(input: GitHubProjectV2ItemArchiveInput, signal?: AbortSignal): Promise<GitHubProjectV2ItemArchiveResult> {
		const target = this.normalizeProjectV2ItemTarget(input);
		const action = normalizeProjectV2ItemArchiveAction(input.action);
		const issue = await this.ensureIssueForProjectItemMutation(target.issueNumber, PROJECT_V2_ITEM_ISSUE_STATE_POLICY.archive_item, signal);
		const validation = await this.readProjectV2ItemValidation(target.itemId, signal);
		assertProjectV2ItemTargetsIssue(validation, target, this.repository.fullName, PROJECT_V2_ITEM_ISSUE_STATE_POLICY.archive_item);
		const desired = action === "archive";
		const current = projectV2ItemArchivedState(validation);
		if (current === desired) return { status: desired ? "already_archived" : "already_active", itemId: target.itemId, issue, isArchived: current };
		const data = await this.graphqlRequest<Record<string, unknown>>(
			projectV2ArchiveOperationName(action),
			buildArchiveProjectV2ItemMutation(action),
			{ projectId: target.projectId, itemId: target.itemId },
			signal,
			true,
		);
		const isArchived = normalizeArchiveProjectV2ItemResult(data, action, target.itemId);
		return { status: desired ? "archived" : "unarchived", itemId: target.itemId, issue, isArchived };
	}

	/** Moves one board item to the top or directly after an anchor on the same board; fields, archive state, relationships, and the issue are untouched. */
	async moveProjectV2Item(input: GitHubProjectV2ItemMoveInput, signal?: AbortSignal): Promise<GitHubProjectV2ItemMoveResult> {
		const target = this.normalizeProjectV2ItemTarget(input);
		const afterItemId = input.afterItemId === undefined ? undefined : normalizeProjectV2IdRequired(input.afterItemId, "afterItemId");
		if (afterItemId === target.itemId) {
			throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "afterItemId must differ from itemId; an item cannot be positioned after itself.", { itemId: target.itemId, afterItemId });
		}
		const issue = await this.ensureIssueForProjectItemMutation(target.issueNumber, PROJECT_V2_ITEM_ISSUE_STATE_POLICY.move_item, signal);
		const validation = await this.readProjectV2ItemValidation(target.itemId, signal);
		assertProjectV2ItemTargetsIssue(validation, target, this.repository.fullName, PROJECT_V2_ITEM_ISSUE_STATE_POLICY.move_item);
		if (afterItemId !== undefined) assertProjectV2AnchorItem(await this.readProjectV2ItemValidation(afterItemId, signal), { ...target, afterItemId });
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeMoveProjectV2Item",
			buildMoveProjectV2ItemMutation(),
			{ projectId: target.projectId, itemId: target.itemId, afterId: afterItemId ?? null, verifyFirst: MAX_TOOL_PROJECT_ITEMS },
			signal,
			true,
		);
		const verification = normalizeMoveProjectV2ItemResult(data, target.itemId, afterItemId);
		return { status: "moved", itemId: target.itemId, issue, ...(afterItemId === undefined ? {} : { afterItemId }), ...verification };
	}

	private normalizeProjectV2ItemTarget(input: GitHubProjectV2ItemTarget): GitHubProjectV2ItemTarget {
		return {
			projectId: normalizeProjectV2IdRequired(input.projectId, "projectId"),
			itemId: normalizeProjectV2IdRequired(input.itemId, "itemId"),
			issueNumber: normalizePositiveIssueNumber(input.issueNumber, "issueNumber"),
		};
	}

	private async readProjectV2ItemValidation(itemId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
		return this.graphqlRequest<Record<string, unknown>>("IssueMeValidateProjectV2ItemForUpdate", buildProjectV2ItemValidationQuery(), { itemId }, signal, false, isProjectV2NodeNotFoundError);
	}

	/** An unresolvable item ID is only reported as absent when the issue's own project items prove the board no longer holds it. */
	private async verifyProjectV2ItemAbsence(target: GitHubProjectV2ItemTarget, issue: GitHubIssueResponse, signal?: AbortSignal): Promise<GitHubProjectV2ItemRemovalResult> {
		const located = await this.locateProjectV2ItemByIssue(target.projectId, target.issueNumber, 1, signal);
		if (located.item) {
			throw new IssueMeError(
				ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
				"itemId did not resolve, but the issue is still on the project under a different item ID; refusing to remove a mismatched item.",
				{ itemId: target.itemId, projectId: target.projectId, issueNumber: target.issueNumber, actualItemId: located.item.item.id },
				{ recoveryHint: "Use issueme_get_project_item with projectId and issueNumber to rediscover the current item ID before removing it." },
			);
		}
		if (located.truncated) {
			throw new IssueMeError(
				ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
				"itemId did not resolve and the issue has more project items than IssueMe could inspect; absence could not be verified.",
				{ itemId: target.itemId, projectId: target.projectId, issueNumber: target.issueNumber, searchedItems: located.searched },
			);
		}
		return { status: "already_absent", itemId: target.itemId, issue };
	}

	async createRepositoryMilestone(input: GitHubRepositoryMilestoneCreateInput, signal?: AbortSignal): Promise<GitHubMilestoneResponse> {
		return this.request<GitHubMilestoneResponse>("POST", this.repoPath("/milestones"), {
			body: compactObject(input),
			signal,
			validate: isRepositoryMilestoneMutationResponse,
			mutation: true,
		});
	}

	async updateRepositoryMilestone(number: number, input: GitHubRepositoryMilestoneUpdateInput, signal?: AbortSignal): Promise<GitHubMilestoneResponse> {
		const milestoneNumber = normalizePositiveMilestoneNumber(number, "milestoneNumber");
		return this.request<GitHubMilestoneResponse>("PATCH", this.repoPath(`/milestones/${milestoneNumber}`), {
			body: compactObject(input),
			signal,
			validate: isRepositoryMilestoneMutationResponse,
			mutation: true,
		});
	}

	async deleteRepositoryMilestone(number: number, signal?: AbortSignal): Promise<void> {
		const milestoneNumber = normalizePositiveMilestoneNumber(number, "milestoneNumber");
		await this.request<void>("DELETE", this.repoPath(`/milestones/${milestoneNumber}`), {
			signal,
			validate: (value) => value === undefined,
			mutation: true,
		});
	}

	async createRepositoryLabel(input: GitHubRepositoryLabelCreateInput, signal?: AbortSignal): Promise<GitHubLabelResponse> {
		return this.request<GitHubLabelResponse>("POST", this.repoPath("/labels"), {
			body: compactObject(input),
			signal,
			validate: isRepositoryLabelMutationResponse,
			mutation: true,
		});
	}

	async getRepositoryLabel(name: string, signal?: AbortSignal): Promise<GitHubLabelResponse | undefined> {
		try {
			return await this.request<GitHubLabelResponse>("GET", this.repoPath(`/labels/${encodeURIComponent(name)}`), { signal, validate: isObject });
		} catch (error) {
			if (error instanceof GitHubApiError && error.status === 404) return undefined;
			throw error;
		}
	}

	async updateRepositoryLabel(name: string, input: GitHubRepositoryLabelUpdateInput, signal?: AbortSignal): Promise<GitHubLabelResponse> {
		return this.request<GitHubLabelResponse>("PATCH", this.repoPath(`/labels/${encodeURIComponent(name)}`), {
			body: compactObject(input),
			signal,
			validate: isRepositoryLabelMutationResponse,
			mutation: true,
		});
	}

	async deleteRepositoryLabel(name: string, signal?: AbortSignal): Promise<void> {
		await this.request<void>("DELETE", this.repoPath(`/labels/${encodeURIComponent(name)}`), {
			signal,
			validate: (value) => value === undefined,
			mutation: true,
		});
	}

	async getIssue(issueNumber: number, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		return this.request<GitHubIssueResponse>("GET", this.repoPath(`/issues/${normalizedIssueNumber}`), { signal, validate: isObject });
	}

	async getRepositoryOwnerType(signal?: AbortSignal): Promise<GitHubRepositoryOwnerType> {
		const repository = await this.request<{ owner?: unknown }>("GET", this.repoPath(""), { signal, validate: isObject });
		const owner = isObject(repository.owner) ? repository.owner : undefined;
		if (owner?.type === "Organization" || owner?.type === "User") return owner.type;
		throw new GitHubApiError("GitHub repository response did not include a valid owner type.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: this.repoPath("") });
	}

	/** This repository's issue templates through the contents endpoint; organization defaults are outside the boundary and stay unresolved. */
	async listIssueTemplates(signal?: AbortSignal): Promise<GitHubIssueTemplatesResult> {
		const directory = await this.readContents(ISSUE_TEMPLATE_DIRECTORY, signal);
		if (Array.isArray(directory)) return this.readIssueTemplateDirectory(assertGitHubContentsDirectoryResponse(directory, ISSUE_TEMPLATE_DIRECTORY), signal);
		for (const path of LEGACY_ISSUE_TEMPLATE_PATHS) {
			const legacy = await this.readContents(path, signal);
			if (legacy === undefined || Array.isArray(legacy)) continue;
			return { source: "legacy_file", sourcePath: path, templates: [this.issueTemplateFromFile(assertGitHubContentsFileResponse(legacy, path))], truncated: false };
		}
		return { source: "none", templates: [], truncated: false };
	}

	/** One template by plain file name, looked up in the template directory and then the legacy single-file locations. */
	async readIssueTemplate(filename: string, signal?: AbortSignal): Promise<GitHubIssueTemplateFile> {
		const name = normalizeTemplateFilename(filename);
		const candidates = [`${ISSUE_TEMPLATE_DIRECTORY}/${name}`, ...LEGACY_ISSUE_TEMPLATE_PATHS.filter((path) => path === name || path.endsWith(`/${name}`))];
		for (const path of candidates) {
			const value = await this.readContents(path, signal);
			if (value === undefined || Array.isArray(value)) continue;
			return this.issueTemplateFromFile(assertGitHubContentsFileResponse(value, path));
		}
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			`No issue template named ${name} exists in ${this.repository.fullName}.`,
			{ filename: name },
			{ recoveryHint: "Call issueme_list_issue_templates without filename to see the available template files." },
		);
	}

	private async readIssueTemplateDirectory(entries: GitHubContentsEntry[], signal?: AbortSignal): Promise<GitHubIssueTemplatesResult> {
		const files = entries.filter((entry) => entry.type === "file");
		const configEntry = files.find((entry) => classifyTemplateFilename(entry.name) === "config");
		const templateEntries = files.filter((entry) => classifyTemplateFilename(entry.name) !== "config");
		const selected = templateEntries.slice(0, MAX_TOOL_ISSUE_TEMPLATES);
		// Cap Contents requests at one in flight; preserve directory order and stop before later reads on failure or cancellation.
		const templates = await mapSequentially(selected, (entry) => this.readIssueTemplateEntry(entry, signal));
		const config = await this.readIssueTemplateConfig(configEntry, signal);
		return { source: "directory", sourcePath: ISSUE_TEMPLATE_DIRECTORY, templates, ...(config ? { config } : {}), truncated: templateEntries.length > selected.length };
	}

	private async readIssueTemplateConfig(entry: GitHubContentsEntry | undefined, signal?: AbortSignal): Promise<ToolIssueTemplateConfigSummary | undefined> {
		if (!entry || isTemplateFileTooLarge(entry.size)) return undefined;
		const value = await this.readContents(entry.path, signal);
		if (value === undefined || Array.isArray(value)) return undefined;
		return parseTemplateConfig(entry.path, decodeContentsFile(assertGitHubContentsFileResponse(value, entry.path)));
	}

	private async readIssueTemplateEntry(entry: GitHubContentsEntry, signal?: AbortSignal): Promise<GitHubIssueTemplateFile> {
		if (classifyTemplateFilename(entry.name) === "unsupported" || isTemplateFileTooLarge(entry.size)) return { template: summarizeIssueTemplate(entry, undefined) };
		const value = await this.readContents(entry.path, signal);
		if (value === undefined || Array.isArray(value)) return { template: summarizeIssueTemplate(entry, undefined) };
		return this.issueTemplateFromFile(assertGitHubContentsFileResponse(value, entry.path));
	}

	private issueTemplateFromFile(file: GitHubContentsFile): GitHubIssueTemplateFile {
		if (isTemplateFileTooLarge(file.size)) return { template: summarizeIssueTemplate(file, undefined) };
		const text = decodeContentsFile(file);
		return { template: summarizeIssueTemplate(file, text), text };
	}

	/** Repository-scoped contents read; 404 means absent, and 403 is rewrapped so the missing Contents permission is explicit. */
	private async readContents(path: string, signal?: AbortSignal): Promise<unknown> {
		try {
			return await this.request<unknown>("GET", this.repoPath(`/contents/${path}`), { signal, validate: (value) => isObject(value) || Array.isArray(value) });
		} catch (error) {
			if (error instanceof GitHubApiError && error.status === 404) return undefined;
			if (error instanceof GitHubApiError && error.status === 403) {
				throw new GitHubApiError(
					`Issue template discovery for ${this.repository.fullName} was forbidden; the GH_TOKEN/GITHUB_TOKEN needs repository Contents read access to read ${path}. GitHub detail: ${error.message}`,
					{ code: ISSUEME_ERROR_CODES.GITHUB_API_ERROR, status: 403, path: `${GITHUB_API_BASE_URL}/repos` },
				);
			}
			throw error;
		}
	}

	/** Organization issue types for the resolved repository owner; user-owned repositories return an empty list with ownerType User. */
	async listRepositoryIssueTypes(signal?: AbortSignal): Promise<GitHubRepositoryIssueTypesResult> {
		const ownerType = await this.getRepositoryOwnerType(signal);
		if (ownerType !== "Organization") return { ownerType, issueTypes: [] };
		const path = `/orgs/${encodeURIComponent(this.repository.owner)}/issue-types`;
		let types: unknown[];
		try {
			types = await this.request<unknown[]>("GET", path, { signal, validate: Array.isArray });
		} catch (error) {
			if (error instanceof GitHubApiError && (error.status === 404 || error.status === 410)) {
				throw new GitHubApiError(`GitHub did not expose issue types for organization ${this.repository.owner}. GitHub detail: ${error.message}`, {
					code: ISSUEME_ERROR_CODES.GITHUB_ISSUE_TYPES_UNSUPPORTED,
					status: error.status,
					path: `${GITHUB_API_BASE_URL}${path}`,
				});
			}
			throw error;
		}
		for (const type of types) assertGitHubIssueTypeDiscoveryResponse(type, `${GITHUB_API_BASE_URL}${path}`);
		return { ownerType, issueTypes: types as GitHubIssueTypeResponse[] };
	}

	async getAuthenticatedUserLogin(signal?: AbortSignal): Promise<string> {
		const user = await this.request<GitHubUserResponse>("GET", "/user", { signal, validate: isObject });
		if (isValidGitHubLogin(user.login)) return user.login;
		throw new GitHubApiError("GitHub authenticated-user response did not include a valid login.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/user` });
	}

	async listComments(issueNumber: number, signal?: AbortSignal, options: PaginationOptions = {}): Promise<GitHubCommentResponse[]> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		return this.paginate<GitHubCommentResponse>(
			this.repoPath(`/issues/${normalizedIssueNumber}/comments`),
			{ per_page: String(Math.min(options.limit ?? 100, 100)) },
			signal,
			options,
		);
	}

	async getIssueComment(commentId: number, signal?: AbortSignal): Promise<GitHubCommentResponse> {
		const normalizedCommentId = normalizePositiveCommentId(commentId, "commentId");
		return this.request<GitHubCommentResponse>("GET", this.repoPath(`/issues/comments/${normalizedCommentId}`), { signal, validate: isObject });
	}

	/** Continuation-aware comment reader for tools; the cache path keeps using listComments with its own cap. */
	async listIssueComments(issueNumber: number, filters: GitHubIssueCommentListFilters = {}, signal?: AbortSignal): Promise<GitHubIssueCommentListResult> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const limit = normalizePaginationLimit(filters.limit);
		const since = normalizeCommentSinceFilter(filters.since);
		const binding = this.continuationBinding("issue_comments", { issueNumber: normalizedIssueNumber, since });
		const start = decodeContinuationToken(filters.after, binding, "rest");
		const query = compactObject({ per_page: String(Math.min(limit ?? 100, 100)), since }) as Record<string, string>;
		const result = await this.paginateFiltered<GitHubCommentResponse>(this.repoPath(`/issues/${normalizedIssueNumber}/comments`), query, signal, {
			limit,
			maxPages: filters.maxPages,
			start: restContinuationStart(start),
			assertItem: assertGitHubCommentDiscoveryResponse,
		});
		return { comments: result.items, truncated: result.truncated, continuation: restContinuation(binding, result, start !== undefined) };
	}

	/** Reads one comment after confirming it belongs to the requested issue; the issue may be open or closed. */
	async getIssueCommentForIssue(issueNumber: number, commentId: number, signal?: AbortSignal): Promise<GitHubIssueCommentLookupResult> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const normalizedCommentId = normalizePositiveCommentId(commentId, "commentId");
		const issue = await this.getIssue(normalizedIssueNumber, signal);
		const comment = await this.getIssueComment(normalizedCommentId, signal);
		assertGitHubCommentDiscoveryResponse(comment, this.repoPath(`/issues/comments/${normalizedCommentId}`));
		if (!commentBelongsToIssue(this.repository, comment, normalizedIssueNumber, normalizedCommentId)) {
			throw new IssueMeError(
				ISSUEME_ERROR_CODES.COMMENT_ISSUE_MISMATCH,
				`Comment ${normalizedCommentId} does not belong to issue #${normalizedIssueNumber}; refusing to return its content.`,
				{ issueNumber: normalizedIssueNumber, id: normalizedCommentId },
			);
		}
		return { issue, comment };
	}

	async createIssue(input: IssueCreateInput, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		assertCollectionItemLimit(input.labels, "labels", MAX_TOOL_LABELS);
		assertCollectionItemLimit(input.assignees, "assignees", MAX_TOOL_ASSIGNEES);
		return this.request<GitHubIssueResponse>("POST", this.repoPath("/issues"), {
			body: compactObject(input),
			signal,
			validate: isObject,
			mutation: true,
		});
	}

	async deleteIssue(issueNumber: number, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const issue = await this.getIssue(normalizedIssueNumber, signal);
		await this.deleteIssueByIssueResponse(issue, signal);
		return issue;
	}

	async deleteIssueByIssueResponse(issue: GitHubIssueResponse, signal?: AbortSignal): Promise<void> {
		const issueId = requireDeletableIssueNodeId(issue);
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeDeleteIssue",
			buildDeleteIssueMutation(),
			{ issueId },
			signal,
			true,
		);
		normalizeDeleteIssueMutationResult(data);
	}

	async addSubIssue(parentNumber: number, childNumber: number, signal?: AbortSignal): Promise<NativeSubIssueMutationResult> {
		const normalizedParentNumber = normalizePositiveIssueNumber(parentNumber, "parentNumber");
		const normalizedChildNumber = normalizePositiveIssueNumber(childNumber, "childNumber");
		const [parentIssue, childIssue] = await Promise.all([
			this.ensureIssueOpen(normalizedParentNumber, signal),
			this.ensureIssueOpen(normalizedChildNumber, signal),
		]);
		return this.addSubIssueByIssueResponses(parentIssue, childIssue, signal);
	}

	async addSubIssueByIssueResponses(parentIssue: GitHubIssueResponse, childIssue: GitHubIssueResponse, signal?: AbortSignal): Promise<NativeSubIssueMutationResult> {
		return this.mutateSubIssueRelationship("add", requireIssueNodeId(parentIssue, "parent issue"), requireIssueNodeId(childIssue, "child issue"), signal);
	}

	async removeSubIssue(parentNumber: number, childNumber: number, signal?: AbortSignal): Promise<NativeSubIssueMutationResult> {
		const normalizedParentNumber = normalizePositiveIssueNumber(parentNumber, "parentNumber");
		const normalizedChildNumber = normalizePositiveIssueNumber(childNumber, "childNumber");
		const [parentIssue, childIssue] = await Promise.all([
			this.ensureIssueOpen(normalizedParentNumber, signal),
			this.ensureIssueOpen(normalizedChildNumber, signal),
		]);
		return this.removeSubIssueByIssueResponses(parentIssue, childIssue, signal);
	}

	async removeSubIssueByIssueResponses(parentIssue: GitHubIssueResponse, childIssue: GitHubIssueResponse, signal?: AbortSignal): Promise<NativeSubIssueMutationResult> {
		return this.mutateSubIssueRelationship("remove", requireIssueNodeId(parentIssue, "parent issue"), requireIssueNodeId(childIssue, "child issue"), signal);
	}

	async reorderSubIssues(parentNumber: number, orderedChildNumbers: number[], signal?: AbortSignal): Promise<NativeSubIssueReorderResult> {
		const normalizedParentNumber = normalizePositiveIssueNumber(parentNumber, "parentNumber");
		const parentIssue = await this.ensureIssueOpen(normalizedParentNumber, signal);
		const relationship = await this.listSubIssueRelationships(normalizedParentNumber, { limit: MAX_TOOL_ISSUES }, signal);
		return this.reorderSubIssuesByIssueResponseAndRelationship(parentIssue, relationship, orderedChildNumbers, signal);
	}

	async reorderSubIssuesByIssueResponseAndRelationship(
		parentIssue: GitHubIssueResponse,
		relationship: NativeSubIssueRelationshipResult,
		orderedChildNumbers: number[],
		signal?: AbortSignal,
	): Promise<NativeSubIssueReorderResult> {
		const normalizedParentNumber = normalizePositiveIssueNumber(relationship.issue.number, "parentNumber");
		const parentIssueNumber = normalizePositiveIssueNumber(typeof parentIssue.number === "number" ? parentIssue.number : undefined, "parentNumber");
		if (parentIssueNumber !== normalizedParentNumber) {
			throw new IssueMeError(
				ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
				`Native sub-issue reorder preflight mismatch: parent issue #${parentIssueNumber} does not match relationship issue #${normalizedParentNumber}.`,
				{ parentNumber: parentIssueNumber, relationshipIssueNumber: normalizedParentNumber },
			);
		}
		const desiredNumbers = normalizeSubIssueReorderNumbers(orderedChildNumbers, normalizedParentNumber);
		const parentIssueId = requireIssueNodeId(parentIssue, "parent issue");
		assertReorderableSubIssueList(this.repository.fullName, normalizedParentNumber, desiredNumbers, relationship);

		const issueByNumber = new Map(relationship.subIssues.map((issue) => [issue.number, issue]));
		let currentOrder = [...relationship.subIssues];
		const mutations: NativeSubIssueMutationResult[] = [];
		try {
			await mapSequentially(desiredNumbers, async (_childNumber, index) => {
				const result = await this.reprioritizeDesiredSubIssue(parentIssueId, desiredNumbers, index, issueByNumber, currentOrder, signal);
				currentOrder = result.currentOrder;
				if (result.mutation) mutations.push(result.mutation);
			});
			const refreshed = await this.refreshSubIssueRelationshipAfterReorder(normalizedParentNumber, relationship, mutations, signal);
			return { relationship: refreshed, mutations };
		} catch (error) {
			if (mutations.length > 0) throw markMutationSettlement(error, "remote_success_known");
			throw error;
		}
	}

	private async reprioritizeDesiredSubIssue(
		parentIssueId: string,
		desiredNumbers: number[],
		index: number,
		issueByNumber: Map<number, NativeSubIssueSummary>,
		currentOrder: NativeSubIssueSummary[],
		signal?: AbortSignal,
	): Promise<ReprioritizeSubIssueStepResult> {
		const childNumber = desiredNumbers[index];
		const child = issueByNumber.get(childNumber);
		if (!child) return { currentOrder };
		if (index === 0) return this.reprioritizeFirstDesiredSubIssue(parentIssueId, child, currentOrder, signal);
		return this.reprioritizeFollowingDesiredSubIssue(parentIssueId, child, desiredNumbers[index - 1], issueByNumber, currentOrder, signal);
	}

	private async reprioritizeFirstDesiredSubIssue(
		parentIssueId: string,
		child: NativeSubIssueSummary,
		currentOrder: NativeSubIssueSummary[],
		signal?: AbortSignal,
	): Promise<ReprioritizeSubIssueStepResult> {
		if (currentOrder[0]?.number === child.number) return { currentOrder };
		const before = currentOrder.find((issue) => issue.number !== child.number);
		if (!before) return { currentOrder };
		const mutation = await this.reprioritizeSubIssue(parentIssueId, child, { beforeId: before.id }, signal);
		return {
			currentOrder: moveNativeSubIssue(currentOrder, child.number, { beforeNumber: before.number }),
			mutation,
		};
	}

	private async reprioritizeFollowingDesiredSubIssue(
		parentIssueId: string,
		child: NativeSubIssueSummary,
		previousNumber: number,
		issueByNumber: Map<number, NativeSubIssueSummary>,
		currentOrder: NativeSubIssueSummary[],
		signal?: AbortSignal,
	): Promise<ReprioritizeSubIssueStepResult> {
		const previous = issueByNumber.get(previousNumber);
		if (!previous) return { currentOrder };
		const previousIndex = currentOrder.findIndex((issue) => issue.number === previousNumber);
		if (previousIndex >= 0 && currentOrder[previousIndex + 1]?.number === child.number) return { currentOrder };
		const mutation = await this.reprioritizeSubIssue(parentIssueId, child, { afterId: previous.id }, signal);
		return {
			currentOrder: moveNativeSubIssue(currentOrder, child.number, { afterNumber: previousNumber }),
			mutation,
		};
	}

	private async refreshSubIssueRelationshipAfterReorder(
		parentNumber: number,
		relationship: NativeSubIssueRelationshipResult,
		mutations: NativeSubIssueMutationResult[],
		signal?: AbortSignal,
	): Promise<NativeSubIssueRelationshipResult> {
		if (mutations.length === 0) return relationship;
		return this.listSubIssueRelationships(parentNumber, { limit: MAX_TOOL_ISSUES }, signal);
	}

	async listSubIssueRelationships(issueNumber: number, options: GitHubContinuationReadOptions = {}, signal?: AbortSignal): Promise<NativeSubIssueRelationshipResult> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const limit = normalizeSubIssueRelationshipLimit(options.limit);
		const binding = this.continuationBinding("sub_issues", { issueNumber: normalizedIssueNumber });
		const start = graphqlContinuationStart(decodeContinuationToken(options.after, binding, "graphql"));
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeListSubIssues",
			buildSubIssueRelationshipsQuery(),
			compactObject({ owner: this.repository.owner, repo: this.repository.repo, issueNumber: normalizedIssueNumber, first: limit, after: start.cursor }),
			signal,
		);
		const resumed = start.cursor !== undefined;
		const { endCursor, hasNextPage, ...relationship } = normalizeNativeSubIssueRelationshipResult(data, this.repository.fullName, normalizedIssueNumber, limit, { skip: start.skip, resumed });
		const next = graphqlConnectionNextPosition(start.cursor, undefined, hasNextPage, endCursor);
		return { ...relationship, continuation: buildContinuation(binding, next, 1, resumed, !relationship.truncated) };
	}

	async listIssueDevelopmentLinks(issueNumber: number, options: GitHubContinuationReadOptions = {}, signal?: AbortSignal): Promise<GitHubIssueDevelopmentLinksResult> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const limit = normalizeIssueDevelopmentLinkLimit(options.limit);
		const binding = this.continuationBinding("development_links", { issueNumber: normalizedIssueNumber });
		const start = graphqlContinuationStart(decodeContinuationToken(options.after, binding, "graphql"));
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeListIssueDevelopmentLinks",
			buildIssueDevelopmentLinksQuery(),
			compactObject({ owner: this.repository.owner, repo: this.repository.repo, issueNumber: normalizedIssueNumber, first: limit, after: start.cursor }),
			signal,
			false,
			isInaccessibleCloserError,
		);
		const resumed = start.cursor !== undefined;
		const { endCursor, hasNextPage, ...links } = normalizeIssueDevelopmentLinksResult(data, this.repository.fullName, normalizedIssueNumber, limit, { skip: start.skip, resumed });
		const next = graphqlConnectionNextPosition(start.cursor, undefined, hasNextPage, endCursor);
		return { ...links, continuation: buildContinuation(binding, next, 1, resumed, !links.truncated) };
	}

	/** Full REST timeline with continuation; the GraphQL development-link reader stays separate and unchanged. */
	async listIssueTimeline(issueNumber: number, filters: GitHubIssueTimelineFilters = {}, signal?: AbortSignal): Promise<GitHubIssueTimelineResult> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const limit = normalizePaginationLimit(filters.limit);
		const eventTypes = normalizeTimelineEventTypes(filters.eventTypes);
		const binding = this.continuationBinding("issue_timeline", { issueNumber: normalizedIssueNumber, eventTypes });
		const start = decodeContinuationToken(filters.after, binding, "rest");
		const result = await this.paginateFiltered<GitHubTimelineEventResponse>(this.repoPath(timelineEventPath(normalizedIssueNumber)), { per_page: String(Math.min(limit ?? 100, 100)) }, signal, {
			limit,
			maxPages: filters.maxPages,
			start: restContinuationStart(start),
			assertItem: assertGitHubTimelineEventResponse,
			filter: (event) => timelineEventMatches(event, eventTypes),
		});
		return { events: result.items, truncated: result.truncated, continuation: restContinuation(binding, result, start !== undefined) };
	}

	async listIssueDependencies(issueNumber: number, direction: IssueDependencyDirection, options: GitHubContinuationReadOptions = {}, signal?: AbortSignal): Promise<GitHubIssueDependencyListResult> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const normalizedDirection = normalizeIssueDependencyDirection(direction);
		const limit = normalizePaginationLimit(options.limit);
		const binding = this.continuationBinding(`dependencies_${normalizedDirection}`, { issueNumber: normalizedIssueNumber });
		const start = decodeContinuationToken(options.after, binding, "rest");
		const result = await this.paginateIssueDependencies(normalizedIssueNumber, normalizedDirection, { limit, maxPages: options.maxPages, start: restContinuationStart(start) }, signal);
		return { direction: normalizedDirection, issues: result.items, truncated: result.truncated, continuation: restContinuation(binding, result, start !== undefined) };
	}

	/** Bounded scan for one edge by blocking-issue database id; `complete` is false when the cap stopped the scan. */
	async findIssueDependency(issueNumber: number, direction: IssueDependencyDirection, blockingIssueId: number, signal?: AbortSignal): Promise<GitHubIssueDependencyLookup> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const result = await this.paginateIssueDependencies(normalizedIssueNumber, normalizeIssueDependencyDirection(direction), {
			limit: 1,
			maxPages: ISSUE_DEPENDENCY_PREFLIGHT_PAGE_CAP,
			filter: (issue) => issue.id === blockingIssueId,
		}, signal);
		const issue = result.items[0];
		return { ...(issue ? { issue } : {}), complete: issue !== undefined || !result.truncated };
	}

	async addIssueDependency(issueNumber: number, blockingIssueNumber: number, signal?: AbortSignal): Promise<GitHubIssueDependencyMutationResult> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const normalizedBlockingNumber = normalizePositiveIssueNumber(blockingIssueNumber, "blockingIssueNumber");
		assertDistinctDependencyNumbers(normalizedIssueNumber, normalizedBlockingNumber);
		const [issue, blockingIssue] = await Promise.all([
			this.ensureIssueOpen(normalizedIssueNumber, signal),
			this.ensureIssueOpen(normalizedBlockingNumber, signal),
		]);
		return this.addIssueDependencyByIssueResponses(issue, blockingIssue, signal);
	}

	async addIssueDependencyByIssueResponses(issue: GitHubIssueResponse, blockingIssue: GitHubIssueResponse, signal?: AbortSignal): Promise<GitHubIssueDependencyMutationResult> {
		const { issueNumber, blockingIssueId } = this.resolveIssueDependencyIdentities(issue, blockingIssue);
		const existing = await this.findIssueDependency(issueNumber, "blocked_by", blockingIssueId, signal);
		if (existing.issue) return { status: "already_present", issue, blockingIssue: existing.issue, blockingIssueId };
		let response: GitHubIssueResponse;
		try {
			response = await this.request<GitHubIssueResponse>("POST", this.repoPath(issueDependencyPath(issueNumber, "blocked_by")), {
				body: { issue_id: blockingIssueId },
				signal,
				validate: isIssueDependencyMember,
				mutation: true,
			});
		} catch (error) {
			throw mapIssueDependencyMutationError(error, "add") ?? error;
		}
		return { status: "added", issue, blockingIssue: response, blockingIssueId };
	}

	async removeIssueDependency(issueNumber: number, blockingIssueNumber: number, signal?: AbortSignal): Promise<GitHubIssueDependencyMutationResult> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const normalizedBlockingNumber = normalizePositiveIssueNumber(blockingIssueNumber, "blockingIssueNumber");
		assertDistinctDependencyNumbers(normalizedIssueNumber, normalizedBlockingNumber);
		const [issue, blockingIssue] = await Promise.all([
			this.ensureIssueOpen(normalizedIssueNumber, signal),
			this.ensureIssueOpen(normalizedBlockingNumber, signal),
		]);
		return this.removeIssueDependencyByIssueResponses(issue, blockingIssue, signal);
	}

	async removeIssueDependencyByIssueResponses(issue: GitHubIssueResponse, blockingIssue: GitHubIssueResponse, signal?: AbortSignal): Promise<GitHubIssueDependencyMutationResult> {
		const { issueNumber, blockingIssueId } = this.resolveIssueDependencyIdentities(issue, blockingIssue);
		const existing = await this.findIssueDependency(issueNumber, "blocked_by", blockingIssueId, signal);
		if (!existing.issue && existing.complete) return { status: "already_absent", issue, blockingIssue, blockingIssueId };
		try {
			const response = await this.request<GitHubIssueResponse | undefined>("DELETE", this.repoPath(issueDependencyRemovalPath(issueNumber, blockingIssueId)), {
				signal,
				validate: (value) => value === undefined || isIssueDependencyMember(value),
				mutation: true,
			});
			return { status: "removed", issue, blockingIssue: response ?? existing.issue ?? blockingIssue, blockingIssueId };
		} catch (error) {
			if (isIssueDependencyRemovalNotFound(error)) return { status: "already_absent", issue, blockingIssue, blockingIssueId, inferred: true };
			throw mapIssueDependencyMutationError(error, "remove") ?? error;
		}
	}

	async listRelatedIssues(issueNumber: number, options: GitHubContinuationReadOptions = {}, signal?: AbortSignal): Promise<GitHubRelatedIssueListResult> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const limit = normalizePaginationLimit(options.limit);
		const binding = this.continuationBinding("related_issues", { issueNumber: normalizedIssueNumber });
		const start = decodeContinuationToken(options.after, binding, "rest");
		const result = await this.paginateRelatedIssues(normalizedIssueNumber, { limit, maxPages: options.maxPages, start: restContinuationStart(start) }, signal);
		return { issues: result.items, truncated: result.truncated, continuation: restContinuation(binding, result, start !== undefined) };
	}

	async findRelatedIssue(issueNumber: number, relatedIssueId: number, signal?: AbortSignal): Promise<GitHubIssueDependencyLookup> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const result = await this.paginateRelatedIssues(normalizedIssueNumber, { limit: 1, maxPages: RELATED_ISSUE_PREFLIGHT_PAGE_CAP, filter: (issue) => issue.id === relatedIssueId }, signal);
		const issue = result.items[0];
		return { ...(issue ? { issue } : {}), complete: issue !== undefined || !result.truncated };
	}

	async addRelatedIssue(issueNumber: number, relatedIssueNumber: number, signal?: AbortSignal): Promise<GitHubRelatedIssueMutationResult> {
		const [issue, relatedIssue] = await this.fetchRelatedIssuePair(issueNumber, relatedIssueNumber, signal);
		return this.addRelatedIssueByIssueResponses(issue, relatedIssue, signal);
	}

	async addRelatedIssueByIssueResponses(issue: GitHubIssueResponse, relatedIssue: GitHubIssueResponse, signal?: AbortSignal): Promise<GitHubRelatedIssueMutationResult> {
		const { issueNumber, relatedIssueId } = this.resolveRelatedIssueIdentities(issue, relatedIssue);
		const existing = await this.findRelatedIssue(issueNumber, relatedIssueId, signal);
		if (existing.issue) return { status: "already_present", issue, relatedIssue: existing.issue, relatedIssueId };
		let response: GitHubIssueResponse;
		try {
			response = await this.request<GitHubIssueResponse>("POST", this.repoPath(relatedIssuesPath(issueNumber)), {
				body: { issue_id: relatedIssueId },
				signal,
				validate: isRelatedIssueMember,
				mutation: true,
			});
		} catch (error) {
			throw mapRelatedIssueMutationError(error, "add") ?? error;
		}
		return { status: "added", issue, relatedIssue: response, relatedIssueId };
	}

	async removeRelatedIssue(issueNumber: number, relatedIssueNumber: number, signal?: AbortSignal): Promise<GitHubRelatedIssueMutationResult> {
		const [issue, relatedIssue] = await this.fetchRelatedIssuePair(issueNumber, relatedIssueNumber, signal);
		return this.removeRelatedIssueByIssueResponses(issue, relatedIssue, signal);
	}

	async removeRelatedIssueByIssueResponses(issue: GitHubIssueResponse, relatedIssue: GitHubIssueResponse, signal?: AbortSignal): Promise<GitHubRelatedIssueMutationResult> {
		const { issueNumber, relatedIssueId } = this.resolveRelatedIssueIdentities(issue, relatedIssue);
		const existing = await this.findRelatedIssue(issueNumber, relatedIssueId, signal);
		if (!existing.issue && existing.complete) return { status: "already_absent", issue, relatedIssue, relatedIssueId };
		try {
			const response = await this.request<GitHubIssueResponse | undefined>("DELETE", this.repoPath(relatedIssueRemovalPath(issueNumber, relatedIssueId)), {
				signal,
				validate: (value) => value === undefined || isRelatedIssueMember(value),
				mutation: true,
			});
			return { status: "removed", issue, relatedIssue: response ?? existing.issue ?? relatedIssue, relatedIssueId };
		} catch (error) {
			if (isRelatedIssueRemovalNotFound(error)) return { status: "already_absent", issue, relatedIssue, relatedIssueId, inferred: true };
			throw mapRelatedIssueMutationError(error, "remove") ?? error;
		}
	}

	private async fetchRelatedIssuePair(issueNumber: number, relatedIssueNumber: number, signal?: AbortSignal): Promise<[GitHubIssueResponse, GitHubIssueResponse]> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const normalizedRelatedNumber = normalizePositiveIssueNumber(relatedIssueNumber, "relatedIssueNumber");
		assertDistinctRelatedNumbers(normalizedIssueNumber, normalizedRelatedNumber);
		return Promise.all([this.ensureIssueOpen(normalizedIssueNumber, signal), this.ensureIssueOpen(normalizedRelatedNumber, signal)]);
	}

	private resolveRelatedIssueIdentities(issue: GitHubIssueResponse, relatedIssue: GitHubIssueResponse): { issueNumber: number; relatedIssueId: number } {
		const issueNumber = normalizePositiveIssueNumber(typeof issue.number === "number" ? issue.number : undefined, "issueNumber");
		const relatedIssueNumber = normalizePositiveIssueNumber(typeof relatedIssue.number === "number" ? relatedIssue.number : undefined, "relatedIssueNumber");
		assertDistinctRelatedNumbers(issueNumber, relatedIssueNumber);
		assertDependencyTargetIsIssue(issue, "issueNumber");
		assertDependencyTargetIsIssue(relatedIssue, "relatedIssueNumber");
		return { issueNumber, relatedIssueId: requireIssueDatabaseId(relatedIssue, "related issue") };
	}

	private async paginateRelatedIssues(
		issueNumber: number,
		options: PaginationOptions & { filter?: (issue: GitHubIssueResponse) => boolean },
		signal?: AbortSignal,
	): Promise<PaginatedCollection<GitHubIssueResponse>> {
		try {
			return await this.paginateFiltered<GitHubIssueResponse>(this.repoPath(relatedIssuesPath(issueNumber)), { per_page: String(Math.min(options.limit ?? 100, 100)) }, signal, {
				...options,
				assertItem: assertIssueDependencyMember,
			});
		} catch (error) {
			throw mapRelatedIssueReadError(error) ?? error;
		}
	}

	private resolveIssueDependencyIdentities(issue: GitHubIssueResponse, blockingIssue: GitHubIssueResponse): { issueNumber: number; blockingIssueId: number } {
		const issueNumber = normalizePositiveIssueNumber(typeof issue.number === "number" ? issue.number : undefined, "issueNumber");
		const blockingIssueNumber = normalizePositiveIssueNumber(typeof blockingIssue.number === "number" ? blockingIssue.number : undefined, "blockingIssueNumber");
		assertDistinctDependencyNumbers(issueNumber, blockingIssueNumber);
		assertDependencyTargetIsIssue(issue, "issueNumber");
		assertDependencyTargetIsIssue(blockingIssue, "blockingIssueNumber");
		return { issueNumber, blockingIssueId: requireIssueDatabaseId(blockingIssue, "blocking issue") };
	}

	private async paginateIssueDependencies(
		issueNumber: number,
		direction: IssueDependencyDirection,
		options: PaginationOptions & { filter?: (issue: GitHubIssueResponse) => boolean },
		signal?: AbortSignal,
	): Promise<PaginatedCollection<GitHubIssueResponse>> {
		try {
			return await this.paginateFiltered<GitHubIssueResponse>(this.repoPath(issueDependencyPath(issueNumber, direction)), { per_page: String(Math.min(options.limit ?? 100, 100)) }, signal, {
				...options,
				assertItem: assertIssueDependencyMember,
			});
		} catch (error) {
			throw mapIssueDependencyReadError(error) ?? error;
		}
	}

	private continuationBinding(collection: string, filters: Record<string, unknown>): ContinuationBinding {
		return { collection, repository: this.repository.fullName, filters };
	}

	async updateIssue(issueNumber: number, input: IssueUpdateInput, signal?: AbortSignal, preflight?: GitHubIssueCollectionPreflight): Promise<GitHubIssueResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const normalizedInput = normalizeIssueUpdateInput(input);
		assertCollectionItemLimit(normalizedInput.labels, "labels", MAX_TOOL_LABELS);
		assertCollectionItemLimit(normalizedInput.assignees, "assignees", MAX_TOOL_ASSIGNEES);
		await this.ensureIssueOpen(normalizedIssueNumber, signal);
		if (normalizedInput.labels !== undefined) await this.assertRepositoryLabelsExist(normalizedInput.labels, signal, preflight);
		if (normalizedInput.assignees !== undefined) await this.assertRepositoryAssigneesAssignable(normalizedInput.assignees, signal, preflight);
		return this.request<GitHubIssueResponse>("PATCH", this.repoPath(`/issues/${normalizedIssueNumber}`), {
			body: compactObject(normalizedInput),
			signal,
			validate: isObject,
			mutation: true,
		});
	}

	async addComment(issueNumber: number, body: string, signal?: AbortSignal): Promise<GitHubCommentResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		await this.ensureIssueOpen(normalizedIssueNumber, signal);
		return this.request<GitHubCommentResponse>("POST", this.repoPath(`/issues/${normalizedIssueNumber}/comments`), {
			body: { body },
			signal,
			validate: isObject,
			mutation: true,
		});
	}

	async updateComment(issueNumber: number, commentId: number, body: string, signal?: AbortSignal): Promise<GitHubCommentResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const normalizedCommentId = normalizePositiveCommentId(commentId, "commentId");
		await this.ensureCommentTargetsOpenIssue(normalizedIssueNumber, normalizedCommentId, signal);
		return this.request<GitHubCommentResponse>("PATCH", this.repoPath(`/issues/comments/${normalizedCommentId}`), {
			body: { body },
			signal,
			validate: isObject,
			mutation: true,
		});
	}

	async deleteComment(issueNumber: number, commentId: number, signal?: AbortSignal): Promise<GitHubCommentResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const normalizedCommentId = normalizePositiveCommentId(commentId, "commentId");
		const { comment } = await this.ensureCommentTargetsOpenIssue(normalizedIssueNumber, normalizedCommentId, signal);
		await this.request<void>("DELETE", this.repoPath(`/issues/comments/${normalizedCommentId}`), {
			signal,
			validate: (value) => value === undefined,
			mutation: true,
		});
		return comment;
	}

	async isRepositoryAssigneeAssignable(login: string, signal?: AbortSignal): Promise<boolean> {
		try {
			await this.request<void>("GET", this.repoPath(`/assignees/${encodeURIComponent(login)}`), { signal, validate: (value) => value === undefined });
			return true;
		} catch (error) {
			if (error instanceof GitHubApiError && error.status === 404) return false;
			throw error;
		}
	}

	async addAssignees(issueNumber: number, assignees: string[], signal?: AbortSignal, preflight?: GitHubIssueCollectionPreflight): Promise<GitHubIssueResponse> {
		assertCollectionItemLimit(assignees, "assignees", MAX_TOOL_ASSIGNEES);
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		await this.ensureIssueOpen(normalizedIssueNumber, signal);
		await this.assertRepositoryAssigneesAssignable(assignees, signal, preflight);
		return this.request<GitHubIssueResponse>("POST", this.repoPath(`/issues/${normalizedIssueNumber}/assignees`), {
			body: { assignees },
			signal,
			validate: isObject,
			mutation: true,
		});
	}

	async removeAssignees(issueNumber: number, assignees: string[], signal?: AbortSignal): Promise<GitHubIssueResponse> {
		assertCollectionItemLimit(assignees, "assignees", MAX_TOOL_ASSIGNEES);
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		await this.ensureIssueOpen(normalizedIssueNumber, signal);
		return this.request<GitHubIssueResponse>("DELETE", this.repoPath(`/issues/${normalizedIssueNumber}/assignees`), {
			body: { assignees },
			signal,
			validate: isObject,
			mutation: true,
		});
	}

	async setAssignees(issueNumber: number, assignees: string[], signal?: AbortSignal, preflight?: GitHubIssueCollectionPreflight): Promise<GitHubIssueResponse> {
		return this.updateIssue(issueNumber, { assignees }, signal, preflight);
	}

	async addLabels(issueNumber: number, labels: string[], signal?: AbortSignal, preflight?: GitHubIssueCollectionPreflight): Promise<GitHubLabelListResponse> {
		assertCollectionItemLimit(labels, "labels", MAX_TOOL_LABELS);
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		await this.ensureIssueSupportsLabelMutation(normalizedIssueNumber, signal);
		await this.assertRepositoryLabelsExist(labels, signal, preflight);
		return this.request<GitHubLabelListResponse>("POST", this.repoPath(`/issues/${normalizedIssueNumber}/labels`), {
			body: { labels },
			signal,
			validate: Array.isArray,
			mutation: true,
		});
	}

	async setLabels(issueNumber: number, labels: string[], signal?: AbortSignal, preflight?: GitHubIssueCollectionPreflight): Promise<GitHubLabelListResponse> {
		assertCollectionItemLimit(labels, "labels", MAX_TOOL_LABELS);
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		await this.ensureIssueSupportsLabelMutation(normalizedIssueNumber, signal);
		await this.assertRepositoryLabelsExist(labels, signal, preflight);
		return this.request<GitHubLabelListResponse>("PUT", this.repoPath(`/issues/${normalizedIssueNumber}/labels`), {
			body: { labels },
			signal,
			validate: Array.isArray,
			mutation: true,
		});
	}

	async removeLabel(issueNumber: number, label: string, signal?: AbortSignal): Promise<GitHubLabelListResponse | undefined> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		await this.ensureIssueSupportsLabelMutation(normalizedIssueNumber, signal);
		try {
			return await this.request<GitHubLabelListResponse | undefined>(
				"DELETE",
				this.repoPath(`/issues/${normalizedIssueNumber}/labels/${encodeURIComponent(label)}`),
				{ signal, validate: (value) => value === undefined || Array.isArray(value), mutation: true },
			);
		} catch (error) {
			if (error instanceof GitHubApiError && error.status === 404) return undefined;
			throw error;
		}
	}

	async closeIssue(issueNumber: number, input: IssueCloseInput = {}, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		await this.ensureIssueOpen(normalizedIssueNumber, signal);
		return this.request<GitHubIssueResponse>("PATCH", this.repoPath(`/issues/${normalizedIssueNumber}`), {
			body: compactObject({ state: "closed", state_reason: input.reason }),
			signal,
			validate: isObject,
			mutation: true,
		});
	}

	async reopenIssue(issueNumber: number, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		return this.request<GitHubIssueResponse>("PATCH", this.repoPath(`/issues/${normalizedIssueNumber}`), {
			body: { state: "open", state_reason: "reopened" },
			signal,
			validate: isObject,
			mutation: true,
		});
	}

	async ensureIssueOpen(issueNumber: number, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const issue = await this.getIssue(normalizedIssueNumber, signal);
		if (issue.state !== "open") {
			throw new ClosedIssueMutationError(normalizedIssueNumber, typeof issue.state === "string" ? issue.state : "unknown", issueResponseToSafeSummary(this.repository.fullName, issue, normalizedIssueNumber));
		}
		return issue;
	}

	private async ensureIssueSupportsLabelMutation(issueNumber: number, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		const issue = await this.getIssue(issueNumber, signal);
		if (issue.state === "open" || issue.state === "closed") return issue;
		throw new GitHubApiError("GitHub REST API returned an issue without a valid open/closed state.", {
			code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID,
			path: this.repoPath(`/issues/${issueNumber}`),
		});
	}

	private async ensureCommentTargetsOpenIssue(
		issueNumber: number,
		commentId: number,
		signal?: AbortSignal,
	): Promise<{ issue: GitHubIssueResponse; comment: GitHubCommentResponse }> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const normalizedCommentId = normalizePositiveCommentId(commentId, "commentId");
		const issue = await this.ensureIssueOpen(normalizedIssueNumber, signal);
		const comment = await this.getIssueComment(normalizedCommentId, signal);
		if (!commentBelongsToIssue(this.repository, comment, normalizedIssueNumber, normalizedCommentId)) {
			throw new IssueMeError(
				ISSUEME_ERROR_CODES.COMMENT_ISSUE_MISMATCH,
				`Comment ${normalizedCommentId} does not belong to issue #${normalizedIssueNumber}; refusing to mutate it.`,
				{ issueNumber: normalizedIssueNumber, id: normalizedCommentId },
			);
		}
		return { issue, comment };
	}

	private async ensureProjectV2AllowedForAdd(
		projectId: string,
		policy: ReturnType<typeof normalizeProjectV2AddValidationPolicy>,
		signal?: AbortSignal,
	): Promise<void> {
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeValidateProjectV2ForAdd",
			buildProjectV2AddValidationQuery(),
			{ projectId },
			signal,
		);
		assertProjectV2AllowedForAdd(data, { projectId, policy, repository: this.repository });
	}

	private async ensureProjectV2ItemTargetsIssue(
		input: { projectId: string; itemId: string; issueNumber: number },
		statePolicy: ProjectV2ItemIssueStatePolicy,
		signal?: AbortSignal,
	): Promise<void> {
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeValidateProjectV2ItemForUpdate",
			buildProjectV2ItemValidationQuery(),
			{ itemId: input.itemId },
			signal,
			false,
			isProjectV2NodeNotFoundError,
		);
		assertProjectV2ItemTargetsIssue(data, input, this.repository.fullName, statePolicy);
	}

	/** Project-only metadata actions accept closed issues under the approved policy; everything else keeps the open-issue guard. */
	private async ensureIssueForProjectItemMutation(issueNumber: number, statePolicy: ProjectV2ItemIssueStatePolicy, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		if (statePolicy === "open_only") return this.ensureIssueOpen(issueNumber, signal);
		return this.getIssue(normalizePositiveIssueNumber(issueNumber, "issueNumber"), signal);
	}

	private async mutateSubIssueRelationship(
		action: "add" | "remove",
		parentIssueId: string,
		childIssueId: string,
		signal?: AbortSignal,
	): Promise<NativeSubIssueMutationResult> {
		const mutationName = action === "add" ? "IssueMeAddSubIssue" : "IssueMeRemoveSubIssue";
		const mutationField = action === "add" ? "addSubIssue" : "removeSubIssue";
		const data = await this.graphqlRequest<Record<string, unknown>>(
			mutationName,
			`mutation ${mutationName}($issueId: ID!, $subIssueId: ID!) {
				${mutationField}(input: {issueId: $issueId, subIssueId: $subIssueId}) {
					issue { id number title state url author { login } }
					subIssue { id number title state url author { login } }
				}
			}`,
			{ issueId: parentIssueId, subIssueId: childIssueId },
			signal,
			true,
		);
		return normalizeSubIssueMutationResult(data, mutationField, this.repository.fullName);
	}

	private async reprioritizeSubIssue(
		parentIssueId: string,
		child: NativeSubIssueSummary,
		position: { beforeId?: string; afterId?: string },
		signal?: AbortSignal,
	): Promise<NativeSubIssueMutationResult> {
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeReprioritizeSubIssue",
			`mutation IssueMeReprioritizeSubIssue($issueId: ID!, $subIssueId: ID!, $beforeId: ID, $afterId: ID) {
				reprioritizeSubIssue(input: {issueId: $issueId, subIssueId: $subIssueId, beforeId: $beforeId, afterId: $afterId}) {
					issue { id number title state url author { login } }
				}
			}`,
			compactObject({ issueId: parentIssueId, subIssueId: child.id, beforeId: position.beforeId, afterId: position.afterId }),
			signal,
			true,
		);
		return normalizeReprioritizeSubIssueResult(data, this.repository.fullName, child);
	}

	private async assertRepositoryLabelsExist(labels: string[], signal?: AbortSignal, preflight?: GitHubIssueCollectionPreflight): Promise<void> {
		const validated = this.mutableIssueCollectionPreflight(preflight)?.labels;
		const missing: string[] = [];
		await mapSequentially(new Set(labels), async (label) => {
			if (validated?.has(label)) return;
			const existing = await this.getRepositoryLabel(label, signal);
			if (existing) validated?.add(label);
			else missing.push(label);
		});
		if (missing.length > 0) {
			throw new IssueMeError(
				ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
				`Issue labels must already exist in repository ${this.repository.fullName}; missing label(s): ${missing.join(", ")}.`,
				{ field: "labels", repository: this.repository.fullName, missingLabels: missing },
				{ recoveryHint: "Use issueme_list_labels to discover existing labels or issueme_manage_label to create repository labels before applying them to issues." },
			);
		}
	}

	private async assertRepositoryAssigneesAssignable(assignees: string[], signal?: AbortSignal, preflight?: GitHubIssueCollectionPreflight): Promise<void> {
		const validated = this.mutableIssueCollectionPreflight(preflight)?.assignees;
		const invalid: string[] = [];
		await mapSequentially(new Set(assignees), async (assignee) => {
			if (validated?.has(assignee)) return;
			if (await this.isRepositoryAssigneeAssignable(assignee, signal)) validated?.add(assignee);
			else invalid.push(assignee);
		});
		if (invalid.length > 0) {
			throw new IssueMeError(
				ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
				`Issue assignees must be assignable users in repository ${this.repository.fullName}; invalid assignee(s): ${invalid.join(", ")}.`,
				{ field: "assignees", repository: this.repository.fullName, invalidAssignees: invalid },
				{ recoveryHint: "Use issueme_list_assignees to discover users assignable to this repository before applying assignees." },
			);
		}
	}

	private mutableIssueCollectionPreflight(preflight: GitHubIssueCollectionPreflight | undefined): MutableGitHubIssueCollectionPreflight | undefined {
		if (!preflight || !this.issueCollectionPreflights.has(preflight)) return undefined;
		return preflight as MutableGitHubIssueCollectionPreflight;
	}

	private async graphqlRequest<T>(operationName: string, query: string, variables: Record<string, unknown>, signal?: AbortSignal, mutation = false, tolerateError?: (error: unknown) => boolean): Promise<T> {
		return this.transport.graphqlRequest<T>(operationName, query, variables, signal, mapGitHubGraphQLError, mutation, tolerateError);
	}

	private repoPath(path: string): string {
		return this.transport.repoPath(path);
	}

	private async paginate<T>(
		path: string,
		query: Record<string, string>,
		signal?: AbortSignal,
		options: PaginationOptions = {},
	): Promise<T[]> {
		return this.transport.paginate<T>(path, query, signal, options);
	}

	private async paginateFiltered<T>(
		path: string,
		query: Record<string, string>,
		signal?: AbortSignal,
		options: PaginationOptions & { filter?: (item: T) => boolean; assertItem?: (item: T, path: string) => void } = {},
	): Promise<PaginatedCollection<T>> {
		return this.transport.paginateFiltered<T>(path, query, signal, options);
	}

	private async paginateSearchIssues(
		query: Record<string, string>,
		signal?: AbortSignal,
		options: PaginationOptions = {},
	): Promise<PaginatedCollection<GitHubIssueResponse> & { totalCount?: number; incompleteResults?: boolean }> {
		const metadata: { totalCount?: number; incompleteResults?: boolean } = {};
		const start = this.transport.buildPaginationStart("/search/issues", query, options.start);
		const result = await this.transport.paginateCollection<GitHubIssueResponse>(
			start,
			(url) => this.readIssueSearchPage(url, signal, metadata),
			{ limit: options.limit, maxPages: options.maxPages, filter: (issue) => !isPullRequestIssueResponse(issue) },
		);
		const truncated = result.truncated || isIssueSearchTotalTruncated(result.items.length, options.limit, metadata.totalCount);
		return issueSearchPaginationResult({ ...result, truncated }, metadata.totalCount, metadata.incompleteResults);
	}

	private async readIssueSearchPage(nextUrl: string, signal: AbortSignal | undefined, metadata: { totalCount?: number; incompleteResults?: boolean }): Promise<IssueSearchPageReadResult> {
		this.transport.assertAllowedPaginationUrl(nextUrl);
		const response = await this.requestWithHeaders<unknown>("GET", nextUrl, {
			signal,
			alreadyAbsolute: true,
			validate: isIssueSearchResponse,
		});
		if (!isIssueSearchResponse(response.data)) {
			throw new GitHubApiError("GitHub issue search returned an unexpected response shape.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID });
		}
		const page = normalizeIssueSearchResponse(response.data);
		metadata.totalCount ??= page.totalCount;
		metadata.incompleteResults ??= page.incompleteResults;
		return { items: page.items, nextUrl: parseNextLink(response.headers.get("link")) };
	}

	private async request<T>(
		method: string,
		pathOrUrl: string,
		options: { body?: unknown; signal?: AbortSignal; alreadyAbsolute?: boolean; validate?: (value: unknown) => boolean; mutation?: boolean } = {},
	): Promise<T> {
		return this.transport.request<T>(method, pathOrUrl, options);
	}

	private async requestWithHeaders<T>(
		method: string,
		pathOrUrl: string,
		options: { body?: unknown; signal?: AbortSignal; alreadyAbsolute?: boolean; validate?: (value: unknown) => boolean } = {},
	): Promise<{ data: T; headers: Headers }> {
		return this.transport.requestWithHeaders<T>(method, pathOrUrl, options);
	}
}

function isRepositoryLabelMutationResponse(value: unknown): boolean {
	return isObject(value) && typeof value.name === "string" && value.name.trim().length > 0;
}

function isRepositoryMilestoneMutationResponse(value: unknown): boolean {
	if (!isObject(value)) return false;
	const validNumber = typeof value.number === "number" && Number.isSafeInteger(value.number) && value.number > 0;
	const validTitle = typeof value.title === "string" && value.title.trim().length > 0;
	const validState = value.state === "open" || value.state === "closed";
	return validNumber && validTitle && validState;
}

function isIssueSearchTotalTruncated(valuesLength: number, limit: number | undefined, totalCount: number | undefined): boolean {
	return limit !== undefined && totalCount !== undefined && totalCount > valuesLength;
}

function issueSearchPaginationResult(
	collection: PaginatedCollection<GitHubIssueResponse>,
	totalCount: number | undefined,
	incompleteResults: boolean | undefined,
): PaginatedCollection<GitHubIssueResponse> & { totalCount?: number; incompleteResults?: boolean } {
	const result: PaginatedCollection<GitHubIssueResponse> & { totalCount?: number; incompleteResults?: boolean } = { ...collection };
	if (typeof totalCount === "number") result.totalCount = totalCount;
	if (typeof incompleteResults === "boolean") result.incompleteResults = incompleteResults;
	return result;
}

function normalizeCommentSinceFilter(value: string | undefined): string | undefined {
	return normalizeOptionalIsoDateOrTimestamp(value, "since", { invalidMessage: "since must be a valid ISO YYYY-MM-DD date or ISO 8601 timestamp with timezone." });
}

function restContinuation(binding: ContinuationBinding, result: PaginatedCollection<unknown>, resumed: boolean): GitHubContinuation {
	return buildContinuation(binding, restNextPosition(result.next), result.pagesRead, resumed, !result.truncated);
}

/** Page size changes between calls are allowed because continuation stores an absolute index, so it is excluded from the filter fingerprint. */
function withoutPageSize(query: Record<string, string>): Record<string, unknown> {
	return Object.fromEntries(Object.entries(query).filter(([key]) => key !== "per_page" && key !== "page"));
}

function visibleProjectV2Summary(node: unknown, includeClosed: boolean): ToolProjectSummary | undefined {
	const project = requireProjectV2Summary(node);
	if (includeClosed || project.closed !== true) return project;
	return undefined;
}
