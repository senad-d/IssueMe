import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ISSUEME_TOOL_NAMES } from "../src/tools/inventory.ts";

const execFileAsync = promisify(execFile);
const rootPath = fileURLToPath(new URL("../", import.meta.url));
const expectedTools = [...ISSUEME_TOOL_NAMES];

test("smoke discovery reports the IssueMe command and tools without invoking handlers", async () => {
	const { stdout } = await execFileAsync(process.execPath, ["scripts/smoke-observability.mjs", "--json"], {
		cwd: rootPath,
		env: { ...process.env, PI_OFFLINE: "1", NO_COLOR: "1" },
		timeout: 20000,
	});
	const report = JSON.parse(stdout);

	assert.equal(report.ok, true);
	assert.deepEqual(report.commandDiscovery.commands.map((command) => command.name), ["issueme"]);
	assert.deepEqual(report.toolDiscovery.tools.map((tool) => tool.name), expectedTools);
	assert.ok(report.toolDiscovery.tools.every((tool) => tool.hasPromptSnippet));
	assert.ok(report.toolDiscovery.tools.every((tool) => tool.schemaStrict));
	assert.equal(report.safety.handlersInvoked, false);
	assert.equal(report.safety.noLiveGitHubMutation, true);
});
