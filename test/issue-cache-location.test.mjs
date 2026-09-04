import assert from "node:assert/strict";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { DEFAULT_ISSUES_DIR, LEGACY_ISSUES_DIR } from "../src/constants.ts";
import { DEFAULT_ISSUEME_CONFIG } from "../src/config/config.ts";
import { listIssueFiles, writeIssueRecord } from "../src/issues/store.ts";
import { localIssueRecord, tempProject } from "./helpers/issueme-test-helpers.mjs";

test("default issue cache lives under .pi/issues and hides itself from git status", async () => {
	const root = await tempProject();
	assert.equal(DEFAULT_ISSUES_DIR, ".pi/issues");
	assert.equal(DEFAULT_ISSUEME_CONFIG.issueDirectory, ".pi/issues");

	const result = await writeIssueRecord(root, { ...DEFAULT_ISSUEME_CONFIG }, localIssueRecord({ number: 3, title: "Cache Home" }));
	assert.equal(result.action, "created");
	assert.equal(result.path, join(root, ".pi", "issues", "3-cache-home.json"));
	assert.equal(await readFile(join(root, ".pi", "issues", ".gitignore"), "utf8"), "*\n");
});

test("legacy issues/ cache files migrate by copy into .pi/issues and both directories become git-invisible", async () => {
	const root = await tempProject();
	const legacyDirectory = join(root, LEGACY_ISSUES_DIR);
	await mkdir(legacyDirectory);
	const record = localIssueRecord({ number: 7, title: "Legacy Record" });
	await writeFile(join(legacyDirectory, "7-legacy-record.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
	await writeFile(join(legacyDirectory, "notes.txt"), "not an issue cache file\n", "utf8");

	const files = await listIssueFiles(root, { ...DEFAULT_ISSUEME_CONFIG });
	assert.equal(files.length, 1);
	assert.equal(files[0].path, join(root, ".pi", "issues", "7-legacy-record.json"));
	assert.deepEqual((await readdir(join(root, ".pi", "issues"))).sort(), [".gitignore", "7-legacy-record.json"]);
	// Migration copies, never deletes: legacy files may be git-tracked, so removal stays a user decision.
	assert.deepEqual((await readdir(legacyDirectory)).sort(), [".gitignore", "7-legacy-record.json", "notes.txt"]);
	assert.equal(await readFile(join(root, ".pi", "issues", ".gitignore"), "utf8"), "*\n");
	assert.equal(await readFile(join(legacyDirectory, ".gitignore"), "utf8"), "*\n");
});

test("legacy migration applies only when the configured directory is the default", async () => {
	const root = await tempProject();
	await mkdir(join(root, LEGACY_ISSUES_DIR));
	await writeFile(join(root, LEGACY_ISSUES_DIR, "9-stays-put.json"), `${JSON.stringify(localIssueRecord({ number: 9, title: "Stays Put" }), null, 2)}\n`, "utf8");

	const files = await listIssueFiles(root, { ...DEFAULT_ISSUEME_CONFIG, issueDirectory: "custom-cache" });
	assert.deepEqual(files, []);
	await assert.rejects(() => readdir(join(root, "custom-cache")), { code: "ENOENT" });
	assert.deepEqual(await readdir(join(root, LEGACY_ISSUES_DIR)), ["9-stays-put.json"]);
});
