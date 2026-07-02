import assert from "node:assert/strict";
import test from "node:test";

import { GitHubApiError, IssueMeError } from "../src/errors.ts";
import { GitHubClient } from "../src/github/client.ts";
import {
	buildIssueListQuery,
	buildIssueSearchRequestQuery,
	buildMilestoneListQuery,
	commentBelongsToIssue,
	isIssueSearchResponse,
	isPullRequestIssueResponse,
	issueResponseToSafeSummary,
	normalizeIssueSearchResponse,
	normalizeIssueUpdateInput,
	normalizeOptionalTextFilter,
	normalizePaginationLimit,
} from "../src/github/issues-client.ts";
import { GitHubTransport, parseNextLink } from "../src/github/transport.ts";

const TOKEN = "ghp_transport_client_secret";
const PRIVATE_BODY = "PRIVATE BODY VALUE";
const REPOSITORY = { owner: "owner", repo: "repo", fullName: "owner/repo" };

function issue(number = 1, overrides = {}) {
	return {
		number,
		title: `Issue ${number}`,
		state: "open",
		body: `Body ${number}`,
		labels: [],
		assignees: [],
		milestone: null,
		html_url: `https://github.com/${REPOSITORY.fullName}/issues/${number}`,
		created_at: "2026-07-02T00:00:00Z",
		updated_at: "2026-07-02T00:00:00Z",
		closed_at: null,
		...overrides,
	};
}

function comment(id, issueNumber = 1, overrides = {}) {
	return {
		id,
		issue_url: `https://api.github.com/repos/${REPOSITORY.fullName}/issues/${issueNumber}`,
		html_url: `https://github.com/${REPOSITORY.fullName}/issues/${issueNumber}#issuecomment-${id}`,
		...overrides,
	};
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json", ...(init.headers ?? {}) },
	});
}

function textResponse(text, init = {}) {
	return new Response(text, {
		status: init.status ?? 500,
		statusText: init.statusText ?? "Server Error",
		headers: { "content-type": "text/plain", ...(init.headers ?? {}) },
	});
}

function captureCall(calls, input, init = {}) {
	const url = new URL(input.toString());
	const body = init.body === undefined ? undefined : JSON.parse(init.body);
	calls.push({ method: init.method, path: url.pathname, search: url.search, headers: init.headers, body });
	return { url, body };
}

function assertNoSecrets(value) {
	const serialized = JSON.stringify(value);
	assert.doesNotMatch(serialized, new RegExp(TOKEN));
	assert.doesNotMatch(serialized, new RegExp(PRIVATE_BODY));
}

test("parseNextLink handles absent, ordered, relative, and malformed link headers", () => {
	assert.equal(parseNextLink(null), undefined);
	assert.equal(parseNextLink(""), undefined);
	assert.equal(parseNextLink('<https://api.github.com/repos/owner/repo/issues?page=2>; rel="next"'), "https://api.github.com/repos/owner/repo/issues?page=2");
	assert.equal(
		parseNextLink('<https://api.github.com/repos/owner/repo/issues?page=1>; rel="prev", <https://api.github.com/repos/owner/repo/issues?page=3>; rel="next"'),
		"https://api.github.com/repos/owner/repo/issues?page=3",
	);
	assert.equal(parseNextLink('</repos/owner/repo/issues?page=2>; rel="next"'), "/repos/owner/repo/issues?page=2");
	assert.equal(parseNextLink('<https://api.github.com/repos/owner/repo/issues?page=9>; rel="last"'), undefined);
	assert.equal(parseNextLink('not a valid link header'), undefined);
});

test("GitHubTransport sends safe REST requests and maps malformed, GraphQL, and text errors", async () => {
	const calls = [];
	const transport = new GitHubTransport({
		repository: REPOSITORY,
		token: TOKEN,
		userAgent: "IssueMe transport test",
		fetchFn: async (input, init = {}) => {
			const { url } = captureCall(calls, input, init);
			if (url.pathname === "/repos/owner/repo/issues/1") return jsonResponse(issue(1));
			if (url.pathname === "/graphql") return jsonResponse({ data: null });
			if (url.pathname === "/repos/owner/repo/issues") return textResponse(`plain ${TOKEN} ${PRIVATE_BODY}`);
			throw new Error(`Unexpected request ${init.method} ${url.pathname}`);
		},
	});

	const result = await transport.request("GET", transport.repoPath("/issues/1"), { validate: (value) => typeof value === "object" && value !== null });
	assert.equal(result.number, 1);
	assert.equal(calls[0].method, "GET");
	assert.equal(calls[0].path, "/repos/owner/repo/issues/1");
	assert.equal(calls[0].headers.Authorization, `Bearer ${TOKEN}`);
	assert.equal(calls[0].headers.Accept, "application/vnd.github+json");
	assert.equal(calls[0].headers["User-Agent"], "IssueMe transport test");
	assert.equal(calls[0].headers["Content-Type"], undefined);

	await assert.rejects(
		() => transport.request("GET", "not a valid absolute url", { alreadyAbsolute: true }),
		(error) => error instanceof GitHubApiError && error.code === "github_url_malformed",
	);
	await assert.rejects(
		() => transport.graphqlRequest("BadGraphQL", "query BadGraphQL { viewer { login } }", { body: PRIVATE_BODY }),
		(error) => error instanceof GitHubApiError && error.code === "github_response_shape_invalid",
	);
	await assert.rejects(
		() => transport.request("POST", transport.repoPath("/issues"), { body: { title: PRIVATE_BODY } }),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assert.equal(error.status, 500);
			assertNoSecrets(error);
			return true;
		},
	);
});

test("GitHubClient covers authenticated user, bounded list pagination, and search metadata", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository: REPOSITORY,
		token: TOKEN,
		fetchFn: async (input, init = {}) => {
			const { url } = captureCall(calls, input, init);
			if (url.pathname === "/user") return jsonResponse({ login: "octocat" });
			if (url.pathname === "/repos/owner/repo/issues" && url.searchParams.get("page") === "2") return jsonResponse([issue(2), issue(3)]);
			if (url.pathname === "/repos/owner/repo/issues") {
				return jsonResponse([issue(1), issue(99, { pull_request: {} })], {
					headers: { link: '<https://api.github.com/repos/owner/repo/issues?page=2>; rel="next"' },
				});
			}
			if (url.pathname === "/search/issues") {
				return jsonResponse({
					total_count: 4,
					incomplete_results: true,
					items: [issue(4), issue(5, { pull_request: {} })],
				}, { headers: { link: '<https://api.github.com/search/issues?page=2&q=repo:owner/repo+is:issue>; rel="next"' } });
			}
			throw new Error(`Unexpected request ${init.method} ${url.pathname}`);
		},
	});

	assert.equal(await client.getAuthenticatedUserLogin(), "octocat");
	const listed = await client.listIssues({ state: "all", limit: 2 });
	assert.deepEqual(listed.issues.map((item) => item.number), [1, 2]);
	assert.equal(listed.truncated, true);
	const searched = await client.searchIssues({ query: "crash", limit: 1 });
	assert.deepEqual(searched.issues.map((item) => item.number), [4]);
	assert.equal(searched.totalCount, 4);
	assert.equal(searched.incompleteResults, true);
	assert.equal(searched.truncated, true);

	const requestSummary = calls.map((call) => `${call.method} ${call.path}${call.search}`);
	assert.ok(requestSummary.includes("GET /user"));
	assert.ok(requestSummary.some((item) => item.startsWith("GET /repos/owner/repo/issues?")));
	assert.ok(requestSummary.some((item) => item.startsWith("GET /search/issues?")));
	assert.equal(calls.find((call) => call.path === "/repos/owner/repo/issues").headers.Authorization, `Bearer ${TOKEN}`);
	assertNoSecrets(calls.map((call) => ({ path: call.path, search: call.search, body: call.body })));

	const badUserClient = new GitHubClient({ repository: REPOSITORY, token: TOKEN, fetchFn: async () => jsonResponse({ login: "bad login" }) });
	await assert.rejects(
		() => badUserClient.getAuthenticatedUserLogin(),
		(error) => error instanceof GitHubApiError && error.code === "github_response_shape_invalid",
	);
});

test("issues-client helpers validate filters, ownership URLs, updates, search shapes, and safe summaries", () => {
	assert.deepEqual(buildIssueListQuery({ state: "all", labels: [" bug ", "bug", "agent ready"], assignee: " octocat ", sort: "updated", direction: "asc" }, 250), {
		state: "all",
		per_page: "100",
		labels: "bug,agent ready",
		assignee: "octocat",
		sort: "updated",
		direction: "asc",
	});
	assert.deepEqual(buildMilestoneListQuery({ state: "closed", sort: "due_on", direction: "desc" }, 5), {
		state: "closed",
		sort: "due_on",
		direction: "desc",
		per_page: "5",
	});
	const searchQuery = buildIssueSearchRequestQuery(REPOSITORY.fullName, { query: "crash", state: "open", labels: ['needs "triage"'], milestone: "Sprint 1", since: "2026-07-02" }, 10);
	assert.match(searchQuery.q, /repo:owner\/repo/);
	assert.match(searchQuery.q, /is:issue/);
	assert.match(searchQuery.q, /label:"needs \\"triage\\""/);
	assert.match(searchQuery.q, /milestone:"Sprint 1"/);
	assert.equal(searchQuery.per_page, "10");

	assert.equal(normalizeOptionalTextFilter("  OCTO  ", "login"), "octo");
	assert.equal(normalizePaginationLimit(undefined), undefined);
	assert.equal(normalizePaginationLimit(2), 2);
	assert.throws(() => normalizePaginationLimit(0), (error) => error instanceof IssueMeError && error.safeDetails.field === "limit");
	assert.throws(() => buildIssueListQuery({ state: "invalid" }, 1), (error) => error instanceof IssueMeError && error.safeDetails.field === "state");
	assert.throws(() => buildIssueListQuery({ sort: "bad" }, 1), (error) => error instanceof IssueMeError && error.safeDetails.field === "sort");
	assert.throws(() => buildIssueListQuery({ direction: "sideways" }, 1), (error) => error instanceof IssueMeError && error.safeDetails.field === "direction");
	assert.throws(() => buildMilestoneListQuery({ state: "invalid" }, 1), (error) => error instanceof IssueMeError && error.safeDetails.field === "state");
	assert.throws(() => buildMilestoneListQuery({ sort: "updated" }, 1), (error) => error instanceof IssueMeError && error.safeDetails.field === "sort");
	assert.throws(() => buildMilestoneListQuery({ direction: "sideways" }, 1), (error) => error instanceof IssueMeError && error.safeDetails.field === "direction");

	assert.equal(isPullRequestIssueResponse(issue(1, { pull_request: {} })), true);
	assert.equal(isPullRequestIssueResponse(issue(1, { pull_request: null })), false);
	assert.equal(isIssueSearchResponse({ total_count: 2, incomplete_results: false, items: [issue(1)] }), true);
	assert.equal(isIssueSearchResponse({ total_count: "2", items: [] }), false);
	assert.deepEqual(normalizeIssueSearchResponse({ total_count: 2, incomplete_results: true, items: [issue(1)] }), { totalCount: 2, incompleteResults: true, items: [issue(1)] });
	assert.deepEqual(normalizeIssueUpdateInput({ title: "New", milestone: null }), { title: "New", milestone: null });
	assert.deepEqual(normalizeIssueUpdateInput({ milestone: 3 }), { milestone: 3 });
	assert.throws(() => normalizeIssueUpdateInput({ milestone: 0 }), (error) => error instanceof IssueMeError && error.safeDetails.field === "milestoneNumber");

	assert.equal(commentBelongsToIssue(REPOSITORY, comment(7, 7), 7, 7), true);
	assert.equal(commentBelongsToIssue(REPOSITORY, comment(7, 8), 7, 7), false);
	assert.equal(commentBelongsToIssue(REPOSITORY, comment(7, 7, { issue_url: "not a url", html_url: "not a url" }), 7, 7), false);
	assert.equal(commentBelongsToIssue(REPOSITORY, comment(7, 7, { issue_url: "http://api.github.com/repos/owner/repo/issues/7" }), 7, 7), true);
	assert.equal(commentBelongsToIssue(REPOSITORY, comment(7, 7, { issue_url: "https://api.github.com/repos/other/repo/issues/7", html_url: "https://github.com/owner/repo/pull/7#issuecomment-7" }), 7, 7), false);

	assert.equal(issueResponseToSafeSummary(REPOSITORY.fullName, issue(1, { state: "draft" }), 1), undefined);
	assert.deepEqual(issueResponseToSafeSummary(REPOSITORY.fullName, issue(Number.MAX_SAFE_INTEGER + 2, { number: Number.MAX_SAFE_INTEGER + 2, title: undefined, html_url: undefined, user: { login: "octocat" } }), 42), {
		repository: REPOSITORY.fullName,
		number: 42,
		title: "#42",
		state: "open",
		creator: "octocat",
		labels: [],
		assignees: [],
		html_url: `https://github.com/${REPOSITORY.fullName}/issues/42`,
	});
});
