export interface IssueMeConfig {
	issueDirectory: string;
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

export interface IssueRecord {
	schemaVersion: 1;
	repository: string;
	number: number;
	title: string;
	state: IssueState;
	body: string;
	labels: string[];
	assignees: string[];
	milestone: string | null;
	comments: IssueCommentRecord[];
	html_url: string;
	created_at: string;
	updated_at: string;
	closed_at: string | null;
	synced_at: string;
}

export interface IssueFileMetadata {
	path: string;
	fileName: string;
	number: number;
	title: string;
	state: IssueState;
	updated_at: string;
}

export interface IssueWriteResult {
	action: "created" | "updated" | "unchanged" | "removed";
	path?: string;
	removedPaths: string[];
}

export interface GitHubUserResponse {
	login?: unknown;
}

export interface GitHubLabelResponse {
	name?: unknown;
}

export interface GitHubMilestoneResponse {
	title?: unknown;
}

export interface GitHubIssueResponse {
	number?: unknown;
	title?: unknown;
	state?: unknown;
	body?: unknown;
	labels?: unknown;
	assignees?: unknown;
	milestone?: unknown;
	html_url?: unknown;
	created_at?: unknown;
	updated_at?: unknown;
	closed_at?: unknown;
	pull_request?: unknown;
}

export interface GitHubCommentResponse {
	id?: unknown;
	user?: unknown;
	body?: unknown;
	created_at?: unknown;
	updated_at?: unknown;
	html_url?: unknown;
}

export interface ToolIssueSummary {
	repository: string;
	number: number;
	title: string;
	state: IssueState;
	labels: string[];
	assignees: string[];
	html_url: string;
	localPath?: string;
}

export interface IssueMeToolDetails {
	repository?: string;
	issue?: ToolIssueSummary;
	issues?: ToolIssueSummary[];
	counts?: Record<string, number>;
	paths?: string[];
	removedPaths?: string[];
	changedFields?: string[];
	truncated?: boolean;
	message?: string;
}
