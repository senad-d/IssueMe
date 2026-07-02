export interface IssueMeConfig {
	issueDirectory: string;
	allowedIssueCreator: string;
	defaultLabels: string[];
	defaultAssignees: string[];
	defaultSkillPath: string | null;
}

export interface GitHubRepository {
	owner: string;
	repo: string;
	fullName: string;
}

export type TokenKey = "GH_TOKEN" | "GITHUB_TOKEN";
export type TokenSource = `project-env:${TokenKey}` | `process-env:${TokenKey}`;

export interface TokenResolution {
	token: string;
	key: TokenKey;
	source: TokenSource;
	fromProjectEnv: boolean;
}

export interface TokenStatus {
	present: boolean;
	source?: TokenSource;
	message: string;
	error?: boolean;
}

export type IssueState = "open" | "closed";

export interface IssueCommentRecord {
	id: number;
	author: string;
	body: string;
	created_at: string;
	updated_at: string;
	html_url: string;
}

export interface IssueRelationshipSummary {
	number: number;
	title: string;
	state?: IssueState;
	creator?: string;
	html_url: string;
}

export interface IssueRecord {
	schemaVersion: 1;
	repository: string;
	number: number;
	title: string;
	state: IssueState;
	creator?: string;
	body: string;
	labels: string[];
	assignees: string[];
	milestone: string | null;
	parent_issue?: IssueRelationshipSummary | null;
	sub_issues?: IssueRelationshipSummary[];
	sub_issues_count?: number;
	comments: IssueCommentRecord[];
	comments_truncated?: boolean;
	comments_count?: number;
	comments_fetch_limit?: number;
	html_url: string;
	created_at: string;
	updated_at: string;
	closed_at: string | null;
	synced_at: string;
}

export interface IssueFileMetadata {
	path: string;
	fileName: string;
	repository: string;
	number: number;
	title: string;
	state: IssueState;
	creator?: string;
	updated_at: string;
}

export interface InvalidIssueFileDiagnostic {
	path: string;
	fileName: string;
	reason: string;
}

export interface IssueFileListResult {
	files: IssueFileMetadata[];
	invalidFiles: InvalidIssueFileDiagnostic[];
}

export interface IssueLookupResult {
	record: IssueRecord;
	path: string;
	metadata: IssueFileMetadata;
}

export interface IssueWriteResult {
	action: "created" | "updated" | "renamed" | "unchanged" | "removed";
	path?: string;
	removedPaths: string[];
}

export interface GitHubUserResponse {
	login?: unknown;
	id?: unknown;
	type?: unknown;
	html_url?: unknown;
	url?: unknown;
}

export interface GitHubLabelResponse {
	name?: unknown;
	description?: unknown;
	color?: unknown;
	default?: unknown;
	url?: unknown;
}

export type GitHubLabelListResponse = GitHubLabelResponse[];

export interface GitHubMilestoneResponse {
	number?: unknown;
	title?: unknown;
	state?: unknown;
	description?: unknown;
	due_on?: unknown;
	open_issues?: unknown;
	closed_issues?: unknown;
	html_url?: unknown;
	url?: unknown;
}

export interface GitHubIssueResponse {
	node_id?: unknown;
	number?: unknown;
	title?: unknown;
	state?: unknown;
	user?: unknown;
	body?: unknown;
	labels?: unknown;
	assignees?: unknown;
	milestone?: unknown;
	parent?: unknown;
	parent_issue?: unknown;
	sub_issues?: unknown;
	sub_issues_summary?: unknown;
	html_url?: unknown;
	url?: unknown;
	created_at?: unknown;
	updated_at?: unknown;
	closed_at?: unknown;
	comments?: unknown;
	pull_request?: unknown;
}

export interface GitHubCommentResponse {
	id?: unknown;
	user?: unknown;
	body?: unknown;
	created_at?: unknown;
	updated_at?: unknown;
	html_url?: unknown;
	issue_url?: unknown;
}

export interface ToolIssueSummary {
	repository: string;
	number: number;
	title: string;
	state: IssueState;
	creator?: string;
	labels: string[];
	assignees: string[];
	html_url: string;
	localPath?: string;
	parentIssue?: IssueRelationshipSummary | null;
	subIssues?: IssueRelationshipSummary[];
	subIssuesCount?: number;
	commentsTruncated?: boolean;
	commentsCount?: number;
	commentsFetchLimit?: number;
}

export interface ToolCommentSummary {
	id?: number;
	html_url?: string;
}

export interface ToolLabelSummary {
	name: string;
	description?: string;
	color?: string;
	default?: boolean;
	url?: string;
}

export interface ToolMilestoneSummary {
	number: number;
	title: string;
	state: IssueState;
	description?: string;
	due_on?: string;
	open_issues?: number;
	closed_issues?: number;
	html_url?: string;
	url?: string;
}

export interface ToolAssigneeSummary {
	login: string;
	id?: number;
	type?: string;
	html_url?: string;
	url?: string;
}

export type ProjectV2OwnerType = "repository" | "organization" | "user";

export interface ToolProjectSummary {
	id: string;
	title: string;
	number: number;
	owner: string;
	ownerType: ProjectV2OwnerType;
	url?: string;
	shortDescription?: string;
	closed?: boolean;
	public?: boolean;
}

export interface ToolProjectFieldOptionSummary {
	id: string;
	name: string;
	color?: string;
	description?: string;
}

export interface ToolProjectIterationSummary {
	id: string;
	title: string;
	startDate?: string;
	duration?: number;
}

export interface ToolProjectFieldSummary {
	id: string;
	name: string;
	dataType: string;
	type?: string;
	options?: ToolProjectFieldOptionSummary[];
	iterations?: ToolProjectIterationSummary[];
	completedIterations?: ToolProjectIterationSummary[];
	truncated?: boolean;
	truncation?: Record<string, unknown>;
}

export type ToolIssueDevelopmentLinkType = "pull_request" | "commit" | "unknown";

export type ToolIssueDevelopmentLinkState = "open" | "closed" | "merged";

export interface ToolIssueDevelopmentLinkSummary {
	type: ToolIssueDevelopmentLinkType;
	referenceTypes: string[];
	number?: number;
	title?: string;
	state?: ToolIssueDevelopmentLinkState;
	html_url?: string;
	branchName?: string;
	baseBranchName?: string;
	commitOid?: string;
	message?: string;
	willCloseTarget?: boolean;
	closedBy?: boolean;
	isDraft?: boolean;
}

export interface ToolProjectItemSummary {
	id: string;
	type?: string;
	project?: ToolProjectSummary;
	issue?: IssueRelationshipSummary;
}

export interface ToolFileActionSummary {
	action: IssueWriteResult["action"];
	path?: string;
	removedPaths?: string[];
	issue?: ToolIssueSummary;
}

export type ToolBulkIssueResultStatus = "success" | "partial_success" | "failed" | "skipped";

export interface ToolBulkIssueResultSummary {
	number: number;
	action: string;
	status: ToolBulkIssueResultStatus;
	message?: string;
	issue?: ToolIssueSummary;
	projectItem?: ToolProjectItemSummary;
	paths?: string[];
	removedPaths?: string[];
	changedFields?: string[];
	cacheUpdated?: boolean;
	needsSync?: boolean;
	error?: SafeToolError;
}

export interface SafeToolError {
	code: string;
	category?: string;
	message: string;
	recoveryHint?: string;
	details?: Record<string, unknown>;
}

export type IssueMeToolResult = "success" | "partial_success" | "error";

export interface IssueMeToolBaseDetails {
	result?: IssueMeToolResult;
	repository?: string;
	creatorScope?: string;
	issue?: ToolIssueSummary;
	issues?: ToolIssueSummary[];
	labels?: ToolLabelSummary[];
	milestones?: ToolMilestoneSummary[];
	assignees?: ToolAssigneeSummary[];
	projects?: ToolProjectSummary[];
	project?: ToolProjectSummary;
	projectFields?: ToolProjectFieldSummary[];
	projectItem?: ToolProjectItemSummary;
	developmentLinks?: ToolIssueDevelopmentLinkSummary[];
	bulkResults?: ToolBulkIssueResultSummary[];
	counts?: Record<string, number>;
	paths?: string[];
	removedPaths?: string[];
	fileActions?: ToolFileActionSummary[];
	invalidFiles?: InvalidIssueFileDiagnostic[];
	changedFields?: string[];
	comment?: ToolCommentSummary;
	cacheUpdated?: boolean;
	needsSync?: boolean;
	truncated?: boolean;
	truncation?: Record<string, unknown>;
	status?: string;
	message?: string;
	error?: SafeToolError;
}

export interface IssueMeToolSuccessDetails extends IssueMeToolBaseDetails {
	result: "success";
	error?: undefined;
}

export interface IssueMeToolPartialSuccessDetails extends IssueMeToolBaseDetails {
	result: "partial_success";
	cacheUpdated: false;
	needsSync: true;
	error: SafeToolError;
}

export interface IssueMeToolErrorDetails extends IssueMeToolBaseDetails {
	result: "error";
	error: SafeToolError;
}

export type IssueMeToolDetails = IssueMeToolBaseDetails;
