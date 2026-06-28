import assert from "node:assert/strict";
import test from "node:test";

import { GitHubApiError } from "../src/errors.ts";
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

test("GitHub client refuses off-host, off-repo, non-HTTPS, and malformed pagination URLs", async () => {
	const cases = [
		["off-host", '<https://evil.example/repos/owner/repo/issues?page=2>; rel="next"', /boundary/],
		["off-repo", '<https://api.github.com/repos/other/repo/issues?page=2>; rel="next"', /boundary/],
		["non-HTTPS", '<http://api.github.com/repos/owner/repo/issues?page=2>; rel="next"', /boundary/],
		["malformed", '<not a url>; rel="next"', /malformed/],
	];

	for (const [name, link, messagePattern] of cases) {
		const calls = [];
		const client = new GitHubClient({
			repository,
			token,
			fetchFn: async (url, init) => {
				calls.push({ url: url.toString(), init });
				return jsonResponse([issue()], { headers: { link } });
			},
		});
		await assert.rejects(() => client.listOpenIssues(), (error) => {
			assert.ok(error instanceof GitHubApiError, name);
			assert.match(error.message, /pagination URL/, name);
			assert.match(error.message, messagePattern, name);
			assert.doesNotMatch(error.message, new RegExp(token), name);
			return true;
		});
		assert.equal(calls.length, 1, name);
	}
});


test("GitHub client refuses direct REST URLs outside the GitHub repository boundary before sending tokens", async () => {
	let calls = 0;
	const client = new GitHubClient({
		repository,
		token,
		baseUrl: "https://evil.example",
		fetchFn: async () => {
			calls += 1;
			return jsonResponse(issue());
		},
	});
	await assert.rejects(() => client.getIssue(1), (error) => {
		assert.ok(error instanceof GitHubApiError);
		assert.match(error.message, /REST API URL/);
		assert.match(error.message, /boundary/);
		assert.doesNotMatch(error.message, new RegExp(token));
		return true;
	});
	assert.equal(calls, 0);
});

test("GitHub client maps invalid JSON and unexpected response shapes safely", async () => {
	const invalidJsonClient = new GitHubClient({
		repository,
		token,
		fetchFn: async () => new Response("{not json", { status: 200, statusText: "OK" }),
	});
	await assert.rejects(() => invalidJsonClient.getIssue(1), /invalid JSON/);

	const badShapeClient = new GitHubClient({
		repository,
		token,
		fetchFn: async () => jsonResponse({ not: "an array" }),
	});
	await assert.rejects(() => badShapeClient.listOpenIssues(), /unexpected response shape/);
});

test("GitHub client exposes actionable rate-limit details without leaking token or request body", async () => {
	const privateBody = "PRIVATE REQUEST BODY";
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async () => jsonResponse({ message: `rate limited ${token} ${privateBody}` }, {
			status: 403,
			statusText: "Forbidden",
			headers: {
				"x-ratelimit-remaining": "0",
				"x-ratelimit-reset": "12345",
				"x-ratelimit-resource": "core",
			},
		}),
	});
	await assert.rejects(() => client.createIssue({ title: "Title", body: privateBody }), (error) => {
		assert.ok(error instanceof GitHubApiError);
		assert.match(error.message, /rate-limit|retry-after/i);
		assert.match(error.message, /does not retry automatically/);
		assert.match(error.message, /12345/);
		assert.doesNotMatch(error.message, new RegExp(token));
		assert.doesNotMatch(error.message, /PRIVATE REQUEST BODY/);
		assert.equal(error.safeDetails.rateLimit.remaining, "0");
		assert.equal(error.safeDetails.rateLimit.reset, "12345");
		assert.equal(error.safeDetails.rateLimit.resource, "core");
		assert.equal(error.safeDetails.rateLimit.retryPolicy, "fail_fast");
		return true;
	});
});


test("GitHub client treats secondary rate-limit Retry-After as fail-fast and does not retry", async () => {
	let calls = 0;
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async () => {
			calls += 1;
			return jsonResponse({ message: "secondary rate limit" }, {
				status: 403,
				statusText: "Forbidden",
				headers: { "retry-after": "60" },
			});
		},
	});
	await assert.rejects(() => client.getIssue(1), (error) => {
		assert.ok(error instanceof GitHubApiError);
		assert.match(error.message, /Retry-After: 60/);
		assert.match(error.message, /does not retry automatically/);
		assert.equal(error.safeDetails.rateLimit.retryAfter, "60");
		assert.equal(error.safeDetails.rateLimit.retryPolicy, "fail_fast");
		return true;
	});
	assert.equal(calls, 1);
});


test("GitHub client fail-fast retry policy is deterministic for transient server errors", async () => {
	let calls = 0;
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async () => {
			calls += 1;
			return jsonResponse({ message: "temporary unavailable" }, { status: 503, statusText: "Service Unavailable" });
		},
	});
	await assert.rejects(() => client.getIssue(1), (error) => {
		assert.ok(error instanceof GitHubApiError);
		assert.match(error.message, /503 Service Unavailable/);
		return true;
	});
	assert.equal(calls, 1);
});

test("GitHub label endpoints use label-list semantics and missing label removal is idempotent", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url, init) => {
			calls.push({ url: url.toString(), method: init.method, body: init.body });
			if (init.method === "GET") return jsonResponse(issue());
			if (init.method === "DELETE") return jsonResponse({ message: "Not Found" }, { status: 404, statusText: "Not Found" });
			return jsonResponse([{ name: "bug" }]);
		},
	});
	assert.deepEqual(await client.addLabels(1, ["bug"]), [{ name: "bug" }]);
	assert.deepEqual(await client.setLabels(1, ["bug"]), [{ name: "bug" }]);
	assert.equal(await client.removeLabel(1, "missing"), undefined);
	assert.deepEqual(calls.map((call) => call.method), ["GET", "POST", "GET", "PUT", "GET", "DELETE"]);
});

test("GitHub repository label management uses label REST endpoints", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url, init) => {
			calls.push({ url: new URL(url.toString()), method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) });
			if (init.method === "DELETE") return new Response(null, { status: 204, statusText: "No Content" });
			return jsonResponse({ name: init.method === "PATCH" ? "triaged" : "triage", color: "fbca04", description: "Needs triage" });
		},
	});

	assert.deepEqual(await client.createRepositoryLabel({ name: "triage", color: "fbca04", description: "Needs triage" }), { name: "triage", color: "fbca04", description: "Needs triage" });
	assert.deepEqual(await client.updateRepositoryLabel("triage", { new_name: "triaged", color: "0e8a16", description: "Triaged" }), { name: "triaged", color: "fbca04", description: "Needs triage" });
	await client.deleteRepositoryLabel("triaged");

	assert.deepEqual(calls.map((call) => [call.method, call.url.pathname]), [
		["POST", "/repos/owner/repo/labels"],
		["PATCH", "/repos/owner/repo/labels/triage"],
		["DELETE", "/repos/owner/repo/labels/triaged"],
	]);
	assert.deepEqual(calls[0].body, { name: "triage", color: "fbca04", description: "Needs triage" });
	assert.deepEqual(calls[1].body, { new_name: "triaged", color: "0e8a16", description: "Triaged" });
});

test("GitHub repository milestone management uses milestone REST endpoints", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url, init) => {
			calls.push({ url: new URL(url.toString()), method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body) });
			if (init.method === "DELETE") return new Response(null, { status: 204, statusText: "No Content" });
			return jsonResponse({ number: 1, title: init.method === "PATCH" ? "v1.1" : "v1.0", state: init.body?.includes("closed") ? "closed" : "open" });
		},
	});

	assert.deepEqual(await client.createRepositoryMilestone({ title: "v1.0", description: "First release", due_on: "2026-07-01T00:00:00Z" }), { number: 1, title: "v1.0", state: "open" });
	assert.deepEqual(await client.updateRepositoryMilestone(1, { title: "v1.1", state: "closed", due_on: null }), { number: 1, title: "v1.1", state: "closed" });
	await client.deleteRepositoryMilestone(1);

	assert.deepEqual(calls.map((call) => [call.method, call.url.pathname]), [
		["POST", "/repos/owner/repo/milestones"],
		["PATCH", "/repos/owner/repo/milestones/1"],
		["DELETE", "/repos/owner/repo/milestones/1"],
	]);
	assert.deepEqual(calls[0].body, { title: "v1.0", description: "First release", due_on: "2026-07-01T00:00:00Z" });
	assert.deepEqual(calls[1].body, { title: "v1.1", state: "closed", due_on: null });
});

test("GitHub client lists repository milestones with API filters and bounded pagination", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url, init) => {
			calls.push({ url: new URL(url.toString()), method: init.method });
			if (calls.length === 1) {
				return jsonResponse([{ number: 1, title: "v1.0", state: "closed" }], {
					headers: { link: '<https://api.github.com/repos/owner/repo/milestones?page=2>; rel="next"' },
				});
			}
			return jsonResponse([{ number: 2, title: "v2.0", state: "open" }, { number: 3, title: "v3.0", state: "open" }]);
		},
	});

	const result = await client.listMilestones({ state: "all", sort: "completeness", direction: "desc", limit: 2 });
	assert.deepEqual(result.milestones.map((milestone) => milestone.number), [1, 2]);
	assert.equal(result.truncated, true);
	assert.equal(calls.length, 2);
	assert.deepEqual(calls.map((call) => [call.method, call.url.pathname]), [
		["GET", "/repos/owner/repo/milestones"],
		["GET", "/repos/owner/repo/milestones"],
	]);
	assert.equal(calls[0].url.searchParams.get("state"), "all");
	assert.equal(calls[0].url.searchParams.get("sort"), "completeness");
	assert.equal(calls[0].url.searchParams.get("direction"), "desc");
	assert.equal(calls[0].url.searchParams.get("per_page"), "2");
});

test("GitHub client lists repository assignees with filters and bounded pagination", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url, init) => {
			calls.push({ url: new URL(url.toString()), method: init.method });
			if (calls.length === 1) {
				return jsonResponse([{ login: "octocat", id: 1, type: "User", html_url: "https://github.com/octocat" }], {
					headers: { link: '<https://api.github.com/repos/owner/repo/assignees?page=2>; rel="next"' },
				});
			}
			return jsonResponse([
				{ login: "octo-bot", id: 2, type: "Bot", html_url: "https://github.com/octo-bot" },
				{ login: "hubot", id: 3, type: "Bot", html_url: "https://github.com/hubot" },
				{ login: "dependabot", id: 4, type: "Bot", html_url: "https://github.com/dependabot" },
			]);
		},
	});

	const result = await client.listAssignees({ query: "bot", limit: 2 });
	assert.deepEqual(result.assignees.map((assignee) => assignee.login), ["octo-bot", "hubot"]);
	assert.equal(result.truncated, true);
	assert.equal(calls.length, 2);
	assert.deepEqual(calls.map((call) => [call.method, call.url.pathname]), [
		["GET", "/repos/owner/repo/assignees"],
		["GET", "/repos/owner/repo/assignees"],
	]);
	assert.equal(calls[0].url.searchParams.get("per_page"), "2");
});

test("GitHub comment pagination respects configured limits", async () => {
	const calls = [];
	const client = new GitHubClient({
		repository,
		token,
		fetchFn: async (url, init) => {
			calls.push({ url: url.toString(), init });
			return jsonResponse([{ id: 1 }, { id: 2 }], {
				headers: { link: '<https://api.github.com/repos/owner/repo/issues/1/comments?page=2>; rel="next"' },
			});
		},
	});
	const comments = await client.listComments(1, undefined, { limit: 1 });
	assert.equal(comments.length, 1);
	assert.equal(calls.length, 1);
});
