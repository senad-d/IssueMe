import { GITHUB_API_BASE_URL, MAX_TOOL_PROJECTS } from "../constants.ts";
import { ClosedIssueMutationError, GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { GitHubRepository, IssueRelationshipSummary, ProjectV2OwnerType, ToolIssueSummary, ToolProjectFieldOptionSummary, ToolProjectFieldSummary, ToolProjectItemSummary, ToolProjectIterationSummary, ToolProjectSummary } from "../types.ts";
import { isValidIsoDateOnly } from "../utils/date.ts";
import { normalizeBoundedInteger, normalizeOptionalGitHubOpaqueId, normalizeOptionalTrimmedText, normalizePositiveSafeInteger, normalizeRequiredGitHubOpaqueId } from "../utils/validation.ts";
import { normalizeGraphQLIssueState } from "./graphql-normalizers.ts";
import type { GitHubProjectV2AddIssueInput, GitHubProjectV2FieldValueInput, GitHubProjectV2ItemMutationResult, GitHubProjectV2Scope } from "./client.ts";
import { isObject } from "./shared.ts";
export { connectionEndCursor, connectionHasNextPage, extractConnectionNodes } from "./shared.ts";

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

interface ProjectV2IdentityValidationData {
	node?: unknown;
}

interface ProjectV2ItemValidationData {
	node?: unknown;
}

interface ProjectV2AddValidationPolicy {
	scope?: GitHubProjectV2Scope;
	owner?: string;
}

interface ProjectV2FieldLimits {
	optionLimit: number;
	iterationLimit: number;
}

interface ProjectV2FieldBase {
	id: string;
	name: string;
	dataType: string;
}

interface ProjectV2FieldCollections {
	shownOptions?: ToolProjectFieldOptionSummary[];
	shownIterations?: ToolProjectIterationSummary[];
	shownCompletedIterations?: ToolProjectIterationSummary[];
	truncated: boolean;
	truncation: Record<string, unknown>;
}

// Bound Projects v2 discovery work while still allowing closed-board filtering to scan later pages.
export const PROJECTS_V2_LIST_PAGE_CAP = 10;

export function buildProjectsV2ListQuery(scope: GitHubProjectV2Scope): string {
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

export function buildProjectV2FieldsByIdQuery(): string {
	return `query IssueMeGetProjectV2FieldsById($projectId: ID!, $fieldsFirst: Int!) {
		node(id: $projectId) {
			... on ProjectV2 {
				...IssueMeProjectV2WithFields
			}
		}
		${projectV2WithFieldsFragment()}
	}`;
}

export function buildProjectV2FieldsByNumberQuery(scope: GitHubProjectV2Scope): string {
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
			... on Repository { nameWithOwner }
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

export function buildProjectV2AddValidationQuery(): string {
	return `query IssueMeValidateProjectV2ForAdd($projectId: ID!) {
		node(id: $projectId) {
			... on ProjectV2 { ...IssueMeProjectV2Summary }
		}
	}
	${projectV2SummaryFragment()}`;
}

export function buildAddIssueToProjectV2Mutation(): string {
	return `mutation IssueMeAddIssueToProjectV2($projectId: ID!, $contentId: ID!) {
		addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
			item { ...IssueMeProjectV2ItemSummary }
		}
	}
	${projectV2ItemSummaryFragment()}`;
}

export function buildUpdateProjectV2ItemFieldValueMutation(): string {
	return `mutation IssueMeUpdateProjectV2ItemFieldValue($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
		updateProjectV2ItemFieldValue(input: {projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: $value}) {
			projectV2Item { ...IssueMeProjectV2ItemSummary }
		}
	}
	${projectV2ItemSummaryFragment()}`;
}

export function buildProjectV2ItemValidationQuery(): string {
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
			... on Issue { id number title state url author { login } }
		}
	}`;
}

export function extractProjectV2Connection(data: ProjectV2ConnectionData, scope: GitHubProjectV2Scope): unknown {
	const ownerNode = projectV2OwnerNode(data, scope);
	if (!isObject(ownerNode)) {
		throw new GitHubApiError("GitHub GraphQL Projects v2 query returned an inaccessible owner or unexpected response shape.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	return ownerNode.projectsV2;
}

export function extractProjectV2FieldProject(data: ProjectV2FieldsData, input: { projectId?: string; scope: GitHubProjectV2Scope }): unknown {
	if (input.projectId) return data.node;
	const ownerNode = projectV2OwnerNode(data, input.scope);
	if (!isObject(ownerNode)) {
		throw new GitHubApiError("GitHub GraphQL Projects v2 field query returned an inaccessible owner or unexpected response shape.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	return ownerNode.projectV2;
}

function projectV2OwnerNode(data: ProjectV2ConnectionData | ProjectV2FieldsData, scope: GitHubProjectV2Scope): unknown {
	if (scope === "repository") return data.repository;
	if (scope === "organization") return data.organization;
	return data.user;
}

export function normalizeProjectV2OutputId(value: unknown, field: string): string | undefined {
	if (typeof value !== "string") return undefined;
	try {
		return normalizeRequiredGitHubOpaqueId(value, field);
	} catch {
		return undefined;
	}
}

export function normalizeProjectV2Summary(value: unknown): ToolProjectSummary | undefined {
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

export function requireProjectV2Summary(value: unknown): ToolProjectSummary {
	const project = normalizeProjectV2Summary(value);
	if (project) return project;
	throw new GitHubApiError("GitHub GraphQL Projects v2 query returned a malformed project collection member.", {
		code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID,
		path: `${GITHUB_API_BASE_URL}/graphql`,
	});
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

export function normalizeProjectV2FieldSummary(value: unknown, limits: ProjectV2FieldLimits): ToolProjectFieldSummary | undefined {
	if (!isObject(value)) return undefined;
	const base = normalizeProjectV2FieldBase(value);
	if (!base) return undefined;
	const collections = normalizeProjectV2FieldCollections(value, limits);
	return buildProjectV2FieldSummary(value, base, collections);
}

function normalizeProjectV2FieldBase(value: Record<string, unknown>): ProjectV2FieldBase | undefined {
	const id = normalizeProjectV2OutputId(value.id, "fieldId") ?? "";
	const name = typeof value.name === "string" ? value.name.trim() : "";
	const dataType = typeof value.dataType === "string" ? value.dataType.trim() : "";
	if (!id || !name || !dataType) return undefined;
	return { id, name, dataType };
}

function normalizeProjectV2FieldCollections(value: Record<string, unknown>, limits: ProjectV2FieldLimits): ProjectV2FieldCollections {
	const options = normalizeProjectV2FieldOptions(value.options);
	const configuration = isObject(value.configuration) ? value.configuration : undefined;
	const iterations = normalizeProjectV2Iterations(configuration?.iterations);
	const completedIterations = normalizeProjectV2Iterations(configuration?.completedIterations);
	const shownOptions = options?.slice(0, limits.optionLimit);
	const shownIterations = iterations?.slice(0, limits.iterationLimit);
	const shownCompletedIterations = completedIterations?.slice(0, limits.iterationLimit);
	const truncation = projectV2FieldTruncation(options, iterations, completedIterations, shownOptions, shownIterations, shownCompletedIterations, limits);
	return { shownOptions, shownIterations, shownCompletedIterations, truncated: Object.keys(truncation).length > 0, truncation };
}

function normalizeProjectV2FieldOptions(value: unknown): ToolProjectFieldOptionSummary[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.map(normalizeProjectV2FieldOption).filter((option): option is ToolProjectFieldOptionSummary => option !== undefined);
}

function normalizeProjectV2Iterations(value: unknown): ToolProjectIterationSummary[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.map(normalizeProjectV2Iteration).filter((iteration): iteration is ToolProjectIterationSummary => iteration !== undefined);
}

function projectV2FieldTruncation(
	options: ToolProjectFieldOptionSummary[] | undefined,
	iterations: ToolProjectIterationSummary[] | undefined,
	completedIterations: ToolProjectIterationSummary[] | undefined,
	shownOptions: ToolProjectFieldOptionSummary[] | undefined,
	shownIterations: ToolProjectIterationSummary[] | undefined,
	shownCompletedIterations: ToolProjectIterationSummary[] | undefined,
	limits: ProjectV2FieldLimits,
): Record<string, unknown> {
	const truncation: Record<string, unknown> = {};
	addProjectV2FieldTruncation(truncation, "options", options, shownOptions, limits.optionLimit);
	addProjectV2FieldTruncation(truncation, "iterations", iterations, shownIterations, limits.iterationLimit);
	addProjectV2FieldTruncation(truncation, "completedIterations", completedIterations, shownCompletedIterations, limits.iterationLimit);
	return truncation;
}

function addProjectV2FieldTruncation(
	truncation: Record<string, unknown>,
	key: string,
	values: unknown[] | undefined,
	shownValues: unknown[] | undefined,
	limit: number,
): void {
	if (values && values.length > limit) truncation[key] = { shown: shownValues?.length ?? 0, total: values.length, max: limit };
}

function buildProjectV2FieldSummary(value: Record<string, unknown>, base: ProjectV2FieldBase, collections: ProjectV2FieldCollections): ToolProjectFieldSummary {
	const summary: ToolProjectFieldSummary = { ...base };
	if (typeof value.__typename === "string") summary.type = value.__typename;
	applyProjectV2FieldCollections(summary, collections);
	return summary;
}

function applyProjectV2FieldCollections(summary: ToolProjectFieldSummary, collections: ProjectV2FieldCollections): void {
	if (collections.shownOptions !== undefined) summary.options = collections.shownOptions;
	if (collections.shownIterations !== undefined) summary.iterations = collections.shownIterations;
	if (collections.shownCompletedIterations !== undefined) summary.completedIterations = collections.shownCompletedIterations;
	if (collections.truncated) {
		summary.truncated = true;
		summary.truncation = collections.truncation;
	}
}

export function normalizeProjectV2ItemMutationResult(data: ProjectV2ItemMutationData, field: "addProjectV2ItemById" | "updateProjectV2ItemFieldValue", repository: string): GitHubProjectV2ItemMutationResult {
	const payload = data[field];
	if (!isObject(payload)) {
		throw new GitHubApiError(`GitHub GraphQL ${field} mutation returned an unexpected response shape.`, { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql`, mutationSettlement: "remote_success_known" });
	}
	const itemNode = field === "addProjectV2ItemById" ? payload.item : payload.projectV2Item;
	const item = normalizeProjectV2ItemSummary(itemNode, repository);
	if (!item) {
		throw new GitHubApiError(`GitHub GraphQL ${field} mutation returned incomplete project item data.`, { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql`, mutationSettlement: "remote_success_known" });
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

export function assertProjectV2AllowedForAdd(
	data: ProjectV2IdentityValidationData,
	input: { projectId: string; policy: ProjectV2AddValidationPolicy; repository: GitHubRepository },
): void {
	const project = normalizeProjectV2Summary(data.node);
	if (!project) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			"projectId must resolve to an accessible GitHub Projects v2 board before IssueMe adds an issue to it.",
			{ projectId: input.projectId },
			{ recoveryHint: "Use issueme_list_projects to rediscover the board ID in the intended repository, organization, or user scope before adding issues." },
		);
	}
	if (project.closed === true) {
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			"projectId resolved to a closed GitHub Projects v2 board; refusing to add an issue to it.",
			projectV2AddRefusalDetails(input.projectId, project, input.repository),
			{ recoveryHint: "Choose an open GitHub Projects v2 board or reopen the project before adding issues." },
		);
	}

	if (input.policy.scope) {
		const expectedOwner = input.policy.owner ?? expectedDefaultProjectV2Owner(input.policy.scope, input.repository);
		if (project.ownerType === input.policy.scope && projectOwnerEquals(project.owner, expectedOwner)) return;
		throw new IssueMeError(
			ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
			"projectId owner/scope did not match the requested GitHub Projects v2 add policy; refusing to add the issue to a different board.",
			{
				...projectV2AddRefusalDetails(input.projectId, project, input.repository),
				expectedOwner,
				expectedOwnerType: input.policy.scope,
			},
			{ recoveryHint: "Use issueme_list_projects with the intended scope/owner and pass the matching scope/owner with the discovered projectId." },
		);
	}

	if (isDefaultAllowedProjectV2AddOwner(project, input.repository)) return;
	throw new IssueMeError(
		ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
		"projectId must belong to the current repository or the current repository owner unless a matching scope/owner is provided; refusing to add the issue to a different board.",
		{
			...projectV2AddRefusalDetails(input.projectId, project, input.repository),
			defaultAllowedOwners: [input.repository.fullName, input.repository.owner],
		},
		{ recoveryHint: "Use issueme_list_projects to rediscover the intended board, then pass its scope/owner when adding an issue to a non-default project owner." },
	);
}

export function assertProjectV2ItemTargetsIssue(
	data: ProjectV2ItemValidationData,
	input: { projectId: string; itemId: string; issueNumber: number },
	repository: string,
): void {
	const item = data.node;
	if (!isObject(item)) throw inaccessibleProjectV2ItemError(input);
	const actualProjectId = requireProjectV2ItemProjectId(item);
	if (actualProjectId !== input.projectId) throw projectV2ItemProjectMismatchError(input, actualProjectId);
	const content = requireProjectV2ItemIssueContent(item, input);
	const issue = normalizeProjectV2ItemIssueValidation(content);
	if (issue.actualRepository.toLowerCase() !== repository.toLowerCase()) throw projectV2ItemRepositoryMismatchError(input, repository, issue.actualRepository);
	if (issue.actualIssueNumber !== input.issueNumber) throw projectV2ItemIssueNumberMismatchError(input, issue.actualIssueNumber);
	if (issue.state !== "open") throw new ClosedIssueMutationError(issue.actualIssueNumber, issue.state, projectV2ItemContentToSafeSummary(repository, content, issue.actualIssueNumber, issue.state));
}

function inaccessibleProjectV2ItemError(input: { projectId: string; itemId: string; issueNumber: number }): IssueMeError {
	return new IssueMeError(
		ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
		"itemId must resolve to an accessible GitHub Projects v2 item before IssueMe updates a project field.",
		{ itemId: input.itemId, projectId: input.projectId, issueNumber: input.issueNumber },
	);
}

function requireProjectV2ItemProjectId(item: Record<string, unknown>): string {
	const project = isObject(item.project) ? item.project : undefined;
	const actualProjectId = normalizeProjectV2OutputId(project?.id, "projectId");
	if (!actualProjectId) {
		throw new GitHubApiError("GitHub GraphQL ProjectV2 item validation returned incomplete project data.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	return actualProjectId;
}

function projectV2ItemProjectMismatchError(input: { projectId: string; itemId: string; issueNumber: number }, actualProjectId: string): IssueMeError {
	return new IssueMeError(
		ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
		"itemId must belong to projectId before IssueMe updates a project field.",
		{ itemId: input.itemId, projectId: input.projectId, actualProjectId, issueNumber: input.issueNumber },
	);
}

function requireProjectV2ItemIssueContent(item: Record<string, unknown>, input: { projectId: string; itemId: string; issueNumber: number }): Record<string, unknown> {
	const content = item.content;
	if (isObject(content) && content.__typename === "Issue") return content;
	throw new IssueMeError(
		ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
		"itemId must represent an issue item before IssueMe updates a project field.",
		{ itemId: input.itemId, projectId: input.projectId, issueNumber: input.issueNumber, contentType: projectV2ItemContentType(content) },
	);
}

function projectV2ItemContentType(content: unknown): string {
	if (isObject(content) && typeof content.__typename === "string") return content.__typename;
	return "unknown";
}

function normalizeProjectV2ItemIssueValidation(content: Record<string, unknown>): { actualRepository: string; actualIssueNumber: number; state: "open" | "closed" } {
	const repositoryNode = isObject(content.repository) ? content.repository : undefined;
	const actualRepository = typeof repositoryNode?.nameWithOwner === "string" ? repositoryNode.nameWithOwner.trim() : undefined;
	const actualIssueNumber = typeof content.number === "number" && Number.isSafeInteger(content.number) && content.number > 0 ? content.number : undefined;
	const state = normalizeGraphQLIssueState(content.state);
	if (!actualRepository || actualIssueNumber === undefined || !state) {
		throw new GitHubApiError("GitHub GraphQL ProjectV2 item validation returned incomplete issue data.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/graphql` });
	}
	return { actualRepository, actualIssueNumber, state };
}

function projectV2ItemRepositoryMismatchError(input: { projectId: string; itemId: string; issueNumber: number }, repository: string, actualRepository: string): IssueMeError {
	return new IssueMeError(
		ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
		"itemId must represent an issue in the resolved current repository before IssueMe updates a project field.",
		{ itemId: input.itemId, projectId: input.projectId, issueNumber: input.issueNumber, repository, actualRepository },
	);
}

function projectV2ItemIssueNumberMismatchError(input: { projectId: string; itemId: string; issueNumber: number }, actualIssueNumber: number): IssueMeError {
	return new IssueMeError(
		ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
		"itemId must represent the requested issueNumber before IssueMe updates a project field.",
		{ itemId: input.itemId, projectId: input.projectId, issueNumber: input.issueNumber, actualIssueNumber },
	);
}

function isDefaultAllowedProjectV2AddOwner(project: ToolProjectSummary, repository: GitHubRepository): boolean {
	if (project.ownerType === "repository") return projectOwnerEquals(project.owner, repository.fullName);
	return projectOwnerEquals(project.owner, repository.owner);
}

function projectOwnerEquals(left: string, right: string): boolean {
	return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function projectV2AddRefusalDetails(projectId: string, project: ToolProjectSummary, repository: GitHubRepository): Record<string, unknown> {
	return {
		projectId,
		repository: repository.fullName,
		project: {
			id: project.id,
			number: project.number,
			title: project.title,
			owner: project.owner,
			ownerType: project.ownerType,
			closed: project.closed === true,
		},
	};
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
	const summary: ToolProjectIterationSummary = { id, title };
	if (startDate) summary.startDate = startDate;
	if (duration !== undefined) summary.duration = duration;
	return summary;
}

export function normalizeProjectV2Query(value: string | undefined): string | undefined {
	return normalizeOptionalTrimmedText(value, "query", { nullByteMessage: "project query must not contain null bytes." });
}

export function normalizeProjectV2ListLimit(value: number | undefined): number {
	return Math.min(normalizePaginationLimit(value) ?? MAX_TOOL_PROJECTS, MAX_TOOL_PROJECTS);
}

export function normalizeProjectV2Scope(value: GitHubProjectV2Scope | undefined): GitHubProjectV2Scope {
	if (value === undefined) return "repository";
	if (value === "repository" || value === "organization" || value === "user") return value;
	throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Project scope must be repository, organization, or user.", { field: "scope" });
}

export function normalizeProjectV2Owner(scope: GitHubProjectV2Scope, value: string | undefined, repository: GitHubRepository): string {
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

export function normalizeProjectV2AddValidationPolicy(input: Pick<GitHubProjectV2AddIssueInput, "scope" | "owner">, repository: GitHubRepository): ProjectV2AddValidationPolicy {
	const hasOwner = typeof input.owner === "string" && input.owner.trim().length > 0;
	if (input.scope === undefined) {
		if (hasOwner) {
			throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "scope is required when owner is provided for a Projects v2 add preflight.", { field: "scope" });
		}
		return {};
	}
	const scope = normalizeProjectV2Scope(input.scope);
	return { scope, owner: expectedDefaultProjectV2Owner(scope, repository, input.owner) };
}

function expectedDefaultProjectV2Owner(scope: GitHubProjectV2Scope, repository: GitHubRepository, owner?: string): string {
	if (scope === "repository") {
		normalizeProjectV2Owner(scope, owner, repository);
		return repository.fullName;
	}
	return normalizeProjectV2Owner(scope, owner, repository);
}

export function normalizeProjectV2Id(value: string | undefined): string | undefined {
	return normalizeOptionalGitHubOpaqueId(value, "projectId");
}

export function normalizeProjectV2IdRequired(value: string | undefined, field: string): string {
	return normalizeRequiredGitHubOpaqueId(value, field);
}

export function normalizeProjectV2FieldValueInput(value: GitHubProjectV2FieldValueInput): GitHubProjectV2FieldValueInput {
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

export function normalizeProjectV2ProjectNumber(value: number | undefined): number {
	return normalizePositiveSafeInteger(value, "projectNumber", { message: "projectNumber must be a positive integer when projectId is not provided." });
}

export function normalizeProjectV2FieldLimit(value: number | undefined): number {
	return normalizeBoundedInteger(value, "fieldLimit", { max: 50, defaultValue: 25 });
}

export function normalizeProjectV2OptionLimit(value: number | undefined): number {
	return normalizeBoundedInteger(value, "optionLimit", { max: 25, defaultValue: 25 });
}

export function normalizeProjectV2IterationLimit(value: number | undefined): number {
	return normalizeBoundedInteger(value, "iterationLimit", { max: 25, defaultValue: 25 });
}

function normalizePaginationLimit(limit: number | undefined): number | undefined {
	if (limit === undefined) return undefined;
	return normalizePositiveSafeInteger(limit, "limit", { message: "Issue list limit must be a positive integer." });
}
