import { GITHUB_API_BASE_URL, GITHUB_API_VERSION } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES, markMutationSettlement, mutationSettlementOf } from "../errors.ts";
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
	mutation?: boolean;
};

type PaginationFilterOptions<T> = PaginationOptions & {
	filter?: (item: T) => boolean;
	assertItem?: (item: T, path: string) => void;
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
		mutation = false,
	): Promise<T> {
		let envelope: GraphQLResponse<T>;
		try {
			envelope = await this.request<GraphQLResponse<T>>("POST", "/graphql", {
				body: { query, variables, operationName },
				signal,
				validate: isObject,
				mutation,
			});
		} catch (error) {
			if (error instanceof GitHubApiError && error.status === 403) {
				const mapped = mapGraphQLError?.({ operationName, detail: error.message, status: error.status });
				if (mapped) throw copyMutationSettlement(error, mapped);
			}
			throw error;
		}

		const errors = Array.isArray(envelope.errors) ? envelope.errors : [];
		if (errors.length > 0) {
			const safeGraphQLErrorDetails = redactSecrets(formatGraphQLErrors(errors), [this.token, ...collectRequestStringValues(variables)]);
			const mapped = mapGraphQLError?.({ operationName, detail: safeGraphQLErrorDetails, errors });
			if (mapped) throw markGraphQLMutationFailure(mapped, mutation);
			const error = new GitHubApiError(redactSecrets(`GitHub GraphQL API ${operationName} failed: ${safeGraphQLErrorDetails}`, [this.token, ...collectRequestStringValues(variables)]), {
				code: ISSUEME_ERROR_CODES.GITHUB_API_ERROR,
				path: `${GITHUB_API_BASE_URL}/graphql`,
			});
			throw markGraphQLMutationFailure(error, mutation);
		}
		if (!isObject(envelope.data)) {
			throw new GitHubApiError("GitHub GraphQL API returned an unexpected response shape.", {
				code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID,
				path: `${GITHUB_API_BASE_URL}/graphql`,
				mutationSettlement: mutation ? "remote_success_known" : undefined,
			});
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
		options: PaginationFilterOptions<T> = {},
	): Promise<{ items: T[]; truncated: boolean }> {
		const values: T[] = [];
		let nextUrl: string | undefined = this.buildUrl(path, query).toString();
		while (nextUrl) {
			const response = await this.fetchPaginationPage<T>(nextUrl, signal);
			assertPaginationPageItems(response.data, options.assertItem, safePath(new URL(nextUrl)));
			const next = parseNextLink(response.headers.get("link"));
			const page = collectFilteredPaginationItems(response.data, values.length, options);
			values.push(...page.items);
			if (page.truncated || hasAdditionalPageBeyondLimit(options.limit, values.length, next)) return { items: values, truncated: true };
			nextUrl = next;
			if (nextUrl) this.assertAllowedPaginationUrl(nextUrl);
		}
		return { items: values, truncated: false };
	}

	private async fetchPaginationPage<T>(nextUrl: string, signal?: AbortSignal): Promise<{ data: T[]; headers: Headers }> {
		this.assertAllowedPaginationUrl(nextUrl);
		return this.requestWithHeaders<T[]>("GET", nextUrl, {
			signal,
			alreadyAbsolute: true,
			validate: Array.isArray,
		});
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
		assertGitHubRequestNotAborted(options.signal, url, options.mutation === true);
		const body = serializeRequestBody(options.body);
		const headers = buildGitHubRequestHeaders(url, this.token, this.userAgent, body !== undefined);
		const response = await this.fetchGitHubResponse(url, method, headers, body, options);
		const text = await readResponseText(response);
		if (!response.ok) throw this.buildHttpError(response, text, url, options.body, options.mutation === true);
		const data = parseGitHubResponseData(response, text, url, options.mutation === true);
		validateGitHubResponseData(data, response.status, url, options.validate, options.mutation === true);
		return { data: data as T, headers: response.headers };
	}

	private async fetchGitHubResponse(url: URL, method: string, headers: Record<string, string>, body: string | undefined, options: RequestOptions): Promise<Response> {
		try {
			return await this.fetchFn(url, { method, headers, body, signal: options.signal });
		} catch (error) {
			throw gitHubNetworkError(error, options.signal, url, this.token, options.body, options.mutation === true);
		}
	}

	private buildHttpError(response: Response, text: string, url: URL, requestBody: unknown, mutation: boolean): GitHubApiError {
		const rateLimit = readRateLimit(response.headers);
		return new GitHubApiError(this.formatError(response, text, requestBody), {
			code: rateLimit.limited ? ISSUEME_ERROR_CODES.GITHUB_RATE_LIMIT : ISSUEME_ERROR_CODES.GITHUB_API_ERROR,
			status: response.status,
			path: safePath(url),
			rateLimit,
			mutationSettlement: mutation ? "no_remote_success_known" : undefined,
		});
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

function copyMutationSettlement(source: unknown, target: GitHubApiError): GitHubApiError {
	const settlement = mutationSettlementOf(source);
	if (settlement) return markMutationSettlement(target, settlement) as GitHubApiError;
	return target;
}

function markGraphQLMutationFailure(error: GitHubApiError, mutation: boolean): GitHubApiError {
	if (!mutation) return error;
	return markMutationSettlement(error, "no_remote_success_known") as GitHubApiError;
}

function serializeRequestBody(body: unknown): string | undefined {
	return body === undefined ? undefined : JSON.stringify(body);
}

function buildGitHubRequestHeaders(url: URL, token: string, userAgent: string, hasBody: boolean): Record<string, string> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		Authorization: `Bearer ${token}`,
		"User-Agent": userAgent,
		"X-GitHub-Api-Version": GITHUB_API_VERSION,
	};
	if (url.pathname === "/graphql") headers["GraphQL-Features"] = "sub_issues";
	if (hasBody) headers["Content-Type"] = "application/json";
	return headers;
}

function assertGitHubRequestNotAborted(signal: AbortSignal | undefined, url: URL, mutation: boolean): void {
	if (signal?.aborted) {
		throw new GitHubApiError("GitHub request aborted.", {
			code: ISSUEME_ERROR_CODES.GITHUB_REQUEST_ABORTED,
			path: safePath(url),
			mutationSettlement: mutation ? "not_started" : undefined,
		});
	}
}

function gitHubNetworkError(error: unknown, signal: AbortSignal | undefined, url: URL, token: string, requestBody: unknown, mutation: boolean): GitHubApiError {
	if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
		return new GitHubApiError("GitHub request aborted.", {
			code: ISSUEME_ERROR_CODES.GITHUB_REQUEST_ABORTED,
			path: safePath(url),
			mutationSettlement: mutation ? "indeterminate" : undefined,
		});
	}
	const message = error instanceof Error ? error.message : String(error);
	return new GitHubApiError(redactSecrets(`GitHub network request failed: ${message}`, [token, ...collectRequestStringValues(requestBody)]), {
		code: ISSUEME_ERROR_CODES.GITHUB_NETWORK_ERROR,
		path: safePath(url),
		mutationSettlement: mutation ? "indeterminate" : undefined,
	});
}

async function readResponseText(response: Response): Promise<string> {
	return response.status === 204 ? "" : await response.text();
}

function parseGitHubResponseData(response: Response, text: string, url: URL, mutation: boolean): unknown {
	if (!text) return undefined;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		throw new GitHubApiError("GitHub REST API returned invalid JSON.", {
			code: ISSUEME_ERROR_CODES.GITHUB_INVALID_JSON,
			status: response.status,
			path: safePath(url),
			mutationSettlement: mutation ? "remote_success_known" : undefined,
		});
	}
}

function validateGitHubResponseData(data: unknown, status: number, url: URL, validate: ((value: unknown) => boolean) | undefined, mutation: boolean): void {
	if (validate && !validate(data)) {
		throw new GitHubApiError("GitHub REST API returned an unexpected response shape.", {
			code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID,
			status,
			path: safePath(url),
			mutationSettlement: mutation ? "remote_success_known" : undefined,
		});
	}
}

function assertPaginationPageItems<T>(items: T[], assertItem: ((item: T, path: string) => void) | undefined, path: string): void {
	if (!assertItem) return;
	for (const item of items) assertItem(item, path);
}

function collectFilteredPaginationItems<T>(items: T[], currentCount: number, options: PaginationFilterOptions<T>): { items: T[]; truncated: boolean } {
	const values: T[] = [];
	for (const item of items) {
		if (options.filter && !options.filter(item)) continue;
		if (hasReachedPaginationLimit(options.limit, currentCount + values.length)) return { items: values, truncated: true };
		values.push(item);
	}
	return { items: values, truncated: false };
}

function hasAdditionalPageBeyondLimit(limit: number | undefined, count: number, nextUrl: string | undefined): boolean {
	return nextUrl !== undefined && hasReachedPaginationLimit(limit, count);
}

function hasReachedPaginationLimit(limit: number | undefined, count: number): boolean {
	return limit !== undefined && count >= limit;
}

const NEXT_LINK_PATTERN = /<([^<>]+)>;\s*rel="next"/u;

export function parseNextLink(linkHeader: string | null): string | undefined {
	if (!linkHeader) return undefined;
	for (const part of linkHeader.split(",")) {
		const match = NEXT_LINK_PATTERN.exec(part);
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
