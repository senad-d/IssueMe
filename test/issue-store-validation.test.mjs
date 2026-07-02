import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { IssueMeError } from "../src/errors.ts";
import { githubIssueToRecord, isPullRequestIssue, issueRecordToToolSummary, formatIssueSummary, applyIssueRelationshipMetadata } from "../src/issues/format.ts";
import { findIssueByLookup, findIssueByNumber, issueFileDiagnosticReason, listIssueFileEntries, readIssueByLookup, readIssueFile, removeClosedIssueFiles, writeIssueRecord } from "../src/issues/store.ts";

const REPOSITORY = { owner: "owner", repo: "repo", fullName: "owner/repo" };
const OTHER_REPOSITORY = { owner: "other", repo: "repo", fullName: "other/repo" };
const CONFIG = { issueDirectory: "issues", allowedIssueCreator: "all", defaultLabels: [], defaultAssignees: [], defaultSkillPath: null };
const NOW = "2026-07-02T00:00:00Z";

function assertIssueMeError(error, code) {
	assert.ok(error instanceof IssueMeError);
	if (code) assert.equal(error.code, code);
	return true;
}

async function tempProject() {
	const projectRoot = await mkdtemp(join(tmpdir(), "issueme-store-validation-"));
	await mkdir(join(projectRoot, CONFIG.issueDirectory), { recursive: true });
	return projectRoot;
}

function record(number, title, overrides = {}) {
	return {
		schemaVersion: 1,
		repository: REPOSITORY.fullName,
		number,
		title,
		state: "open",
		creator: "octocat",
		body: `Body for ${title}`,
		labels: ["bug"],
		assignees: ["octocat"],
		milestone: null,
		comments: [],
		html_url: `https://github.com/${REPOSITORY.fullName}/issues/${number}`,
		created_at: NOW,
		updated_at: NOW,
		closed_at: null,
		synced_at: NOW,
		...overrides,
	};
}

function comment(id, issueNumber = 1, overrides = {}) {
	return {
		id,
		author: "octocat",
		body: `Comment ${id}`,
		created_at: NOW,
		updated_at: NOW,
		html_url: `https://github.com/${REPOSITORY.fullName}/issues/${issueNumber}#issuecomment-${id}`,
		...overrides,
	};
}

function relationship(number, overrides = {}) {
	return {
		number,
		title: `Related ${number}`,
		state: "open",
		creator: "octocat",
		html_url: `https://github.com/${REPOSITORY.fullName}/issues/${number}`,
		...overrides,
	};
}

function githubIssue(number, overrides = {}) {
	return {
		node_id: `I_${number}`,
		number,
		title: `Remote ${number}`,
		state: "open",
		body: `Remote body ${number}`,
		labels: [{ name: "bug" }, "docs", { notName: true }],
		assignees: [{ login: "octocat" }, { login: "hubot" }, {}],
		milestone: { title: "M1" },
		user: { login: "creator" },
		parent_issue: { number: 2, title: "Parent", state: "OPEN", url: `https://github.com/${REPOSITORY.fullName}/issues/2`, author: { login: "parent-author" } },
		sub_issues: { nodes: [{ number: 3, title: "Child", state: "CLOSED", url: `https://github.com/${REPOSITORY.fullName}/issues/3`, author: { login: "child-author" } }, { title: "invalid" }] },
		sub_issues_summary: { totalCount: 4 },
		html_url: `https://github.com/${REPOSITORY.fullName}/issues/${number}`,
		created_at: NOW,
		updated_at: NOW,
		closed_at: null,
		comments: 5,
		...overrides,
	};
}

async function writeRecordFile(projectRoot, fileName, value) {
	await writeFile(join(projectRoot, CONFIG.issueDirectory, fileName), `${JSON.stringify(value, null, 2)}\n`);
}

async function assertInvalidRecordReason(projectRoot, fileName, value, expectedReason) {
	await writeRecordFile(projectRoot, fileName, value);
	await assert.rejects(() => readIssueFile(join(projectRoot, CONFIG.issueDirectory, fileName), join(projectRoot, CONFIG.issueDirectory), projectRoot), (error) => {
		assertIssueMeError(error, "issue_file_invalid");
		assert.equal(error.safeDetails.reason, expectedReason);
		return true;
	});
}

test("issue store reads invalid JSON and invalid records with structured diagnostics while scanning valid files", async () => {
	const projectRoot = await tempProject();
	await writeRecordFile(projectRoot, "1-valid.json", record(1, "Valid"));
	await writeFile(join(projectRoot, CONFIG.issueDirectory, "2-broken.json"), "{not json");
	await writeRecordFile(projectRoot, "3-bad-state.json", record(3, "Bad State", { state: "draft" }));
	await writeRecordFile(projectRoot, "not-an-issue.json", record(4, "Bad Name", { number: 4, html_url: `https://github.com/${REPOSITORY.fullName}/issues/4` }));
	await mkdir(join(projectRoot, CONFIG.issueDirectory, "5-directory.json"));

	await assert.rejects(() => readIssueFile(join(projectRoot, CONFIG.issueDirectory, "2-broken.json"), join(projectRoot, CONFIG.issueDirectory), projectRoot), (error) => {
		assertIssueMeError(error, "issue_file_parse_failed");
		assert.equal(issueFileDiagnosticReason(error), "issue_file_parse_failed");
		return true;
	});
	assert.equal(issueFileDiagnosticReason(new Error("plain")), "issue_file_read_failed");

	const entries = await listIssueFileEntries(projectRoot, CONFIG);
	assert.deepEqual(entries.files.map((file) => `${file.number}:${file.title}`), ["1:Valid"]);
	assert.deepEqual(entries.invalidFiles.map((file) => `${file.fileName}:${file.reason}`), [
		"2-broken.json:issue_file_parse_failed",
		"3-bad-state.json:issue_file_state_invalid",
		"5-directory.json:issue_file_not_regular",
		"not-an-issue.json:issue_file_name_invalid",
	]);
});

test("issue record validation rejects unsafe schema, identity, comment, URL, timestamp, and relationship shapes", async () => {
	const projectRoot = await tempProject();
	const cases = [
		["1-schema.json", record(1, "Schema", { schemaVersion: 2 }), "issue_file_schema_version_invalid"],
		["2-repository.json", record(2, "Repository", { repository: "bad" }), "issue_file_repository_invalid"],
		["3-number.json", record(3, "Number", { number: 0 }), "issue_file_number_invalid"],
		["4-title.json", record(4, "Title", { title: "" }), "issue_file_title_invalid"],
		["5-labels.json", record(5, "Labels", { labels: [""] }), "issue_file_labels_invalid"],
		["6-assignees.json", record(6, "Assignees", { assignees: ["bad_login"] }), "issue_file_assignees_invalid"],
		["7-milestone.json", record(7, "Milestone", { milestone: "" }), "issue_file_milestone_invalid"],
		["8-timestamp.json", record(8, "Timestamp", { created_at: "yesterday" }), "issue_file_timestamp_invalid"],
		["9-url.json", record(9, "Url", { html_url: `https://github.com/${REPOSITORY.fullName}/issues/99` }), "issue_file_url_invalid"],
		["10-comment-url.json", record(10, "Comment Url", { comments: [comment(10, 99)] }), "issue_file_comment_url_invalid"],
		["11-comment-author.json", record(11, "Comment Author", { comments: [comment(11, 11, { author: "bad_login" })] }), "issue_file_comment_author_invalid"],
		["12-parent.json", record(12, "Parent", { parent_issue: { number: 1, title: "Parent", html_url: "not-a-url" } }), "issue_file_relationship_invalid"],
		["13-sub-count.json", record(13, "Sub Count", { sub_issues: [relationship(1)], sub_issues_count: 0 }), "issue_file_relationship_invalid"],
		["14-comments-count.json", record(14, "Comments Count", { comments: [comment(14, 14)], comments_count: 0 }), "issue_file_comments_metadata_invalid"],
	];
	for (const [fileName, value, reason] of cases) await assertInvalidRecordReason(projectRoot, fileName, value, reason);
});

test("issue lookup resolves numbers, filenames, slugs, titles, and ambiguous matches deterministically", async () => {
	const projectRoot = await tempProject();
	const alpha = record(1, "Alpha Target");
	const beta = record(2, "Beta Target");
	const alphaOther = record(3, "Alpha Other");
	await writeIssueRecord(projectRoot, CONFIG, alpha);
	await writeIssueRecord(projectRoot, CONFIG, beta);
	await writeIssueRecord(projectRoot, CONFIG, alphaOther);

	assert.equal((await findIssueByNumber(projectRoot, CONFIG, 1, REPOSITORY.fullName)).record.title, "Alpha Target");
	assert.equal((await readIssueByLookup(projectRoot, CONFIG, "#2")).title, "Beta Target");
	assert.equal((await findIssueByLookup(projectRoot, CONFIG, "1-alpha-target.json", REPOSITORY.fullName)).record.title, "Alpha Target");
	assert.equal((await findIssueByLookup(projectRoot, CONFIG, "beta-target", REPOSITORY.fullName)).record.title, "Beta Target");
	assert.equal(await findIssueByLookup(projectRoot, CONFIG, "missing", REPOSITORY.fullName), undefined);
	await assert.rejects(() => findIssueByLookup(projectRoot, CONFIG, "Alpha", REPOSITORY.fullName), (error) => assertIssueMeError(error, "issue_lookup_ambiguous"));

	const duplicateSeven = record(7, "Duplicate A");
	const duplicateSevenRenamed = record(7, "Duplicate B", { title: "Duplicate B", html_url: `https://github.com/${REPOSITORY.fullName}/issues/7` });
	await writeRecordFile(projectRoot, "7-duplicate-a.json", duplicateSeven);
	await writeRecordFile(projectRoot, "7-duplicate-b.json", duplicateSevenRenamed);
	await assert.rejects(() => findIssueByNumber(projectRoot, CONFIG, 7, REPOSITORY.fullName), (error) => {
		assertIssueMeError(error, "issue_lookup_ambiguous");
		assert.deepEqual(error.safeDetails.paths, ["issues/7-duplicate-a.json", "issues/7-duplicate-b.json"]);
		return true;
	});
});

test("issue store cleanup and writes preserve repository safety, stale files, and unchanged cache timestamps", async () => {
	const projectRoot = await tempProject();
	const openRecord = record(1, "Keep Open");
	const closedRecord = record(2, "Remove Closed", { state: "closed", closed_at: NOW });
	const staleRecord = record(4, "Remove Stale");
	const foreignClosed = record(3, "Foreign Closed", { repository: OTHER_REPOSITORY.fullName, state: "closed", closed_at: NOW, html_url: `https://github.com/${OTHER_REPOSITORY.fullName}/issues/3` });
	await writeRecordFile(projectRoot, "1-keep-open.json", openRecord);
	await writeRecordFile(projectRoot, "2-remove-closed.json", closedRecord);
	await writeRecordFile(projectRoot, "3-foreign-closed.json", foreignClosed);
	await writeRecordFile(projectRoot, "4-remove-stale.json", staleRecord);
	await writeFile(join(projectRoot, CONFIG.issueDirectory, "5-invalid.json"), "{broken");

	const removed = await removeClosedIssueFiles(projectRoot, CONFIG, new Set([1]), REPOSITORY.fullName);
	assert.deepEqual(removed.map((path) => path.split("/").at(-1)).sort(), ["2-remove-closed.json", "4-remove-stale.json"]);
	const remaining = await readdir(join(projectRoot, CONFIG.issueDirectory));
	assert.deepEqual(remaining.sort(), ["1-keep-open.json", "3-foreign-closed.json", "5-invalid.json"]);

	const createResult = await writeIssueRecord(projectRoot, CONFIG, record(6, "Write Target"));
	assert.equal(createResult.action, "created");
	const firstText = await readFile(createResult.path, "utf8");
	const unchanged = await writeIssueRecord(projectRoot, CONFIG, record(6, "Write Target", { synced_at: "2026-07-02T01:00:00Z" }));
	assert.equal(unchanged.action, "unchanged");
	assert.equal(await readFile(unchanged.path, "utf8"), firstText);
	const renamed = await writeIssueRecord(projectRoot, CONFIG, record(6, "Write Target Renamed"));
	assert.equal(renamed.action, "renamed");
	assert.deepEqual(renamed.removedPaths.map((path) => path.split("/").at(-1)), ["6-write-target.json"]);

	await writeRecordFile(projectRoot, "8-collision.json", record(8, "Collision", { repository: OTHER_REPOSITORY.fullName, html_url: `https://github.com/${OTHER_REPOSITORY.fullName}/issues/8` }));
	await assert.rejects(() => writeIssueRecord(projectRoot, CONFIG, record(8, "Collision")), (error) => assertIssueMeError(error, "issue_cache_repository_collision"));
});

test("issue format helpers normalize GitHub issue shapes, relationship metadata, and truncation-friendly output", () => {
	const remoteIssue = githubIssue(20);
	const comments = [
		{ id: 201, user: { login: "octocat" }, body: "A".repeat(80), created_at: NOW, updated_at: NOW, html_url: `https://github.com/${REPOSITORY.fullName}/issues/20#issuecomment-201` },
		{ id: 202, user: {}, body: "B".repeat(80), created_at: NOW, updated_at: NOW, html_url: `https://github.com/${REPOSITORY.fullName}/issues/20#issuecomment-202` },
	];
	const converted = githubIssueToRecord(REPOSITORY, remoteIssue, comments, NOW, { limit: 2, truncated: true, totalCount: 5 });
	assert.equal(converted.creator, "creator");
	assert.deepEqual(converted.labels, ["bug", "docs"]);
	assert.deepEqual(converted.assignees, ["octocat", "hubot"]);
	assert.equal(converted.milestone, "M1");
	assert.equal(converted.parent_issue.creator, "parent-author");
	assert.equal(converted.sub_issues[0].state, "closed");
	assert.equal(converted.sub_issues_count, 4);
	assert.equal(converted.comments[1].author, "unknown");
	assert.equal(converted.comments_truncated, true);
	assert.equal(converted.comments_count, 5);
	assert.equal(isPullRequestIssue({ pull_request: {} }), true);
	assert.equal(isPullRequestIssue({ pull_request: null }), false);

	const withRelationships = applyIssueRelationshipMetadata(converted, { parent_issue: null, sub_issues: [relationship(30)], sub_issues_count: 2 });
	const summary = issueRecordToToolSummary(withRelationships, "issues/20-remote-20.json");
	assert.equal(summary.localPath, "issues/20-remote-20.json");
	assert.equal(summary.parentIssue, null);
	assert.deepEqual(summary.subIssues.map((item) => item.number), [30]);
	assert.equal(summary.commentsTruncated, true);

	const formatted = formatIssueSummary({ ...withRelationships, body: "X".repeat(50), comments: [comment(201, 20, { body: "Y".repeat(50) }), comment(202, 20, { body: "Z".repeat(50) })] }, { maxBodyChars: 20, maxComments: 1, maxCommentChars: 20 });
	assert.equal(formatted.truncated, true);
	assert.match(formatted.text, /#20 Remote 20/);
	assert.match(formatted.text, /Creator: creator/);
	assert.match(formatted.text, /Parent issue: none/);
	assert.match(formatted.text, /Sub-issues: #30 Related 30 \(open\) \(1 shown of 2\)/);
	assert.match(formatted.text, /IssueMe output truncated/);
	assert.equal(formatted.truncation.body.maxChars, 20);
	assert.deepEqual(formatted.truncation.comments, { shown: 1, total: 2, max: 1 });
	assert.deepEqual(formatted.truncation.commentBodies, { affected: 1, maxChars: 20 });
	assert.deepEqual(formatted.truncation.cacheComments, { shown: 2, limit: 2, total: 5 });
});
