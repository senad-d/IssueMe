#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { renderConfigTuiSnapshot } from "../src/commands/config-tui.ts";

const outputDir = join("test", "snapshots", "tui", "issueme-config");
const config = {
	issueDirectory: "issues",
	allowedIssueCreator: "all",
	defaultLabels: ["bug", "agent-ready"],
	defaultAssignees: [],
	defaultSkillPath: null,
};

const cases = [
	{ name: "wide-category-focus", width: 80, state: { focus: "categories" }, description: "Wide two-pane layout with category pane focused." },
	{ name: "wide-settings-focus", width: 80, state: { focus: "settings" }, description: "Wide two-pane layout with settings pane focused." },
	{ name: "narrow-category", width: 48, state: { focus: "categories" }, description: "Narrow category-only view." },
	{ name: "narrow-settings", width: 48, state: { focus: "settings" }, description: "Narrow settings-only view." },
	{ name: "tiny", width: 20, state: { focus: "settings" }, description: "Tiny no-border fallback." },
	{ name: "search-results", width: 80, state: { focus: "settings", searchActive: true, search: "labels" }, description: "Search view with matching settings." },
	{ name: "search-empty", width: 80, state: { focus: "settings", searchActive: true, search: "nope" }, description: "Search view with no matching settings." },
	{ name: "edit-state", width: 80, state: { focus: "settings", editing: true, editBuffer: "issues-next" }, description: "Inline editing footer state." },
	{ name: "validation-error", width: 80, state: { focus: "settings", validationError: "Issue directory cannot use path traversal." }, description: "Validation error footer state." },
];

await mkdir(outputDir, { recursive: true });
const manifest = [];
for (const item of cases) {
	const lines = renderConfigTuiSnapshot("/tmp/issueme-project", config, item.width, item.state);
	const file = `${item.name}.txt`;
	await writeFile(join(outputDir, file), `${lines.join("\n")}\n`, "utf8");
	manifest.push({
		file,
		width: item.width,
		description: item.description,
		lineCount: lines.length,
		maxLineLength: Math.max(...lines.map((line) => line.length)),
	});
}
await writeFile(join(outputDir, "manifest.json"), `${JSON.stringify({ generatedBy: "npm run test:tui-artifacts", cases: manifest }, null, 2)}\n`, "utf8");
console.log(`Wrote ${cases.length} IssueMe TUI artifact(s) to ${outputDir}.`);
