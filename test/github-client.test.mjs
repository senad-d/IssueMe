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
	const abortClient = new GitHubClient({
		repository,
		token,
		fetchFn: async () => {
			throw new DOMException("aborted", "AbortError");
		},
	});
	await assert.rejects(() => abortClient.getIssue(1, controller.signal), /aborted/);
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
