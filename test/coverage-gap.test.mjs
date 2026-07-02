import assert from "node:assert/strict";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { getIssueMeErrorRecoveryHint, getIssueMeErrorTaxonomy, GitHubApiError, IssueMeError } from "../src/errors.ts";
import { IssueMeConfigTui } from "../src/commands/config-tui.ts";
import { registerIssueMeCommand } from "../src/commands/issueme-command.ts";
import { GitHubClient } from "../src/github/client.ts";
import { mapGitHubGraphQLError } from "../src/github/graphql-errors.ts";
import { commentBelongsToIssue } from "../src/github/issues-client.ts";
import { connectionEndCursor, connectionHasNextPage, extractConnectionNodes } from "../src/github/projects-client.ts";
import { formatIssueSummary } from "../src/issues/format.ts";
import { registerListIssueDevelopmentLinksTool } from "../src/tools/development-links.ts";
import { registerAddSubIssueTool } from "../src/tools/sub-issue.ts";
import { stripLeadingAt } from "../src/utils/env.ts";
import { realpathIfExists } from "../src/utils/project-root.ts";
import { assertPathNotEqual } from "../src/utils/slug.ts";

const TOKEN = "ghp_coverage_gap_secret";
const REPOSITORY = { owner: "owner", repo: "repo", fullName: "owner/repo" };
const ISSUEME_CONFIG = {
	issueDirectory: "issues",
	allowedIssueCreator: "all",
	defaultLabels: [],
	defaultAssignees: [],
	defaultSkillPath: null,
};

async function tempProject() {
	return mkdtemp(join(tmpdir(), "issueme-coverage-gap-"));
}

function jsonResponse(body, init = {}) {
	return new Response(JSON.stringify(body), {
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		headers: { "content-type": "application/json", ...(init.headers ?? {}) },
	});
}

function restIssue(number, overrides = {}) {
	return {
		node_id: `I_${number}`,
		number,
		title: `Issue ${number}`,
		state: "open",
		body: "Body",
		labels: [],
		assignees: [],
		milestone: null,
		html_url: `https://github.com/${REPOSITORY.fullName}/issues/${number}`,
		created_at: "2026-07-02T00:00:00Z",
		updated_at: "2026-07-02T00:00:00Z",
		closed_at: null,
		comments: 0,
		user: { login: "octocat" },
		...overrides,
	};
}

function issueNode(number, overrides = {}) {
	return {
		id: `I_${number}`,
		number,
		title: `Issue ${number}`,
		state: "OPEN",
		url: `https://github.com/${REPOSITORY.fullName}/issues/${number}`,
		author: { login: "octocat" },
		...overrides,
	};
}

function subIssueRelationship(childNumbers) {
	return {
		repository: {
			issue: {
				...issueNode(10),
				parent: null,
				subIssues: {
					totalCount: childNumbers.length,
					nodes: childNumbers.map((number) => issueNode(number)),
					pageInfo: { hasNextPage: false },
				},
			},
		},
	};
}

function createReorderFetch(calls) {
	let relationshipReads = 0;
	return async function reorderFetch(input, init = {}) {
		const url = new URL(input.toString());
		const body = init.body === undefined ? undefined : JSON.parse(init.body);
		calls.push({ method: init.method, path: url.pathname, body });
		if (url.pathname === "/repos/owner/repo/issues/10" && init.method === "GET") return jsonResponse(restIssue(10));
		if (url.pathname !== "/graphql" || init.method !== "POST") throw new Error(`Unexpected request ${init.method} ${url.pathname}`);
		if (body.operationName === "IssueMeListSubIssues") {
			relationshipReads += 1;
			const children = relationshipReads === 1 ? [11, 12, 13] : [12, 11, 13];
			return jsonResponse({ data: subIssueRelationship(children) });
		}
		if (body.operationName === "IssueMeReprioritizeSubIssue") {
			return jsonResponse({ data: { reprioritizeSubIssue: { issue: issueNode(10) } } });
		}
		throw new Error(`Unexpected GraphQL operation ${body.operationName}`);
	};
}

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

function fakeCommandPi() {
	const messages = [];
	return {
		messages,
		command: undefined,
		registerCommand(_name, command) { this.command = command; },
		sendMessage(message) { messages.push(message); },
	};
}

function createDevelopmentLinksClient(link) {
	return {
		repository: REPOSITORY,
		async listIssueDevelopmentLinks() {
			return {
				issue: {
					id: "I_42",
					number: 42,
					title: "Feature issue",
					state: "open",
					html_url: `https://github.com/${REPOSITORY.fullName}/issues/42`,
				},
				links: [link],
				timelineEventCount: 1,
				truncated: false,
			};
		},
	};
}

function sampleIssueRecord(overrides = {}) {
	return {
		schemaVersion: 1,
		repository: REPOSITORY.fullName,
		number: 5,
		title: "Parent issue",
		state: "open",
		body: "Body",
		labels: [],
		assignees: [],
		milestone: null,
		comments: [],
		html_url: `https://github.com/${REPOSITORY.fullName}/issues/5`,
		created_at: "2026-07-02T00:00:00Z",
		updated_at: "2026-07-02T00:00:00Z",
		closed_at: null,
		synced_at: "2026-07-02T00:00:01Z",
		...overrides,
	};
}

test("GitHubClient public reorderSubIssues fetches, reprioritizes, and refreshes relationships", async () => {
	const calls = [];
	const client = new GitHubClient({ repository: REPOSITORY, token: TOKEN, fetchFn: createReorderFetch(calls) });

	const result = await client.reorderSubIssues(10, [12, 11, 13]);

	assert.deepEqual(result.relationship.subIssues.map((issue) => issue.number), [12, 11, 13]);
	assert.equal(result.mutations.length, 1);
	assert.equal(result.mutations[0].child.number, 12);
	const operations = calls.filter((call) => call.path === "/graphql").map((call) => call.body.operationName);
	assert.deepEqual(operations, ["IssueMeListSubIssues", "IssueMeReprioritizeSubIssue", "IssueMeListSubIssues"]);
	const mutation = calls.find((call) => call.body?.operationName === "IssueMeReprioritizeSubIssue");
	assert.deepEqual(mutation.body.variables, { issueId: "I_10", subIssueId: "I_12", beforeId: "I_11" });
	assert.doesNotMatch(JSON.stringify(calls), new RegExp(TOKEN));
});

test("GraphQL mapper handles forbidden status for sub-issue, project, and development-link operations", () => {
	const subIssue = mapGitHubGraphQLError({ operationName: "IssueMeListSubIssues", detail: "blocked", status: 403 });
	const project = mapGitHubGraphQLError({ operationName: "IssueMeUpdateProjectV2ItemFieldValue", detail: "blocked", status: 403 });
	const development = mapGitHubGraphQLError({ operationName: "IssueMeListIssueDevelopmentLinks", detail: "blocked", status: 403 });
	const unknown = mapGitHubGraphQLError({ operationName: "OtherOperation", detail: "blocked", status: 403 });

	assert.ok(subIssue instanceof GitHubApiError);
	assert.equal(subIssue.code, "github_sub_issue_forbidden");
	assert.match(subIssue.message, /ListSubIssues was forbidden/);
	assert.ok(project instanceof GitHubApiError);
	assert.equal(project.code, "github_projects_v2_forbidden");
	assert.match(project.message, /project item management/);
	assert.ok(development instanceof GitHubApiError);
	assert.equal(development.code, "github_development_links_forbidden");
	assert.equal(unknown, undefined);
});

test("issue comments can be matched by HTML URL when the API issue URL is absent", () => {
	const repository = { owner: "Owner", repo: "Repo", fullName: "Owner/Repo" };
	const comment = {
		id: 777,
		body: "Body",
		user: { login: "octocat" },
		created_at: "2026-07-02T00:00:00Z",
		updated_at: "2026-07-02T00:00:00Z",
		html_url: "https://github.com/owner/repo/issues/42#issuecomment-777",
	};

	assert.equal(commentBelongsToIssue(repository, comment, 42, 777), true);
	assert.equal(commentBelongsToIssue(repository, { ...comment, html_url: "https://github.com/owner/repo/issues/43#issuecomment-777" }, 42, 777), false);
	assert.equal(commentBelongsToIssue(repository, { ...comment, html_url: "https://github.com/owner/repo/pull/42#issuecomment-777" }, 42, 777), false);
});

test("issue summaries render sub-issue totals when child details are not cached", () => {
	const summary = formatIssueSummary(sampleIssueRecord({ sub_issues_count: 3 }));

	assert.equal(summary.truncated, false);
	assert.match(summary.text, /Sub-issues: 3 total/);
});

test("config TUI accepts shifted Kitty printable input while searching", async () => {
	const renders = [];
	const theme = { fg(_role, text) { return text; }, bold(text) { return text; } };
	const tui = new IssueMeConfigTui(await tempProject(), ISSUEME_CONFIG, theme, () => {}, () => renders.push("render"), { searchActive: true });

	tui.handleInput("\u001b[97:65;2u");

	assert.ok(renders.length > 0);
	assert.match(tui.render(80).join("\n"), /A/);
});

test("development-link tool formats generic unknown references from injected clients", async () => {
	const pi = fakePi();
	const genericLink = { type: "unknown", referenceTypes: [], title: "Manual development reference" };
	registerListIssueDevelopmentLinksTool(pi, {
		runtime: { config: ISSUEME_CONFIG, repository: REPOSITORY.fullName, client: createDevelopmentLinksClient(genericLink) },
	});

	const result = await pi.tools.get("issueme_list_issue_development_links").execute("call", { issueNumber: 42 }, undefined, undefined, {
		cwd: await tempProject(),
		isProjectTrusted: () => true,
	});

	assert.equal(result.details.result, "success");
	assert.equal(result.details.developmentLinks[0].type, "unknown");
	assert.match(result.content[0].text, /Development reference \(reference\); Manual development reference/);
});

test("small exported utility edges are covered directly", async () => {
	const projectRoot = await tempProject();
	const existing = join(projectRoot, "existing.txt");
	await writeFile(existing, "ok", "utf8");

	assert.equal(stripLeadingAt("@skills/issue/SKILL.md"), "skills/issue/SKILL.md");
	assert.equal(stripLeadingAt("skills/issue/SKILL.md"), "skills/issue/SKILL.md");
	assert.equal(await realpathIfExists(join(projectRoot, "missing.txt")), undefined);
	assert.equal(await realpathIfExists(existing), await realpath(existing));
	assert.doesNotThrow(() => assertPathNotEqual(projectRoot, existing, "must not match"));
	assert.throws(() => assertPathNotEqual(projectRoot, projectRoot, "must not match"), (error) => {
		assert.ok(error instanceof IssueMeError);
		assert.equal(error.code, "unsafe_path");
		assert.equal(error.message, "must not match");
		return true;
	});
});

test("unknown error codes infer stable recovery categories", () => {
	assert.equal(getIssueMeErrorTaxonomy("partial_success_after_write").category, "partial_success");
	assert.equal(getIssueMeErrorTaxonomy("closed_issue_external").category, "closed_issue");
	assert.equal(getIssueMeErrorTaxonomy("project_untrusted_custom").category, "trust");
	assert.equal(getIssueMeErrorTaxonomy("token_missing_custom").category, "auth");
	assert.equal(getIssueMeErrorTaxonomy("config_custom").category, "config");
	assert.equal(getIssueMeErrorTaxonomy("repository_custom").category, "repository");
	assert.equal(getIssueMeErrorTaxonomy("github_custom").category, "github_api");
	assert.equal(getIssueMeErrorTaxonomy("issue_cache_custom").category, "local_cache");
	assert.equal(getIssueMeErrorTaxonomy("invalid_custom").category, "validation");
	assert.equal(getIssueMeErrorTaxonomy("surprising_custom").category, "runtime");
	assert.match(getIssueMeErrorRecoveryHint("token_missing_custom"), /GH_TOKEN|GITHUB_TOKEN/);
});
