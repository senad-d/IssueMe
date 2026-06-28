import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const snapshotDir = join("test", "snapshots", "tui", "issueme-config");

test("IssueMe TUI visual artifacts are deterministic and width-bounded", async () => {
	const manifest = JSON.parse(await readFile(join(snapshotDir, "manifest.json"), "utf8"));
	assert.equal(manifest.generatedBy, "npm run test:tui-artifacts");
	assert.ok(manifest.cases.length >= 9);
	const names = manifest.cases.map((entry) => entry.file);
	for (const required of ["wide-category-focus.txt", "narrow-settings.txt", "tiny.txt", "search-empty.txt", "edit-state.txt", "validation-error.txt"]) {
		assert.ok(names.includes(required), `${required} missing from artifact manifest`);
	}
	for (const entry of manifest.cases) {
		const text = await readFile(join(snapshotDir, entry.file), "utf8");
		assert.doesNotMatch(text, /GH_TOKEN|GITHUB_TOKEN|ghp_/);
		const lines = text.trimEnd().split("\n");
		assert.equal(lines.length, entry.lineCount);
		assert.equal(Math.max(...lines.map((line) => line.length)), entry.maxLineLength);
		for (const line of lines) assert.ok(line.length <= entry.width, `${entry.file} line exceeds width ${entry.width}`);
	}
});
