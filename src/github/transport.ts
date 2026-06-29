import { GITHUB_API_BASE_URL, GITHUB_API_VERSION } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES } from "../errors.ts";
import type { GitHubRepository } from "../types.ts";
import { redactSecrets } from "../utils/env.ts";
import { isObject } from "./shared.ts";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface GitHubClientOptions {
	repository: GitHubRepository;
	token: string;
	fetchFn?: FetchLike;
	baseUrl?: string;
	userAgent?: string;
}

export interface PaginationOptions {
	limit?: number;
}

export interface GitHubGraphQLErrorContext {
	operationName: string;
	detail: string;
	status?: number;
	errors?: unknown[];
}

export type GitHubGraphQLErrorMapper = (context: GitHubGraphQLErrorContext) => GitHubApiError | undefined;

interface GraphQLResponse<T> {
	data?: T | null;
	errors?: unknown;
}

type RequestOptions = {
	body?: unknown;
	signal?: AbortSignal;
	alreadyAbsolute?: boolean;
	validate?: (value: unknown) => boolean;
};

export class GitHubTransport {
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

	repoPath(path: string): string {
		return `/repos/${encodeURIComponent(this.repository.owner)}/${encodeURIComponent(this.repository.repo)}${path}`;
	}

	async graphqlRequest<T>(
		operationName: string,
		query: string,
		variables: Record<string, unknown>,
		signal?: AbortSignal,
		mapGraphQLError?: GitHubGraphQLErrorMapper,
	): Promise<T> {
		let envelope: GraphQLResponse<T>;
		try {
			envelope = await this.request<GraphQLResponse<T>>("POST", "/graphql", {
				body: { query, variables, operationName },
				signal,
				validate: isObject,
			});
		} catch (error) {
			if (error instanceof GitHubApiError && error.status === 403) {
				const mapped = mapGraphQLError?.({ operationName, detail: error.message, status: error.status });
				if (mapped) throw mapped;
			}
			throw error;
		}

		const errors = Array.isArray(envelope.errors) ? envelope.errors : [];
		if (errors.length > 0) {
			const safeGraphQLErrorDetails = redactSecrets(formatGraphQLErrors(errors), [this.token, ...collectRequestStringValues(variables)]);
			const mapped = mapGraphQLError?.({ operationName, detail: safeGraphQLErrorDetails, errors });
			if (mapped) throw mapped;
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

	async paginate<T>(
		path: string,
		query: Record<string, string>,
		signal?: AbortSignal,
		options: PaginationOptions = {},
	): Promise<T[]> {
		return (await this.paginateFiltered<T>(path, query, signal, options)).items;
	}

	async paginateFiltered<T>(
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

	async request<T>(
		method: string,
		pathOrUrl: string,
		options: RequestOptions = {},
	): Promise<T> {
		return (await this.requestWithHeaders<T>(method, pathOrUrl, options)).data;
	}

	async requestWithHeaders<T>(
		method: string,
		pathOrUrl: string,
		options: RequestOptions = {},
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

	buildUrl(path: string, query: Record<string, string> = {}): URL {
		const url = path.startsWith("http://") || path.startsWith("https://") ? new URL(path) : new URL(path, this.baseUrl);
		for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
		return url;
	}

	assertAllowedPaginationUrl(rawUrl: string): void {
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
		const authenticatedUserEndpoint = url.pathname === "/user";
		const issueSearchEndpoint = url.pathname === "/search/issues" && this.isAllowedIssueSearchUrl(url);
		if (!onExpectedHost || (!withinRepository && !graphqlEndpoint && !authenticatedUserEndpoint && !issueSearchEndpoint)) {
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

export function parseNextLink(linkHeader: string | null): string | undefined {
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
