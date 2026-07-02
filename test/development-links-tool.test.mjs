import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { GitHubApiError } from "../src/errors.ts";
import { registerListIssueDevelopmentLinksTool } from "../src/tools/development-links.ts";

const TOKEN = "ghp_development_links_secret";
const REPOSITORY = "owner/repo";
const config = { issueDirectory: "issues", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-development-links-tool-"));
}

async function executeDevelopmentLinksTool(fetchFn, params) {
	const pi = fakePi();
	registerListIssueDevelopmentLinksTool(pi, {
		runtime: {
			config,
			repository: REPOSITORY,
			token: TOKEN,
			fetchFn,
		},
	});
	return pi.tools.get("issueme_list_issue_development_links").execute("call", params, undefined, undefined, {
		cwd: await tempProject(),
		isProjectTrusted: () => true,
	});
}

async function executeDevelopmentLinksToolWithClient(client, params) {
	const pi = fakePi();
	registerListIssueDevelopmentLinksTool(pi, {
		runtime: {
			config,
			repository: REPOSITORY,
			client,
		},
	});
	return pi.tools.get("issueme_list_issue_development_links").execute("call", params, undefined, undefined, {
		cwd: await tempProject(),
		isProjectTrusted: () => true,
	});
}

function developmentLinksClient(link) {
	return {
		repository: { owner: "owner", repo: "repo", fullName: REPOSITORY },
		async listIssueDevelopmentLinks() {
			return {
				issue: { id: "I_42", number: 42, title: "Feature issue", state: "open", html_url: `https://github.com/${REPOSITORY}/issues/42` },
				links: [link],
				timelineEventCount: 1,
				truncated: false,
			};
		},
	};
}

function issueNode(number = 42, title = "Feature issue", state = "OPEN") {
	return {
		id: `I_${number}`,
		number,
		title,
		state,
		url: `https://github.com/${REPOSITORY}/issues/${number}`,
	};
}

function pullRequest(number, title, overrides = {}) {
	return {
		__typename: "PullRequest",
		id: `PR_${number}`,
		number,
		title,
		state: "OPEN",
		merged: false,
		url: `https://github.com/${REPOSITORY}/pull/${number}`,
		headRefName: `feature/${number}`,
		baseRefName: "main",
		isDraft: false,
		...overrides,
	};
}

function commit(oid, message, overrides = {}) {
	return {
		__typename: "Commit",
		oid,
		messageHeadline: message,
		url: `https://github.com/${REPOSITORY}/commit/${oid}`,
		...overrides,
	};
}

function crossReferencedPrEvent(pr, willCloseTarget = true) {
	return {
		__typename: "CrossReferencedEvent",
		createdAt: "2026-06-27T00:00:00Z",
		willCloseTarget,
		source: pr,
	};
}

function connectedPrEvent(pr) {
	return {
		__typename: "ConnectedEvent",
		createdAt: "2026-06-27T00:00:00Z",
		subject: pr,
	};
}

function referencedCommitEvent(commitNode) {
	return {
		__typename: "ReferencedEvent",
		createdAt: "2026-06-27T00:00:00Z",
		commit: commitNode,
	};
}

function closedByEvent(closer) {
	return {
		__typename: "ClosedEvent",
		createdAt: "2026-06-27T00:00:00Z",
		closer,
	};
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json", ...(init.headers ?? {}) },
	});
}

function developmentLinksResponse({ events, totalCount = events.length, hasNextPage = false, issue = issueNode() }) {
	return jsonResponse({
		data: {
			repository: {
				issue: {
					...issue,
					timelineItems: {
						totalCount,
						nodes: events,
						pageInfo: { hasNextPage },
					},
				},
			},
		},
	});
}

function makeGraphQLFetch(handler) {
	const calls = [];
	const fetchFn = async (url, init = {}) => {
		const parsed = new URL(url.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ path: parsed.pathname, body, headers: init.headers, method: init.method });
		assert.equal(parsed.pathname, "/graphql");
		assert.equal(init.method, "POST");
		assert.equal(body.operationName, "IssueMeListIssueDevelopmentLinks");
		return handler({ url: parsed, init, body });
	};
	return { calls, fetchFn };
}

function assertNoToken(result) {
	assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));
}

test("issueme_list_issue_development_links reports no linked development clearly", async () => {
	const mock = makeGraphQLFetch(({ body }) => {
		assert.deepEqual(body.variables, { owner: "owner", repo: "repo", issueNumber: 42, first: 25 });
		assert.match(body.query, /timelineItems/);
		return developmentLinksResponse({ events: [] });
	});

	const result = await executeDevelopmentLinksTool(mock.fetchFn, { issueNumber: 42 });

	assert.equal(result.details.result, "success");
	assert.equal(result.details.status, "list_issue_development_links");
	assert.equal(result.details.cacheUpdated, false);
	assert.equal(result.details.needsSync, false);
	assert.equal(result.details.issue.number, 42);
	assert.deepEqual(result.details.developmentLinks, []);
	assert.equal(result.details.counts.timelineEvents, 0);
	assert.match(result.content[0].text, /No linked pull requests/);
	assert.match(result.content[0].text, /read-only/);
	assertNoToken(result);
});

test("issueme_list_issue_development_links formats generic unknown references from injected clients", async () => {
	const genericLink = { type: "unknown", referenceTypes: [], title: "Manual development reference" };

	const result = await executeDevelopmentLinksToolWithClient(developmentLinksClient(genericLink), { issueNumber: 42 });

	assert.equal(result.details.result, "success");
	assert.equal(result.details.developmentLinks[0].type, "unknown");
	assert.match(result.content[0].text, /Development reference \(reference\); Manual development reference/);
	assertNoToken(result);
});

test("issueme_list_issue_development_links returns linked pull request state, URL, branch, and closing metadata", async () => {
	const pr = pullRequest(7, "Implement feature", { headRefName: "feature/linked-pr" });
	const mock = makeGraphQLFetch(({ body }) => {
		assert.equal(body.variables.first, 25);
		return developmentLinksResponse({ events: [crossReferencedPrEvent(pr, true), connectedPrEvent(pr)] });
	});

	const result = await executeDevelopmentLinksTool(mock.fetchFn, { issueNumber: 42 });

	assert.equal(result.details.developmentLinks.length, 1);
	const link = result.details.developmentLinks[0];
	assert.equal(link.type, "pull_request");
	assert.equal(link.number, 7);
	assert.equal(link.title, "Implement feature");
	assert.equal(link.state, "open");
	assert.equal(link.html_url, "https://github.com/owner/repo/pull/7");
	assert.equal(link.branchName, "feature/linked-pr");
	assert.equal(link.baseBranchName, "main");
	assert.equal(link.willCloseTarget, true);
	assert.deepEqual(link.referenceTypes, ["closing_reference", "connected"]);
	assert.match(result.content[0].text, /PR #7 \[open\]/);
	assert.match(result.content[0].text, /branch feature\/linked-pr -> main/);
	assertNoToken(result);
});

test("issueme_list_issue_development_links bounds many pull requests with truncation metadata", async () => {
	const events = Array.from({ length: 5 }, (_, index) => crossReferencedPrEvent(pullRequest(index + 1, `PR ${index + 1}`), false));
	const mock = makeGraphQLFetch(({ body }) => {
		assert.equal(body.variables.first, 5);
		return developmentLinksResponse({ events, totalCount: 12, hasNextPage: true });
	});

	const result = await executeDevelopmentLinksTool(mock.fetchFn, { issueNumber: 42, limit: 5 });

	assert.equal(result.details.developmentLinks.length, 5);
	assert.equal(result.details.truncated, true);
	assert.deepEqual(result.details.truncation.developmentLinks, { shown: 5, total: 12, max: 5 });
	assert.equal(result.details.counts.pullRequests, 5);
	assert.equal(result.details.counts.timelineEvents, 12);
	assert.match(result.content[0].text, /truncated at 5 event/);
	assertNoToken(result);
});

test("issueme_list_issue_development_links keeps same-number pull requests from different URLs distinct", async () => {
	const repoPr = pullRequest(7, "Repo PR");
	const forkPr = pullRequest(7, "Fork PR", {
		url: "https://github.com/fork/repo/pull/7",
		headRefName: "fork/feature",
	});
	const mock = makeGraphQLFetch(() => developmentLinksResponse({ events: [crossReferencedPrEvent(repoPr, true), connectedPrEvent(forkPr)] }));

	const result = await executeDevelopmentLinksTool(mock.fetchFn, { issueNumber: 42 });

	assert.equal(result.details.developmentLinks.length, 2);
	assert.deepEqual(
		result.details.developmentLinks.map((link) => link.html_url).sort(),
		["https://github.com/fork/repo/pull/7", "https://github.com/owner/repo/pull/7"],
	);
	assert.deepEqual(result.details.developmentLinks.map((link) => link.referenceTypes), [["closing_reference"], ["connected"]]);
	assertNoToken(result);
});

test("issueme_list_issue_development_links includes closed pull requests and commit references", async () => {
	const closedPr = pullRequest(9, "Closed attempt", { state: "CLOSED", headRefName: "fix/closed" });
	const commitNode = commit("abcdef1234567890", "Reference issue from commit");
	const mock = makeGraphQLFetch(() => developmentLinksResponse({ events: [closedByEvent(closedPr), referencedCommitEvent(commitNode)] }));

	const result = await executeDevelopmentLinksTool(mock.fetchFn, { issueNumber: 42 });

	const prLink = result.details.developmentLinks.find((link) => link.type === "pull_request");
	const commitLink = result.details.developmentLinks.find((link) => link.type === "commit");
	assert.equal(prLink.state, "closed");
	assert.equal(prLink.closedBy, true);
	assert.deepEqual(prLink.referenceTypes, ["closed_by"]);
	assert.equal(commitLink.commitOid, "abcdef1234567890");
	assert.equal(commitLink.message, "Reference issue from commit");
	assert.deepEqual(commitLink.referenceTypes, ["commit_reference"]);
	assert.equal(result.details.counts.commits, 1);
	assert.match(result.content[0].text, /PR #9 \[closed\]/);
	assert.match(result.content[0].text, /Commit abcdef123456/);
	assertNoToken(result);
});

test("issueme_list_issue_development_links maps permission and unsupported GraphQL failures safely", async () => {
	const forbidden = makeGraphQLFetch(() => jsonResponse({ data: null, errors: [{ type: "FORBIDDEN", message: `Resource not accessible by integration ${TOKEN}` }] }));
	await assert.rejects(
		() => executeDevelopmentLinksTool(forbidden.fetchFn, { issueNumber: 42 }),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assert.equal(error.code, "github_development_links_forbidden");
			assert.match(error.message, /development-link inspection was forbidden/i);
			assert.doesNotMatch(error.message, new RegExp(TOKEN));
			return true;
		},
	);

	const unsupported = makeGraphQLFetch(() => jsonResponse({ data: null, errors: [{ type: "undefinedField", message: "Field 'timelineItems' doesn't exist on type 'Issue'" }] }));
	await assert.rejects(
		() => executeDevelopmentLinksTool(unsupported.fetchFn, { issueNumber: 42 }),
		(error) => {
			assert.ok(error instanceof GitHubApiError);
			assert.equal(error.code, "github_development_links_unsupported");
			assert.match(error.message, /unsupported|unavailable/i);
			return true;
		},
	);
});
