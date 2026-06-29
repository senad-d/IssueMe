import assert from "node:assert/strict";
import test from "node:test";

import { ClosedIssueMutationError, GitHubApiError } from "../src/errors.ts";
import { GitHubClient } from "../src/github/client.ts";

const repository = { owner: "owner", repo: "repo", fullName: "owner/repo" };
const token = "ghp_secret_token";

function issue(overrides = {}) {
	return {
		number: 1,
		title: "Title",
		state: "open",
		body: "Body",
		labels: [],
		assignees: [],
		milestone: null,
		html_url: "https://github.com/owner/repo/issues/1",
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
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

test("GitHub client sends required REST headers and parses successful JSON", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url, init) => {
			calls.push({ url: url.toString(), init });
			return jsonResponse(issue());
		},
	});
	const result = await client.getIssue(1);
	assert.equal(result.number, 1);
	assert.equal(calls[0].init.headers.Authorization, `Bearer ${token}`);
	assert.equal(calls[0].init.headers.Accept, "application/vnd.github+json");
	assert.equal(calls[0].init.headers["X-GitHub-Api-Version"], "2022-11-28");
	assert.equal(calls[0].init.headers["User-Agent"], "IssueMe Pi extension");
	assert.equal(calls[0].url, "https://api.github.com/repos/owner/repo/issues/1");
});

test("GitHub client handles 204 no-content responses", async () => {
	const responses = [jsonResponse(issue()), new Response(null, { status: 204, statusText: "No Content" })];
	const client = new GitHubClient({ repository, token, fetchFn: async () => responses.shift() });
	assert.equal(await client.removeLabel(1, "bug"), undefined);
});

test("GitHub client maps API errors without exposing tokens", async () => {
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async () => jsonResponse({ message: `bad token ${token}` }, { status: 401, statusText: "Unauthorized" }),
	});
	await assert.rejects(() => client.getIssue(1), (error) => {
		assert.ok(error instanceof GitHubApiError);
		assert.match(error.message, /401 Unauthorized/);
		assert.doesNotMatch(error.message, new RegExp(token));
		assert.match(error.message, /\[REDACTED\]/);
		return true;
	});
});

test("GitHub client maps network and abort errors safely", async () => {
	const networkClient = new GitHubClient({
		repository,
		token,
		fetchFn: async () => {
			throw new Error(`network leaked ${token}`);
		},
	});
	await assert.rejects(() => networkClient.getIssue(1), (error) => {
		assert.ok(error instanceof GitHubApiError);
		assert.doesNotMatch(error.message, new RegExp(token));
		return true;
	});

	const controller = new AbortController();
	controller.abort();
	let alreadyAbortedCalls = 0;
	const alreadyAbortedClient = new GitHubClient({
		repository,
		token,
		fetchFn: async () => {
			alreadyAbortedCalls += 1;
			return jsonResponse(issue());
		},
	});
	await assert.rejects(() => alreadyAbortedClient.getIssue(1, controller.signal), (error) => {
		assert.ok(error instanceof GitHubApiError);
		assert.equal(error.code, "github_request_aborted");
		return true;
	});
	assert.equal(alreadyAbortedCalls, 0);

	const abortClient = new GitHubClient({
		repository,
		token,
		fetchFn: async () => {
			throw new DOMException("aborted", "AbortError");
		},
	});
	await assert.rejects(() => abortClient.getIssue(1, AbortSignal.timeout(1000)), /aborted/);
});

test("GitHub client paginates open issues and filters pull requests", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url, init) => {
			calls.push({ url: url.toString(), init });
			if (calls.length === 1) {
				return jsonResponse([issue({ number: 1 }), issue({ number: 2, pull_request: {} })], {
					headers: { link: '<https://api.github.com/repos/owner/repo/issues?page=2>; rel="next"' },
				});
			}
			return jsonResponse([issue({ number: 3 })]);
		},
	});
	const issues = await client.listOpenIssues();
	assert.deepEqual(issues.map((item) => item.number), [1, 3]);
	assert.equal(calls.length, 2);
	assert.match(calls[0].url, /state=open/);
});

test("GitHub client lists issues with structured filters and bounded PR-excluding limits", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url, init) => {
			calls.push({ url: new URL(url.toString()), init });
			return jsonResponse([issue({ number: 1 }), issue({ number: 2, pull_request: {} }), issue({ number: 3 })]);
		},
	});
	const result = await client.listIssues({
		state: "all",
		labels: ["bug", "agent ready"],
		assignee: "octocat",
		creator: "hubot",
		mentioned: "maintainer",
		milestone: "v1.0",
		since: "2026-06-27T00:00:00Z",
		sort: "updated",
		direction: "asc",
		limit: 1,
	});
	assert.deepEqual(result.issues.map((item) => item.number), [1]);
	assert.equal(result.truncated, true);
	assert.equal(calls.length, 1);
	const search = calls[0].url.searchParams;
	assert.equal(search.get("state"), "all");
	assert.equal(search.get("labels"), "bug,agent ready");
	assert.equal(search.get("assignee"), "octocat");
	assert.equal(search.get("creator"), "hubot");
	assert.equal(search.get("mentioned"), "maintainer");
	assert.equal(search.get("milestone"), "v1.0");
	assert.equal(search.get("since"), "2026-06-27T00:00:00Z");
	assert.equal(search.get("sort"), "updated");
	assert.equal(search.get("direction"), "asc");
});

test("GitHub client searches issues with enforced repository and issue qualifiers", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url, init) => {
			calls.push({ url: new URL(url.toString()), init });
			return jsonResponse({
				total_count: 2,
				incomplete_results: false,
				items: [issue({ number: 5, state: "closed", title: "Search match" }), issue({ number: 6, pull_request: {} })],
			});
		},
	});
	const result = await client.searchIssues({
		query: "crash report",
		state: "closed",
		labels: ["bug", "needs triage"],
		creator: "octocat",
		mentioned: "hubot",
		milestone: "Sprint 1",
		since: "2026-06-27",
		sort: "comments",
		direction: "desc",
		limit: 10,
	});
	assert.deepEqual(result.issues.map((item) => item.number), [5]);
	assert.equal(result.totalCount, 2);
	assert.equal(result.truncated, true);
	assert.equal(calls.length, 1);
	const q = calls[0].url.searchParams.get("q");
	assert.match(q, /repo:owner\/repo/);
	assert.match(q, /is:issue/);
	assert.match(q, /crash report/);
	assert.match(q, /state:closed/);
	assert.match(q, /label:"needs triage"/);
	assert.match(q, /author:octocat/);
	assert.match(q, /mentions:hubot/);
	assert.match(q, /milestone:"Sprint 1"/);
	assert.match(q, /updated:>=2026-06-27/);
	assert.equal(calls[0].url.pathname, "/search/issues");
	assert.equal(calls[0].url.searchParams.get("sort"), "comments");
	assert.equal(calls[0].url.searchParams.get("order"), "desc");
});

test("GitHub client refuses issue search queries that try to escape the repository or include PRs", async () => {
	let calls = 0;
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async () => {
			calls += 1;
			return jsonResponse({ total_count: 0, incomplete_results: false, items: [] });
		},
	});
	for (const query of ["repo:evil/repo crash", "org:evil crash", "user:evil crash", "is:pr crash", "type:pull-request crash"]) {
		await assert.rejects(() => client.searchIssues({ query }), (error) => error?.code === "invalid_tool_input");
	}
	assert.equal(calls, 0);
});

test("mutating methods re-check state and refuse closed issues before sending mutation payloads", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url, init) => {
			calls.push({ url: url.toString(), method: init.method, body: init.body });
			return jsonResponse(issue({ state: "closed" }));
		},
	});
	await assert.rejects(() => client.updateIssue(1, { title: "New" }), (error) => {
		assert.ok(error instanceof ClosedIssueMutationError);
		return true;
	});
	assert.deepEqual(calls.map((call) => call.method), ["GET"]);
});

test("mutating methods guard immediately before mutation", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url, init) => {
			calls.push({ url: url.toString(), method: init.method, body: init.body });
			return jsonResponse(issue({ title: init.method === "PATCH" ? "New" : "Title" }));
		},
	});
	await client.updateIssue(1, { title: "New" });
	assert.deepEqual(calls.map((call) => call.method), ["GET", "PATCH"]);
	assert.equal(JSON.parse(calls[1].body).title, "New");
});

test("GitHub client links native sub-issues with GraphQL addSubIssue", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url, init) => {
			const body = init.body === undefined ? undefined : JSON.parse(init.body);
			calls.push({ url: url.toString(), method: init.method, headers: init.headers, body });
			const path = new URL(url.toString()).pathname;
			if (path === "/repos/owner/repo/issues/1") return jsonResponse(issue({ number: 1, title: "Parent", node_id: "I_parent" }));
			if (path === "/repos/owner/repo/issues/2") return jsonResponse(issue({ number: 2, title: "Child", node_id: "I_child", html_url: "https://github.com/owner/repo/issues/2" }));
			if (path === "/graphql") {
				return jsonResponse({
					data: {
						addSubIssue: {
							issue: { id: "I_parent", number: 1, title: "Parent", state: "OPEN", url: "https://github.com/owner/repo/issues/1" },
							subIssue: { id: "I_child", number: 2, title: "Child", state: "OPEN", url: "https://github.com/owner/repo/issues/2" },
						},
					},
				});
			}
			throw new Error(`Unexpected request ${init.method} ${path}`);
		},
	});

	const result = await client.addSubIssue(1, 2);
	assert.equal(result.parent.number, 1);
	assert.equal(result.child.number, 2);
	const graphQlCall = calls.find((call) => new URL(call.url).pathname === "/graphql");
	assert.ok(graphQlCall);
	assert.equal(graphQlCall.method, "POST");
	assert.equal(graphQlCall.headers["GraphQL-Features"], "sub_issues");
	assert.match(graphQlCall.body.query, /addSubIssue/);
	assert.deepEqual(graphQlCall.body.variables, { issueId: "I_parent", subIssueId: "I_child" });
});

test("GitHub client maps forbidden addSubIssue errors to actionable permission failures", async () => {
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url) => {
			const path = new URL(url.toString()).pathname;
			if (path === "/repos/owner/repo/issues/1") return jsonResponse(issue({ number: 1, title: "Parent", node_id: "I_parent" }));
			if (path === "/repos/owner/repo/issues/2") return jsonResponse(issue({ number: 2, title: "Child", node_id: "I_child", html_url: "https://github.com/owner/repo/issues/2" }));
			if (path === "/graphql") return jsonResponse({ data: null, errors: [{ type: "FORBIDDEN", message: "Resource not accessible by integration" }] });
			throw new Error(`Unexpected request ${path}`);
		},
	});

	await assert.rejects(() => client.addSubIssue(1, 2), (error) => {
		assert.ok(error instanceof GitHubApiError);
		assert.equal(error.code, "github_sub_issue_forbidden");
		assert.equal(error.status, 403);
		assert.match(error.message, /lacks permission for native sub-issues/i);
		assert.match(error.message, /did not fall back/i);
		assert.doesNotMatch(error.message, new RegExp(token));
		return true;
	});
});
