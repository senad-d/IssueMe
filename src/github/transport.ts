import { GITHUB_API_BASE_URL, GITHUB_API_VERSION, GITHUB_GRAPHQL_FEATURE_FLAGS } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError, markMutationSettlement, mutationSettlementOf } from "../errors.ts";
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
	/** Internal request budget; omitted preserves existing pagination behavior. */
	maxPages?: number;
	/** Absolute 0-based raw index of the first collection member to consume; decoded from a continuation token. */
	start?: number;
}

export interface PaginationPage<T> {
	items: T[];
	nextUrl?: string;
}

export interface PaginationStart {
	url: string;
	/** Absolute raw index of the first member on the first page read. */
	pageBase: number;
	/** Raw members of the first page already consumed by an earlier call. */
	skip: number;
	perPage: number;
}

export interface PaginatedCollection<T> {
	items: T[];
	truncated: boolean;
	/** Absolute raw index of the next unconsumed member when more data may exist. */
	next?: number;
	pagesRead: number;
}

const DEFAULT_REST_PAGE_SIZE = 30;

export function normalizeMaxPages(value: number | undefined): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isSafeInteger(value) || value < 1) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "maxPages must be a positive integer.");
	}
	return value;
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
		tolerateError?: (error: unknown) => boolean,
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

		const rawErrors = Array.isArray(envelope.errors) ? envelope.errors : [];
		assertGraphQLNotRateLimited(rawErrors, mutation);
		const errors = tolerateError ? rawErrors.filter((error) => !tolerateError(error)) : rawErrors;
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
	): Promise<PaginatedCollection<T>> {
		const start = this.buildPaginationStart(path, query, options.start);
		return this.paginateCollection<T>(start, (url) => this.fetchPaginationPage<T>(url, signal, options.assertItem), options);
	}

	/** Resolve the first page URL for an absolute raw index; the first page never carries a page parameter. */
	buildPaginationStart(path: string, query: Record<string, string>, start: number | undefined): PaginationStart {
		const perPage = parsePerPage(query.per_page);
		const index = normalizePaginationStartIndex(start);
		const page = Math.floor(index / perPage) + 1;
		const pageBase = (page - 1) * perPage;
		const pageQuery = page > 1 ? { ...query, page: String(page) } : query;
		return { url: this.buildUrl(path, pageQuery).toString(), pageBase, skip: index - pageBase, perPage };
	}

	/** Shared page loop: consumes raw members from `start`, applies filters, and reports the exact resume index when it stops early. */
	async paginateCollection<T>(
		start: PaginationStart,
		readPage: (url: string) => Promise<PaginationPage<T>>,
		options: PaginationFilterOptions<T> = {},
	): Promise<PaginatedCollection<T>> {
		const values: T[] = [];
		const maxPages = normalizeMaxPages(options.maxPages);
		let pagesRead = 0;
		let pageBase = start.pageBase;
		let skip = start.skip;
		let nextUrl: string | undefined = start.url;
		while (nextUrl) {
			const page = await readPage(nextUrl);
			const consumed = collectFilteredPaginationItems(page.items, values.length, skip, options);
			values.push(...consumed.items);
			pagesRead += 1;
			if (consumed.stoppedAt !== undefined) return { items: values, truncated: true, next: pageBase + consumed.stoppedAt, pagesRead };
			if (page.nextUrl === undefined) return { items: values, truncated: false, pagesRead };
			const nextBase = nextPageBase(page.nextUrl, pageBase, page.items.length, start.perPage);
			if (hasReachedPaginationLimit(options.limit, values.length) || (maxPages !== undefined && pagesRead >= maxPages)) {
				return { items: values, truncated: true, next: nextBase, pagesRead };
			}
			nextUrl = this.resolvePaginationUrl(page.nextUrl);
			pageBase = nextBase;
			skip = 0;
		}
		return { items: values, truncated: false, pagesRead };
	}

	private async fetchPaginationPage<T>(nextUrl: string, signal: AbortSignal | undefined, assertItem: ((item: T, path: string) => void) | undefined): Promise<PaginationPage<T>> {
		const response = await this.requestWithHeaders<T[]>("GET", this.resolvePaginationUrl(nextUrl), {
			signal,
			alreadyAbsolute: true,
			validate: Array.isArray,
		});
		assertPaginationPageItems(response.data, assertItem, safePath(new URL(nextUrl)));
		return { items: response.data, nextUrl: parseNextLink(response.headers.get("link")) };
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
		this.resolvePaginationUrl(rawUrl);
	}

	/** GitHub Link headers point at /repositories/<id>/..., not /repos/<owner>/<repo>/...; map them back before the boundary check. */
	resolvePaginationUrl(rawUrl: string): string {
		let url: URL;
		try {
			url = new URL(rawUrl);
		} catch {
			throw new GitHubApiError("GitHub pagination URL is malformed.", { code: ISSUEME_ERROR_CODES.GITHUB_URL_MALFORMED });
		}
		url.pathname = url.pathname.replace(REPOSITORY_ID_PATH_PATTERN, this.repoPath("/"));
		this.assertAllowedRequestUrl(url, "GitHub pagination URL");
		return url.toString();
	}

	private assertAllowedRequestUrl(url: URL, label: string): void {
		const expectedBase = new URL(GITHUB_API_BASE_URL);
		const expectedPrefix = `/repos/${encodeURIComponent(this.repository.owner)}/${encodeURIComponent(this.repository.repo)}/`;
		const onExpectedHost = url.protocol === "https:" && url.host === expectedBase.host;
		const withinRepository = url.pathname.startsWith(expectedPrefix) || url.pathname === expectedPrefix.slice(0, -1);
		const graphqlEndpoint = url.pathname === "/graphql";
		const authenticatedUserEndpoint = url.pathname === "/user";
		const issueSearchEndpoint = url.pathname === "/search/issues" && this.isAllowedIssueSearchUrl(url);
		// Narrow organization allowance: only the resolved owner's issue-type list, never other /orgs/* paths.
		const organizationIssueTypesEndpoint = url.pathname === `/orgs/${encodeURIComponent(this.repository.owner)}/issue-types`;
		if (!onExpectedHost || (!withinRepository && !graphqlEndpoint && !authenticatedUserEndpoint && !issueSearchEndpoint && !organizationIssueTypesEndpoint)) {
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

function assertGraphQLNotRateLimited(errors: unknown[], mutation: boolean): void {
	if (!errors.some(isGraphQLRateLimitError)) return;
	throw markGraphQLMutationFailure(new GitHubApiError("GitHub GraphQL rate limit is active; wait before retrying.", {
		code: ISSUEME_ERROR_CODES.GITHUB_RATE_LIMIT,
		path: `${GITHUB_API_BASE_URL}/graphql`,
	}), mutation);
}

function isGraphQLRateLimitError(error: unknown): boolean {
	if (!isObject(error)) return false;
	return error.type === "RATE_LIMITED" || (isObject(error.extensions) && error.extensions.code === "RATE_LIMITED");
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
	if (url.pathname === "/graphql") headers["GraphQL-Features"] = GITHUB_GRAPHQL_FEATURE_FLAGS.join(",");
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

function collectFilteredPaginationItems<T>(items: T[], currentCount: number, skip: number, options: PaginationFilterOptions<T>): { items: T[]; stoppedAt?: number } {
	const values: T[] = [];
	for (let index = skip; index < items.length; index += 1) {
		const item = items[index];
		if (options.filter && !options.filter(item)) continue;
		if (hasReachedPaginationLimit(options.limit, currentCount + values.length)) return { items: values, stoppedAt: index };
		values.push(item);
	}
	return { items: values };
}

function hasReachedPaginationLimit(limit: number | undefined, count: number): boolean {
	return limit !== undefined && count >= limit;
}

function parsePerPage(value: string | undefined): number {
	const parsed = value === undefined ? Number.NaN : Number(value);
	if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
	return DEFAULT_REST_PAGE_SIZE;
}

function normalizePaginationStartIndex(value: number | undefined): number {
	if (value === undefined) return 0;
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "pagination start must be a non-negative integer.");
	}
	return value;
}

/** GitHub next links carry the next page number; fall back to counting when a link omits it. */
function nextPageBase(nextUrl: string, pageBase: number, pageLength: number, perPage: number): number {
	let page: number | undefined;
	try {
		const raw = new URL(nextUrl, GITHUB_API_BASE_URL).searchParams.get("page");
		page = raw !== null && /^\d+$/.test(raw) ? Number(raw) : undefined;
	} catch {
		page = undefined;
	}
	if (page !== undefined && Number.isSafeInteger(page) && page > 1) return (page - 1) * perPage;
	return pageBase + pageLength;
}

const NEXT_LINK_PATTERN = /<([^<>]+)>;\s*rel="next"/u;
const REPOSITORY_ID_PATH_PATTERN = /^\/repositories\/\d+\//u;

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
