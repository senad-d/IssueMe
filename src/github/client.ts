import { GITHUB_API_BASE_URL, MAX_TOOL_ISSUES } from "../constants.ts";
import { ClosedIssueMutationError, GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { GitHubCommentResponse, GitHubIssueResponse, GitHubLabelListResponse, GitHubLabelResponse, GitHubMilestoneResponse, GitHubRepository, GitHubUserResponse, ProjectV2OwnerType, ToolProjectFieldSummary, ToolProjectItemSummary, ToolProjectSummary } from "../types.ts";
import { isValidGitHubLogin } from "../utils/github-login.ts";
import { buildIssueDevelopmentLinksQuery, normalizeIssueDevelopmentLinkLimit, normalizeIssueDevelopmentLinksResult } from "./development-links-client.ts";
import { mapGitHubGraphQLError } from "./graphql-errors.ts";
import { assigneeMatchesFilters, buildAssigneeListQuery, buildIssueListQuery, buildIssueSearchRequestQuery, buildLabelListQuery, buildMilestoneListQuery, commentBelongsToIssue, isIssueSearchResponse, isPullRequestIssueResponse, issueResponseToSafeSummary, labelMatchesFilters, normalizeIssueSearchResponse, normalizeIssueUpdateInput, normalizeOptionalTextFilter, normalizePaginationLimit, normalizePositiveCommentId, normalizePositiveIssueNumber, normalizePositiveMilestoneNumber } from "./issues-client.ts";
import { PROJECTS_V2_LIST_PAGE_CAP, assertProjectV2AllowedForAdd, assertProjectV2ItemTargetsIssue, buildAddIssueToProjectV2Mutation, buildProjectV2AddValidationQuery, buildProjectV2FieldsByIdQuery, buildProjectV2FieldsByNumberQuery, buildProjectV2ItemValidationQuery, buildProjectsV2ListQuery, buildUpdateProjectV2ItemFieldValueMutation, extractProjectV2Connection, extractProjectV2FieldProject, normalizeProjectV2AddValidationPolicy, normalizeProjectV2FieldLimit, normalizeProjectV2FieldSummary, normalizeProjectV2FieldValueInput, normalizeProjectV2Id, normalizeProjectV2IdRequired, normalizeProjectV2IterationLimit, normalizeProjectV2ListLimit, normalizeProjectV2OptionLimit, normalizeProjectV2Owner, normalizeProjectV2ProjectNumber, normalizeProjectV2Query, normalizeProjectV2Scope, normalizeProjectV2Summary, normalizeProjectV2ItemMutationResult } from "./projects-client.ts";
import { compactObject, connectionEndCursor, connectionHasNextPage, extractConnectionNodes, isObject } from "./shared.ts";
import { assertReorderableSubIssueList, buildSubIssueRelationshipsQuery, moveNativeSubIssue, normalizeNativeSubIssueRelationshipResult, normalizeReprioritizeSubIssueResult, normalizeSubIssueMutationResult, normalizeSubIssueRelationshipLimit, normalizeSubIssueReorderNumbers, requireIssueNodeId } from "./sub-issues-client.ts";
import { GitHubTransport, parseNextLink } from "./transport.ts";
import type { FetchLike, GitHubClientOptions, PaginationOptions } from "./transport.ts";

export type { FetchLike, GitHubClientOptions, PaginationOptions } from "./transport.ts";

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
}

export interface NativeSubIssueReorderResult {
	relationship: NativeSubIssueRelationshipResult;
	mutations: NativeSubIssueMutationResult[];
}

export interface GitHubIssueDevelopmentLinksResult {
	issue: NativeSubIssueSummary;
	links: import("../types.ts").ToolIssueDevelopmentLinkSummary[];
	timelineEventCount: number;
	truncated: boolean;
}

export class GitHubClient {
	readonly repository: GitHubRepository;
	private readonly transport: GitHubTransport;

	constructor(options: GitHubClientOptions) {
		this.repository = options.repository;
		this.transport = new GitHubTransport(options);
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
			const data = await this.graphqlRequest<Record<string, unknown>>(
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
		const projectPolicy = normalizeProjectV2AddValidationPolicy(input, this.repository);
		const issue = await this.ensureIssueOpen(issueNumber, signal);
		const contentId = requireIssueNodeId(issue, "issue");
		await this.ensureProjectV2AllowedForAdd(projectId, projectPolicy, signal);
		const data = await this.graphqlRequest<Record<string, unknown>>(
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
		const data = await this.graphqlRequest<Record<string, unknown>>(
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
		const milestoneNumber = normalizePositiveMilestoneNumber(number, "milestoneNumber");
		return this.request<GitHubMilestoneResponse>("PATCH", this.repoPath(`/milestones/${milestoneNumber}`), {
			body: compactObject(input),
			signal,
			validate: isObject,
		});
	}

	async deleteRepositoryMilestone(number: number, signal?: AbortSignal): Promise<void> {
		const milestoneNumber = normalizePositiveMilestoneNumber(number, "milestoneNumber");
		await this.request<void>("DELETE", this.repoPath(`/milestones/${milestoneNumber}`), {
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
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		return this.request<GitHubIssueResponse>("GET", this.repoPath(`/issues/${normalizedIssueNumber}`), { signal, validate: isObject });
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

	async createIssue(input: IssueCreateInput, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		return this.request<GitHubIssueResponse>("POST", this.repoPath("/issues"), {
			body: compactObject(input),
			signal,
			validate: isObject,
		});
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
		const data = await this.graphqlRequest<Record<string, unknown>>(
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
		const data = await this.graphqlRequest<Record<string, unknown>>(
			"IssueMeListIssueDevelopmentLinks",
			buildIssueDevelopmentLinksQuery(),
			{ owner: this.repository.owner, repo: this.repository.repo, issueNumber: normalizedIssueNumber, first: limit },
			signal,
		);
		return normalizeIssueDevelopmentLinksResult(data, this.repository.fullName, normalizedIssueNumber, limit);
	}

	async updateIssue(issueNumber: number, input: IssueUpdateInput, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const normalizedInput = normalizeIssueUpdateInput(input);
		await this.ensureIssueOpen(normalizedIssueNumber, signal);
		if (normalizedInput.labels !== undefined) await this.assertRepositoryLabelsExist(normalizedInput.labels, signal);
		if (normalizedInput.assignees !== undefined) await this.assertRepositoryAssigneesAssignable(normalizedInput.assignees, signal);
		return this.request<GitHubIssueResponse>("PATCH", this.repoPath(`/issues/${normalizedIssueNumber}`), {
			body: compactObject(normalizedInput),
			signal,
			validate: isObject,
		});
	}

	async addComment(issueNumber: number, body: string, signal?: AbortSignal): Promise<GitHubCommentResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		await this.ensureIssueOpen(normalizedIssueNumber, signal);
		return this.request<GitHubCommentResponse>("POST", this.repoPath(`/issues/${normalizedIssueNumber}/comments`), {
			body: { body },
			signal,
			validate: isObject,
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
		});
	}

	async deleteComment(issueNumber: number, commentId: number, signal?: AbortSignal): Promise<GitHubCommentResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		const normalizedCommentId = normalizePositiveCommentId(commentId, "commentId");
		const { comment } = await this.ensureCommentTargetsOpenIssue(normalizedIssueNumber, normalizedCommentId, signal);
		await this.request<void>("DELETE", this.repoPath(`/issues/comments/${normalizedCommentId}`), {
			signal,
			validate: (value) => value === undefined,
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

	async addAssignees(issueNumber: number, assignees: string[], signal?: AbortSignal): Promise<GitHubIssueResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		await this.ensureIssueOpen(normalizedIssueNumber, signal);
		await this.assertRepositoryAssigneesAssignable(assignees, signal);
		return this.request<GitHubIssueResponse>("POST", this.repoPath(`/issues/${normalizedIssueNumber}/assignees`), {
			body: { assignees },
			signal,
			validate: isObject,
		});
	}

	async removeAssignees(issueNumber: number, assignees: string[], signal?: AbortSignal): Promise<GitHubIssueResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		await this.ensureIssueOpen(normalizedIssueNumber, signal);
		return this.request<GitHubIssueResponse>("DELETE", this.repoPath(`/issues/${normalizedIssueNumber}/assignees`), {
			body: { assignees },
			signal,
			validate: isObject,
		});
	}

	async setAssignees(issueNumber: number, assignees: string[], signal?: AbortSignal): Promise<GitHubIssueResponse> {
		return this.updateIssue(issueNumber, { assignees }, signal);
	}

	async addLabels(issueNumber: number, labels: string[], signal?: AbortSignal): Promise<GitHubLabelListResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		await this.ensureIssueOpen(normalizedIssueNumber, signal);
		await this.assertRepositoryLabelsExist(labels, signal);
		return this.request<GitHubLabelListResponse>("POST", this.repoPath(`/issues/${normalizedIssueNumber}/labels`), {
			body: { labels },
			signal,
			validate: Array.isArray,
		});
	}

	async setLabels(issueNumber: number, labels: string[], signal?: AbortSignal): Promise<GitHubLabelListResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		await this.ensureIssueOpen(normalizedIssueNumber, signal);
		await this.assertRepositoryLabelsExist(labels, signal);
		return this.request<GitHubLabelListResponse>("PUT", this.repoPath(`/issues/${normalizedIssueNumber}/labels`), {
			body: { labels },
			signal,
			validate: Array.isArray,
		});
	}

	async removeLabel(issueNumber: number, label: string, signal?: AbortSignal): Promise<GitHubLabelListResponse | undefined> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		await this.ensureIssueOpen(normalizedIssueNumber, signal);
		try {
			return await this.request<GitHubLabelListResponse | undefined>(
				"DELETE",
				this.repoPath(`/issues/${normalizedIssueNumber}/labels/${encodeURIComponent(label)}`),
				{ signal, validate: (value) => value === undefined || Array.isArray(value) },
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
		});
	}

	async reopenIssue(issueNumber: number, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		const normalizedIssueNumber = normalizePositiveIssueNumber(issueNumber, "issueNumber");
		return this.request<GitHubIssueResponse>("PATCH", this.repoPath(`/issues/${normalizedIssueNumber}`), {
			body: { state: "open", state_reason: "reopened" },
			signal,
			validate: isObject,
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
		signal?: AbortSignal,
	): Promise<void> {
		const data = await this.graphqlRequest<Record<string, unknown>>(
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
		);
		return normalizeReprioritizeSubIssueResult(data, this.repository.fullName, child);
	}

	private async assertRepositoryLabelsExist(labels: string[], signal?: AbortSignal): Promise<void> {
		const missing: string[] = [];
		for (const label of [...new Set(labels)]) {
			const existing = await this.getRepositoryLabel(label, signal);
			if (!existing) missing.push(label);
		}
		if (missing.length > 0) {
			throw new IssueMeError(
				ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
				`Issue labels must already exist in repository ${this.repository.fullName}; missing label(s): ${missing.join(", ")}.`,
				{ field: "labels", repository: this.repository.fullName, missingLabels: missing },
				{ recoveryHint: "Use issueme_list_labels to discover existing labels or issueme_manage_label to create repository labels before applying them to issues." },
			);
		}
	}

	private async assertRepositoryAssigneesAssignable(assignees: string[], signal?: AbortSignal): Promise<void> {
		const invalid: string[] = [];
		for (const assignee of [...new Set(assignees)]) {
			if (!await this.isRepositoryAssigneeAssignable(assignee, signal)) invalid.push(assignee);
		}
		if (invalid.length > 0) {
			throw new IssueMeError(
				ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
				`Issue assignees must be assignable users in repository ${this.repository.fullName}; invalid assignee(s): ${invalid.join(", ")}.`,
				{ field: "assignees", repository: this.repository.fullName, invalidAssignees: invalid },
				{ recoveryHint: "Use issueme_list_assignees to discover users assignable to this repository before applying assignees." },
			);
		}
	}

	private async graphqlRequest<T>(operationName: string, query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
		return this.transport.graphqlRequest<T>(operationName, query, variables, signal, mapGitHubGraphQLError);
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
		options: PaginationOptions & { filter?: (item: T) => boolean } = {},
	): Promise<{ items: T[]; truncated: boolean }> {
		return this.transport.paginateFiltered<T>(path, query, signal, options);
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
		let nextUrl: string | undefined = this.transport.buildUrl("/search/issues", query).toString();
		while (nextUrl) {
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
			if (nextUrl) this.transport.assertAllowedPaginationUrl(nextUrl);
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
