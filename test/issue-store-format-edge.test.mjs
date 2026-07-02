import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";

import { IssueMeError } from "../src/errors.ts";
import {
	applyIssueRelationshipMetadata,
	formatIssueSummary,
	githubIssueToRecord,
	issueRecordToToolSummary,
	truncateText,
} from "../src/issues/format.ts";
import {
	findIssueByLookup,
	findIssueByNumber,
	listIssueFileEntries,
	listIssueFiles,
	readIssueByLookup,
	readIssueByNumber,
	readIssueFile,
	relativeIssuePath,
	removeIssueByNumber,
	writeIssueRecord,
} from "../src/issues/store.ts";
import {
	githubComment,
	githubIssue,
	issueMeConfig,
	localIssueRecord,
	TEST_NOW,
	TEST_REPOSITORY,
	TEST_REPOSITORY_OBJECT,
	TEST_SYNCED_AT,
} from "./helpers/issueme-test-helpers.mjs";

const CONFIG = issueMeConfig();
const OTHER_REPOSITORY = "other/repo";

async function tempIssueProject(prefix = "issueme-store-format-edge-") {
	const projectRoot = await mkdtemp(join(tmpdir(), prefix));
	await mkdir(join(projectRoot, CONFIG.issueDirectory), { recursive: true });
	return projectRoot;
}

async function tempProject(prefix = "issueme-store-format-edge-") {
	return mkdtemp(join(tmpdir(), prefix));
}

function record(overrides = {}) {
	return localIssueRecord({ body: "Issue body", labels: ["bug"], assignees: ["octocat"], ...overrides });
}

function otherRepositoryRecord(number, title, overrides = {}) {
	return record({
		number,
		title,
		repository: OTHER_REPOSITORY,
		html_url: `https://github.com/${OTHER_REPOSITORY}/issues/${number}`,
		...overrides,
	});
}

function commentRecord(id, issueNumber, overrides = {}) {
	return {
		id,
		author: "octocat",
		body: `Comment ${id}`,
		created_at: TEST_NOW,
		updated_at: TEST_NOW,
		html_url: `https://github.com/${TEST_REPOSITORY}/issues/${issueNumber}#issuecomment-${id}`,
		...overrides,
	};
}

function relationship(number, overrides = {}) {
	return {
		number,
		title: `Related ${number}`,
		state: "open",
		creator: "octocat",
		html_url: `https://github.com/${TEST_REPOSITORY}/issues/${number}`,
		...overrides,
	};
}

async function writeRawIssueFile(projectRoot, fileName, value, config = CONFIG) {
	const issueDirectory = join(projectRoot, config.issueDirectory);
	await mkdir(issueDirectory, { recursive: true });
	await writeFile(join(issueDirectory, fileName), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function captureAsyncError(action) {
	try {
		await action();
	} catch (error) {
		return error;
	}
	assert.fail("Expected action to throw.");
}

function captureSyncError(action) {
	try {
		action();
	} catch (error) {
		return error;
	}
	assert.fail("Expected action to throw.");
}

function assertIssueMeError(error, code) {
	assert.ok(error instanceof IssueMeError);
	assert.equal(error.code, code);
	return error;
}

test("issue cache writes stay project-bound and report create, update, rename, unchanged, and remove outcomes", async () => {
	const projectRoot = await tempProject();
	const nestedConfig = issueMeConfig({ issueDirectory: "cache/nested/issues" });
	const baseRecord = record({ number: 11, title: "Nested Create" });

	const created = await writeIssueRecord(projectRoot, nestedConfig, baseRecord);
	assert.equal(created.action, "created");
	assert.equal(basename(created.path), "11-nested-create.json");

	const updated = await writeIssueRecord(projectRoot, nestedConfig, { ...baseRecord, body: "Changed body" });
	assert.equal(updated.action, "updated");
	assert.equal(basename(updated.path), "11-nested-create.json");

	const unchanged = await writeIssueRecord(projectRoot, nestedConfig, { ...baseRecord, body: "Changed body", synced_at: "2026-07-02T01:00:00Z" });
	assert.equal(unchanged.action, "unchanged");
	const unchangedText = await readFile(unchanged.path, "utf8");
	assert.match(unchangedText, /2026-06-27T00:00:01Z/);

	const renamed = await writeIssueRecord(projectRoot, nestedConfig, { ...baseRecord, title: "Nested Create Renamed", body: "Changed body" });
	assert.equal(renamed.action, "renamed");
	assert.deepEqual(renamed.removedPaths.map((path) => basename(path)), ["11-nested-create.json"]);
	assert.equal(basename(renamed.path), "11-nested-create-renamed.json");

	const removed = await writeIssueRecord(projectRoot, nestedConfig, {
		...baseRecord,
		title: "Nested Create Renamed",
		state: "closed",
		closed_at: TEST_NOW,
	});
	assert.equal(removed.action, "removed");
	assert.deepEqual(removed.removedPaths.map((path) => basename(path)), ["11-nested-create-renamed.json"]);
	assert.deepEqual(await listIssueFiles(projectRoot, nestedConfig), []);

	const aborted = new AbortController();
	aborted.abort();
	const abortError = await captureAsyncError(() => writeIssueRecord(projectRoot, nestedConfig, record({ number: 12, title: "Aborted" }), aborted.signal));
	assertIssueMeError(abortError, "github_request_aborted");

	const unsafeConfig = issueMeConfig({ issueDirectory: "../outside" });
	const unsafeError = await captureAsyncError(() => writeIssueRecord(projectRoot, unsafeConfig, record({ number: 13, title: "Unsafe" })));
	assertIssueMeError(unsafeError, "unsafe_issue_directory");
});

test("writeIssueRecord refuses malformed existing targets and cross-repository collisions before overwriting", async () => {
	const projectRoot = await tempIssueProject();
	await writeFile(join(projectRoot, CONFIG.issueDirectory, "21-broken-target.json"), "{not json", "utf8");

	const parseError = await captureAsyncError(() => writeIssueRecord(projectRoot, CONFIG, record({ number: 21, title: "Broken Target" })));
	assertIssueMeError(parseError, "issue_file_parse_failed");
	assert.equal(await readFile(join(projectRoot, CONFIG.issueDirectory, "21-broken-target.json"), "utf8"), "{not json");

	await writeRawIssueFile(projectRoot, "22-collision.json", otherRepositoryRecord(22, "Collision"));
	const collisionError = await captureAsyncError(() => writeIssueRecord(projectRoot, CONFIG, record({ number: 22, title: "Collision" })));
	assertIssueMeError(collisionError, "issue_cache_repository_collision");
	assert.equal(collisionError.safeDetails.existingRepository, OTHER_REPOSITORY);
});

test("issue cache listing and lookup handle missing directories, invalid files, duplicates, repository filters, and unsafe paths", async () => {
	const emptyProjectRoot = await tempProject();
	assert.deepEqual(await listIssueFileEntries(emptyProjectRoot, CONFIG), { files: [], invalidFiles: [] });

	const projectRoot = await tempIssueProject();
	await writeRawIssueFile(projectRoot, "2-beta.json", record({ number: 2, title: "Beta" }));
	await writeRawIssueFile(projectRoot, "1-alpha.json", record({ number: 1, title: "Alpha" }));
	await writeRawIssueFile(projectRoot, "1-alpha-other.json", otherRepositoryRecord(1, "Alpha Other"));
	await writeRawIssueFile(projectRoot, "3-mismatch.json", record({ number: 99, title: "Mismatch", html_url: `https://github.com/${TEST_REPOSITORY}/issues/99` }));
	await writeRawIssueFile(projectRoot, "4-bad-schema.json", record({ number: 4, title: "Bad Schema", schemaVersion: 2 }));
	await writeFile(join(projectRoot, CONFIG.issueDirectory, "not-an-issue.json"), "{}\n", "utf8");
	await writeFile(join(projectRoot, CONFIG.issueDirectory, "notes.txt"), "ignored\n", "utf8");
	await mkdir(join(projectRoot, CONFIG.issueDirectory, "5-directory.json"));

	const entries = await listIssueFileEntries(projectRoot, CONFIG);
	assert.deepEqual(entries.files.map((file) => `${file.repository}#${file.number}:${file.title}`), [
		"other/repo#1:Alpha Other",
		"owner/repo#1:Alpha",
		"owner/repo#2:Beta",
	]);
	assert.deepEqual(entries.invalidFiles.map((file) => `${file.fileName}:${file.reason}`), [
		"3-mismatch.json:issue_file_number_mismatch",
		"4-bad-schema.json:issue_file_schema_version_invalid",
		"5-directory.json:issue_file_not_regular",
		"not-an-issue.json:issue_file_name_invalid",
	]);

	const ownerFiles = await listIssueFiles(projectRoot, CONFIG, { repository: TEST_REPOSITORY });
	assert.deepEqual(ownerFiles.map((file) => file.number), [1, 2]);
	assert.equal((await readIssueByNumber(projectRoot, CONFIG, 2, TEST_REPOSITORY)).title, "Beta");
	assert.equal((await readIssueByLookup(projectRoot, CONFIG, "2-beta.json")).title, "Beta");
	assert.equal((await findIssueByLookup(projectRoot, CONFIG, "#2", TEST_REPOSITORY)).record.title, "Beta");
	assert.equal(await findIssueByLookup(projectRoot, CONFIG, "   ", TEST_REPOSITORY), undefined);
	assert.equal(await findIssueByNumber(projectRoot, CONFIG, 404, TEST_REPOSITORY), undefined);

	const unsafeLookupError = await captureAsyncError(() => findIssueByLookup(projectRoot, CONFIG, "../outside.json", TEST_REPOSITORY));
	assertIssueMeError(unsafeLookupError, "unsafe_path");

	const ambiguousReadError = await captureAsyncError(() => readIssueByNumber(projectRoot, CONFIG, 1));
	assertIssueMeError(ambiguousReadError, "issue_lookup_ambiguous");
	const ambiguousRemoveError = await captureAsyncError(() => removeIssueByNumber(projectRoot, CONFIG, 1));
	assertIssueMeError(ambiguousRemoveError, "issue_lookup_ambiguous");
	const removed = await removeIssueByNumber(projectRoot, CONFIG, 1, OTHER_REPOSITORY);
	assert.deepEqual(removed.map((path) => basename(path)), ["1-alpha-other.json"]);

	assert.equal(relativeIssuePath(projectRoot, undefined), undefined);
	assert.equal(relativeIssuePath(projectRoot, join(projectRoot, CONFIG.issueDirectory, "2-beta.json")), "issues/2-beta.json");
});

test("issue file validation rejects non-string comment URLs with structured diagnostics", async () => {
	const projectRoot = await tempIssueProject();
	await writeRawIssueFile(projectRoot, "31-bad-comment-url.json", record({
		number: 31,
		title: "Bad Comment Url",
		comments: [commentRecord(3100, 31, { html_url: 3100 })],
	}));

	const error = await captureAsyncError(() => readIssueFile(join(projectRoot, CONFIG.issueDirectory, "31-bad-comment-url.json"), join(projectRoot, CONFIG.issueDirectory), projectRoot));
	assertIssueMeError(error, "issue_file_invalid");
	assert.equal(error.safeDetails.reason, "issue_file_comment_url_invalid");
	assert.equal(error.safeDetails.field, "comments[0].html_url");
});

test("issue listing propagates unreadable directory errors when permissions make that portable", async (t) => {
	if (process.platform === "win32") {
		t.skip("POSIX chmod-based unreadable directory checks are not portable on Windows.");
		return;
	}

	const projectRoot = await tempIssueProject();
	const issueDirectory = join(projectRoot, CONFIG.issueDirectory);
	await chmod(issueDirectory, 0o000);
	try {
		let chmodDeniedReads = false;
		try {
			await readdir(issueDirectory);
		} catch {
			chmodDeniedReads = true;
		}
		if (!chmodDeniedReads) {
			t.skip("Current filesystem permissions still allow reading chmod 000 directories.");
			return;
		}

		const error = await captureAsyncError(() => listIssueFileEntries(projectRoot, CONFIG));
		assert.ok(error && typeof error === "object");
		assert.match(error.code, /EACCES|EPERM/);
	} finally {
		await chmod(issueDirectory, 0o700);
	}
});

test("githubIssueToRecord normalizes optional edge shapes and summaries without leaking invalid relationship state", () => {
	const remoteIssue = {
		...githubIssue({ number: 41, title: "Formatter Edge" }),
		body: null,
		labels: ["bug", { name: "docs" }, 42, { name: "" }],
		assignees: [{ login: "octocat" }, "not-a-user", { login: "hubot" }, {}],
		milestone: { title: 42 },
		user: { login: "bad_login" },
		parent: {
			number: 40,
			title: "Parent Without State",
			state: "MERGED",
			html_url: `https://github.com/${TEST_REPOSITORY}/issues/40`,
			user: { login: "bad_login" },
		},
		sub_issues: [
			{ number: 42, title: "Child A", state: "open", html_url: `https://github.com/${TEST_REPOSITORY}/issues/42`, user: { login: "child-a" } },
			{ number: 43, title: "Child B", state: "UNKNOWN", html_url: `https://github.com/${TEST_REPOSITORY}/issues/43` },
			{ title: "Invalid child" },
		],
		sub_issues_summary: { total: 2 },
		comments: "not-a-count",
	};
	const comments = [githubComment({ id: 4100, issueNumber: 41, user: null, body: null })];

	const converted = githubIssueToRecord(TEST_REPOSITORY_OBJECT, remoteIssue, comments, TEST_NOW, { totalCount: 0 });
	assert.equal(converted.body, "");
	assert.deepEqual(converted.labels, ["bug", "docs"]);
	assert.deepEqual(converted.assignees, ["octocat", "hubot"]);
	assert.equal(converted.milestone, null);
	assert.equal(converted.creator, undefined);
	assert.deepEqual(converted.parent_issue, {
		number: 40,
		title: "Parent Without State",
		html_url: `https://github.com/${TEST_REPOSITORY}/issues/40`,
	});
	assert.deepEqual(converted.sub_issues.map((issue) => issue.state), ["open", undefined]);
	assert.equal(converted.sub_issues_count, 2);
	assert.equal(converted.comments[0].author, "unknown");
	assert.equal(converted.comments[0].body, "");
	assert.equal(converted.comments_count, 1);

	const summary = issueRecordToToolSummary(converted);
	assert.equal(Object.hasOwn(summary, "localPath"), false);
	assert.equal(Object.hasOwn(summary, "creator"), false);

	const formatted = formatIssueSummary(converted, { maxBodyChars: 200, maxComments: 5, maxCommentChars: 200 });
	assert.equal(formatted.truncated, false);
	assert.match(formatted.text, /Parent issue: #40 Parent Without State/);
	assert.match(formatted.text, /Sub-issues: #42 Child A \(open\), #43 Child B/);
	assert.doesNotMatch(formatted.text, /shown of/);
});

test("formatter helpers apply relationship metadata, truncate defensively, and reject malformed required GitHub fields", () => {
	const baseRecord = record({ number: 51, title: "Relationships", comments: [commentRecord(5100, 51)] });
	const updated = applyIssueRelationshipMetadata(baseRecord, { sub_issues: [relationship(52)], sub_issues_count: 1 });
	const formatted = formatIssueSummary(updated, { maxBodyChars: 5, maxComments: 0, maxCommentChars: 5 });
	assert.equal(formatted.truncated, true);
	assert.match(formatted.text, /Sub-issues: #52 Related 52 \(open\)/);
	assert.deepEqual(formatted.truncation.comments, { shown: 0, total: 1, max: 0 });
	assert.deepEqual(truncateText("short", 20), { text: "short", truncated: false });
	assert.deepEqual(truncateText("0123456789", 3), { text: "\n… [truncated]", truncated: true });

	const invalidNumberError = captureSyncError(() => githubIssueToRecord(TEST_REPOSITORY_OBJECT, { ...githubIssue({ number: 61 }), number: "61" }, [], TEST_SYNCED_AT));
	assertIssueMeError(invalidNumberError, "github_issue_shape_invalid");
	assert.match(invalidNumberError.message, /issue\.number/);

	const invalidTitleError = captureSyncError(() => githubIssueToRecord(TEST_REPOSITORY_OBJECT, { ...githubIssue({ number: 62 }), title: null }, [], TEST_SYNCED_AT));
	assertIssueMeError(invalidTitleError, "github_issue_shape_invalid");
	assert.match(invalidTitleError.message, /issue\.title/);

	const invalidStateError = captureSyncError(() => githubIssueToRecord(TEST_REPOSITORY_OBJECT, { ...githubIssue({ number: 63 }), state: "draft" }, [], TEST_SYNCED_AT));
	assertIssueMeError(invalidStateError, "github_issue_shape_invalid");
	assert.match(invalidStateError.message, /unsupported issue state/);
});
