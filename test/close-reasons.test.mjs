import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

import { issueResponseToSafeSummary } from "../src/github/issues-client.ts";
import { formatIssueStateWithReason, formatIssueSummary, githubIssueToRecord, issueRecordToToolSummary, normalizeIssueStateReason } from "../src/issues/format.ts";
import { listIssueFileEntries, readIssueFile, writeIssueRecord } from "../src/issues/store.ts";
import { registerCloseIssueTool } from "../src/tools/close-issue.ts";
import { registerGetIssueTool } from "../src/tools/get-issue.ts";
import { registerListIssuesTool } from "../src/tools/list-issues.ts";
import { registerReopenIssueTool } from "../src/tools/reopen-issue.ts";
import {
	createFakePi,
	createFetchRecorder,
	executeRegisteredTool,
	githubIssue,
	issueMeConfig,
	jsonResponse,
	localIssueRecord,
	runtimeOptions,
	tempProject,
	TEST_REPOSITORY,
	TEST_REPOSITORY_OBJECT,
} from "./helpers/issueme-test-helpers.mjs";

const CONFIG = issueMeConfig();
const CLOSED_AT = "2026-10-01T00:00:00Z";

function closedIssue(number, stateReason, overrides = {}) {
	return githubIssue({ number, title: `Closed ${number}`, state: "closed", closed_at: CLOSED_AT, state_reason: stateReason, ...overrides });
}

async function tools(handler, register) {
	const recorder = createFetchRecorder(handler);
	const pi = createFakePi();
	register(pi, { runtime: runtimeOptions({ fetchFn: recorder.fetchFn }) });
	return { pi, recorder, cwd: await tempProject() };
}

test("close reasons normalize documented values, keep null, and never invent a reason for unknown or missing values", () => {
	assert.equal(normalizeIssueStateReason("completed"), "completed");
	assert.equal(normalizeIssueStateReason("not_planned"), "not_planned");
	assert.equal(normalizeIssueStateReason("duplicate"), "duplicate");
	assert.equal(normalizeIssueStateReason("reopened"), "reopened");
	assert.equal(normalizeIssueStateReason(null), null);
	assert.equal(normalizeIssueStateReason(undefined), undefined);
	assert.equal(normalizeIssueStateReason("wontfix"), undefined);
	assert.equal(normalizeIssueStateReason({ reason: "completed" }), undefined);

	const completed = githubIssueToRecord(TEST_REPOSITORY_OBJECT, closedIssue(1, "completed"), []);
	assert.equal(completed.state_reason, "completed");
	assert.equal(issueRecordToToolSummary(completed).stateReason, "completed");
	assert.match(formatIssueSummary(completed).text, /^State: closed \(completed\)$/m);

	const notPlanned = githubIssueToRecord(TEST_REPOSITORY_OBJECT, closedIssue(2, "not_planned"), []);
	assert.equal(notPlanned.state_reason, "not_planned");
	assert.match(formatIssueSummary(notPlanned).text, /^State: closed \(not_planned\)$/m);

	const nullReason = githubIssueToRecord(TEST_REPOSITORY_OBJECT, closedIssue(3, null), []);
	assert.equal(nullReason.state_reason, null);
	assert.equal(issueRecordToToolSummary(nullReason).stateReason, null);
	assert.match(formatIssueSummary(nullReason).text, /^State: closed$/m, "a null reason adds no suffix");
	assert.equal(formatIssueStateWithReason({ state: "open", state_reason: null }), "open");

	const unknownReason = githubIssueToRecord(TEST_REPOSITORY_OBJECT, closedIssue(4, "wontfix"), []);
	assert.equal(Object.hasOwn(unknownReason, "state_reason"), false);
	assert.equal(Object.hasOwn(issueRecordToToolSummary(unknownReason), "stateReason"), false);
	assert.match(formatIssueSummary(unknownReason).text, /^State: closed$/m);

	const withoutReason = closedIssue(5, "completed");
	delete withoutReason.state_reason;
	const absentReason = githubIssueToRecord(TEST_REPOSITORY_OBJECT, withoutReason, []);
	assert.equal(Object.hasOwn(absentReason, "state_reason"), false);
	assert.equal(formatIssueStateWithReason(absentReason), "closed");

	const reopened = githubIssueToRecord(TEST_REPOSITORY_OBJECT, githubIssue({ number: 6, state_reason: "reopened" }), []);
	assert.equal(reopened.state_reason, "reopened");
	assert.match(formatIssueSummary(reopened).text, /^State: open \(reopened\)$/m);

	const safe = issueResponseToSafeSummary(TEST_REPOSITORY, closedIssue(7, "duplicate"), 7);
	assert.equal(safe.stateReason, "duplicate");
	assert.equal(Object.hasOwn(issueResponseToSafeSummary(TEST_REPOSITORY, closedIssue(8, "mystery"), 8), "stateReason"), false);
});

test("issue cache persists state_reason, accepts legacy files without it, and rejects unfamiliar values", async () => {
	const projectRoot = await tempProject();
	const reopened = await writeIssueRecord(projectRoot, CONFIG, localIssueRecord({ number: 1, title: "Reopened", state_reason: "reopened" }));
	const persisted = await readIssueFile(reopened.path);
	assert.equal(persisted.state_reason, "reopened");
	assert.deepEqual(Object.keys(persisted).slice(0, 6), ["schemaVersion", "repository", "number", "title", "state", "state_reason"]);

	const nullReason = await writeIssueRecord(projectRoot, CONFIG, localIssueRecord({ number: 2, title: "Null Reason", state_reason: null }));
	assert.equal((await readIssueFile(nullReason.path)).state_reason, null);

	const legacy = localIssueRecord({ number: 3, title: "Legacy" });
	assert.equal(Object.hasOwn(legacy, "state_reason"), false);
	const legacyWrite = await writeIssueRecord(projectRoot, CONFIG, legacy);
	const legacyRead = await readIssueFile(legacyWrite.path);
	assert.equal(Object.hasOwn(legacyRead, "state_reason"), false);

	const invalidPath = join(dirname(legacyWrite.path), "4-invalid.json");
	await writeFile(invalidPath, JSON.stringify(localIssueRecord({ number: 4, title: "Invalid", state_reason: "wontfix" })), "utf8");
	await assert.rejects(() => readIssueFile(invalidPath), (error) => /state_reason/.test(error.message) || error.safeDetails?.reason === "issue_file_state_reason_invalid");
	const entries = await listIssueFileEntries(projectRoot, CONFIG);
	assert.deepEqual(entries.files.map((file) => file.number), [1, 2, 3]);
	assert.deepEqual(entries.invalidFiles.map((file) => `${file.fileName}:${file.reason}`), ["4-invalid.json:issue_file_state_reason_invalid"]);
});

test("issueme_list_issues and issueme_get_issue refresh expose close reasons in text and bounded details", async () => {
	const listed = await tools((call) => {
		assert.equal(call.url.pathname, "/repos/owner/repo/issues");
		return jsonResponse([closedIssue(10, "completed"), closedIssue(11, "not_planned"), closedIssue(12, null), closedIssue(13, "mystery")]);
	}, registerListIssuesTool);
	const list = await executeRegisteredTool(listed.pi.tools, "issueme_list_issues", { state: "closed" }, { cwd: listed.cwd });
	assert.match(list.content[0].text, /#10 \[closed: completed\] Closed 10/);
	assert.match(list.content[0].text, /#11 \[closed: not_planned\] Closed 11/);
	assert.match(list.content[0].text, /#12 \[closed\] Closed 12/);
	assert.match(list.content[0].text, /#13 \[closed\] Closed 13/);
	assert.deepEqual(list.details.issues.map((issue) => issue.stateReason), ["completed", "not_planned", null, undefined]);

	const fetched = await tools((call) => {
		if (call.url.pathname === "/repos/owner/repo/issues/21") return jsonResponse(closedIssue(21, "not_planned"));
		if (call.url.pathname === "/repos/owner/repo/issues/21/comments") return jsonResponse([]);
		throw new Error(`Unexpected request ${call.method} ${call.url.pathname}`);
	}, registerGetIssueTool);
	const refreshed = await executeRegisteredTool(fetched.pi.tools, "issueme_get_issue", { number: 21, refresh: true }, { cwd: fetched.cwd });
	assert.match(refreshed.content[0].text, /^State: closed \(not_planned\)$/m);
	assert.equal(refreshed.details.issue.stateReason, "not_planned");
	assert.equal(refreshed.details.issue.state, "closed");
	assert.match(refreshed.content[0].text, /removed \(issue is closed\)/);
	const entries = await listIssueFileEntries(fetched.cwd, CONFIG);
	assert.deepEqual(entries.files, []);
});

test("issueme_close_issue and issueme_reopen_issue surface the recorded reason GitHub returns without inventing one", async () => {
	const closing = await tools((call) => {
		if (call.method === "GET") return jsonResponse(githubIssue({ number: 30, title: "Close Me" }));
		assert.equal(call.method, "PATCH");
		assert.deepEqual(call.json, { state: "closed", state_reason: "not_planned" });
		return jsonResponse(closedIssue(30, "not_planned", { title: "Close Me" }));
	}, registerCloseIssueTool);
	const closed = await executeRegisteredTool(closing.pi.tools, "issueme_close_issue", { number: 30, reason: "not_planned" }, { cwd: closing.cwd });
	assert.equal(closed.details.status, "closed_now");
	assert.equal(closed.details.issue.stateReason, "not_planned");
	assert.match(closed.content[0].text, /^Recorded state reason: not_planned$/m);

	const silent = await tools((call) => {
		if (call.method === "GET") return jsonResponse(githubIssue({ number: 31, title: "Silent" }));
		const response = closedIssue(31, "completed", { title: "Silent" });
		delete response.state_reason;
		return jsonResponse(response);
	}, registerCloseIssueTool);
	const silentClose = await executeRegisteredTool(silent.pi.tools, "issueme_close_issue", { number: 31 }, { cwd: silent.cwd });
	assert.equal(Object.hasOwn(silentClose.details.issue, "stateReason"), false);
	assert.doesNotMatch(silentClose.content[0].text, /Recorded state reason/);

	let reopenGets = 0;
	const reopening = await tools((call) => {
		if (call.url.pathname === "/repos/owner/repo/issues/40" && call.method === "GET") {
			reopenGets += 1;
			if (reopenGets === 1) return jsonResponse(closedIssue(40, "completed", { title: "Reopen Me" }));
			return jsonResponse(githubIssue({ number: 40, title: "Reopen Me", state_reason: "reopened" }));
		}
		if (call.url.pathname === "/repos/owner/repo/issues/40" && call.method === "PATCH") {
			assert.deepEqual(call.json, { state: "open", state_reason: "reopened" });
			return jsonResponse(githubIssue({ number: 40, title: "Reopen Me", state_reason: "reopened" }));
		}
		if (call.url.pathname === "/repos/owner/repo/issues/40/comments") return jsonResponse([]);
		throw new Error(`Unexpected request ${call.method} ${call.url.pathname}`);
	}, registerReopenIssueTool);
	const reopened = await executeRegisteredTool(reopening.pi.tools, "issueme_reopen_issue", { number: 40 }, { cwd: reopening.cwd });
	assert.equal(reopened.details.status, "reopened");
	assert.equal(reopened.details.issue.stateReason, "reopened");
	const record = await readIssueFile(join(reopening.cwd, reopened.details.paths[0]));
	assert.equal(record.state, "open");
	assert.equal(record.state_reason, "reopened");
});
