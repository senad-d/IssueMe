import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { IssueMeConfigTui, renderConfigTuiSnapshot } from "../src/commands/config-tui.ts";

const plainTheme = { fg: (_role, text) => text, bold: (text) => text };

function sampleConfig(overrides = {}) {
	return {
		issueDirectory: "issues",
		defaultLabels: [],
		defaultAssignees: [],
		defaultSkillPath: null,
		...overrides,
	};
}

function stripAnsi(value) {
	return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function visibleWidth(value) {
	return stripAnsi(value).length;
}

function assertVisibleLineBounds(lines, width) {
	for (const line of lines) {
		assert.ok(visibleWidth(line) <= width, `line exceeds width ${width}: ${stripAnsi(line)}`);
	}
}

function themeRecorder() {
	const roles = [];
	const codes = { accent: "36", dim: "2", muted: "90", warning: "33" };
	return {
		roles,
		theme: {
			fg(role, text) {
				roles.push(role);
				return `\u001b[${codes[role] ?? "37"}m${text}\u001b[0m`;
			},
			bold(text) {
				roles.push("bold");
				return `\u001b[1m${text}\u001b[0m`;
			},
		},
	};
}

test("configuration TUI renderer covers wide two-pane mode", () => {
	const width = 80;
	const lines = renderConfigTuiSnapshot("/tmp/issueme-project", sampleConfig({ defaultLabels: ["bug", "agent-ready"] }), width, { focus: "categories" });
	const text = lines.join("\n");

	assertVisibleLineBounds(lines, width);
	assert.match(text, /╭─ Configuration/);
	assert.match(text, /┬/);
	assert.match(text, /┴/);
	assert.match(text, /▶ Cache/);
	assert.match(text, /CACHE\s+1\/1/);
	assert.match(text, /Issue directory\s+issues/);
	assert.match(text, /1\/1 • Project-local directory/);
});

test("configuration TUI renderer covers narrow category and settings modes", () => {
	const width = 48;
	const categoryLines = renderConfigTuiSnapshot("/tmp/issueme-project", sampleConfig(), width, { focus: "categories" });
	const categoryText = categoryLines.join("\n");
	const settingsLines = renderConfigTuiSnapshot("/tmp/issueme-project", sampleConfig(), width, { focus: "settings" });
	const settingsText = settingsLines.join("\n");

	assertVisibleLineBounds(categoryLines, width);
	assertVisibleLineBounds(settingsLines, width);
	assert.doesNotMatch(categoryText, /┬|┴/);
	assert.match(categoryText, /▶ Cache/);
	assert.match(categoryText, /Defaults/);
	assert.doesNotMatch(categoryText, /Issue directory\s+issues/);
	assert.doesNotMatch(settingsText, /┬|┴/);
	assert.match(settingsText, /CACHE\s+1\/1/);
	assert.match(settingsText, /▶ Issue directory\s+issues/);
	assert.doesNotMatch(settingsText, /Defaults\s*\n/);
});

test("configuration TUI renderer covers tiny no-border fallback", () => {
	const width = 20;
	const lines = renderConfigTuiSnapshot("/tmp/issueme-project", sampleConfig(), width, { focus: "settings" });
	const text = lines.join("\n");

	assert.equal(lines.length, 4);
	assertVisibleLineBounds(lines, width);
	assert.doesNotMatch(text, /╭|╰|├|┤|┬|┴/);
	assert.match(text, /^Configuration/m);
	assert.match(text, /^Project/m);
	assert.match(text, /^Issue directory: iss/m);
	assert.match(text, /^s save  Esc\/q quit/m);
});

test("configuration TUI renderer clips and pads ANSI-styled lines by visible width", () => {
	const width = 36;
	const { roles, theme } = themeRecorder();
	const component = new IssueMeConfigTui(
		"/tmp/issueme-project",
		sampleConfig({ issueDirectory: "very/deep/folder/final-name.ext" }),
		theme,
		() => {},
		() => {},
		{ focus: "settings" },
	);
	const lines = component.render(width);
	const text = lines.join("\n");
	const plainText = stripAnsi(text);

	assertVisibleLineBounds(lines, width);
	assert.match(text, /\u001b\[/);
	assert.match(plainText, /…nal-name\.ext/);
	assert.ok(roles.includes("accent"));
	assert.ok(roles.includes("dim"));
	assert.ok(roles.includes("bold"));
});

test("configuration TUI renderer uses warning role for empty search results", () => {
	const width = 80;
	const { roles, theme } = themeRecorder();
	const component = new IssueMeConfigTui(
		"/tmp/issueme-project",
		sampleConfig(),
		theme,
		() => {},
		() => {},
		{ focus: "settings", searchActive: true, search: "nope" },
	);
	const lines = component.render(width);
	const text = stripAnsi(lines.join("\n"));

	assertVisibleLineBounds(lines, width);
	assert.match(text, /SEARCH NOPE\s+0\/0/);
	assert.match(text, /No matching settings/);
	assert.match(text, /Search: nope • 0\/0/);
	assert.ok(roles.includes("muted"));
	assert.ok(roles.includes("warning"));
});

test("configuration TUI keyboard input covers navigation, search, edit save, and edit cancel", async () => {
	const root = await mkdtemp(join(tmpdir(), "issueme-config-tui-"));
	let renderRequests = 0;
	const saved = [];
	const component = new IssueMeConfigTui(root, sampleConfig(), plainTheme, (result) => saved.push(result), () => { renderRequests += 1; });

	component.handleInput("j");
	assert.match(component.render(80).join("\n"), /▶ Defaults/);
	component.handleInput("\t");
	assert.match(component.render(80).join("\n"), /DEFAULTS\s+1\/2/);
	component.handleInput("/");
	for (const char of "assignees") component.handleInput(char);
	assert.match(component.render(80).join("\n"), /SEARCH ASSIGNEES\s+1\/1/);
	assert.match(component.render(80).join("\n"), /Default assignees \(Defaults\)/);
	component.handleInput("\u001b");
	assert.doesNotMatch(component.render(80).join("\n"), /SEARCH ASSIGNEES/);

	const quitCount = saved.length;
	const quitComponent = new IssueMeConfigTui(root, sampleConfig(), plainTheme, (result) => saved.push(result), () => { renderRequests += 1; });
	quitComponent.handleInput("\u001b");
	assert.equal(saved.length, quitCount + 1);
	assert.equal(saved.at(-1), undefined);
	const qQuitCount = saved.length;
	const qQuitComponent = new IssueMeConfigTui(root, sampleConfig(), plainTheme, (result) => saved.push(result), () => { renderRequests += 1; });
	qQuitComponent.handleInput("q");
	assert.equal(saved.length, qQuitCount + 1);
	assert.equal(saved.at(-1), undefined);

	const editComponent = new IssueMeConfigTui(root, sampleConfig(), plainTheme, (result) => saved.push(result), () => { renderRequests += 1; }, { focus: "settings" });
	editComponent.handleInput("\r");
	for (let index = 0; index < "issues".length; index += 1) editComponent.handleInput("\x7f");
	for (const char of "issue-cache") editComponent.handleInput(char);
	assert.match(editComponent.render(80).join("\n"), /Editing issue-cache/);
	editComponent.handleInput("\r");
	assert.match(editComponent.render(80).join("\n"), /Setting updated/);
	assert.match(editComponent.render(80).join("\n"), /Issue directory\s+issue-cache/);
	editComponent.handleInput("s");
	assert.equal(saved.at(-1).issueDirectory, "issue-cache");

	const cancelSaved = [];
	const cancelComponent = new IssueMeConfigTui(root, sampleConfig(), plainTheme, (result) => cancelSaved.push(result), () => { renderRequests += 1; }, { focus: "settings" });
	cancelComponent.handleInput("\r");
	for (const char of "-draft") cancelComponent.handleInput(char);
	assert.match(cancelComponent.render(80).join("\n"), /Editing issues-draft/);
	cancelComponent.handleInput("\u001b");
	assert.match(cancelComponent.render(80).join("\n"), /Edit cancelled/);
	assert.doesNotMatch(cancelComponent.render(80).join("\n"), /issues-draft/);
	cancelComponent.handleInput("s");
	assert.equal(cancelSaved.at(-1).issueDirectory, "issues");
	assert.ok(renderRequests > 0);
});
