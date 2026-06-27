import { GITHUB_API_BASE_URL, GITHUB_API_VERSION } from "../constants.ts";
import { ClosedIssueMutationError, GitHubApiError } from "../errors.ts";
import type { GitHubCommentResponse, GitHubIssueResponse, GitHubRepository } from "../types.ts";
import { redactSecrets } from "../utils/env.ts";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface GitHubClientOptions {
	repository: GitHubRepository;
	token: string;
	fetchFn?: FetchLike;
	baseUrl?: string;
}

export interface IssueCreateInput {
	title: string;
	body?: string;
	labels?: string[];
	assignees?: string[];
}

export interface IssueUpdateInput {
	title?: string;
	body?: string;
	labels?: string[];
	assignees?: string[];
	milestone?: number | null;
	state?: "open" | "closed";
	state_reason?: "completed" | "not_planned" | "reopened" | null;
}

export class GitHubClient {
	readonly repository: GitHubRepository;
	private readonly token: string;
	private readonly fetchFn: FetchLike;
	private readonly baseUrl: string;

	constructor(options: GitHubClientOptions) {
		this.repository = options.repository;
		this.token = options.token;
		this.fetchFn = options.fetchFn ?? fetch;
		this.baseUrl = options.baseUrl ?? GITHUB_API_BASE_URL;
	}

	async listOpenIssues(signal?: AbortSignal): Promise<GitHubIssueResponse[]> {
		const issues = await this.paginate<GitHubIssueResponse>(this.repoPath("/issues"), {
			state: "open",
			per_page: "100",
		}, signal);
		return issues.filter((issue) => issue.pull_request === undefined || issue.pull_request === null);
	}

	async getIssue(issueNumber: number, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		return this.request<GitHubIssueResponse>("GET", this.repoPath(`/issues/${issueNumber}`), { signal });
	}

	async listComments(issueNumber: number, signal?: AbortSignal): Promise<GitHubCommentResponse[]> {
		return this.paginate<GitHubCommentResponse>(
			this.repoPath(`/issues/${issueNumber}/comments`),
			{ per_page: "100" },
			signal,
		);
	}

	async createIssue(input: IssueCreateInput, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		return this.request<GitHubIssueResponse>("POST", this.repoPath("/issues"), {
			body: compactObject(input),
			signal,
		});
	}

	async updateIssue(issueNumber: number, input: IssueUpdateInput, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubIssueResponse>("PATCH", this.repoPath(`/issues/${issueNumber}`), {
			body: compactObject(input),
			signal,
		});
	}

	async addComment(issueNumber: number, body: string, signal?: AbortSignal): Promise<GitHubCommentResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubCommentResponse>("POST", this.repoPath(`/issues/${issueNumber}/comments`), {
			body: { body },
			signal,
		});
	}

	async addAssignees(issueNumber: number, assignees: string[], signal?: AbortSignal): Promise<GitHubIssueResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubIssueResponse>("POST", this.repoPath(`/issues/${issueNumber}/assignees`), {
			body: { assignees },
			signal,
		});
	}

	async removeAssignees(issueNumber: number, assignees: string[], signal?: AbortSignal): Promise<GitHubIssueResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubIssueResponse>("DELETE", this.repoPath(`/issues/${issueNumber}/assignees`), {
			body: { assignees },
			signal,
		});
	}

	async setAssignees(issueNumber: number, assignees: string[], signal?: AbortSignal): Promise<GitHubIssueResponse> {
		return this.updateIssue(issueNumber, { assignees }, signal);
	}

	async addLabels(issueNumber: number, labels: string[], signal?: AbortSignal): Promise<GitHubIssueResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubIssueResponse>("POST", this.repoPath(`/issues/${issueNumber}/labels`), {
			body: { labels },
			signal,
		});
	}

	async setLabels(issueNumber: number, labels: string[], signal?: AbortSignal): Promise<GitHubIssueResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubIssueResponse>("PUT", this.repoPath(`/issues/${issueNumber}/labels`), {
			body: { labels },
			signal,
		});
	}

	async removeLabel(issueNumber: number, label: string, signal?: AbortSignal): Promise<GitHubIssueResponse | undefined> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubIssueResponse | undefined>(
			"DELETE",
			this.repoPath(`/issues/${issueNumber}/labels/${encodeURIComponent(label)}`),
			{ signal },
		);
	}

	async closeIssue(issueNumber: number, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		await this.ensureIssueOpen(issueNumber, signal);
		return this.request<GitHubIssueResponse>("PATCH", this.repoPath(`/issues/${issueNumber}`), {
			body: { state: "closed" },
			signal,
		});
	}

	async ensureIssueOpen(issueNumber: number, signal?: AbortSignal): Promise<GitHubIssueResponse> {
		const issue = await this.getIssue(issueNumber, signal);
		if (issue.state !== "open") {
			throw new ClosedIssueMutationError(issueNumber, typeof issue.state === "string" ? issue.state : "unknown");
		}
		return issue;
	}

	private repoPath(path: string): string {
		return `/repos/${encodeURIComponent(this.repository.owner)}/${encodeURIComponent(this.repository.repo)}${path}`;
	}

	private async paginate<T>(path: string, query: Record<string, string>, signal?: AbortSignal): Promise<T[]> {
		const values: T[] = [];
		let nextUrl: string | undefined = this.buildUrl(path, query).toString();
		while (nextUrl) {
			const response = await this.requestWithHeaders<T[]>("GET", nextUrl, { signal, alreadyAbsolute: true });
			values.push(...response.data);
			nextUrl = parseNextLink(response.headers.get("link"));
		}
		return values;
	}

	private async request<T>(
		method: string,
		pathOrUrl: string,
		options: { body?: unknown; signal?: AbortSignal; alreadyAbsolute?: boolean } = {},
	): Promise<T> {
		return (await this.requestWithHeaders<T>(method, pathOrUrl, options)).data;
	}

	private async requestWithHeaders<T>(
		method: string,
		pathOrUrl: string,
		options: { body?: unknown; signal?: AbortSignal; alreadyAbsolute?: boolean } = {},
	): Promise<{ data: T; headers: Headers }> {
		const url = options.alreadyAbsolute ? new URL(pathOrUrl) : this.buildUrl(pathOrUrl);
		const headers: Record<string, string> = {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${this.token}`,
			"X-GitHub-Api-Version": GITHUB_API_VERSION,
		};
		if (options.body !== undefined) headers["Content-Type"] = "application/json";

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
				throw new GitHubApiError("GitHub request aborted.", { path: safePath(url) });
			}
			const message = error instanceof Error ? error.message : String(error);
			throw new GitHubApiError(redactSecrets(`GitHub network request failed: ${message}`, [this.token]), {
				path: safePath(url),
			});
		}

		const text = response.status === 204 ? "" : await response.text();
		if (!response.ok) {
			throw new GitHubApiError(this.formatError(response, text), { status: response.status, path: safePath(url) });
		}

		return { data: text ? (JSON.parse(text) as T) : (undefined as T), headers: response.headers };
	}

	private buildUrl(path: string, query: Record<string, string> = {}): URL {
		const url = path.startsWith("http://") || path.startsWith("https://") ? new URL(path) : new URL(path, this.baseUrl);
		for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
		return url;
	}

	private formatError(response: Response, text: string): string {
		let detail = text.trim();
		try {
			const parsed = JSON.parse(text) as { message?: unknown; documentation_url?: unknown };
			if (typeof parsed.message === "string") detail = parsed.message;
		} catch {
			// Keep the raw text if it is not JSON.
		}
		const base = `GitHub REST API request failed with ${response.status} ${response.statusText}`;
		return redactSecrets(detail ? `${base}: ${detail}` : base, [this.token]);
	}
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
