import assert from "node:assert/strict";
import { constants as fsConstants } from "node:fs";
import { access, chmod, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { registerIssueMeCommand, parseIssueMeCommand, renderIssueMeInfo } from "../src/commands/issueme-command.ts";
import { IssueMeConfigTui, renderConfigTuiSnapshot } from "../src/commands/config-tui.ts";
import { writeIssueRecord } from "../src/issues/store.ts";
import { registerIssueMeTools } from "../src/tools/issueme-tools.ts";

function sampleConfig(overrides = {}) {
	return {
		issueDirectory: "issues",
		defaultLabels: [],
		defaultAssignees: [],
		defaultSkillPath: null,
		...overrides,
	};
}

function sampleIssue(overrides = {}) {
	return {
		schemaVersion: 1,
		repository: "owner/repo",
		number: 7,
		title: "Trusted Cache Issue",
		state: "open",
		body: "Body",
		labels: [],
		assignees: [],
		milestone: null,
		comments: [],
		html_url: "https://github.com/owner/repo/issues/7",
		created_at: "2026-06-27T00:00:00Z",
		updated_at: "2026-06-27T00:00:00Z",
		closed_at: null,
		synced_at: "2026-06-27T00:00:01Z",
		...overrides,
	};
}

async function tempProject() {
	const root = await mkdtemp(join(tmpdir(), "issueme-command-"));
	await mkdir(join(root, ".git"));
	await writeFile(join(root, ".git", "config"), '[remote "origin"]\n\turl = https://github.com/owner/repo.git\n', "utf8");
	return root;
}

function fakePi() {
	const commands = new Map();
	const tools = new Map();
	const messages = [];
	const userMessages = [];
	return {
		commands,
		tools,
		messages,
		userMessages,
		registerCommand(name, options) { commands.set(name, options); },
		registerTool(tool) { tools.set(tool.name, tool); },
		sendMessage(message, options) { messages.push({ message, options }); },
		sendUserMessage(content, options) { userMessages.push({ content, options }); },
	};
}

function fakeCtx(cwd, overrides = {}) {
	return {
		cwd,
		mode: "json",
		hasUI: false,
		ui: { notify() {} },
		isIdle: () => true,
		isProjectTrusted: () => true,
		...overrides,
	};
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function withCleanGitHubEnv(fn) {
	const keys = ["GH_TOKEN", "GITHUB_TOKEN", "GITHUB_REPOSITORY"];
	const previous = new Map(keys.map((key) => [key, process.env[key]]));
	for (const key of keys) delete process.env[key];
	try {
		return await fn();
	} finally {
		for (const key of keys) {
			const value = previous.get(key);
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
}

test("parseIssueMeCommand handles aliases, exact start, quoted paths, and unknown commands", () => {
	assert.deepEqual(parseIssueMeCommand(""), { kind: "config" });
	assert.deepEqual(parseIssueMeCommand("info"), { kind: "info" });
	assert.deepEqual(parseIssueMeCommand("help"), { kind: "info" });
	assert.deepEqual(parseIssueMeCommand("--help"), { kind: "info" });
	assert.deepEqual(parseIssueMeCommand("-h"), { kind: "info" });
	assert.deepEqual(parseIssueMeCommand('start "skills/my skill/SKILL.md"'), { kind: "start", skillPath: "skills/my skill/SKILL.md" });
	assert.deepEqual(parseIssueMeCommand(String.raw`start skills/my\ skill/SKILL.md`), { kind: "start", skillPath: "skills/my skill/SKILL.md" });
	assert.deepEqual(parseIssueMeCommand(String.raw`start C:\tmp\SKILL.md`), { kind: "start", skillPath: String.raw`C:\tmp\SKILL.md` });
	assert.equal(parseIssueMeCommand("starter path").kind, "info");
	assert.match(parseIssueMeCommand("starter path").warning, /Unknown/);
	assert.deepEqual(parseIssueMeCommand("start"), { kind: "start" });
});

test("renderIssueMeInfo is one combined help/status surface", () => {
	const text = renderIssueMeInfo({
		warning: "Unknown /issueme subcommand: wat",
		trusted: false,
		repositoryStatus: "repo missing",
		tokenStatus: "missing",
		configPath: ".pi/agent/issueme.json",
		issueDirectory: "issues",
		defaultSkillPath: null,
		cachedIssues: 0,
		invalidCacheFiles: 0,
	});
	assert.match(text, /IssueMe help and status/);
	assert.match(text, /\/issueme info \| help \| --help \| -h/);
	assert.match(text, /issueme_sync_issues/);
	assert.match(text, /Project trusted: no/);
	assert.match(text, /Default skill path: not set/);
	assert.match(text, /Troubleshooting/);
});

test("/issueme start validates exact readable project-local files, configured defaults, and delivery modes", async () => {
	const root = await tempProject();
	await mkdir(join(root, ".pi", "agent"), { recursive: true });
	await mkdir(join(root, "skills", "my skill"), { recursive: true });
	await mkdir(join(root, "skills", "default"), { recursive: true });
	await writeFile(join(root, "skills", "my skill", "SKILL.md"), "# Skill\n", "utf8");
	await writeFile(join(root, "skills", "default", "SKILL.md"), "# Default Skill\n", "utf8");
	await writeFile(join(root, ".pi", "agent", "issueme.json"), `${JSON.stringify(sampleConfig({ defaultSkillPath: "skills/default/SKILL.md" }), null, 2)}\n`, "utf8");

	const busyPi = fakePi();
	registerIssueMeCommand(busyPi);
	await busyPi.commands.get("issueme").handler('start "skills/my skill/SKILL.md"', fakeCtx(root, { isIdle: () => false }));
	assert.equal(busyPi.userMessages.length, 1);
	assert.equal(busyPi.userMessages[0].options.deliverAs, "followUp");
	assert.match(busyPi.userMessages[0].content, /IssueMe workflow skill/);
	assert.match(busyPi.userMessages[0].content, /@skills\/my skill\/SKILL\.md/);
	assert.doesNotMatch(busyPi.userMessages[0].content, new RegExp(escapeRegExp(root)));

	const defaultPi = fakePi();
	registerIssueMeCommand(defaultPi);
	await defaultPi.commands.get("issueme").handler("start", fakeCtx(root));
	assert.equal(defaultPi.userMessages.length, 1);
	assert.equal(defaultPi.userMessages[0].options, undefined);
	assert.match(defaultPi.userMessages[0].content, /@skills\/default\/SKILL\.md/);
	assert.doesNotMatch(defaultPi.userMessages[0].content, new RegExp(escapeRegExp(root)));

	const idlePi = fakePi();
	registerIssueMeCommand(idlePi);
	await idlePi.commands.get("issueme").handler('start @"skills/my skill/SKILL.md"', fakeCtx(root));
	assert.equal(idlePi.userMessages.length, 1);
	assert.equal(idlePi.userMessages[0].options, undefined);
	assert.match(idlePi.userMessages[0].content, /@skills\/my skill\/SKILL\.md/);
	assert.doesNotMatch(idlePi.userMessages[0].content, new RegExp(escapeRegExp(root)));

	const absolutePi = fakePi();
	registerIssueMeCommand(absolutePi);
	await absolutePi.commands.get("issueme").handler(`start "${join(root, "skills", "my skill", "SKILL.md")}"`, fakeCtx(root));
	assert.equal(absolutePi.userMessages.length, 1);
	assert.match(absolutePi.userMessages[0].content, /@skills\/my skill\/SKILL\.md/);
	assert.doesNotMatch(absolutePi.userMessages[0].content, new RegExp(escapeRegExp(root)));

	try {
		const linkedSkill = join(root, "skills", "linked-skill.md");
		await symlink(join(root, "skills", "my skill", "SKILL.md"), linkedSkill);
		const symlinkPi = fakePi();
		registerIssueMeCommand(symlinkPi);
		await symlinkPi.commands.get("issueme").handler("start skills/linked-skill.md", fakeCtx(root));
		assert.match(symlinkPi.userMessages[0].content, /@skills\/my skill\/SKILL\.md/);
		assert.doesNotMatch(symlinkPi.userMessages[0].content, new RegExp(escapeRegExp(root)));
	} catch (error) {
		if (error?.code !== "EPERM" && error?.code !== "EACCES") throw error;
	}
});

test("/issueme start rejects missing, directory, unreadable, and unsafe skill paths", async () => {
	const root = await tempProject();
	await mkdir(join(root, "skills"), { recursive: true });
	await writeFile(join(root, "skills", "SKILL.md"), "# Skill\n", "utf8");
	const pi = fakePi();
	registerIssueMeCommand(pi);
	const handler = pi.commands.get("issueme").handler;

	await handler("starter skills/SKILL.md", fakeCtx(root));
	assert.equal(pi.userMessages.length, 0);
	assert.match(pi.messages.at(-1).message.content, /Unknown \/issueme subcommand: starter/);

	await handler("start", fakeCtx(root));
	assert.equal(pi.userMessages.length, 0);
	assert.match(pi.messages.at(-1).message.content, /Usage: \/issueme start \[skill-path\]/);
	assert.match(pi.messages.at(-1).message.content, /defaultSkillPath/);

	await mkdir(join(root, ".pi", "agent"), { recursive: true });
	await writeFile(join(root, ".pi", "agent", "issueme.json"), `${JSON.stringify(sampleConfig({ defaultSkillPath: "../outside/SKILL.md" }), null, 2)}\n`, "utf8");
	await assert.rejects(
		() => handler("start", fakeCtx(root)),
		(error) => error?.code === "unsafe_skill_path" && /current project/.test(error.message),
	);
	await writeFile(join(root, ".pi", "agent", "issueme.json"), `${JSON.stringify(sampleConfig(), null, 2)}\n`, "utf8");

	await assert.rejects(
		() => handler("start skills/missing.md", fakeCtx(root)),
		(error) => error?.code === "skill_path_not_found" && /does not exist/.test(error.message),
	);
	await assert.rejects(
		() => handler("start skills", fakeCtx(root)),
		(error) => error?.code === "skill_path_not_file" && /readable file/.test(error.message),
	);

	const outsideRoot = await mkdtemp(join(tmpdir(), "issueme-command-outside-"));
	const outsideSkill = join(outsideRoot, "SKILL.md");
	await writeFile(outsideSkill, "# Outside\n", "utf8");
	await assert.rejects(
		() => handler(`start ${outsideSkill}`, fakeCtx(root)),
		(error) => error?.code === "unsafe_skill_path" && /current project/.test(error.message),
	);

	try {
		await symlink(outsideSkill, join(root, "skills", "outside-link.md"));
		await assert.rejects(
			() => handler("start skills/outside-link.md", fakeCtx(root)),
			(error) => error?.code === "unsafe_skill_path" && /current project/.test(error.message),
		);
	} catch (error) {
		if (error?.code !== "EPERM" && error?.code !== "EACCES") throw error;
	}

	const unreadableSkill = join(root, "skills", "unreadable.md");
	await writeFile(unreadableSkill, "# Unreadable\n", "utf8");
	await chmod(unreadableSkill, 0o000);
	try {
		const platformStillReportsReadable = await access(unreadableSkill, fsConstants.R_OK).then(() => true, () => false);
		if (!platformStillReportsReadable) {
			await assert.rejects(
				() => handler("start skills/unreadable.md", fakeCtx(root)),
				(error) => error?.code === "skill_path_unreadable" && /not readable/.test(error.message),
			);
		}
	} finally {
		await chmod(unreadableSkill, 0o600);
	}
});

test("/issueme help aliases render the same info surface", async () => {
	const root = await tempProject();
	const pi = fakePi();
	registerIssueMeCommand(pi);
	for (const alias of ["info", "help", "--help", "-h"]) {
		await pi.commands.get("issueme").handler(alias, fakeCtx(root));
	}
	assert.equal(pi.messages.length, 4);
	for (const entry of pi.messages) {
		assert.equal(entry.message.content, pi.messages[0].message.content);
	}
});

test("/issueme info honors project-local reads only when the project is trusted", async () => withCleanGitHubEnv(async () => {
	const root = await tempProject();
	const localConfig = sampleConfig({ issueDirectory: "custom-cache" });
	await mkdir(join(root, ".pi", "agent"), { recursive: true });
	await writeFile(join(root, ".pi", "agent", "issueme.json"), `${JSON.stringify(localConfig, null, 2)}\n`, "utf8");
	await writeFile(join(root, ".env"), "GH_TOKEN=project-secret\n", "utf8");
	await writeIssueRecord(root, localConfig, sampleIssue());

	const untrustedPi = fakePi();
	registerIssueMeCommand(untrustedPi);
	await untrustedPi.commands.get("issueme").handler("info", fakeCtx(root, { isProjectTrusted: () => false }));
	const untrustedText = untrustedPi.messages[0].message.content;
	assert.match(untrustedText, /Project trusted: no/);
	assert.match(untrustedText, /Repository: Project trust is required/);
	assert.match(untrustedText, /Token: missing/);
	assert.match(untrustedText, /Issue directory: issues/);
	assert.match(untrustedText, /Cached open issue files: 0/);
	assert.doesNotMatch(untrustedText, /project-env|project-secret|custom-cache|owner\/repo/);

	const trustedPi = fakePi();
	registerIssueMeCommand(trustedPi);
	await trustedPi.commands.get("issueme").handler("info", fakeCtx(root));
	const trustedText = trustedPi.messages[0].message.content;
	assert.match(trustedText, /Project trusted: yes/);
	assert.match(trustedText, /Repository: owner\/repo/);
	assert.match(trustedText, /Token: present \(project-env:GH_TOKEN\)/);
	assert.match(trustedText, /Issue directory: custom-cache/);
	assert.match(trustedText, /Cached open issue files: 1/);
}));

test("/issueme info exercises a safe non-TUI command path without project secrets", async () => withCleanGitHubEnv(async () => {
	const root = await tempProject();
	const pi = fakePi();
	registerIssueMeCommand(pi);
	await pi.commands.get("issueme").handler("info", fakeCtx(root, { mode: "json", hasUI: false }));
	assert.equal(pi.messages.length, 1);
	const text = pi.messages[0].message.content;
	assert.match(text, /Project trusted: yes/);
	assert.match(text, /Repository: owner\/repo/);
	assert.match(text, /Token: missing/);
	assert.match(text, /Default skill path: not set/);
	assert.equal(pi.messages[0].message.details.tokenPresent, false);
	assert.doesNotMatch(text, /project-secret|process-secret/);
}));

test("/issueme info reports unreadable trusted .env as token status error without throwing", async () => withCleanGitHubEnv(async () => {
	const root = await tempProject();
	await mkdir(join(root, ".env"));
	process.env.GH_TOKEN = "process-secret";
	const pi = fakePi();
	registerIssueMeCommand(pi);
	await pi.commands.get("issueme").handler("info", fakeCtx(root));
	const text = pi.messages[0].message.content;
	assert.match(text, /Token: error/);
	assert.match(text, /Project \.env could not be read/);
	assert.doesNotMatch(text, /process-secret/);
}));

test("untrusted /issueme commands refuse project-local config and skill path handling", async () => withCleanGitHubEnv(async () => {
	const root = await tempProject();
	await mkdir(join(root, ".pi", "agent"), { recursive: true });
	await writeFile(join(root, ".pi", "agent", "issueme.json"), `${JSON.stringify(sampleConfig({ issueDirectory: "custom-cache" }), null, 2)}\n`, "utf8");
	await mkdir(join(root, "skills"), { recursive: true });
	await writeFile(join(root, "skills", "SKILL.md"), "# Skill\n", "utf8");

	const pi = fakePi();
	registerIssueMeCommand(pi);
	await pi.commands.get("issueme").handler("", fakeCtx(root, { isProjectTrusted: () => false }));
	assert.match(pi.messages[0].message.content, /project is not trusted/);
	assert.doesNotMatch(pi.messages[0].message.content, /custom-cache/);
	await assert.rejects(
		() => pi.commands.get("issueme").handler("start skills/SKILL.md", fakeCtx(root, { isProjectTrusted: () => false })),
		(error) => error?.code === "project_untrusted" && /require[s]? project trust/.test(error.message),
	);
}));

test("IssueMe tools require project trust before project-local reads", async () => withCleanGitHubEnv(async () => {
	const root = await tempProject();
	await writeFile(join(root, ".env"), "GH_TOKEN=project-secret\n", "utf8");
	const pi = fakePi();
	registerIssueMeTools(pi);
	const paramsByTool = {
		issueme_sync_issues: {},
		issueme_list_issues: {},
		issueme_list_labels: {},
		issueme_list_milestones: {},
		issueme_list_assignees: {},
		issueme_list_projects: {},
		issueme_get_project_fields: { projectNumber: 1 },
		issueme_add_issue_to_project: { issueNumber: 1, projectId: "PVT_1" },
		issueme_update_project_item: { projectId: "PVT_1", itemId: "PVTI_1", issueNumber: 1, fieldId: "PVTSSF_status", valueType: "single_select", singleSelectOptionId: "opt_todo" },
		issueme_manage_label: { action: "create", name: "triage", color: "d73a4a" },
		issueme_manage_milestone: { action: "create", title: "v1.0" },
		issueme_create_issue: { title: "New issue", body: "Body" },
		issueme_create_sub_issue: { parentNumber: 1, title: "New sub-issue", body: "Body" },
		issueme_add_sub_issue: { parentNumber: 1, childNumber: 2 },
		issueme_remove_sub_issue: { parentNumber: 1, childNumber: 2 },
		issueme_reorder_sub_issues: { parentNumber: 1, orderedChildNumbers: [2, 3] },
		issueme_list_sub_issues: { issueNumber: 1 },
		issueme_list_issue_development_links: { issueNumber: 1 },
		issueme_get_issue: { number: 1 },
		issueme_update_issue: { number: 1, title: "Updated" },
		issueme_comment_issue: { number: 1, body: "Progress note" },
		issueme_update_comment: { issueNumber: 1, commentId: 1, body: "Corrected progress note" },
		issueme_delete_comment: { issueNumber: 1, commentId: 1 },
		issueme_assign_issue: { number: 1, action: "add", assignees: ["octocat"] },
		issueme_label_issue: { number: 1, action: "add", labels: ["bug"] },
		issueme_reopen_issue: { number: 1 },
		issueme_close_issue: { number: 1 },
		issueme_bulk_update_issues: { issueNumbers: [1], action: "add_labels", labels: ["bug"] },
	};
	for (const [name, params] of Object.entries(paramsByTool)) {
		await assert.rejects(
			() => pi.tools.get(name).execute("call", params, undefined, () => {}, fakeCtx(root, { isProjectTrusted: () => false })),
			(error) => error?.code === "project_untrusted" && /require[s]? project trust/.test(error.message),
			`${name} should reject untrusted projects before token/repository/cache work`,
		);
	}
}));

test("configuration TUI renderer follows wide, narrow, and tiny width modes", () => {
	for (const width of [80, 40, 20]) {
		const lines = renderConfigTuiSnapshot("/tmp/project", sampleConfig({ defaultLabels: ["bug", "agent-ready"] }), width);
		for (const line of lines) assert.ok(line.length <= width, `line exceeds ${width}: ${line}`);
		assert.match(lines.join("\n"), /Configuration/);
	}
	const wide = renderConfigTuiSnapshot("/tmp/project", sampleConfig(), 80);
	assert.match(wide.join("\n"), /┬/);
	assert.match(wide.join("\n"), /▶/);
	const tiny = renderConfigTuiSnapshot("/tmp/project", sampleConfig(), 20);
	assert.equal(tiny.length, 4);
	assert.doesNotMatch(tiny.join("\n"), /╭|╰/);
});

test("configuration TUI handles search, edit, save, cancel, and validation states", async () => {
	const root = await tempProject();
	const saved = [];
	const component = new IssueMeConfigTui(root, sampleConfig(), { fg: (_role, text) => text, bold: (text) => text }, (result) => saved.push(result));
	component.handleInput("\t");
	component.handleInput("\r");
	for (const char of "cache") component.handleInput(char);
	component.handleInput("\r");
	component.handleInput("s");
	assert.equal(saved.at(-1).issueDirectory, "issuescache");

	const invalid = new IssueMeConfigTui(root, sampleConfig(), { fg: (_role, text) => text, bold: (text) => text }, (result) => saved.push(result));
	invalid.handleInput("\t");
	invalid.handleInput("\r");
	for (let index = 0; index < "issues".length; index += 1) invalid.handleInput("\x7f");
	for (const char of "../bad") invalid.handleInput(char);
	invalid.handleInput("\r");
	assert.match(invalid.render(80).join("\n"), /path traversal|current project|protected/);

	const closed = [];
	const search = new IssueMeConfigTui(root, sampleConfig(), { fg: (_role, text) => text, bold: (text) => text }, (result) => closed.push(result));
	search.handleInput("/");
	for (const char of "labels") search.handleInput(char);
	assert.match(search.render(80).join("\n"), /SEARCH LABELS/);
	search.handleInput("\u001b");
	assert.doesNotMatch(search.render(80).join("\n"), /SEARCH LABELS/);
	assert.equal(closed.length, 0);
});

test("non-TUI /issueme config path sends actionable config text without opening an editor", async () => {
	const root = await tempProject();
	for (const mode of ["json", "print"]) {
		const pi = fakePi();
		registerIssueMeCommand(pi);
		await pi.commands.get("issueme").handler("", fakeCtx(root, { mode }));
		assert.equal(pi.messages.length, 1);
		assert.match(pi.messages[0].message.content, /interactive only in TUI mode/);
		assert.match(pi.messages[0].message.content, /Current config/);
	}
});

test("/issueme config never opens custom TUI outside terminal-capable UI contexts", async () => {
	const root = await tempProject();
	const pi = fakePi();
	registerIssueMeCommand(pi);
	let customCalled = false;
	await pi.commands.get("issueme").handler("", fakeCtx(root, {
		mode: "rpc",
		hasUI: true,
		ui: {
			notify() {},
			custom() {
				customCalled = true;
				throw new Error("custom TUI should not open in RPC mode");
			},
		},
	}));
	assert.equal(customCalled, false);
	assert.match(pi.messages[0].message.content, /interactive only in TUI mode/);

	const noUiPi = fakePi();
	registerIssueMeCommand(noUiPi);
	await noUiPi.commands.get("issueme").handler("", fakeCtx(root, {
		mode: "tui",
		hasUI: false,
		ui: {
			notify() {},
			custom() {
				customCalled = true;
				throw new Error("custom TUI should not open without UI support");
			},
		},
	}));
	assert.equal(customCalled, false);
	assert.match(noUiPi.messages[0].message.content, /needs UI support/);
});

test("/issueme config uses custom TUI and notifications when TUI UI is available", async () => {
	const root = await tempProject();
	const pi = fakePi();
	registerIssueMeCommand(pi);
	const notifications = [];
	let customCalled = false;
	await pi.commands.get("issueme").handler("", fakeCtx(root, {
		mode: "tui",
		hasUI: true,
		ui: {
			notify(message, level) { notifications.push({ message, level }); },
			async custom(factory) {
				customCalled = true;
				const component = factory({ requestRender() {} }, { fg: (_role, text) => text, bold: (text) => text }, {}, () => {});
				assert.equal(typeof component.render, "function");
				return sampleConfig({ defaultLabels: ["triaged"] });
			},
		},
	}));
	assert.equal(customCalled, true);
	assert.equal(notifications.at(-1).message, "IssueMe config saved.");
	assert.equal(notifications.at(-1).level, "info");
	assert.equal(pi.messages.length, 1);
	assert.match(pi.messages[0].message.content, /config saved/);
	const saved = JSON.parse(await readFile(join(root, ".pi", "agent", "issueme.json"), "utf8"));
	assert.deepEqual(saved.defaultLabels, ["triaged"]);
});

test("/issueme config validates custom TUI results before saving", async () => {
	const root = await tempProject();
	const pi = fakePi();
	registerIssueMeCommand(pi);
	const notifications = [];
	await assert.rejects(
		() => pi.commands.get("issueme").handler("", fakeCtx(root, {
			mode: "tui",
			hasUI: true,
			ui: {
				notify(message, level) { notifications.push({ message, level }); },
				async custom() { return sampleConfig({ issueDirectory: "../outside" }); },
			},
		})),
		(error) => error?.code === "unsafe_issue_directory" && /path traversal/.test(error.message),
	);
	assert.equal(pi.messages.length, 0);
	assert.equal(notifications.at(-1).level, "error");
	assert.match(notifications.at(-1).message, /config not saved/);
	await assert.rejects(
		() => readFile(join(root, ".pi", "agent", "issueme.json"), "utf8"),
		(error) => error?.code === "ENOENT",
	);
});
