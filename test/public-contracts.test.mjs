import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { ISSUEME_COMMAND_CONTRACTS, ISSUEME_TOOL_CONTRACTS } from "../src/contracts.ts";
import { registerIssueMeTools } from "../src/tools/issueme-tools.ts";
import { ISSUEME_TOOL_NAMES } from "../src/tools/inventory.ts";

const DISCOVERY_CONTRACT_NAMES = [
	"issueme_list_labels",
	"issueme_list_milestones",
	"issueme_list_assignees",
	"issueme_list_projects",
];

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerTool(tool) { tools.set(tool.name, tool); },
	};
}

test("public tool contract matrix covers every registered IssueMe tool in inventory order", () => {
	assert.deepEqual(ISSUEME_TOOL_CONTRACTS.map((contract) => contract.name), [...ISSUEME_TOOL_NAMES]);
	for (const contract of ISSUEME_TOOL_CONTRACTS) {
		assert.equal(contract.trustRequired, true, `${contract.name} must document the trust gate`);
		assert.ok(contract.githubApi.length > 0, `${contract.name} must document GitHub API family`);
		assert.ok(contract.localSideEffects.length > 0, `${contract.name} must document local side effects`);
		assert.ok(contract.validationGates.length > 0, `${contract.name} must document validation gates`);
		assert.ok(contract.resultPolicy.length > 0, `${contract.name} must document result/failure policy`);
		assert.ok(contract.coverage.length > 0, `${contract.name} must document focused coverage`);
	}
});

test("public discovery contracts distinguish valid empty collections from malformed members", () => {
	for (const name of DISCOVERY_CONTRACT_NAMES) {
		const contract = ISSUEME_TOOL_CONTRACTS.find((candidate) => candidate.name === name);
		assert.ok(contract, `${name} must have a public contract`);
		assert.equal(contract.validationGates.some((gate) => /collection member identity shape/i.test(gate)), true);
		assert.match(contract.resultPolicy, /malformed/);
		assert.match(contract.resultPolicy, /valid empty/);
	}
});

test("public tool contract execution modes match actual Pi registrations", () => {
	const pi = fakePi();
	registerIssueMeTools(pi);
	for (const contract of ISSUEME_TOOL_CONTRACTS) {
		const tool = pi.tools.get(contract.name);
		assert.ok(tool, `${contract.name} must be registered`);
		assert.equal(tool.executionMode ?? "parallel", contract.executionMode, `${contract.name} executionMode contract drifted`);
	}
});

test("public command contract matrix covers /issueme command variants", () => {
	assert.deepEqual(ISSUEME_COMMAND_CONTRACTS.map((contract) => contract.command), ["/issueme", "/issueme info/help", "/issueme start [skill-path]"]);
	for (const contract of ISSUEME_COMMAND_CONTRACTS) {
		assert.ok(contract.sideEffects.length > 0, `${contract.command} must document side effects`);
		assert.ok(contract.trustRequirement.length > 0, `${contract.command} must document trust behavior`);
		assert.ok(contract.modeBehavior.length > 0, `${contract.command} must document mode behavior`);
		assert.ok(contract.resultPolicy.length > 0, `${contract.command} must document result/failure policy`);
		assert.ok(contract.coverage.length > 0, `${contract.command} must document focused coverage`);
	}
});

test("public contract documentation points to the machine-readable matrix and lists all tool names", async () => {
	const text = await readFile(new URL("../docs/public-contracts.md", import.meta.url), "utf8");
	assert.match(text, /src\/contracts\.ts/);
	assert.match(text, /Result and failure signaling policy/);
	for (const toolName of ISSUEME_TOOL_NAMES) {
		assert.ok(text.includes(`\`${toolName}\``), `${toolName} must be listed in docs/public-contracts.md`);
	}
});
