import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { IssueMeConfigTui } from "../src/commands/config-tui.ts";
import { registerIssueMeCommand } from "../src/commands/issueme-command.ts";
import { DEFAULT_CONFIG_PATH } from "../src/constants.ts";
import {
	assertNoSecretLeak,
	createFakeCommandContext,
	createFakePi,
	createGitProject,
	issueMeConfig,
	tempProject,
	withCleanGitHubEnv,
} from "./helpers/issueme-test-helpers.mjs";

const plainTheme = { fg: (_role, text) => text, bold: (text) => text };

function typeText(component, value) {
	for (const char of value) component.handleInput(char);
}

function commandHandler(pi) {
	const command = pi.commands.get("issueme");
	assert.ok(command, "IssueMe command should be registered");
	return command.handler;
}

test("/issueme config reports TUI save failures without persisting unsafe config output", async () => withCleanGitHubEnv(async () => {
	const root = await createGitProject();
	const pi = createFakePi();
	registerIssueMeCommand(pi);

	const ctx = createFakeCommandContext(root, {
		mode: "tui",
		hasUI: true,
		async customRunner(factory, { tui, theme }) {
			const component = factory(tui, theme, {}, () => {});
			assert.match(component.render(80).join("\n"), /Configuration/);
			await mkdir(join(root, DEFAULT_CONFIG_PATH), { recursive: true });
			return issueMeConfig({ defaultLabels: ["triaged"] });
		},
	});

	await assert.rejects(
		() => commandHandler(pi)("", ctx),
		(error) => error?.code === "unsafe_path" && /regular file/.test(error.message),
	);

	assert.equal(pi.messages.length, 0);
	assert.equal(ctx.customCalls.length, 1);
	assert.equal(ctx.notifications.at(-1).level, "error");
	assert.match(ctx.notifications.at(-1).message, /config not saved/i);
	assertNoSecretLeak({ notifications: ctx.notifications, messages: pi.messages });
}));

test("/issueme info combines unknown-command warnings, repository failures, and invalid cache counts", async () => withCleanGitHubEnv(async () => {
	const root = await tempProject("issueme-command-info-");
	await mkdir(join(root, "issues"), { recursive: true });
	await writeFile(join(root, "issues", "1-bad-json.json"), "{not json", "utf8");
	await writeFile(join(root, "issues", "not-an-issue.json"), "{}\n", "utf8");

	const pi = createFakePi();
	registerIssueMeCommand(pi);
	await commandHandler(pi)("wat", createFakeCommandContext(root, { mode: "json", hasUI: false }));

	const message = pi.messages[0].message;
	assert.match(message.content, /Unknown \/issueme subcommand: wat/);
	assert.match(message.content, /Repository: Unable to resolve GitHub repository/);
	assert.match(message.content, /Token: missing/);
	assert.match(message.content, /Invalid cache files: 2/);
	assert.equal(message.details.warning, "Unknown /issueme subcommand: wat");
	assert.equal(message.details.repositoryStatus.includes("Unable to resolve GitHub repository"), true);
	assert.equal(message.details.invalidCacheFiles, 2);
	assert.equal(message.details.trusted, true);
	assertNoSecretLeak(message);
}));

test("/issueme start rejects null-byte and overlong skill paths before prompt delivery", async () => {
	const root = await createGitProject();
	const pi = createFakePi();
	registerIssueMeCommand(pi);
	const handler = commandHandler(pi);
	const ctx = createFakeCommandContext(root, { mode: "json", hasUI: false });

	await assert.rejects(
		() => handler("start skills/bad\0SKILL.md", ctx),
		(error) => error?.code === "invalid_skill_path" && /empty or invalid/.test(error.message),
	);
	await assert.rejects(
		() => handler(`start ${"a".repeat(5000)}`, ctx),
		(error) => error?.code === "skill_path_unreadable" && /inspected safely/.test(error.message),
	);
	assert.equal(pi.userMessages.length, 0);
});

test("IssueMeConfigTui drives settings-pane movement and edits list/path settings through public input", async () => {
	const root = await createGitProject();
	const saved = [];
	let renderRequests = 0;
	const component = new IssueMeConfigTui(root, issueMeConfig(), plainTheme, (result) => saved.push(result), () => { renderRequests += 1; }, {
		focus: "settings",
		selectedCategory: 1,
		selectedSettingByCategory: [0, 0, 0],
	});

	component.handleInput("j");
	assert.match(component.render(80).join("\n"), /▶ Default assignees/);
	component.handleInput("\r");
	typeText(component, "octocat, octocat, hubot");
	component.handleInput("\r");
	assert.match(component.render(80).join("\n"), /Default assignees\s+octocat, hubot/);

	component.handleInput("\t");
	component.handleInput("j");
	component.handleInput("\t");
	assert.match(component.render(80).join("\n"), /WORKFLOW\s+1\/1/);
	component.handleInput("\r");
	typeText(component, "skills/workflow/SKILL.md");
	component.handleInput("\r");
	component.handleInput("s");

	assert.deepEqual(saved.at(-1).defaultAssignees, ["octocat", "hubot"]);
	assert.equal(saved.at(-1).defaultSkillPath, "skills/workflow/SKILL.md");
	assert.ok(renderRequests > 0);
});

test("IssueMeConfigTui handles empty search, invalid printable keys, save validation, and ANSI truncation", async () => {
	const root = await createGitProject();
	const search = new IssueMeConfigTui(root, issueMeConfig(), plainTheme, () => {}, () => {}, { focus: "settings" });
	search.handleInput("/");
	typeText(search, "zzzz");
	search.handleInput("j");
	assert.match(search.render(80).join("\n"), /No matching settings/);
	search.handleInput("\x7f");
	assert.match(search.render(80).join("\n"), /SEARCH ZZZ/);
	search.handleInput("\u001b");
	assert.doesNotMatch(search.render(80).join("\n"), /SEARCH ZZZ/);

	const invalidSaves = [];
	const invalid = new IssueMeConfigTui(root, issueMeConfig({ defaultSkillPath: "../outside/SKILL.md" }), plainTheme, (result) => invalidSaves.push(result));
	invalid.handleInput("s");
	assert.equal(invalidSaves.length, 0);
	assert.match(invalid.render(80).join("\n"), /Default skill path must stay inside/);

	const kitty = new IssueMeConfigTui(root, issueMeConfig(), plainTheme, () => {}, () => {}, { focus: "settings" });
	kitty.handleInput("\r");
	kitty.handleInput("\u001b[999999999999999999999u");
	assert.match(kitty.render(80).join("\n"), /Editing issues/);

	const malformedAnsiTheme = {
		fg: (_role, text) => `\u001b[;m${text}`,
		bold: (text) => `\u001b[1;xm${text}`,
	};
	const styled = new IssueMeConfigTui(root, issueMeConfig({ issueDirectory: "issues/with/a/very/deep/final-name" }), malformedAnsiTheme, () => {}, () => {}, { focus: "settings" });
	const styledLines = styled.render(24);
	assert.ok(styledLines.every((line) => typeof line === "string"));
});

test("/issueme config persists only non-secret TUI output on a successful save", async () => withCleanGitHubEnv(async () => {
	const root = await createGitProject();
	const pi = createFakePi();
	registerIssueMeCommand(pi);
	const ctx = createFakeCommandContext(root, {
		mode: "tui",
		hasUI: true,
		customResult: issueMeConfig({ defaultLabels: ["bug"], defaultAssignees: ["octocat"], defaultSkillPath: "skills/SKILL.md" }),
	});

	await commandHandler(pi)("", ctx);

	const savedText = await readFile(join(root, DEFAULT_CONFIG_PATH), "utf8");
	const savedConfig = JSON.parse(savedText);
	assert.deepEqual(savedConfig.defaultLabels, ["bug"]);
	assert.deepEqual(savedConfig.defaultAssignees, ["octocat"]);
	assert.equal(savedConfig.defaultSkillPath, "skills/SKILL.md");
	assert.doesNotMatch(savedText, /token|secret|password|credential|api[_-]?key/i);
	assert.match(pi.messages[0].message.content, /Secrets were not accepted/);
	assert.deepEqual(ctx.notifications.at(-1), { message: "IssueMe config saved.", level: "info" });
}));
