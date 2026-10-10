import assert from "node:assert/strict";
import test from "node:test";

import { ISSUEME_ERROR_CODES, IssueMeError } from "../src/errors.ts";
import { GitHubClient } from "../src/github/client.ts";
import { consumeConnectionNodes, decodeContinuationToken, encodeContinuationToken, normalizeContinuationTokenInput } from "../src/github/continuation.ts";
import { registerListLabelsTool } from "../src/tools/list-labels.ts";
import { registerListMilestonesTool } from "../src/tools/list-milestones.ts";
import { registerListSubIssuesTool } from "../src/tools/sub-issue.ts";
import {
	createFakePi,
	createFetchRecorder,
	executeRegisteredTool,
	githubIssue,
	githubLabel,
	graphQLConnection,
	graphQLResponse,
	jsonResponse,
	projectV2Node,
	projectV2SingleSelectField,
	runtimeOptions,
	tempProject,
	TEST_REPOSITORY,
	TEST_REPOSITORY_OBJECT,
	TEST_TOKEN,
} from "./helpers/issueme-test-helpers.mjs";

const LABEL_BINDING = { collection: "labels", repository: TEST_REPOSITORY, filters: { name: "wanted" } };

function clientFor(handler) {
	const recorder = createFetchRecorder(handler);
	return { ...recorder, client: new GitHubClient({ repository: TEST_REPOSITORY_OBJECT, token: TEST_TOKEN, fetchFn: recorder.fetchFn }) };
}

/** Serves a stable REST collection by page/per_page with GitHub-style next links. */
function restCollection(path, items) {
	return (call) => {
		assert.equal(call.url.pathname, `/repos/owner/repo/${path}`);
		const perPage = Number(call.url.searchParams.get("per_page") ?? "30");
		const page = Number(call.url.searchParams.get("page") ?? "1");
		const start = (page - 1) * perPage;
		const slice = items.slice(start, start + perPage);
		const headers = start + perPage < items.length
			? { link: `<https://api.github.com/repos/owner/repo/${path}?per_page=${perPage}&page=${page + 1}>; rel="next"` }
			: {};
		return jsonResponse(slice, { headers });
	};
}

/** Serves a stable GraphQL connection with cursors of the form c<index>. */
function connectionPage(nodes, first, after) {
	const start = after === undefined ? 0 : Number(after.slice(1));
	const slice = nodes.slice(start, start + first);
	const end = start + slice.length;
	return { ...graphQLConnection(slice, { hasNextPage: end < nodes.length, endCursor: end > start ? `c${end}` : null }), totalCount: nodes.length };
}

async function traverse(read) {
	const pages = [];
	let after;
	for (let round = 0; round < 25; round += 1) {
		const result = await read(after);
		pages.push(result);
		if (!result.continuation?.nextToken) return pages;
		after = result.continuation.nextToken;
	}
	throw new Error("continuation did not terminate");
}

function rejectsContinuation(reason) {
	return (error) => {
		assert.ok(error instanceof IssueMeError, `expected IssueMeError, got ${error}`);
		assert.equal(error.code, ISSUEME_ERROR_CODES.CONTINUATION_TOKEN_INVALID);
		assert.equal(error.safeDetails.reason, reason);
		assert.equal(error.safeDetails.field, "after");
		return true;
	};
}

test("continuation tokens round-trip and fail safely when forged, mismatched, malformed, or out of bounds", () => {
	const restToken = encodeContinuationToken(LABEL_BINDING, { kind: "rest", index: 7 });
	assert.deepEqual(decodeContinuationToken(restToken, LABEL_BINDING, "rest"), { kind: "rest", index: 7 });
	assert.doesNotMatch(restToken, /https?:/);
	const graphqlBinding = { collection: "projects", repository: TEST_REPOSITORY, filters: { scope: "repository", includeClosed: false } };
	const graphqlToken = encodeContinuationToken(graphqlBinding, { kind: "graphql", cursor: "c4", skip: 1 });
	assert.deepEqual(decodeContinuationToken(graphqlToken, graphqlBinding, "graphql"), { kind: "graphql", cursor: "c4", skip: 1 });
	assert.deepEqual(decodeContinuationToken(encodeContinuationToken(graphqlBinding, { kind: "graphql", skip: 0 }), graphqlBinding, "graphql"), { kind: "graphql", skip: 0 });

	assert.equal(decodeContinuationToken(undefined, LABEL_BINDING, "rest"), undefined);
	assert.equal(decodeContinuationToken("   ", LABEL_BINDING, "rest"), undefined);
	assert.equal(normalizeContinuationTokenInput(" "), undefined);
	assert.equal(normalizeContinuationTokenInput(` ${restToken} `), restToken);
	assert.throws(() => normalizeContinuationTokenInput("a b"), rejectsContinuation("malformed"));
	assert.throws(() => normalizeContinuationTokenInput("x".repeat(2049)), rejectsContinuation("malformed"));

	assert.throws(() => decodeContinuationToken("not-a-token", LABEL_BINDING, "rest"), rejectsContinuation("malformed"));
	assert.throws(() => decodeContinuationToken(Buffer.from("{\"v\":1}").toString("base64url"), LABEL_BINDING, "rest"), rejectsContinuation("malformed"));
	assert.throws(() => decodeContinuationToken(Buffer.from("https://evil.example/repos/x").toString("base64url"), LABEL_BINDING, "rest"), rejectsContinuation("malformed"));

	const payload = JSON.parse(Buffer.from(restToken, "base64url").toString("utf8"));
	const forged = Buffer.from(JSON.stringify({ ...payload, p: { k: "r", i: 900 } }), "utf8").toString("base64url");
	assert.throws(() => decodeContinuationToken(forged, LABEL_BINDING, "rest"), rejectsContinuation("checksum"));

	assert.throws(() => decodeContinuationToken(restToken, { ...LABEL_BINDING, collection: "milestones" }, "rest"), rejectsContinuation("collection_mismatch"));
	assert.throws(() => decodeContinuationToken(restToken, { ...LABEL_BINDING, repository: "other/repo" }, "rest"), rejectsContinuation("repository_mismatch"));
	assert.throws(() => decodeContinuationToken(restToken, { ...LABEL_BINDING, filters: { name: "other" } }, "rest"), rejectsContinuation("filter_mismatch"));
	assert.throws(() => decodeContinuationToken(restToken, LABEL_BINDING, "graphql"), rejectsContinuation("kind_mismatch"));
	assert.throws(() => decodeContinuationToken(encodeContinuationToken(LABEL_BINDING, { kind: "rest", index: -1 }), LABEL_BINDING, "rest"), rejectsContinuation("out_of_bounds"));
	assert.throws(() => decodeContinuationToken(encodeContinuationToken(LABEL_BINDING, { kind: "rest", index: 5_000_000 }), LABEL_BINDING, "rest"), rejectsContinuation("out_of_bounds"));
	assert.throws(() => decodeContinuationToken(encodeContinuationToken(graphqlBinding, { kind: "graphql", cursor: "c1", skip: 101 }), graphqlBinding, "graphql"), rejectsContinuation("out_of_bounds"));
	assert.throws(() => decodeContinuationToken(encodeContinuationToken(graphqlBinding, { kind: "graphql", cursor: "bad\ncursor", skip: 0 }), graphqlBinding, "graphql"), rejectsContinuation("out_of_bounds"));

	// Filter fingerprints ignore key order and undefined values, so normalized filters bind consistently.
	const reordered = { collection: "labels", repository: TEST_REPOSITORY, filters: { query: undefined, name: "wanted" } };
	assert.deepEqual(decodeContinuationToken(restToken, reordered, "rest"), { kind: "rest", index: 7 });
});

test("consumeConnectionNodes skips consumed nodes, filters, stops at the limit, and carries oversized skips", () => {
	const normalize = (node) => (node.keep ? node.id : undefined);
	const nodes = [{ id: 1, keep: true }, { id: 2, keep: false }, { id: 3, keep: true }, { id: 4, keep: true }];
	assert.deepEqual(consumeConnectionNodes(nodes, 0, 10, normalize), { items: [1, 3, 4], carriedSkip: 0 });
	assert.deepEqual(consumeConnectionNodes(nodes, 1, 1, normalize), { items: [3], stoppedAt: 3, carriedSkip: 0 });
	assert.deepEqual(consumeConnectionNodes(nodes, 4, 2, normalize), { items: [], carriedSkip: 0 });
	assert.deepEqual(consumeConnectionNodes(nodes, 6, 2, normalize), { items: [], carriedSkip: 2 });
});

test("REST label discovery resumes across filtered multi-page collections without skips or repeats", async () => {
	const labels = Array.from({ length: 23 }, (_, index) => githubLabel({ name: index % 3 === 0 ? `wanted-${index}` : `other-${index}` }));
	const wanted = labels.map((label) => label.name).filter((name) => name.startsWith("wanted"));
	const harness = clientFor(restCollection("labels", labels));

	const pages = await traverse((after) => harness.client.listLabels({ name: "wanted", limit: 3, after }));
	assert.deepEqual(pages.flatMap((page) => page.labels.map((label) => label.name)), wanted);
	assert.equal(pages.at(-1).continuation.complete, true);
	assert.equal(pages.at(-1).continuation.nextToken, undefined);
	assert.equal(pages[0].continuation.resumed, false);
	assert.equal(pages[1].continuation.resumed, true);
	for (const page of pages.slice(0, -1)) {
		assert.equal(page.truncated, true);
		assert.equal(page.continuation.complete, false);
		assert.equal(page.continuation.collection, "labels");
	}
	assert.equal(harness.calls[0].url.searchParams.has("page"), false, "first page never carries a page parameter");

	// A resumed read that stopped mid-page positions by absolute raw index, so changing the limit between calls stays exact.
	const first = await harness.client.listLabels({ name: "wanted", limit: 2 });
	assert.deepEqual(decodeContinuationToken(first.continuation.nextToken, LABEL_BINDING, "rest"), { kind: "rest", index: 4 });
	const rest = await traverse((after) => harness.client.listLabels({ name: "wanted", limit: 5, after: after ?? first.continuation.nextToken }));
	assert.deepEqual([...first.labels, ...rest.flatMap((page) => page.labels)].map((label) => label.name), wanted);
	const resumedCall = harness.calls.find((call) => call.url.searchParams.get("per_page") === "5");
	assert.ok(resumedCall && !resumedCall.url.searchParams.has("page"), "a page size of 5 maps absolute index 4 back onto the first page, which carries no page parameter");
});

test("REST issue list and search continuation preserve pull-request filtering and page parameters", async () => {
	const issues = Array.from({ length: 9 }, (_, index) => githubIssue({ number: index + 1, ...(index % 4 === 1 ? { pull_request: {} } : {}) }));
	const expected = issues.filter((issue) => !issue.pull_request).map((issue) => issue.number);
	const listHarness = clientFor(restCollection("issues", issues));
	const listPages = await traverse((after) => listHarness.client.listIssues({ state: "all", limit: 2, after }));
	assert.deepEqual(listPages.flatMap((page) => page.issues.map((issue) => issue.number)), expected);
	assert.equal(listPages.at(-1).continuation.complete, true);

	const searchHarness = clientFor((call) => {
		assert.equal(call.url.pathname, "/search/issues");
		assert.match(call.url.searchParams.get("q"), /repo:owner\/repo/);
		const perPage = Number(call.url.searchParams.get("per_page"));
		const page = Number(call.url.searchParams.get("page") ?? "1");
		const start = (page - 1) * perPage;
		const slice = issues.slice(start, start + perPage);
		const headers = start + perPage < issues.length
			? { link: `<https://api.github.com/search/issues?q=repo%3Aowner%2Frepo+is%3Aissue+crash&per_page=${perPage}&page=${page + 1}>; rel="next"` }
			: {};
		return jsonResponse({ total_count: issues.length, incomplete_results: false, items: slice }, { headers });
	});
	const searchPages = await traverse((after) => searchHarness.client.searchIssues({ query: "crash", limit: 4, after }));
	assert.deepEqual(searchPages.flatMap((page) => page.issues.map((issue) => issue.number)), expected);
	assert.equal(searchPages[0].totalCount, issues.length);
	assert.equal(searchPages.at(-1).continuation.collection, "issue_search");

	const listToken = listPages[0].continuation.nextToken;
	await assert.rejects(() => searchHarness.client.searchIssues({ query: "crash", limit: 4, after: listToken }), rejectsContinuation("collection_mismatch"));
	await assert.rejects(() => listHarness.client.listIssues({ state: "closed", limit: 2, after: listToken }), rejectsContinuation("filter_mismatch"));
});

test("Projects v2 discovery continuation keeps closed-board filtering exact across cursor pages", async () => {
	const nodes = Array.from({ length: 9 }, (_, index) => projectV2Node({ number: index + 1, closed: index % 3 === 1 }));
	const expected = nodes.filter((node) => !node.closed).map((node) => node.number);
	const harness = clientFor((call) => {
		assert.equal(call.json.operationName, "IssueMeListProjectsV2");
		assert.equal(call.json.variables.first, 2);
		return graphQLResponse({ repository: { projectsV2: connectionPage(nodes, call.json.variables.first, call.json.variables.after) } });
	});
	const pages = await traverse((after) => harness.client.listProjectsV2({ limit: 2, after }));
	assert.deepEqual(pages.flatMap((page) => page.projects.map((project) => project.number)), expected);
	assert.equal(pages.at(-1).continuation.complete, true);
	assert.ok(pages.every((page) => page.projects.length <= 2));
	assert.ok(pages.slice(0, -1).every((page) => page.truncated && page.continuation.nextToken));

	await assert.rejects(() => harness.client.listProjectsV2({ limit: 2, includeClosed: true, after: pages[0].continuation.nextToken }), rejectsContinuation("filter_mismatch"));
});

test("project field, sub-issue, and development-link continuation follow GitHub cursors without count-based false truncation", async () => {
	const fields = Array.from({ length: 5 }, (_, index) => projectV2SingleSelectField({ id: `PVTSSF_${index}`, name: `Field ${index}` }));
	const fieldHarness = clientFor((call) => {
		assert.equal(call.json.operationName, "IssueMeGetProjectV2FieldsById");
		return graphQLResponse({ node: { ...projectV2Node(), fields: connectionPage(fields, call.json.variables.fieldsFirst, call.json.variables.fieldsAfter) } });
	});
	const fieldPages = await traverse((after) => fieldHarness.client.getProjectV2Fields({ projectId: "PVT_1", fieldLimit: 2, after }));
	assert.deepEqual(fieldPages.flatMap((page) => page.fields.map((field) => field.name)), fields.map((field) => field.name));
	assert.equal(fieldPages.length, 3);
	assert.equal(fieldPages.at(-1).truncated, false);
	assert.equal(fieldHarness.calls[0].json.variables.fieldsAfter, undefined);
	assert.equal(fieldHarness.calls[1].json.variables.fieldsAfter, "c2");

	const children = Array.from({ length: 5 }, (_, index) => ({ id: `I_${index + 10}`, number: index + 10, title: `Child ${index}`, state: "OPEN", url: `https://github.com/owner/repo/issues/${index + 10}`, author: { login: "octocat" } }));
	const subIssueHarness = clientFor((call) => {
		assert.equal(call.json.operationName, "IssueMeListSubIssues");
		return graphQLResponse({ repository: { issue: { id: "I_1", number: 1, title: "Parent", state: "OPEN", url: "https://github.com/owner/repo/issues/1", author: { login: "octocat" }, parent: null, subIssues: connectionPage(children, call.json.variables.first, call.json.variables.after) } } });
	});
	const subIssuePages = await traverse((after) => subIssueHarness.client.listSubIssueRelationships(1, { limit: 2, after }));
	assert.deepEqual(subIssuePages.flatMap((page) => page.subIssues.map((issue) => issue.number)), children.map((child) => child.number));
	assert.equal(subIssuePages[0].truncated, true);
	assert.equal(subIssuePages[0].subIssuesCount, 5);
	assert.equal(subIssuePages.at(-1).truncated, false, "the final resumed page is complete even though totalCount exceeds the page");
	assert.equal(subIssuePages.at(-1).continuation.resumed, true);
	assert.equal(subIssueHarness.calls[0].json.variables.after, undefined);

	const events = Array.from({ length: 3 }, (_, index) => ({
		__typename: "CrossReferencedEvent",
		createdAt: "2026-06-27T00:00:00Z",
		willCloseTarget: false,
		source: { __typename: "PullRequest", id: `PR_${index}`, number: 100 + index, title: `PR ${index}`, state: "OPEN", merged: false, url: `https://github.com/owner/repo/pull/${100 + index}`, headRefName: `feature/${index}`, baseRefName: "main", isDraft: false },
	}));
	const linkHarness = clientFor((call) => {
		assert.equal(call.json.operationName, "IssueMeListIssueDevelopmentLinks");
		return graphQLResponse({ repository: { issue: { id: "I_1", number: 1, title: "Parent", state: "OPEN", url: "https://github.com/owner/repo/issues/1", author: { login: "octocat" }, timelineItems: connectionPage(events, call.json.variables.first, call.json.variables.after) } } });
	});
	const linkPages = await traverse((after) => linkHarness.client.listIssueDevelopmentLinks(1, { limit: 2, after }));
	assert.deepEqual(linkPages.flatMap((page) => page.links.map((link) => link.number)), [100, 101, 102]);
	assert.equal(linkPages.at(-1).truncated, false);
	assert.equal(linkPages.at(-1).continuation.complete, true);
});

test("discovery tools expose continuation metadata, accept their own tokens, and refuse foreign or unsafe tokens", async () => {
	const labels = Array.from({ length: 5 }, (_, index) => githubLabel({ name: `ready-${index}` }));
	const recorder = createFetchRecorder((call) => (call.url.pathname.endsWith("/labels") ? restCollection("labels", labels)(call) : jsonResponse([])));
	const pi = createFakePi();
	registerListLabelsTool(pi, { runtime: runtimeOptions({ fetchFn: recorder.fetchFn }) });
	registerListMilestonesTool(pi, { runtime: runtimeOptions({ fetchFn: recorder.fetchFn }) });
	registerListSubIssuesTool(pi, { runtime: runtimeOptions() });
	const cwd = await tempProject();

	const first = await executeRegisteredTool(pi.tools, "issueme_list_labels", { query: "ready", limit: 2 }, { cwd });
	assert.equal(first.details.result, "success");
	assert.equal(first.details.truncated, true);
	assert.equal(first.details.continuation.collection, "labels");
	assert.equal(first.details.continuation.complete, false);
	assert.equal(first.details.continuation.resumed, false);
	assert.ok(first.details.continuation.nextToken);
	assert.match(first.content[0].text, /Continuation: more labels may exist; call again with the same filters and after: "/);
	assert.match(first.content[0].text, /not an atomic snapshot/);

	const second = await executeRegisteredTool(pi.tools, "issueme_list_labels", { query: "ready", limit: 10, after: first.details.continuation.nextToken }, { cwd });
	assert.deepEqual(second.details.labels.map((label) => label.name), ["ready-2", "ready-3", "ready-4"]);
	assert.equal(second.details.continuation.complete, true);
	assert.equal(second.details.continuation.resumed, true);
	assert.equal(second.details.continuation.nextToken, undefined);
	assert.match(second.content[0].text, /Continuation: labels collection exhausted after resuming\./);

	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_list_labels", { query: "other", limit: 2, after: first.details.continuation.nextToken }, { cwd }), rejectsContinuation("filter_mismatch"));
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_list_milestones", { after: first.details.continuation.nextToken }, { cwd }), rejectsContinuation("collection_mismatch"));
	await assert.rejects(() => executeRegisteredTool(pi.tools, "issueme_list_labels", { after: "https://api.github.com/repos/other/repo/labels" }, { cwd }), rejectsContinuation("malformed"));
	await assert.rejects(
		() => executeRegisteredTool(pi.tools, "issueme_list_sub_issues", { issueNumber: 1, refreshCache: true, after: first.details.continuation.nextToken }, { cwd }),
		(error) => error instanceof IssueMeError && error.code === ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT && /refreshCache/.test(error.message),
	);
	assert.ok(recorder.calls.every((call) => call.url.pathname.startsWith("/repos/owner/repo/")), "continuation never redirects requests outside the repository boundary");
});
