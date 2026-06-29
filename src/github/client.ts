import { GITHUB_API_BASE_URL, GITHUB_API_VERSION, MAX_TOOL_DEVELOPMENT_LINKS, MAX_TOOL_ISSUES, MAX_TOOL_PROJECTS } from "../constants.ts";
import { ClosedIssueMutationError, GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { GitHubCommentResponse, GitHubIssueResponse, GitHubLabelListResponse, GitHubLabelResponse, GitHubMilestoneResponse, GitHubRepository, GitHubUserResponse, IssueRelationshipSummary, ProjectV2OwnerType, ToolIssueDevelopmentLinkSummary, ToolIssueSummary, ToolProjectFieldOptionSummary, ToolProjectFieldSummary, ToolProjectItemSummary, ToolProjectIterationSummary, ToolProjectSummary } from "../types.ts";
import { isValidIsoDateOnly } from "../utils/date.ts";
import { redactSecrets } from "../utils/env.ts";
import { normalizeBoundedInteger, normalizeOptionalGitHubOpaqueId, normalizeOptionalIsoDateOrTimestamp, normalizeOptionalLowercaseTextFilter, normalizeOptionalTrimmedText, normalizePositiveSafeInteger, normalizeRequiredGitHubOpaqueId } from "../utils/validation.ts";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface GitHubClientOptions {
	repository: GitHubRepository;
	token: string;
	fetchFn?: FetchLike;
	baseUrl?: string;
	userAgent?: string;
}

export interface IssueCreateInput {
	title: string;
	body?: string;
	labels?: string[];
	assignees?: string[];
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
}

export interface IssueCloseInput {
	reason?: GitHubIssueCloseReason;
}

export interface PaginationOptions {
	limit?: number;
}

export type GitHubIssueListState = "open" | "closed" | "all";
export type GitHubIssueListSort = "created" | "updated" | "comments";
export type GitHubIssueListDirection = "asc" | "desc";

export interface GitHubIssueListFilters extends PaginationOptions {
	state?: GitHubIssueListState;
	labels?: string[];
	assignee?: string;
	creator?: string;
	mentioned?: string;
	milestone?: string;
	since?: string;
	sort?: GitHubIssueListSort;
	direction?: GitHubIssueListDirection;
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
}

export interface GitHubRepositoryLabelListFilters extends PaginationOptions {
	name?: string;
	query?: string;
}

export interface GitHubRepositoryLabelListResult {
	labels: GitHubLabelResponse[];
	truncated: boolean;
}

export type GitHubMilestoneListState = "open" | "closed" | "all";
export type GitHubMilestoneListSort = "due_on" | "completeness";
export type GitHubMilestoneListDirection = "asc" | "desc";

export interface GitHubRepositoryMilestoneListFilters extends PaginationOptions {
	state?: GitHubMilestoneListState;
	sort?: GitHubMilestoneListSort;
	direction?: GitHubMilestoneListDirection;
}

export interface GitHubRepositoryMilestoneListResult {
	milestones: GitHubMilestoneResponse[];
	truncated: boolean;
}

export interface GitHubRepositoryAssigneeListFilters extends PaginationOptions {
	login?: string;
	query?: string;
}

export type GitHubProjectV2Scope = ProjectV2OwnerType;

export interface GitHubProjectV2ListFilters extends PaginationOptions {
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
}

export interface GitHubProjectV2FieldListFilters {
	projectId?: string;
	scope?: GitHubProjectV2Scope;
	owner?: string;
	projectNumber?: number;
	fieldLimit?: number;
	optionLimit?: number;
	iterationLimit?: number;
}

export interface GitHubProjectV2FieldListResult {
	project: ToolProjectSummary;
	fields: ToolProjectFieldSummary[];
	truncated: boolean;
}

export interface GitHubProjectV2AddIssueInput {
	projectId: string;
	issueNumber: number;
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

export interface GitHubRepositoryAssigneeListResult {
	assignees: GitHubUserResponse[];
	truncated: boolean;
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
}

export interface NativeSubIssueReorderResult {
	relationship: NativeSubIssueRelationshipResult;
	mutations: NativeSubIssueMutationResult[];
}

export interface GitHubIssueDevelopmentLinksResult {
	issue: NativeSubIssueSummary;
	links: ToolIssueDevelopmentLinkSummary[];
	timelineEventCount: number;
	truncated: boolean;
}

interface GraphQLResponse<T> {
	data?: T | null;
	errors?: unknown;
}

interface GitHubIssueSearchResponse {
	total_count?: unknown;
	incomplete_results?: unknown;
	items?: unknown;
}

interface NormalizedIssueSearchResponse {
	totalCount?: number;
	incompleteResults?: boolean;
	items: GitHubIssueResponse[];
}

interface SubIssueMutationData {
	addSubIssue?: unknown;
	removeSubIssue?: unknown;
	reprioritizeSubIssue?: unknown;
}

interface SubIssueRelationshipData {
	repository?: unknown;
}

interface IssueDevelopmentLinksData {
	repository?: unknown;
}

interface ProjectV2ConnectionData {
	repository?: unknown;
	organization?: unknown;
	user?: unknown;
}

interface ProjectV2FieldsData {
	node?: unknown;
	repository?: unknown;
	organization?: unknown;
	user?: unknown;
}

interface ProjectV2ItemMutationData {
	addProjectV2ItemById?: unknown;
	updateProjectV2ItemFieldValue?: unknown;
}

interface ProjectV2ItemValidationData {
	node?: unknown;
}

interface ProjectV2FieldLimits {
	optionLimit: number;
	iterationLimit: number;
}

// Bound Projects v2 discovery work while still allowing closed-board filtering to scan later pages.
const PROJECTS_V2_LIST_PAGE_CAP = 10;

export class GitHubClient {
	readonly repository: GitHubRepository;
	private readonly token: string;
	private readonly fetchFn: FetchLike;
	private readonly baseUrl: string;
	private readonly userAgent: string;

	constructor(options: GitHubClientOptions) {
		this.repository = options.repository;
		this.token = options.token;
		this.fetchFn = options.fetchFn ?? fetch;
		this.baseUrl = options.baseUrl ?? GITHUB_API_BASE_URL;
		this.userAgent = options.userAgent ?? "IssueMe Pi extension";
	}

	async listOpenIssues(signal?: AbortSignal): Promise<GitHubIssueResponse[]> {
		return (await this.listIssues({ state: "open" }, signal)).issues;
	}

	async listIssues(filters: GitHubIssueListFilters = {}, signal?: AbortSignal): Promise<GitHubIssueListResult> {
		const limit = normalizePaginationLimit(filters.limit);
		const query = buildIssueListQuery(filters, limit);
		const result = await this.paginateFiltered<GitHubIssueResponse>(this.repoPath("/issues"), query, signal, {
			limit,
			filter: (issue) => !isPullRequestIssueResponse(issue),
		});
		return { mode: "list", issues: result.items, truncated: result.truncated };
	}

	async searchIssues(filters: GitHubIssueSearchFilters, signal?: AbortSignal): Promise<GitHubIssueListResult> {
		const limit = normalizePaginationLimit(filters.limit);
		const result = await this.paginateSearchIssues(buildIssueSearchRequestQuery(this.repository.fullName, filters, limit), signal, { limit });
		return {
			mode: "search",
			issues: result.items,
			truncated: result.truncated,
			...(result.totalCount !== undefined ? { totalCount: result.totalCount } : {}),
			...(result.incompleteResults !== undefined ? { incompleteResults: result.incompleteResults } : {}),
		};
	}

	async listLabels(filters: GitHubRepositoryLabelListFilters = {}, signal?: AbortSignal): Promise<GitHubRepositoryLabelListResult> {
		const limit = normalizePaginationLimit(filters.limit);
		const nameFilter = normalizeOptionalTextFilter(filters.name, "label name");
		const queryFilter = normalizeOptionalTextFilter(filters.query, "label query");
		const result = await this.paginateFiltered<GitHubLabelResponse>(this.repoPath("/labels"), buildLabelListQuery(limit), signal, {
			limit,
			filter: (label) => labelMatchesFilters(label, nameFilter, queryFilter),
		});
		return { labels: result.items, truncated: result.truncated };
	}

	async listMilestones(filters: GitHubRepositoryMilestoneListFilters = {}, signal?: AbortSignal): Promise<GitHubRepositoryMilestoneListResult> {
		const limit = normalizePaginationLimit(filters.limit);
		const result = await this.paginateFiltered<GitHubMilestoneResponse>(this.repoPath("/milestones"), buildMilestoneListQuery(filters, limit), signal, { limit });
		return { milestones: result.items, truncated: result.truncated };
	}

	async listAssignees(filters: GitHubRepositoryAssigneeListFilters = {}, signal?: AbortSignal): Promise<GitHubRepositoryAssigneeListResult> {
		const limit = normalizePaginationLimit(filters.limit);
		const loginFilter = normalizeOptionalTextFilter(filters.login, "assignee login");
		const queryFilter = normalizeOptionalTextFilter(filters.query, "assignee query");
		const result = await this.paginateFiltered<GitHubUserResponse>(this.repoPath("/assignees"), buildAssigneeListQuery(limit), signal, {
			limit,
			filter: (assignee) => assigneeMatchesFilters(assignee, loginFilter, queryFilter),
		});
		return { assignees: result.items, truncated: result.truncated };
	}

	async listProjectsV2(filters: GitHubProjectV2ListFilters = {}, signal?: AbortSignal): Promise<GitHubProjectV2ListResult> {
		const scope = normalizeProjectV2Scope(filters.scope);
		const owner = normalizeProjectV2Owner(scope, filters.owner, this.repository);
		const limit = normalizeProjectV2ListLimit(filters.limit);
		const query = normalizeProjectV2Query(filters.query);
		const includeClosed = filters.includeClosed === true;
		const projects: ToolProjectSummary[] = [];
		let after: string | undefined;
		let truncated = false;
		let pagesRead = 0;

		while (projects.length < limit) {
			const listVariables = scope === "repository"
				? compactObject({ owner, repo: this.repository.repo, first: limit, after, query })
				: compactObject({ owner, first: limit, after, query });
			const data = await this.graphqlRequest<ProjectV2ConnectionData>(
				"IssueMeListProjectsV2",
				buildProjectsV2ListQuery(scope),
				listVariables,
				signal,
			);
			pagesRead += 1;
			const connection = extractProjectV2Connection(data, scope);
			const rawProjects = extractConnectionNodes(connection);
			const visibleProjects = rawProjects
				.map(normalizeProjectV2Summary)
				.filter((project): project is ToolProjectSummary => project !== undefined)
				.filter((project) => includeClosed || project.closed !== true);
			const availableSlots = limit - projects.length;
			projects.push(...visibleProjects.slice(0, availableSlots));
			const hasNextPage = connectionHasNextPage(connection);
			const endCursor = connectionEndCursor(connection);
			if (visibleProjects.length > availableSlots) {
				truncated = true;
				break;
			}
			if (projects.length >= limit) {
				truncated = hasNextPage;
				break;
			}
			if (!hasNextPage) break;
			if (pagesRead >= PROJECTS_V2_LIST_PAGE_CAP || !endCursor) {
				truncated = true;
				break;
			}
			after = endCursor;
		}

		return {
			scope,
			owner: scope === "repository" ? this.repository.fullName : owner,
			projects,
			truncated,
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
		const fieldVariables = projectId
			? compactObject({ projectId, fieldsFirst: fieldLimit })
			: scope === "repository"
				? compactObject({ owner, repo: this.repository.repo, projectNumber, fieldsFirst: fieldLimit })
				: compactObject({ owner, projectNumber, fieldsFirst: fieldLimit });
		const data = await this.graphqlRequest<ProjectV2FieldsData>(
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
		const fields = rawFields
			.map((field) => normalizeProjectV2FieldSummary(field, { optionLimit, iterationLimit }))
			.filter((field): field is ToolProjectFieldSummary => field !== undefined)
			.slice(0, fieldLimit);
		return {
			project,
			fields,
			truncated: connectionHasNextPage(fieldsConnection) || rawFields.length > fields.length || fields.some((field) => field.truncated === true),
		};
	}

	async addIssueToProjectV2(input: GitHubProjectV2AddIssueInput, signal?: AbortSignal): Promise<GitHubProjectV2ItemMutationResult> {
		const projectId = normalizeProjectV2IdRequired(input.projectId, "projectId");
		const issueNumber = normalizePositiveIssueNumber(input.issueNumber, "issueNumber");
		const issue = await this.ensureIssueOpen(issueNumber, signal);
		const contentId = requireIssueNodeId(issue, "issue");
		const data = await this.graphqlRequest<ProjectV2ItemMutationData>(
			"IssueMeAddIssueToProjectV2",
			buildAddIssueToProjectV2Mutation(),
			{ projectId, contentId },
			signal,
		);
		return normalizeProjectV2ItemMutationResult(data, "addProjectV2ItemById", this.repository.fullName);
	}

	async updateProjectV2ItemField(input: GitHubProjectV2UpdateItemFieldInput, signal?: AbortSignal): Promise<GitHubProjectV2ItemMutationResult> {
		const projectId = normalizeProjectV2IdRequired(input.projectId, "projectId");
		const itemId = normalizeProjectV2IdRequired(input.itemId, "itemId");
		const fieldId = normalizeProjectV2IdRequired(input.fieldId, "fieldId");
		const issueNumber = normalizePositiveIssueNumber(input.issueNumber, "issueNumber");
		await this.ensureIssueOpen(issueNumber, signal);
		await this.ensureProjectV2ItemTargetsIssue({ projectId, itemId, issueNumber }, signal);
		const value = normalizeProjectV2FieldValueInput(input.value);
		const data = await this.graphqlRequest<ProjectV2ItemMutationData>(
			"IssueMeUpdateProjectV2ItemFieldValue",
			buildUpdateProjectV2ItemFieldValueMutation(),
			{ projectId, itemId, fieldId, value },
			signal,
		);
		return normalizeProjectV2ItemMutationResult(data, "updateProjectV2ItemFieldValue", this.repository.fullName);
	}

	async createRepositoryMilestone(input: GitHubRepositoryMilestoneCreateInput, signal?: AbortSignal): Promise<GitHubMilestoneResponse> {
		return this.request<GitHubMilestoneResponse>("POST", this.repoPath("/milestones"), {
			body: compactObject(input),
			signal,
			validate: isObject,
		});
	}

	async updateRepositoryMilestone(number: number, input: GitHubRepositoryMilestoneUpdateInput, signal?: AbortSignal): Promise<GitHubMilestoneResponse> {
		return this.request<GitHubMilestoneResponse>("PATCH", this.repoPath(`/milestones/${number}`), {
			body: compactObject(input),
			signal,
			validate: isObject,
		});
	}

	async deleteRepositoryMilestone(number: number, signal?: AbortSignal): Promise<void> {
		await this.request<void>("DELETE", this.repoPath(`/milestones/${number}`), {
			signal,
			validate: (value) => value === undefined,
		});
	}

	async createRepositoryLabel(input: GitHubRepositoryLabelCreateInput, signal?: AbortSignal): Promise<GitHubLabelResponse> {
		return this.request<GitHubLabelResponse>("POST", this.repoPath("/labels"), {
			body: compactObject(input),
			signal,
			validate: isObject,
		});
	}

	async updateRepositoryLabel(name: string, input: GitHubRepositoryLabelUpdateInput, signal?: AbortSignal): Promise<GitHubLabelResponse> {
		return this.request<GitHubLabelResponse>("PATCH", this.repoPath(`/labels/${encodeURIComponent(name)}`), {
			body: compactObject(input),
			signal,
			validate: isObject,
		});
	}

	async deleteRepositoryLabel(name: string, signal?: AbortSignal): Promise<void> {
		await this.request<void>("DELETE", this.repoPath(`/labels/${encodeURIComponent(name)}`), {
			signal,
			validate: (value) => value === undefined,
		});
	}

	async getIssue(issueNumber: number, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		return this.request<GitHubIssueResponse>("GET", this.repoPath(`/issues/${issueNumber}`), { signal, validate: isObject });
	}

	async listComments(issueNumber: number, signal?: AbortSignal, options: PaginationOptions = {}): Promise<GitHubCommentResponse[]> {
		return this.paginate<GitHubCommentResponse>(
			this.repoPath(`/issues/${issueNumber}/comments`),
			{ per_page: String(Math.min(options.limit ?? 100, 100)) },
			signal,
			options,
		);
	}

	async getIssueComment(commentId: number, signal?: AbortSignal): Promise<GitHubCommentResponse> {
		return this.request<GitHubCommentResponse>("GET", this.repoPath(`/issues/comments/${commentId}`), { signal, validate: isObject });
	}

	async createIssue(input: IssueCreateInput, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		return this.request<GitHubIssueResponse>("POST", this.repoPath("/issues"), {
			body: compactObject(input),
			signal,
			validate: isObject,
		});
	}

	async addSubIssue(parentNumber: number, childNumber: number, signal?: AbortSignal): Promise<NativeSubIssueMutationResult> {
		const [parentIssue, childIssue] = await Promise.all([
			this.ensureIssueOpen(parentNumber, signal),
			this.ensureIssueOpen(childNumber, signal),
		]);
		return this.addSubIssueByIssueResponses(parentIssue, childIssue, signal);
	}

	async addSubIssueByIssueResponses(parentIssue: GitHubIssueResponse, childIssue: GitHubIssueResponse, signal?: AbortSignal): Promise<NativeSubIssueMutationResult> {
		return this.mutateSubIssueRelationship("add", requireIssueNodeId(parentIssue, "parent issue"), requireIssueNodeId(childIssue, "child issue"), signal);
	}

	async removeSubIssue(parentNumber: number, childNumber: number, signal?: AbortSignal): Promise<NativeSubIssueMutationResult> {
		const [parentIssue, childIssue] = await Promise.all([
			this.ensureIssueOpen(parentNumber, signal),
			this.ensureIssueOpen(childNumber, signal),
		]);
		return this.mutateSubIssueRelationship("remove", requireIssueNodeId(parentIssue, "parent issue"), requireIssueNodeId(childIssue, "child issue"), signal);
	}

	async reorderSubIssues(parentNumber: number, orderedChildNumbers: number[], signal?: AbortSignal): Promise<NativeSubIssueReorderResult> {
		const normalizedParentNumber = normalizePositiveIssueNumber(parentNumber, "parentNumber");
		const desiredNumbers = normalizeSubIssueReorderNumbers(orderedChildNumbers, normalizedParentNumber);
		const parentIssue = await this.ensureIssueOpen(normalizedParentNumber, signal);
		const parentIssueId = requireIssueNodeId(parentIssue, "parent issue");
		const relationship = await this.listSubIssueRelationships(normalizedParentNumber, { limit: MAX_TOOL_ISSUES }, signal);
		assertReorderableSubIssueList(this.repository.fullName, normalizedParentNumber, desiredNumbers, relationship);

		const issueByNumber = new Map(relationship.subIssues.map((issue) => [issue.number, issue]));
		let currentOrder = [...relationship.subIssues];
		const mutations: NativeSubIssueMutationResult[] = [];
		for (let index = 0; index < desiredNumbers.length; index++) {
			const childNumber = desiredNumbers[index];
			const child = issueByNumber.get(childNumber);
			if (!child) continue;
			if (index === 0) {
				if (currentOrder[0]?.number === childNumber) continue;
				const before = currentOrder.find((issue) => issue.number !== childNumber);
				if (!before) continue;
				mutations.push(await this.reprioritizeSubIssue(parentIssueId, child, { beforeId: before.id }, signal));
				currentOrder = moveNativeSubIssue(currentOrder, childNumber, { beforeNumber: before.number });
				continue;
			}
			const previousNumber = desiredNumbers[index - 1];
			const previous = issueByNumber.get(previousNumber);
			if (!previous) continue;
			const previousIndex = currentOrder.findIndex((issue) => issue.number === previousNumber);
			if (previousIndex >= 0 && currentOrder[previousIndex + 1]?.number === childNumber) continue;
			mutations.push(await this.reprioritizeSubIssue(parentIssueId, child, { afterId: previous.id }, signal));
			currentOrder = moveNativeSubIssue(currentOrder, childNumber, { afterNumber: previousNumber });
		}
		const refreshed = mutations.length > 0
			? await this.listSubIssueRelationships(normalizedParentNumber, { limit: MAX_TOOL_ISSUES }, signal)
			: relationship;
		return { relationship: refreshed, mutations };
	}

	async listSubIssueRelationships(issueNumber: number, options: PaginationOptions = {}, signal?: AbortSignal): Promise<NativeSubIssueRelationshipResult> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const limit = normalizeSubIssueRelationshipLimit(options.limit);
		const data = await this.graphqlRequest<SubIssueRelationshipData>(
			"IssueMeListSubIssues",
			buildSubIssueRelationshipsQuery(),
			{ owner: this.repository.owner, repo: this.repository.repo, issueNumber: normalizedIssueNumber, first: limit },
			signal,
		);
		return normalizeNativeSubIssueRelationshipResult(data, this.repository.fullName, normalizedIssueNumber, limit);
	}

	async listIssueDevelopmentLinks(issueNumber: number, options: PaginationOptions = {}, signal?: AbortSignal): Promise<GitHubIssueDevelopmentLinksResult> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const limit = normalizeIssueDevelopmentLinkLimit(options.limit);
		const data = await this.graphqlRequest<IssueDevelopmentLinksData>(
			"IssueMeListIssueDevelopmentLinks",
			buildIssueDevelopmentLinksQuery(),
			{ owner: this.repository.owner, repo: this.repository.repo, issueNumber: normalizedIssueNumber, first: limit },
			signal,
		);
		return normalizeIssueDevelopmentLinksResult(data, this.repository.fullName, normalizedIssueNumber, limit);
	}

	async updateIssue(issueNumber: number, input: IssueUpdateInput, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubIssueResponse>("PATCH", this.repoPath(`/issues/${issueNumber}`), {
			body: compactObject(input),
			signal,
			validate: isObject,
		});
	}

	async addComment(issueNumber: number, body: string, signal?: AbortSignal): Promise<GitHubCommentResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubCommentResponse>("POST", this.repoPath(`/issues/${issueNumber}/comments`), {
			body: { body },
			signal,
			validate: isObject,
		});
	}

	async updateComment(issueNumber: number, commentId: number, body: string, signal?: AbortSignal): Promise<GitHubCommentResponse> {
		await this.ensureCommentTargetsOpenIssue(issueNumber, commentId, signal);
		return this.request<GitHubCommentResponse>("PATCH", this.repoPath(`/issues/comments/${commentId}`), {
			body: { body },
			signal,
			validate: isObject,
		});
	}

	async deleteComment(issueNumber: number, commentId: number, signal?: AbortSignal): Promise<GitHubCommentResponse> {
		const { comment } = await this.ensureCommentTargetsOpenIssue(issueNumber, commentId, signal);
		await this.request<void>("DELETE", this.repoPath(`/issues/comments/${commentId}`), {
			signal,
			validate: (value) => value === undefined,
		});
		return comment;
	}

	async addAssignees(issueNumber: number, assignees: string[], signal?: AbortSignal): Promise<GitHubIssueResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubIssueResponse>("POST", this.repoPath(`/issues/${issueNumber}/assignees`), {
			body: { assignees },
			signal,
			validate: isObject,
		});
	}

	async removeAssignees(issueNumber: number, assignees: string[], signal?: AbortSignal): Promise<GitHubIssueResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubIssueResponse>("DELETE", this.repoPath(`/issues/${issueNumber}/assignees`), {
			body: { assignees },
			signal,
			validate: isObject,
		});
	}

	async setAssignees(issueNumber: number, assignees: string[], signal?: AbortSignal): Promise<GitHubIssueResponse> {
		return this.updateIssue(issueNumber, { assignees }, signal);
	}

	async addLabels(issueNumber: number, labels: string[], signal?: AbortSignal): Promise<GitHubLabelListResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubLabelListResponse>("POST", this.repoPath(`/issues/${issueNumber}/labels`), {
			body: { labels },
			signal,
			validate: Array.isArray,
		});
	}

	async setLabels(issueNumber: number, labels: string[], signal?: AbortSignal): Promise<GitHubLabelListResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubLabelListResponse>("PUT", this.repoPath(`/issues/${issueNumber}/labels`), {
			body: { labels },
			signal,
			validate: Array.isArray,
		});
	}

	async removeLabel(issueNumber: number, label: string, signal?: AbortSignal): Promise<GitHubLabelListResponse | undefined> {
		await this.ensureIssueOpen(issueNumber, signal);
		try {
			return await this.request<GitHubLabelListResponse | undefined>(
				"DELETE",
				this.repoPath(`/issues/${issueNumber}/labels/${encodeURIComponent(label)}`),
				{ signal, validate: (value) => value === undefined || Array.isArray(value) },
			);
		} catch (error) {
			if (error instanceof GitHubApiError && error.status === 404) return undefined;
			throw error;
		}
	}

	async closeIssue(issueNumber: number, input: IssueCloseInput = {}, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubIssueResponse>("PATCH", this.repoPath(`/issues/${issueNumber}`), {
			body: compactObject({ state: "closed", state_reason: input.reason }),
			signal,
			validate: isObject,
		});
	}

	async reopenIssue(issueNumber: number, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		return this.request<GitHubIssueResponse>("PATCH", this.repoPath(`/issues/${issueNumber}`), {
			body: { state: "open", state_reason: "reopened" },
			signal,
			validate: isObject,
		});
	}

	async ensureIssueOpen(issueNumber: number, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		const issue = await this.getIssue(issueNumber, signal);
		if (issue.state !== "open") {
			throw new ClosedIssueMutationError(issueNumber, typeof issue.state === "string" ? issue.state : "unknown", issueResponseToSafeSummary(this.repository.fullName, issue, issueNumber));
		}
		return issue;
	}

	private async ensureCommentTargetsOpenIssue(
		issueNumber: number,
		commentId: number,
		signal?: AbortSignal,
	): Promise<{ issue: GitHubIssueResponse; comment: GitHubCommentResponse }> {
		const issue = await this.ensureIssueOpen(issueNumber, signal);
		const comment = await this.getIssueComment(commentId, signal);
		if (!commentBelongsToIssue(this.repository, comment, issueNumber, commentId)) {
			throw new IssueMeError(
				ISSUEME_ERROR_CODES.COMMENT_ISSUE_MISMATCH,
				`Comment ${commentId} does not belong to issue #${issueNumber}; refusing to mutate it.`,
				{ issueNumber, id: commentId },
			);
		}
		return { issue, comment };
	}

	private async ensureProjectV2ItemTargetsIssue(
		input: { projectId: string; itemId: string; issueNumber: number },
		signal?: AbortSignal,
	): Promise<void> {
		const data = await this.graphqlRequest<ProjectV2ItemValidationData>(
			"IssueMeValidateProjectV2ItemForUpdate",
			buildProjectV2ItemValidationQuery(),
			{ itemId: input.itemId },
			signal,
		);
		assertProjectV2ItemTargetsIssue(data, input, this.repository.fullName);
	}

	private async mutateSubIssueRelationship(
		action: "add" | "remove",
		parentIssueId: string,
		childIssueId: string,
		signal?: AbortSignal,
	): Promise<NativeSubIssueMutationResult> {
		const mutationName = action === "add" ? "IssueMeAddSubIssue" : "IssueMeRemoveSubIssue";
		const mutationField = action === "add" ? "addSubIssue" : "removeSubIssue";
		const data = await this.graphqlRequest<SubIssueMutationData>(
			mutationName,
			`mutation ${mutationName}($issueId: ID!, $subIssueId: ID!) {
				${mutationField}(input: {issueId: $issueId, subIssueId: $subIssueId}) {
					issue { id number title state url }
					subIssue { id number title state url }
				}
			}`,
			{ issueId: parentIssueId, subIssueId: childIssueId },
			signal,
		);
		return normalizeSubIssueMutationResult(data, mutationField, this.repository.fullName);
	}

	private async reprioritizeSubIssue(
		parentIssueId: string,
		child: NativeSubIssueSummary,
		position: { beforeId?: string; afterId?: string },
		signal?: AbortSignal,
	): Promise<NativeSubIssueMutationResult> {
		const data = await this.graphqlRequest<SubIssueMutationData>(
			"IssueMeReprioritizeSubIssue",
			`mutation IssueMeReprioritizeSubIssue($issueId: ID!, $subIssueId: ID!, $beforeId: ID, $afterId: ID) {
				reprioritizeSubIssue(input: {issueId: $issueId, subIssueId: $subIssueId, beforeId: $beforeId, afterId: $afterId}) {
					issue { id number title state url }
				}
			}`,
			compactObject({ issueId: parentIssueId, subIssueId: child.id, beforeId: position.beforeId, afterId: position.afterId }),
			signal,
		);
		return normalizeReprioritizeSubIssueResult(data, this.repository.fullName, child);
	}

	private async graphqlRequest<T>(operationName: string, query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
		let envelope: GraphQLResponse<T>;
		try {
			envelope = await this.request<GraphQLResponse<T>>("POST", "/graphql", {
				body: { query, variables, operationName },
				signal,
				validate: isObject,
			});
		} catch (error) {
			if (error instanceof GitHubApiError && error.status === 403 && isSubIssueOperation(operationName)) {
				throw subIssuePermissionError(operationName, error.message);
			}
			if (error instanceof GitHubApiError && error.status === 403 && isProjectV2Operation(operationName)) {
				throw projectV2PermissionError(operationName, error.message);
			}
			if (error instanceof GitHubApiError && error.status === 403 && isDevelopmentLinkOperation(operationName)) {
				throw developmentLinksPermissionError(error.message);
			}
			throw error;
		}

		const errors = Array.isArray(envelope.errors) ? envelope.errors : [];
		if (errors.length > 0) {
			const safeGraphQLErrorDetails = redactSecrets(formatGraphQLErrors(errors), [this.token, ...collectRequestStringValues(variables)]);
			if (isSubIssueOperation(operationName) && errors.some(isForbiddenGraphQLError)) {
				throw subIssuePermissionError(operationName, safeGraphQLErrorDetails);
			}
			if (isSubIssueOperation(operationName) && errors.some(isUnsupportedSubIssueGraphQLError)) {
				throw subIssueUnsupportedError(operationName, safeGraphQLErrorDetails);
			}
			if (isProjectV2Operation(operationName) && errors.some(isForbiddenGraphQLError)) {
				throw projectV2PermissionError(operationName, safeGraphQLErrorDetails);
			}
			if (isDevelopmentLinkOperation(operationName) && errors.some(isForbiddenGraphQLError)) {
				throw developmentLinksPermissionError(safeGraphQLErrorDetails);
			}
			if (isDevelopmentLinkOperation(operationName) && errors.some(isUnsupportedDevelopmentLinksGraphQLError)) {
				throw developmentLinksUnsupportedError(safeGraphQLErrorDetails);
			}
			throw new GitHubApiError(redactSecrets(`GitHub GraphQL API ${operationName} failed: ${safeGraphQLErrorDetails}`, [this.token, ...collectRequestStringValues(variables)]), {
				code: ISSUEME_ERROR_CODES.GITHUB_API_ERROR,
				path: `${GITHUB_API_BASE_URL}/graphql`,
			});
		}
		if (!isObject(envelope.data)) {
			throw new GitHubApiError("GitHub GraphQL API returned an unexpected response shape.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
		}
		return envelope.data as T;
	}

	private repoPath(path: string): string {
		return `/repos/${encodeURIComponent(this.repository.owner)}/${encodeURIComponent(this.repository.repo)}${path}`;
	}

	private async paginate<T>(
		path: string,
		query: Record<string, string>,
		signal?: AbortSignal,
		options: PaginationOptions = {},
	): Promise<T[]> {
		return (await this.paginateFiltered<T>(path, query, signal, options)).items;
	}

	private async paginateFiltered<T>(
		path: string,
		query: Record<string, string>,
		signal?: AbortSignal,
		options: PaginationOptions & { filter?: (item: T) => boolean } = {},
	): Promise<{ items: T[]; truncated: boolean }> {
		const values: T[] = [];
		let truncated = false;
		let nextUrl: string | undefined = this.buildUrl(path, query).toString();
		while (nextUrl) {
			this.assertAllowedPaginationUrl(nextUrl);
			const response = await this.requestWithHeaders<T[]>("GET", nextUrl, {
				signal,
				alreadyAbsolute: true,
				validate: Array.isArray,
			});
			const next = parseNextLink(response.headers.get("link"));
			for (const item of response.data) {
				if (options.filter && !options.filter(item)) continue;
				if (options.limit !== undefined && values.length >= options.limit) {
					truncated = true;
					break;
				}
				values.push(item);
			}
			if (truncated) break;
			if (options.limit !== undefined && values.length >= options.limit && next) {
				truncated = true;
				break;
			}
			nextUrl = next;
			if (nextUrl) this.assertAllowedPaginationUrl(nextUrl);
		}
		return { items: values, truncated };
	}

	private async paginateSearchIssues(
		query: Record<string, string>,
		signal?: AbortSignal,
		options: PaginationOptions = {},
	): Promise<{ items: GitHubIssueResponse[]; truncated: boolean; totalCount?: number; incompleteResults?: boolean }> {
		const values: GitHubIssueResponse[] = [];
		let truncated = false;
		let totalCount: number | undefined;
		let incompleteResults: boolean | undefined;
		let nextUrl: string | undefined = this.buildUrl("/search/issues", query).toString();
		while (nextUrl) {
			this.assertAllowedPaginationUrl(nextUrl);
			const response = await this.requestWithHeaders<GitHubIssueSearchResponse>("GET", nextUrl, {
				signal,
				alreadyAbsolute: true,
				validate: isIssueSearchResponse,
			});
			const page = normalizeIssueSearchResponse(response.data);
			totalCount ??= page.totalCount;
			incompleteResults ??= page.incompleteResults;
			const next = parseNextLink(response.headers.get("link"));
			for (const item of page.items) {
				if (isPullRequestIssueResponse(item)) continue;
				if (options.limit !== undefined && values.length >= options.limit) {
					truncated = true;
					break;
				}
				values.push(item);
			}
			if (truncated) break;
			if (options.limit !== undefined && values.length >= options.limit && next) {
				truncated = true;
				break;
			}
			nextUrl = next;
			if (nextUrl) this.assertAllowedPaginationUrl(nextUrl);
		}
		if (options.limit !== undefined && totalCount !== undefined && totalCount > values.length) truncated = true;
		return {
			items: values,
			truncated,
			...(totalCount !== undefined ? { totalCount } : {}),
			...(incompleteResults !== undefined ? { incompleteResults } : {}),
		};
	}

	private async request<T>(
		method: string,
		pathOrUrl: string,
		options: { body?: unknown; signal?: AbortSignal; alreadyAbsolute?: boolean; validate?: (value: unknown) => boolean } = {},
	): Promise<T> {
		return (await this.requestWithHeaders<T>(method, pathOrUrl, options)).data;
	}

	private async requestWithHeaders<T>(
		method: string,
		pathOrUrl: string,
		options: { body?: unknown; signal?: AbortSignal; alreadyAbsolute?: boolean; validate?: (value: unknown) => boolean } = {},
	): Promise<{ data: T; headers: Headers }> {
		const url = this.buildRequestUrl(pathOrUrl, options.alreadyAbsolute);
		this.assertAllowedRequestUrl(url, "GitHub REST API URL");
		const headers: Record<string, string> = {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${this.token}`,
			"User-Agent": this.userAgent,
			"X-GitHub-Api-Version": GITHUB_API_VERSION,
		};
		if (url.pathname === "/graphql") headers["GraphQL-Features"] = "sub_issues";
		if (options.body !== undefined) headers["Content-Type"] = "application/json";
		if (options.signal?.aborted) {
			throw new GitHubApiError("GitHub request aborted.", { code: ISSUEME_ERROR_CODES.GITHUB_REQUEST_ABORTED, path: safePath(url) });
		}

		let response: Response;
		try {
			response = await this.fetchFn(url, {
				method,
				headers,
				body: options.body === undefined ? undefined : JSON.stringify(options.body),
				signal: options.signal,
			});
		} catch (error) {
			if (options.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
				throw new GitHubApiError("GitHub request aborted.", { code: ISSUEME_ERROR_CODES.GITHUB_REQUEST_ABORTED, path: safePath(url) });
			}
			const message = error instanceof Error ? error.message : String(error);
			throw new GitHubApiError(redactSecrets(`GitHub network request failed: ${message}`, [this.token, ...collectRequestStringValues(options.body)]), {
				code: ISSUEME_ERROR_CODES.GITHUB_NETWORK_ERROR,
				path: safePath(url),
			});
		}

		const text = response.status === 204 ? "" : await response.text();
		if (!response.ok) {
			const rateLimit = readRateLimit(response.headers);
			throw new GitHubApiError(this.formatError(response, text, options.body), {
				code: rateLimit.limited ? ISSUEME_ERROR_CODES.GITHUB_RATE_LIMIT : ISSUEME_ERROR_CODES.GITHUB_API_ERROR,
				status: response.status,
				path: safePath(url),
				rateLimit,
			});
		}

		let data: unknown = undefined;
		if (text) {
			try {
				data = JSON.parse(text) as unknown;
			} catch {
				throw new GitHubApiError("GitHub REST API returned invalid JSON.", { code: ISSUEME_ERROR_CODES.GITHUB_INVALID_JSON, status: response.status, path: safePath(url) });
			}
		}
		if (options.validate && !options.validate(data)) {
			throw new GitHubApiError("GitHub REST API returned an unexpected response shape.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, status: response.status, path: safePath(url) });
		}
		return { data: data as T, headers: response.headers };
	}

	private buildRequestUrl(pathOrUrl: string, alreadyAbsolute = false): URL {
		try {
			return alreadyAbsolute ? new URL(pathOrUrl) : this.buildUrl(pathOrUrl);
		} catch {
			throw new GitHubApiError("GitHub REST API URL is malformed.", { code: ISSUEME_ERROR_CODES.GITHUB_URL_MALFORMED });
		}
	}

	private buildUrl(path: string, query: Record<string, string> = {}): URL {
		const url = path.startsWith("http://") || path.startsWith("https://") ? new URL(path) : new URL(path, this.baseUrl);
		for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
		return url;
	}

	private assertAllowedPaginationUrl(rawUrl: string): void {
		let url: URL;
		try {
			url = new URL(rawUrl);
		} catch {
			throw new GitHubApiError("GitHub pagination URL is malformed.", { code: ISSUEME_ERROR_CODES.GITHUB_URL_MALFORMED });
		}
		this.assertAllowedRequestUrl(url, "GitHub pagination URL");
	}

	private assertAllowedRequestUrl(url: URL, label: string): void {
		const expectedBase = new URL(GITHUB_API_BASE_URL);
		const expectedPrefix = `/repos/${encodeURIComponent(this.repository.owner)}/${encodeURIComponent(this.repository.repo)}/`;
		const onExpectedHost = url.protocol === "https:" && url.host === expectedBase.host;
		const withinRepository = url.pathname.startsWith(expectedPrefix);
		const graphqlEndpoint = url.pathname === "/graphql";
		const issueSearchEndpoint = url.pathname === "/search/issues" && this.isAllowedIssueSearchUrl(url);
		if (!onExpectedHost || (!withinRepository && !graphqlEndpoint && !issueSearchEndpoint)) {
			throw new GitHubApiError(`${label} left the resolved repository boundary.`, { code: ISSUEME_ERROR_CODES.GITHUB_BOUNDARY_VIOLATION, path: safePath(url) });
		}
	}

	private isAllowedIssueSearchUrl(url: URL): boolean {
		const query = url.searchParams.get("q") ?? "";
		const normalized = query.toLowerCase();
		const expectedRepo = `repo:${this.repository.owner.toLowerCase()}/${this.repository.repo.toLowerCase()}`;
		const repoTerms = normalized.match(/\brepo:[^\s]+/g) ?? [];
		return repoTerms.length > 0
			&& repoTerms.every((term) => term === expectedRepo)
			&& /\bis:issue\b/.test(normalized)
			&& !/\b(?:is|type):(?:pr|pull-request|pullrequest)\b/.test(normalized);
	}

	private formatError(response: Response, text: string, requestBody?: unknown): string {
		const base = `GitHub REST API request failed with ${response.status} ${response.statusText}`;
		const rateLimit = readRateLimit(response.headers);
		if (rateLimit.limited) {
			return `${base}: GitHub rate-limit or retry-after policy is active. ${formatRateLimitGuidance(rateLimit)} IssueMe does not retry automatically; wait and run the tool again or sync later.`;
		}

		let detail = text.trim();
		try {
			const parsed = JSON.parse(text) as { message?: unknown; documentation_url?: unknown };
			if (typeof parsed.message === "string") detail = parsed.message;
		} catch {
			// Keep the raw text if it is not JSON.
		}
		return redactSecrets(detail ? `${base}: ${detail}.` : `${base}.`, [this.token, ...collectRequestStringValues(requestBody)]);
	}
}

function buildSubIssueRelationshipsQuery(): string {
	return `query IssueMeListSubIssues($owner: String!, $repo: String!, $issueNumber: Int!, $first: Int!) {
		repository(owner: $owner, name: $repo) {
			issue(number: $issueNumber) {
				id
				number
				title
				state
				url
				parent {
					id
					number
					title
					state
					url
				}
				subIssues(first: $first) {
					totalCount
					nodes {
						id
						number
						title
						state
						url
					}
					pageInfo { hasNextPage }
				}
			}
		}
	}`;
}

function buildIssueDevelopmentLinksQuery(): string {
	return `query IssueMeListIssueDevelopmentLinks($owner: String!, $repo: String!, $issueNumber: Int!, $first: Int!) {
		repository(owner: $owner, name: $repo) {
			issue(number: $issueNumber) {
				id
				number
				title
				state
				url
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

function buildProjectsV2ListQuery(scope: GitHubProjectV2Scope): string {
	const ownerSelection = projectV2ScopeSelectionForScope(scope, `projectsV2(first: $first, after: $after, query: $query) {
		nodes { ...IssueMeProjectV2Summary }
		pageInfo { hasNextPage endCursor }
	}`);
	const variables = scope === "repository" ? "$owner: String!, $repo: String!, $first: Int!, $after: String, $query: String" : "$owner: String!, $first: Int!, $after: String, $query: String";
	return `query IssueMeListProjectsV2(${variables}) {
		${ownerSelection}
	}
	${projectV2SummaryFragment()}`;
}

function buildProjectV2FieldsByIdQuery(): string {
	return `query IssueMeGetProjectV2FieldsById($projectId: ID!, $fieldsFirst: Int!) {
		node(id: $projectId) {
			... on ProjectV2 {
				...IssueMeProjectV2WithFields
			}
		}
		${projectV2WithFieldsFragment()}
	}`;
}

function buildProjectV2FieldsByNumberQuery(scope: GitHubProjectV2Scope): string {
	const ownerSelection = projectV2OwnerSelectionForScope(scope, "projectV2(number: $projectNumber)", "...IssueMeProjectV2WithFields");
	const variables = scope === "repository" ? "$owner: String!, $repo: String!, $projectNumber: Int!, $fieldsFirst: Int!" : "$owner: String!, $projectNumber: Int!, $fieldsFirst: Int!";
	return `query IssueMeGetProjectV2FieldsByNumber(${variables}) {
		${ownerSelection}
	}
	${projectV2WithFieldsFragment()}`;
}

function projectV2OwnerSelectionForScope(scope: GitHubProjectV2Scope, projectSelection: string, projectFragment = "...IssueMeProjectV2Summary"): string {
	return projectV2ScopeSelectionForScope(scope, `${projectSelection} {
		${projectFragment}
	}`);
}

function projectV2ScopeSelectionForScope(scope: GitHubProjectV2Scope, selection: string): string {
	if (scope === "repository") {
		return `repository(owner: $owner, name: $repo) {
			${selection}
		}`;
	}
	if (scope === "organization") {
		return `organization(login: $owner) {
			${selection}
		}`;
	}
	return `user(login: $owner) {
		${selection}
	}`;
}

function projectV2SummaryFragment(): string {
	return `fragment IssueMeProjectV2Summary on ProjectV2 {
		id
		title
		number
		url
		shortDescription
		closed
		public
		owner {
			__typename
			... on Organization { login }
			... on User { login }
		}
	}`;
}

function projectV2WithFieldsFragment(): string {
	return `${projectV2SummaryFragment()}
	fragment IssueMeProjectV2WithFields on ProjectV2 {
		...IssueMeProjectV2Summary
		fields(first: $fieldsFirst) {
			nodes {
				__typename
				... on ProjectV2Field { id name dataType }
				... on ProjectV2SingleSelectField {
					id
					name
					dataType
					options { id name color description }
				}
				... on ProjectV2IterationField {
					id
					name
					dataType
					configuration {
						iterations { id title startDate duration }
						completedIterations { id title startDate duration }
					}
				}
			}
			pageInfo { hasNextPage }
		}
	}`;
}

function buildAddIssueToProjectV2Mutation(): string {
	return `mutation IssueMeAddIssueToProjectV2($projectId: ID!, $contentId: ID!) {
		addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
			item { ...IssueMeProjectV2ItemSummary }
		}
	}
	${projectV2ItemSummaryFragment()}`;
}

function buildUpdateProjectV2ItemFieldValueMutation(): string {
	return `mutation IssueMeUpdateProjectV2ItemFieldValue($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
		updateProjectV2ItemFieldValue(input: {projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $value}) {
			projectV2Item { ...IssueMeProjectV2ItemSummary }
		}
	}
	${projectV2ItemSummaryFragment()}`;
}

function buildProjectV2ItemValidationQuery(): string {
	return `query IssueMeValidateProjectV2ItemForUpdate($itemId: ID!) {
		node(id: $itemId) {
			... on ProjectV2Item {
				id
				type
				project { id }
				content {
					__typename
					... on Issue {
						number
						title
						state
						url
						repository { nameWithOwner }
					}
				}
			}
		}
	}`;
}

function projectV2ItemSummaryFragment(): string {
	return `${projectV2SummaryFragment()}
	fragment IssueMeProjectV2ItemSummary on ProjectV2Item {
		id
		type
		project { ...IssueMeProjectV2Summary }
		content {
			__typename
			... on Issue { id number title state url }
		}
	}`;
}

function extractProjectV2Connection(data: ProjectV2ConnectionData, scope: GitHubProjectV2Scope): unknown {
	const ownerNode = scope === "repository" ? data.repository : scope === "organization" ? data.organization : data.user;
	if (!isObject(ownerNode)) {
		throw new GitHubApiError("GitHub GraphQL Projects v2 query returned an inaccessible owner or unexpected response shape.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	return ownerNode.projectsV2;
}

function extractProjectV2FieldProject(data: ProjectV2FieldsData, input: { projectId?: string; scope: GitHubProjectV2Scope }): unknown {
	if (input.projectId) return data.node;
	const ownerNode = input.scope === "repository" ? data.repository : input.scope === "organization" ? data.organization : data.user;
	if (!isObject(ownerNode)) {
		throw new GitHubApiError("GitHub GraphQL Projects v2 field query returned an inaccessible owner or unexpected response shape.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	return ownerNode.projectV2;
}

function extractConnectionNodes(connection: unknown): unknown[] {
	if (!isObject(connection) || !Array.isArray(connection.nodes)) return [];
	return connection.nodes;
}

function connectionHasNextPage(connection: unknown): boolean {
	if (!isObject(connection)) return false;
	const pageInfo = connection.pageInfo;
	return isObject(pageInfo) && pageInfo.hasNextPage === true;
}

function connectionEndCursor(connection: unknown): string | undefined {
	if (!isObject(connection)) return undefined;
	const pageInfo = connection.pageInfo;
	if (!isObject(pageInfo)) return undefined;
	return typeof pageInfo.endCursor === "string" && pageInfo.endCursor.trim() ? pageInfo.endCursor : undefined;
}

function normalizeConnectionTotalCount(connection: unknown): number | undefined {
	if (!isObject(connection)) return undefined;
	const total = connection.totalCount ?? connection.total_count ?? connection.total;
	return typeof total === "number" && Number.isSafeInteger(total) && total >= 0 ? total : undefined;
}

function normalizeProjectV2OutputId(value: unknown, field: string): string | undefined {
	if (typeof value !== "string") return undefined;
	try {
		return normalizeRequiredGitHubOpaqueId(value, field);
	} catch {
		return undefined;
	}
}

function normalizeProjectV2Summary(value: unknown): ToolProjectSummary | undefined {
	if (!isObject(value)) return undefined;
	const id = normalizeProjectV2OutputId(value.id, "projectId") ?? "";
	const title = typeof value.title === "string" ? value.title.trim() : "";
	const number = typeof value.number === "number" && Number.isSafeInteger(value.number) && value.number > 0 ? value.number : undefined;
	const owner = normalizeProjectV2OwnerSummary(value.owner);
	if (!id || !title || number === undefined || !owner) return undefined;
	const url = typeof value.url === "string" && value.url.trim() ? value.url.trim() : undefined;
	const shortDescription = typeof value.shortDescription === "string" && value.shortDescription.trim() ? value.shortDescription.trim() : undefined;
	return {
		id,
		title,
		number,
		owner: owner.owner,
		ownerType: owner.ownerType,
		...(url ? { url } : {}),
		...(shortDescription ? { shortDescription } : {}),
		...(typeof value.closed === "boolean" ? { closed: value.closed } : {}),
		...(typeof value.public === "boolean" ? { public: value.public } : {}),
	};
}

function normalizeProjectV2OwnerSummary(value: unknown): { owner: string; ownerType: ProjectV2OwnerType } | undefined {
	if (!isObject(value)) return undefined;
	const type = value.__typename;
	if (type === "Repository" && typeof value.nameWithOwner === "string" && value.nameWithOwner.trim()) {
		return { owner: value.nameWithOwner.trim(), ownerType: "repository" };
	}
	if (type === "Organization" && typeof value.login === "string" && value.login.trim()) {
		return { owner: value.login.trim(), ownerType: "organization" };
	}
	if (type === "User" && typeof value.login === "string" && value.login.trim()) {
		return { owner: value.login.trim(), ownerType: "user" };
	}
	return undefined;
}

function normalizeProjectV2FieldSummary(value: unknown, limits: ProjectV2FieldLimits): ToolProjectFieldSummary | undefined {
	if (!isObject(value)) return undefined;
	const id = normalizeProjectV2OutputId(value.id, "fieldId") ?? "";
	const name = typeof value.name === "string" ? value.name.trim() : "";
	const dataType = typeof value.dataType === "string" ? value.dataType.trim() : "";
	if (!id || !name || !dataType) return undefined;
	const options = Array.isArray(value.options) ? value.options.map(normalizeProjectV2FieldOption).filter((option): option is ToolProjectFieldOptionSummary => option !== undefined) : undefined;
	const configuration = isObject(value.configuration) ? value.configuration : undefined;
	const iterations = Array.isArray(configuration?.iterations) ? configuration.iterations.map(normalizeProjectV2Iteration).filter((iteration): iteration is ToolProjectIterationSummary => iteration !== undefined) : undefined;
	const completedIterations = Array.isArray(configuration?.completedIterations) ? configuration.completedIterations.map(normalizeProjectV2Iteration).filter((iteration): iteration is ToolProjectIterationSummary => iteration !== undefined) : undefined;
	const shownOptions = options?.slice(0, limits.optionLimit);
	const shownIterations = iterations?.slice(0, limits.iterationLimit);
	const shownCompletedIterations = completedIterations?.slice(0, limits.iterationLimit);
	const truncation: Record<string, unknown> = {};
	if (options && options.length > limits.optionLimit) truncation.options = { shown: shownOptions?.length ?? 0, total: options.length, max: limits.optionLimit };
	if (iterations && iterations.length > limits.iterationLimit) truncation.iterations = { shown: shownIterations?.length ?? 0, total: iterations.length, max: limits.iterationLimit };
	if (completedIterations && completedIterations.length > limits.iterationLimit) truncation.completedIterations = { shown: shownCompletedIterations?.length ?? 0, total: completedIterations.length, max: limits.iterationLimit };
	const truncated = Object.keys(truncation).length > 0;
	return {
		id,
		name,
		dataType,
		...(typeof value.__typename === "string" ? { type: value.__typename } : {}),
		...(shownOptions ? { options: shownOptions } : {}),
		...(shownIterations ? { iterations: shownIterations } : {}),
		...(shownCompletedIterations ? { completedIterations: shownCompletedIterations } : {}),
		...(truncated ? { truncated: true, truncation } : {}),
	};
}

function normalizeProjectV2ItemMutationResult(data: ProjectV2ItemMutationData, field: "addProjectV2ItemById" | "updateProjectV2ItemFieldValue", repository: string): GitHubProjectV2ItemMutationResult {
	const payload = data[field];
	if (!isObject(payload)) {
		throw new GitHubApiError(`GitHub GraphQL ${field} mutation returned an unexpected response shape.`, { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	const itemNode = field === "addProjectV2ItemById" ? payload.item : payload.projectV2Item;
	const item = normalizeProjectV2ItemSummary(itemNode, repository);
	if (!item) {
		throw new GitHubApiError(`GitHub GraphQL ${field} mutation returned incomplete project item data.`, { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	return { item };
}

function normalizeProjectV2ItemSummary(value: unknown, repository: string): ToolProjectItemSummary | undefined {
	if (!isObject(value)) return undefined;
	const id = normalizeProjectV2OutputId(value.id, "itemId") ?? "";
	if (!id) return undefined;
	const type = typeof value.type === "string" && value.type.trim() ? value.type.trim() : undefined;
	const project = normalizeProjectV2Summary(value.project);
	const issue = normalizeProjectV2ItemIssue(value.content, repository);
	return {
		id,
		...(type ? { type } : {}),
		...(project ? { project } : {}),
		...(issue ? { issue } : {}),
	};
}

function normalizeProjectV2ItemIssue(value: unknown, repository: string): IssueRelationshipSummary | undefined {
	if (!isObject(value) || value.__typename !== "Issue") return undefined;
	const number = typeof value.number === "number" && Number.isSafeInteger(value.number) && value.number > 0 ? value.number : undefined;
	const title = typeof value.title === "string" ? value.title.trim() : "";
	const state = normalizeGraphQLIssueState(value.state);
	const url = typeof value.url === "string" && value.url.trim() ? value.url.trim() : undefined;
	if (number === undefined || !title) return undefined;
	return {
		number,
		title,
		...(state ? { state } : {}),
		html_url: url ?? `https://github.com/${repository}/issues/${number}`,
	};
}

function assertProjectV2ItemTargetsIssue(
	data: ProjectV2ItemValidationData,
	input: { projectId: string; itemId: string; issueNumber: number },
	repository: string,
): void {
	const item = data.node;
	if (!isObject(item)) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			"itemId must resolve to an accessible GitHub Projects v2 item before IssueMe updates a project field.",
			{ itemId: input.itemId, projectId: input.projectId, issueNumber: input.issueNumber },
		);
	}

	const project = isObject(item.project) ? item.project : undefined;
	const actualProjectId = normalizeProjectV2OutputId(project?.id, "projectId");
	if (!actualProjectId) {
		throw new GitHubApiError("GitHub GraphQL ProjectV2 item validation returned incomplete project data.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	if (actualProjectId !== input.projectId) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			"itemId must belong to projectId before IssueMe updates a project field.",
			{ itemId: input.itemId, projectId: input.projectId, actualProjectId, issueNumber: input.issueNumber },
		);
	}

	const content = item.content;
	if (!isObject(content) || content.__typename !== "Issue") {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			"itemId must represent an issue item before IssueMe updates a project field.",
			{ itemId: input.itemId, projectId: input.projectId, issueNumber: input.issueNumber, contentType: isObject(content) && typeof content.__typename === "string" ? content.__typename : "unknown" },
		);
	}

	const repositoryNode = isObject(content.repository) ? content.repository : undefined;
	const actualRepository = typeof repositoryNode?.nameWithOwner === "string" ? repositoryNode.nameWithOwner.trim() : undefined;
	const actualIssueNumber = typeof content.number === "number" && Number.isSafeInteger(content.number) && content.number > 0 ? content.number : undefined;
	const state = normalizeGraphQLIssueState(content.state);
	if (!actualRepository || actualIssueNumber === undefined || !state) {
		throw new GitHubApiError("GitHub GraphQL ProjectV2 item validation returned incomplete issue data.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	if (actualRepository.toLowerCase() !== repository.toLowerCase()) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			"itemId must represent an issue in the resolved current repository before IssueMe updates a project field.",
			{ itemId: input.itemId, projectId: input.projectId, issueNumber: input.issueNumber, repository, actualRepository },
		);
	}
	if (actualIssueNumber !== input.issueNumber) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			"itemId must represent the requested issueNumber before IssueMe updates a project field.",
			{ itemId: input.itemId, projectId: input.projectId, issueNumber: input.issueNumber, actualIssueNumber },
		);
	}
	if (state !== "open") {
		throw new ClosedIssueMutationError(actualIssueNumber, state, projectV2ItemContentToSafeSummary(repository, content, actualIssueNumber, state));
	}
}

function projectV2ItemContentToSafeSummary(
	repository: string,
	content: Record<string, unknown>,
	issueNumber: number,
	state: "open" | "closed",
): ToolIssueSummary {
	const title = typeof content.title === "string" && content.title.trim() ? content.title.trim() : `#${issueNumber}`;
	const url = typeof content.url === "string" && content.url.trim() ? content.url.trim() : `https://github.com/${repository}/issues/${issueNumber}`;
	return {
		repository,
		number: issueNumber,
		title,
		state,
		labels: [],
		assignees: [],
		html_url: url,
	};
}

function normalizeProjectV2FieldOption(value: unknown): ToolProjectFieldOptionSummary | undefined {
	if (!isObject(value)) return undefined;
	const id = normalizeProjectV2OutputId(value.id, "singleSelectOptionId") ?? "";
	const name = typeof value.name === "string" ? value.name.trim() : "";
	if (!id || !name) return undefined;
	const color = typeof value.color === "string" && value.color.trim() ? value.color.trim() : undefined;
	const description = typeof value.description === "string" && value.description.trim() ? value.description.trim() : undefined;
	return { id, name, ...(color ? { color } : {}), ...(description ? { description } : {}) };
}

function normalizeProjectV2Iteration(value: unknown): ToolProjectIterationSummary | undefined {
	if (!isObject(value)) return undefined;
	const id = normalizeProjectV2OutputId(value.id, "iterationId") ?? "";
	const title = typeof value.title === "string" ? value.title.trim() : "";
	if (!id || !title) return undefined;
	const startDate = typeof value.startDate === "string" && value.startDate.trim() ? value.startDate.trim() : undefined;
	const duration = typeof value.duration === "number" && Number.isSafeInteger(value.duration) && value.duration > 0 ? value.duration : undefined;
	return { id, title, ...(startDate ? { startDate } : {}), ...(duration !== undefined ? { duration } : {}) };
}

function normalizeProjectV2Query(value: string | undefined): string | undefined {
	return normalizeOptionalTrimmedText(value, "query", { nullByteMessage: "project query must not contain null bytes." });
}

function normalizeProjectV2ListLimit(value: number | undefined): number {
	return Math.min(normalizePaginationLimit(value) ?? MAX_TOOL_PROJECTS, MAX_TOOL_PROJECTS);
}

function normalizeProjectV2Scope(value: GitHubProjectV2Scope | undefined): GitHubProjectV2Scope {
	if (value === undefined) return "repository";
	if (value === "repository" || value === "organization" || value === "user") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Project scope must be repository, organization, or user.", { field: "scope" });
}

function normalizeProjectV2Owner(scope: GitHubProjectV2Scope, value: string | undefined, repository: GitHubRepository): string {
	if (scope === "repository") {
		if (typeof value === "string" && value.trim()) {
			throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "owner is only supported when scope is organization or user; repository scope uses the resolved current repository.", { field: "owner", scope });
		}
		return repository.owner;
	}
	const owner = typeof value === "string" && value.trim() ? value.trim() : repository.owner;
	if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Project owner must be a valid GitHub user or organization login.", { field: "owner", scope });
	}
	return owner;
}

function normalizeProjectV2Id(value: string | undefined): string | undefined {
	return normalizeOptionalGitHubOpaqueId(value, "projectId");
}

function normalizeProjectV2IdRequired(value: string | undefined, field: string): string {
	return normalizeRequiredGitHubOpaqueId(value, field);
}

function normalizeProjectV2FieldValueInput(value: GitHubProjectV2FieldValueInput): GitHubProjectV2FieldValueInput {
	if (!isObject(value)) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Project field value is required.", { field: "value" });
	}
	const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
	if (entries.length !== 1) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Project field updates must provide exactly one value field.", { fields: entries.map(([key]) => key) });
	}
	const [field, rawValue] = entries[0];
	if (field === "singleSelectOptionId") return { singleSelectOptionId: normalizeProjectV2IdRequired(rawValue as string | undefined, "singleSelectOptionId") };
	if (field === "iterationId") return { iterationId: normalizeProjectV2IdRequired(rawValue as string | undefined, "iterationId") };
	if (field === "date") return { date: normalizeProjectV2DateValue(rawValue) };
	if (field === "text") return { text: normalizeProjectV2TextValue(rawValue) };
	if (field === "number") return { number: normalizeProjectV2NumberValue(rawValue) };
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Unsupported ProjectV2 field value key.", { field });
}

function normalizeProjectV2DateValue(value: unknown): string {
	if (typeof value !== "string") throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "date value is required for date project fields.", { field: "date" });
	const date = value.trim();
	if (!isValidIsoDateOnly(date)) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "date must be a valid YYYY-MM-DD date for GitHub Projects v2 date fields.", { field: "date" });
	return date;
}

function normalizeProjectV2TextValue(value: unknown): string {
	if (typeof value !== "string") throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "text value is required for text project fields.", { field: "text" });
	if (value.includes("\0")) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "text project field value must not contain null bytes.", { field: "text" });
	if (!value.trim()) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "text project field value must not be blank.", { field: "text" });
	return value;
}

function normalizeProjectV2NumberValue(value: unknown): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "numberValue must be a finite number for number project fields.", { field: "numberValue" });
	}
	return value;
}

function normalizeProjectV2ProjectNumber(value: number | undefined): number {
	return normalizePositiveSafeInteger(value, "projectNumber", { message: "projectNumber must be a positive integer when projectId is not provided." });
}

function normalizeProjectV2FieldLimit(value: number | undefined): number {
	return normalizeBoundedInteger(value, "fieldLimit", { max: 50, defaultValue: 25 });
}

function normalizeProjectV2OptionLimit(value: number | undefined): number {
	return normalizeBoundedInteger(value, "optionLimit", { max: 25, defaultValue: 25 });
}

function normalizeProjectV2IterationLimit(value: number | undefined): number {
	return normalizeBoundedInteger(value, "iterationLimit", { max: 25, defaultValue: 25 });
}

function normalizeSubIssueRelationshipLimit(value: number | undefined): number {
	return normalizeBoundedInteger(value, "limit", { max: 100, defaultValue: 25, message: "sub-issue relationship limit must be an integer between 1 and 100." });
}

function normalizeIssueDevelopmentLinkLimit(value: number | undefined): number {
	return normalizeBoundedInteger(value, "limit", { max: MAX_TOOL_DEVELOPMENT_LINKS, defaultValue: 25, message: `development link limit must be an integer between 1 and ${MAX_TOOL_DEVELOPMENT_LINKS}.` });
}

function buildIssueListQuery(filters: GitHubIssueListFilters, limit: number | undefined): Record<string, string> {
	const state = normalizeIssueListState(filters.state);
	return compactQuery({
		state,
		per_page: String(Math.min(limit ?? 100, 100)),
		labels: normalizeStringList(filters.labels).join(",") || undefined,
		assignee: normalizeOptionalQueryValue(filters.assignee),
		creator: normalizeOptionalQueryValue(filters.creator),
		mentioned: normalizeOptionalQueryValue(filters.mentioned),
		milestone: normalizeOptionalQueryValue(filters.milestone),
		since: normalizeIssueSinceFilter(filters.since),
		sort: normalizeIssueListSort(filters.sort),
		direction: normalizeIssueListDirection(filters.direction),
	});
}

function buildIssueSearchRequestQuery(repository: string, filters: GitHubIssueSearchFilters, limit: number | undefined): Record<string, string> {
	const state = normalizeIssueListState(filters.state);
	const terms = [`repo:${repository}`, "is:issue"];
	const query = normalizeSearchText(filters.query);
	if (query) terms.push(query);
	if (state !== "all") terms.push(`state:${state}`);
	for (const label of normalizeStringList(filters.labels)) terms.push(`label:${quoteSearchQualifierValue(label)}`);
	const assignee = normalizeOptionalQueryValue(filters.assignee);
	if (assignee) terms.push(`assignee:${quoteSearchQualifierValue(assignee)}`);
	const creator = normalizeOptionalQueryValue(filters.creator);
	if (creator) terms.push(`author:${quoteSearchQualifierValue(creator)}`);
	const mentioned = normalizeOptionalQueryValue(filters.mentioned);
	if (mentioned) terms.push(`mentions:${quoteSearchQualifierValue(mentioned)}`);
	const milestone = normalizeOptionalQueryValue(filters.milestone);
	if (milestone) terms.push(`milestone:${quoteSearchQualifierValue(milestone)}`);
	const since = normalizeIssueSinceFilter(filters.since);
	if (since) terms.push(`updated:>=${since}`);
	return compactQuery({
		q: terms.join(" "),
		per_page: String(Math.min(limit ?? 100, 100)),
		sort: normalizeIssueListSort(filters.sort),
		order: normalizeIssueListDirection(filters.direction),
	});
}

function buildLabelListQuery(limit: number | undefined): Record<string, string> {
	return { per_page: String(Math.min(limit ?? 100, 100)) };
}

function buildMilestoneListQuery(filters: GitHubRepositoryMilestoneListFilters, limit: number | undefined): Record<string, string> {
	return compactQuery({
		state: normalizeMilestoneListState(filters.state),
		sort: normalizeMilestoneListSort(filters.sort),
		direction: normalizeMilestoneListDirection(filters.direction),
		per_page: String(Math.min(limit ?? 100, 100)),
	});
}

function buildAssigneeListQuery(limit: number | undefined): Record<string, string> {
	return { per_page: String(Math.min(limit ?? 100, 100)) };
}

function labelMatchesFilters(label: GitHubLabelResponse, nameFilter: string | undefined, queryFilter: string | undefined): boolean {
	const name = typeof label.name === "string" ? label.name.toLowerCase() : "";
	const description = typeof label.description === "string" ? label.description.toLowerCase() : "";
	if (nameFilter && !name.includes(nameFilter)) return false;
	if (queryFilter && !name.includes(queryFilter) && !description.includes(queryFilter)) return false;
	return true;
}

function assigneeMatchesFilters(assignee: GitHubUserResponse, loginFilter: string | undefined, queryFilter: string | undefined): boolean {
	const login = typeof assignee.login === "string" ? assignee.login.toLowerCase() : "";
	const type = typeof assignee.type === "string" ? assignee.type.toLowerCase() : "";
	const profileUrl = typeof assignee.html_url === "string" ? assignee.html_url.toLowerCase() : "";
	const apiUrl = typeof assignee.url === "string" ? assignee.url.toLowerCase() : "";
	const id = typeof assignee.id === "number" && Number.isSafeInteger(assignee.id) ? String(assignee.id) : "";
	if (loginFilter && !login.includes(loginFilter)) return false;
	if (queryFilter && !login.includes(queryFilter) && !type.includes(queryFilter) && !profileUrl.includes(queryFilter) && !apiUrl.includes(queryFilter) && !id.includes(queryFilter)) return false;
	return true;
}

function normalizeOptionalTextFilter(value: string | undefined, field: string): string | undefined {
	return normalizeOptionalLowercaseTextFilter(value, field);
}

function normalizePaginationLimit(limit: number | undefined): number | undefined {
	if (limit === undefined) return undefined;
	return normalizePositiveSafeInteger(limit, "limit", { message: "Issue list limit must be a positive integer." });
}

function normalizeIssueListState(state: GitHubIssueListState | undefined): GitHubIssueListState {
	if (state === undefined) return "open";
	if (state === "open" || state === "closed" || state === "all") return state;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Issue state must be open, closed, or all.", { field: "state" });
}

function normalizeMilestoneListState(state: GitHubMilestoneListState | undefined): GitHubMilestoneListState {
	if (state === undefined) return "open";
	if (state === "open" || state === "closed" || state === "all") return state;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone state must be open, closed, or all.", { field: "state" });
}

function normalizeIssueListSort(sort: GitHubIssueListSort | undefined): GitHubIssueListSort | undefined {
	if (sort === undefined) return undefined;
	if (sort === "created" || sort === "updated" || sort === "comments") return sort;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Issue sort must be created, updated, or comments.", { field: "sort" });
}

function normalizeMilestoneListSort(sort: GitHubMilestoneListSort | undefined): GitHubMilestoneListSort | undefined {
	if (sort === undefined) return undefined;
	if (sort === "due_on" || sort === "completeness") return sort;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone sort must be due_on or completeness.", { field: "sort" });
}

function normalizeIssueListDirection(direction: GitHubIssueListDirection | undefined): GitHubIssueListDirection | undefined {
	if (direction === undefined) return undefined;
	if (direction === "asc" || direction === "desc") return direction;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Issue list direction must be asc or desc.", { field: "direction" });
}

function normalizeMilestoneListDirection(direction: GitHubMilestoneListDirection | undefined): GitHubMilestoneListDirection | undefined {
	if (direction === undefined) return undefined;
	if (direction === "asc" || direction === "desc") return direction;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Milestone list direction must be asc or desc.", { field: "direction" });
}

function normalizeIssueSinceFilter(value: string | undefined): string | undefined {
	return normalizeOptionalIsoDateOrTimestamp(value, "since", {
		invalidMessage: "since must be a valid ISO YYYY-MM-DD date or ISO 8601 timestamp with timezone.",
	});
}

function normalizeOptionalQueryValue(value: string | undefined): string | undefined {
	return normalizeOptionalTrimmedText(value, "filter", { nullByteMessage: "Issue list filter values must not contain null bytes." });
}

function normalizeStringList(values: string[] | undefined): string[] {
	if (!Array.isArray(values)) return [];
	return [...new Set(values.map((value) => normalizeOptionalQueryValue(value)).filter((value): value is string => value !== undefined))];
}

function normalizeSubIssueReorderNumbers(values: number[] | undefined, parentNumber: number): number[] {
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

function assertReorderableSubIssueList(
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

function moveNativeSubIssue(
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

function nativeSubIssueToSafeSummary(repository: string, issue: NativeSubIssueSummary): ToolIssueSummary {
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

function normalizeSearchText(value: string): string | undefined {
	const query = normalizeOptionalQueryValue(value);
	if (!query) return undefined;
	if (/\b(?:repo|org|user):|\b(?:is|type):(?:pr|pull-request|pullrequest)\b/i.test(query)) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			"Issue search query must not include repository, owner, or pull-request boundary qualifiers; IssueMe adds repo:<owner>/<repo> is:issue automatically.",
			{ field: "query" },
		);
	}
	return query;
}

function quoteSearchQualifierValue(value: string): string {
	const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
	return /[\s:]/.test(escaped) ? `"${escaped}"` : escaped;
}

function compactQuery(input: Record<string, string | undefined>): Record<string, string> {
	return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Record<string, string>;
}

function isPullRequestIssueResponse(issue: GitHubIssueResponse): boolean {
	return issue.pull_request !== undefined && issue.pull_request !== null;
}

function isIssueSearchResponse(value: unknown): value is GitHubIssueSearchResponse {
	if (!isObject(value)) return false;
	if (!Array.isArray(value.items)) return false;
	if (value.total_count !== undefined && typeof value.total_count !== "number") return false;
	if (value.incomplete_results !== undefined && typeof value.incomplete_results !== "boolean") return false;
	return true;
}

function normalizeIssueSearchResponse(value: GitHubIssueSearchResponse): NormalizedIssueSearchResponse {
	return {
		items: Array.isArray(value.items) ? value.items as GitHubIssueResponse[] : [],
		...(typeof value.total_count === "number" && Number.isSafeInteger(value.total_count) && value.total_count >= 0 ? { totalCount: value.total_count } : {}),
		...(typeof value.incomplete_results === "boolean" ? { incompleteResults: value.incomplete_results } : {}),
	};
}

function requireIssueNodeId(issue: GitHubIssueResponse, label: string): string {
	if (typeof issue.node_id === "string" && issue.node_id.trim()) return issue.node_id;
	throw new GitHubApiError(`GitHub ${label} response did not include node_id required for native sub-issue GraphQL mutations.`, {
		code: ISSUEME_ERROR_CODES.GITHUB_ISSUE_SHAPE_INVALID,
		recoveryHint: "Retry after refreshing the issue from GitHub; if node_id is still absent, update IssueMe or verify GitHub issue API compatibility.",
	});
}

function normalizeSubIssueMutationResult(data: SubIssueMutationData, field: "addSubIssue" | "removeSubIssue", repository: string): NativeSubIssueMutationResult {
	const payload = data[field];
	if (!isObject(payload)) {
		throw new GitHubApiError(`GitHub GraphQL ${field} mutation returned an unexpected response shape.`, { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	const parent = normalizeNativeSubIssueSummary(payload.issue, repository);
	const child = normalizeNativeSubIssueSummary(payload.subIssue, repository);
	if (!parent || !child) {
		throw new GitHubApiError(`GitHub GraphQL ${field} mutation returned incomplete issue data.`, { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	return { parent, child };
}

function normalizeReprioritizeSubIssueResult(data: SubIssueMutationData, repository: string, child: NativeSubIssueSummary): NativeSubIssueMutationResult {
	const payload = data.reprioritizeSubIssue;
	if (!isObject(payload)) {
		throw new GitHubApiError("GitHub GraphQL reprioritizeSubIssue mutation returned an unexpected response shape.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	const parent = normalizeNativeSubIssueSummary(payload.issue, repository);
	if (!parent) {
		throw new GitHubApiError("GitHub GraphQL reprioritizeSubIssue mutation returned incomplete parent issue data.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	return { parent, child };
}

function normalizeNativeSubIssueRelationshipResult(
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

function normalizeNativeSubIssueSummary(value: unknown, repository: string): NativeSubIssueSummary | undefined {
	if (!isObject(value)) return undefined;
	const id = value.id;
	const number = value.number;
	const title = value.title;
	const state = normalizeGraphQLIssueState(value.state);
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
		html_url: typeof url === "string" && url.trim() ? url : `https://github.com/${repository}/issues/${number}`,
	};
}

function normalizeIssueDevelopmentLinksResult(
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
	const number = typeof value.number === "number" && Number.isSafeInteger(value.number) && value.number > 0 ? value.number : undefined;
	const title = typeof value.title === "string" && value.title.trim() ? value.title.trim() : undefined;
	if (number === undefined || !title) return undefined;
	const state = normalizeGraphQLPullRequestState(value.state, value.merged);
	const url = typeof value.url === "string" && value.url.trim() ? value.url.trim() : `https://github.com/${metadata.repository}/pull/${number}`;
	const branchName = typeof value.headRefName === "string" && value.headRefName.trim() ? value.headRefName.trim() : undefined;
	const baseBranchName = typeof value.baseRefName === "string" && value.baseRefName.trim() ? value.baseRefName.trim() : undefined;
	return {
		type: "pull_request",
		referenceTypes: [referenceType],
		number,
		title,
		...(state ? { state } : {}),
		html_url: url,
		...(branchName ? { branchName } : {}),
		...(baseBranchName ? { baseBranchName } : {}),
		...(typeof value.isDraft === "boolean" ? { isDraft: value.isDraft } : {}),
		...(metadata.willCloseTarget !== undefined ? { willCloseTarget: metadata.willCloseTarget } : {}),
		...(metadata.closedBy !== undefined ? { closedBy: metadata.closedBy } : {}),
	};
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
	return {
		type: "commit",
		referenceTypes: [referenceType],
		...(url ? { html_url: url } : {}),
		...(oid ? { commitOid: oid } : {}),
		...(message ? { message } : {}),
		...(metadata.willCloseTarget !== undefined ? { willCloseTarget: metadata.willCloseTarget } : {}),
		...(metadata.closedBy !== undefined ? { closedBy: metadata.closedBy } : {}),
	};
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

function normalizeGraphQLIssueState(value: unknown): "open" | "closed" | undefined {
	if (value === "OPEN" || value === "open") return "open";
	if (value === "CLOSED" || value === "closed") return "closed";
	return undefined;
}

function isSubIssueOperation(operationName: string): boolean {
	return operationName === "IssueMeAddSubIssue"
		|| operationName === "IssueMeRemoveSubIssue"
		|| operationName === "IssueMeReprioritizeSubIssue"
		|| operationName === "IssueMeListSubIssues";
}

function isProjectV2Operation(operationName: string): boolean {
	return operationName === "IssueMeListProjectsV2"
		|| operationName === "IssueMeGetProjectV2FieldsById"
		|| operationName === "IssueMeGetProjectV2FieldsByNumber"
		|| operationName === "IssueMeAddIssueToProjectV2"
		|| operationName === "IssueMeValidateProjectV2ItemForUpdate"
		|| operationName === "IssueMeUpdateProjectV2ItemFieldValue";
}

function isDevelopmentLinkOperation(operationName: string): boolean {
	return operationName === "IssueMeListIssueDevelopmentLinks";
}

function subIssuePermissionError(operationName: string, detail: string): GitHubApiError {
	const actionName = operationName === "IssueMeAddSubIssue"
		? "AddSubIssue"
		: operationName === "IssueMeRemoveSubIssue"
			? "RemoveSubIssue"
			: operationName === "IssueMeReprioritizeSubIssue"
				? "ReprioritizeSubIssue"
				: "ListSubIssues";
	return new GitHubApiError(
		`GitHub GraphQL ${actionName} was forbidden. The GH_TOKEN/GITHUB_TOKEN user or app lacks permission for native sub-issues on this repository. IssueMe did not fall back to body-only references. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_SUB_ISSUE_FORBIDDEN,
			status: 403,
			path: `${GITHUB_API_BASE_URL}/graphql`,
			recoveryHint: "Use a token/user with access to the repository and permission for GitHub native sub-issues, then rerun the IssueMe sub-issue tool.",
		},
	);
}

function subIssueUnsupportedError(operationName: string, detail: string): GitHubApiError {
	return new GitHubApiError(
		`GitHub GraphQL native sub-issue operation ${operationName} is unavailable or unsupported for this repository/API. IssueMe did not fall back to body-only references. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_SUB_ISSUE_UNSUPPORTED,
			path: `${GITHUB_API_BASE_URL}/graphql`,
			recoveryHint: "Use a GitHub environment that exposes native sub-issues through GraphQL, or manage the relationship in GitHub UI; IssueMe will not create body-only relationship fallbacks.",
		},
	);
}

function projectV2PermissionError(operationName: string, detail: string): GitHubApiError {
	const action = operationName === "IssueMeListProjectsV2"
		? "project discovery"
		: operationName === "IssueMeGetProjectV2FieldsById" || operationName === "IssueMeGetProjectV2FieldsByNumber"
			? "project field discovery"
			: "project item management";
	const permission = action === "project item management" ? "read/write permission" : "read permission";
	return new GitHubApiError(
		`GitHub GraphQL Projects v2 ${action} was forbidden. The GH_TOKEN/GITHUB_TOKEN user or app lacks access to the requested repository, organization, or user project scope, or lacks ${permission} for GitHub Projects. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_PROJECTS_V2_FORBIDDEN,
			status: 403,
			path: `${GITHUB_API_BASE_URL}/graphql`,
			recoveryHint: "Use a token/user with access to the requested GitHub Projects v2 board and appropriate project read/write permissions (for example project or read:project access plus write access for item mutations), then rerun the IssueMe project tool.",
		},
	);
}

function developmentLinksPermissionError(detail: string): GitHubApiError {
	return new GitHubApiError(
		`GitHub GraphQL issue development-link inspection was forbidden. The GH_TOKEN/GITHUB_TOKEN user or app lacks permission to inspect linked pull requests, commits, or development references for this issue. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_DEVELOPMENT_LINKS_FORBIDDEN,
			status: 403,
			path: `${GITHUB_API_BASE_URL}/graphql`,
			recoveryHint: "Use a token/user with access to the repository, linked pull requests, and referenced commits, then rerun issueme_list_issue_development_links.",
		},
	);
}

function developmentLinksUnsupportedError(detail: string): GitHubApiError {
	return new GitHubApiError(
		`GitHub GraphQL issue development-link inspection is unavailable or unsupported for this repository/API. IssueMe did not guess from issue body text. GitHub detail: ${detail}`,
		{
			code: ISSUEME_ERROR_CODES.GITHUB_DEVELOPMENT_LINKS_UNSUPPORTED,
			path: `${GITHUB_API_BASE_URL}/graphql`,
			recoveryHint: "Use a GitHub environment that exposes issue timeline development references through GraphQL, or inspect linked development in GitHub UI; IssueMe will not invent body-only development links.",
		},
	);
}

function isForbiddenGraphQLError(error: unknown): boolean {
	if (!isObject(error)) return false;
	const type = typeof error.type === "string" ? error.type : undefined;
	const extensions = isObject(error.extensions) ? error.extensions : undefined;
	const code = typeof extensions?.code === "string" ? extensions.code : undefined;
	const message = typeof error.message === "string" ? error.message : "";
	return type === "FORBIDDEN" || code === "FORBIDDEN" || /forbidden|resource not accessible/i.test(message);
}

function isUnsupportedSubIssueGraphQLError(error: unknown): boolean {
	if (!isObject(error)) return false;
	const type = typeof error.type === "string" ? error.type : undefined;
	const extensions = isObject(error.extensions) ? error.extensions : undefined;
	const code = typeof extensions?.code === "string" ? extensions.code : undefined;
	const message = typeof error.message === "string" ? error.message : "";
	return type === "undefinedField"
		|| code === "undefinedField"
		|| /subIssues|sub_issues|parent|reprioritizeSubIssue|ReprioritizeSubIssue|subIssue/i.test(message) && /doesn'?t exist|undefined|unsupported|not supported|not available/i.test(message);
}

function isUnsupportedDevelopmentLinksGraphQLError(error: unknown): boolean {
	if (!isObject(error)) return false;
	const type = typeof error.type === "string" ? error.type : undefined;
	const extensions = isObject(error.extensions) ? error.extensions : undefined;
	const code = typeof extensions?.code === "string" ? extensions.code : undefined;
	const message = typeof error.message === "string" ? error.message : "";
	return type === "undefinedField"
		|| code === "undefinedField"
		|| /timelineItems|ConnectedEvent|CrossReferencedEvent|ReferencedEvent|ClosedEvent|willCloseTarget|headRefName|closer|development/i.test(message) && /doesn'?t exist|undefined|unsupported|not supported|not available/i.test(message);
}

function formatGraphQLErrors(errors: unknown[]): string {
	return errors
		.map((error) => {
			if (!isObject(error)) return "Unknown GraphQL error";
			const message = typeof error.message === "string" ? error.message : "Unknown GraphQL error";
			const type = typeof error.type === "string" ? error.type : undefined;
			const extensions = isObject(error.extensions) && typeof error.extensions.code === "string" ? error.extensions.code : undefined;
			return [type ?? extensions, message].filter(Boolean).join(": ");
		})
		.join("; ");
}

function compactObject<T extends object>(input: T): Partial<T> {
	return Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function parseNextLink(linkHeader: string | null): string | undefined {
	if (!linkHeader) return undefined;
	for (const part of linkHeader.split(",")) {
		const match = part.match(/<([^>]+)>;\s*rel="next"/);
		if (match) return match[1];
	}
	return undefined;
}

function safePath(url: URL): string {
	return `${url.origin}${url.pathname}`;
}

function commentBelongsToIssue(
	repository: GitHubRepository,
	comment: GitHubCommentResponse,
	issueNumber: number,
	commentId: number,
): boolean {
	const issueUrlIssueNumber = parseGitHubApiIssueUrl(comment.issue_url, repository);
	if (issueUrlIssueNumber !== undefined) return issueUrlIssueNumber === issueNumber;
	const htmlIssueNumber = parseGitHubIssueCommentHtmlUrl(comment.html_url, repository, commentId);
	return htmlIssueNumber === issueNumber;
}

function parseGitHubApiIssueUrl(value: unknown, repository: GitHubRepository): number | undefined {
	if (typeof value !== "string") return undefined;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	const expectedBase = new URL(GITHUB_API_BASE_URL);
	if (url.protocol !== "https:" || url.host !== expectedBase.host) return undefined;
	const [repos, owner, repo, issues, number, ...rest] = url.pathname.split("/").filter(Boolean);
	if (repos !== "repos" || issues !== "issues" || rest.length > 0 || !ownerRepoMatches(repository, owner, repo)) return undefined;
	return parsePositiveIssueNumber(number);
}

function parseGitHubIssueCommentHtmlUrl(value: unknown, repository: GitHubRepository, commentId: number): number | undefined {
	if (typeof value !== "string") return undefined;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return undefined;
	}
	if (url.protocol !== "https:" || url.hostname !== "github.com") return undefined;
	const [owner, repo, type, number, ...rest] = url.pathname.split("/").filter(Boolean);
	if (type !== "issues" || rest.length > 0 || !ownerRepoMatches(repository, owner, repo)) return undefined;
	if (url.hash !== `#issuecomment-${commentId}`) return undefined;
	return parsePositiveIssueNumber(number);
}

function ownerRepoMatches(repository: GitHubRepository, owner: string | undefined, repo: string | undefined): boolean {
	return owner?.toLowerCase() === repository.owner.toLowerCase() && repo?.toLowerCase() === repository.repo.toLowerCase();
}

function parsePositiveIssueNumber(value: string | undefined): number | undefined {
	if (!value || !/^\d+$/.test(value)) return undefined;
	const number = Number(value);
	return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function normalizePositiveIssueNumber(value: number | undefined, field: string): number {
	return normalizePositiveSafeInteger(value, field);
}

function issueResponseToSafeSummary(repository: string, issue: GitHubIssueResponse, fallbackNumber: number): ToolIssueSummary | undefined {
	if (issue.state !== "open" && issue.state !== "closed") return undefined;
	return {
		repository,
		number: typeof issue.number === "number" && Number.isSafeInteger(issue.number) ? issue.number : fallbackNumber,
		title: typeof issue.title === "string" ? issue.title : `#${fallbackNumber}`,
		state: issue.state,
		labels: [],
		assignees: [],
		html_url: typeof issue.html_url === "string" ? issue.html_url : `https://github.com/${repository}/issues/${fallbackNumber}`,
	};
}

function collectRequestStringValues(value: unknown): string[] {
	const values = new Set<string>();
	collectStringValues(value, values);
	return [...values].filter((item) => item.length > 0);
}

function collectStringValues(value: unknown, values: Set<string>): void {
	if (typeof value === "string") {
		values.add(value);
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectStringValues(item, values);
		return;
	}
	if (!isObject(value)) return;
	for (const item of Object.values(value)) collectStringValues(item, values);
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatRateLimitGuidance(rateLimit: Record<string, string | boolean | undefined>): string {
	const parts = [
		rateLimit.retryAfter ? `Retry-After: ${rateLimit.retryAfter} second(s).` : undefined,
		rateLimit.reset ? `Rate limit reset epoch: ${rateLimit.reset}.` : undefined,
		rateLimit.resource ? `Rate limit resource: ${rateLimit.resource}.` : undefined,
	].filter(Boolean);
	return parts.length ? parts.join(" ") : "No reset time was provided by GitHub.";
}

function readRateLimit(headers: Headers): Record<string, string | boolean | undefined> {
	const remaining = headers.get("x-ratelimit-remaining") ?? undefined;
	const reset = headers.get("x-ratelimit-reset") ?? undefined;
	const resource = headers.get("x-ratelimit-resource") ?? undefined;
	const retryAfter = headers.get("retry-after") ?? undefined;
	return {
		remaining,
		reset,
		resource,
		retryAfter,
		retryPolicy: "fail_fast",
		limited: remaining === "0" || retryAfter !== undefined,
	};
}
