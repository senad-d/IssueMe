import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import issueMeExtension from "../src/extension.ts";
import { BULK_ISSUE_ACTION_FIELDS, BULK_ISSUE_COMMON_FIELDS } from "../src/tools/bulk-issues.ts";
import { ISSUEME_TOOL_NAMES } from "../src/tools/inventory.ts";
import { MANAGE_LABEL_ACTION_FIELDS, MANAGE_LABEL_COMMON_FIELDS } from "../src/tools/manage-label.ts";
import { MANAGE_MILESTONE_ACTION_FIELDS, MANAGE_MILESTONE_COMMON_FIELDS } from "../src/tools/manage-milestone.ts";
import { UPDATE_PROJECT_ITEM_COMMON_FIELDS, UPDATE_PROJECT_ITEM_VALUE_FIELDS } from "../src/tools/projects.ts";

const expectedTools = [...ISSUEME_TOOL_NAMES];

const sequentialTools = [
	"issueme_sync_issues",
	"issueme_list_sub_issues",
	"issueme_get_issue",
	"issueme_add_issue_to_project",
	"issueme_update_project_item",
	"issueme_manage_label",
	"issueme_manage_milestone",
	"issueme_create_issue",
	"issueme_create_sub_issue",
	"issueme_add_sub_issue",
	"issueme_remove_sub_issue",
	"issueme_reorder_sub_issues",
	"issueme_update_issue",
	"issueme_comment_issue",
	"issueme_update_comment",
	"issueme_delete_comment",
	"issueme_assign_issue",
	"issueme_label_issue",
	"issueme_reopen_issue",
	"issueme_close_issue",
	"issueme_bulk_update_issues",
];

const perIssueMutationTools = [
	"issueme_add_issue_to_project",
	"issueme_update_project_item",
	"issueme_create_sub_issue",
	"issueme_add_sub_issue",
	"issueme_remove_sub_issue",
	"issueme_reorder_sub_issues",
	"issueme_update_issue",
	"issueme_comment_issue",
	"issueme_update_comment",
	"issueme_delete_comment",
	"issueme_assign_issue",
	"issueme_label_issue",
	"issueme_reopen_issue",
	"issueme_close_issue",
	"issueme_bulk_update_issues",
];

function fakePi() {
	const commands = new Map();
	const tools = new Map();
	const commandRegistrations = [];
	const toolRegistrations = [];
	return {
		commands,
		tools,
		commandRegistrations,
		toolRegistrations,
		registerCommand(name, options) {
			commandRegistrations.push({ name, options });
			commands.set(name, options);
		},
		registerTool(tool) {
			toolRegistrations.push(tool);
			tools.set(tool.name, tool);
		},
	};
}

test("extension registers one /issueme command and all IssueMe tools", () => {
	const pi = fakePi();
	issueMeExtension(pi);
	assert.deepEqual(pi.commandRegistrations.map(({ name }) => name), ["issueme"]);
	assert.deepEqual([...pi.commands.keys()], ["issueme"]);
	assert.deepEqual(pi.toolRegistrations.map(({ name }) => name), expectedTools);
	assert.deepEqual([...pi.tools.keys()], expectedTools);
});

test("all IssueMe tools expose prompt metadata and strict schemas", () => {
	const pi = fakePi();
	issueMeExtension(pi);
	for (const name of expectedTools) {
		const tool = pi.tools.get(name);
		assert.ok(tool.description, `${name} missing description`);
		assert.ok(tool.promptSnippet, `${name} missing promptSnippet`);
		assert.ok(tool.promptGuidelines?.length, `${name} missing promptGuidelines`);
		assert.ok(tool.promptGuidelines.every((guideline) => guideline.includes(name)), `${name} guidelines must name the tool`);
		assert.equal(tool.parameters.additionalProperties, false, `${name} schema should be strict`);
	}
});

test("all IssueMe tools expose result-policy prompt guidance", () => {
	const pi = fakePi();
	issueMeExtension(pi);
	for (const name of expectedTools) {
		const guidelines = pi.tools.get(name)?.promptGuidelines ?? [];
		const guideline = guidelines.find((entry) => entry.includes(`${name}: check details.result`));
		assert.ok(guideline, `${name} missing result-policy prompt guidance`);
		assert.match(guideline, /details\.status/);
		assert.match(guideline, /details\.needsSync/);
		assert.match(guideline, /partial_success\/error may not throw/);
	}
});

test("mutating and cache-refresh IssueMe tools request sequential execution to avoid same-issue races", () => {
	const pi = fakePi();
	issueMeExtension(pi);
	for (const name of sequentialTools) {
		assert.equal(pi.tools.get(name).executionMode, "sequential", `${name} should execute sequentially`);
	}
	for (const name of perIssueMutationTools) {
		assert.equal(pi.tools.get(name).executionMode, "sequential", `${name} must order remote mutations for the same issue`);
	}
});

test("native issue dependency/blocker support remains a documented unsupported decision", () => {
	const pi = fakePi();
	issueMeExtension(pi);
	assert.deepEqual(
		[...pi.tools.keys()].filter((name) => /depend|block/i.test(name)),
		[],
	);

	const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
	assert.match(readme, /Issue dependencies and blockers/);
	assert.match(readme, /no stable native GitHub REST or GraphQL API/i);
	assert.match(readme, /does not create body-only/i);
});

test("action/value-specific normalizer field policies stay in parity with registered schemas", () => {
	const pi = fakePi();
	issueMeExtension(pi);
	const policies = [
		{
			toolName: "issueme_bulk_update_issues",
			discriminator: "action",
			commonFields: BULK_ISSUE_COMMON_FIELDS,
			fieldsByValue: BULK_ISSUE_ACTION_FIELDS,
		},
		{
			toolName: "issueme_update_project_item",
			discriminator: "valueType",
			commonFields: UPDATE_PROJECT_ITEM_COMMON_FIELDS,
			fieldsByValue: UPDATE_PROJECT_ITEM_VALUE_FIELDS,
		},
		{
			toolName: "issueme_manage_label",
			discriminator: "action",
			commonFields: MANAGE_LABEL_COMMON_FIELDS,
			fieldsByValue: MANAGE_LABEL_ACTION_FIELDS,
		},
		{
			toolName: "issueme_manage_milestone",
			discriminator: "action",
			commonFields: MANAGE_MILESTONE_COMMON_FIELDS,
			fieldsByValue: MANAGE_MILESTONE_ACTION_FIELDS,
		},
	];

	for (const policy of policies) {
		const tool = pi.tools.get(policy.toolName);
		const schemaProperties = sortedUnique(Object.keys(tool.parameters.properties));
		const acceptedProperties = sortedUnique([
			...policy.commonFields,
			...Object.values(policy.fieldsByValue).flat(),
		]);
		assert.deepEqual(acceptedProperties, schemaProperties, `${policy.toolName} schema properties must match normalizer accepted fields`);
		assert.deepEqual(sortedUnique(Object.keys(policy.fieldsByValue)), sortedUnique(tool.parameters.properties[policy.discriminator].enum), `${policy.toolName} discriminator values must match field policy keys`);
		for (const [value, fields] of Object.entries(policy.fieldsByValue)) {
			for (const field of fields) {
				assert.ok(tool.parameters.properties[field], `${policy.toolName} policy for ${value} references missing schema field ${field}`);
			}
		}
	}
});

test("tool schemas avoid provider-hostile union, literal, and nullable patterns", () => {
	const pi = fakePi();
	issueMeExtension(pi);
	for (const tool of pi.tools.values()) {
		assert.deepEqual(collectForbiddenSchemaPatterns(tool.parameters), [], `${tool.name} contains provider-hostile schema patterns`);
	}

	assert.deepEqual(pi.tools.get("issueme_assign_issue").parameters.properties.action.enum, ["add", "remove", "set"]);
	assert.deepEqual(pi.tools.get("issueme_label_issue").parameters.properties.action.enum, ["add", "remove", "set"]);
	assert.deepEqual(pi.tools.get("issueme_list_milestones").parameters.properties.state.enum, ["open", "closed", "all"]);
	assert.deepEqual(pi.tools.get("issueme_list_milestones").parameters.properties.sort.enum, ["due_on", "completeness"]);
	assert.deepEqual(pi.tools.get("issueme_list_projects").parameters.properties.scope.enum, ["repository", "organization", "user"]);
	assert.deepEqual(pi.tools.get("issueme_get_project_fields").parameters.properties.scope.enum, ["repository", "organization", "user"]);
	assert.deepEqual(pi.tools.get("issueme_add_issue_to_project").parameters.properties.scope.enum, ["repository", "organization", "user"]);
	assert.deepEqual(pi.tools.get("issueme_update_project_item").parameters.properties.valueType.enum, ["single_select", "iteration", "date", "text", "number"]);
	assert.equal(pi.tools.get("issueme_add_issue_to_project").parameters.properties.issueNumber.type, "integer");
	assert.equal(pi.tools.get("issueme_update_project_item").parameters.properties.issueNumber.type, "integer");
	assert.equal(pi.tools.get("issueme_update_project_item").parameters.properties.numberValue.type, "number");
	assert.deepEqual(pi.tools.get("issueme_manage_label").parameters.properties.action.enum, ["create", "update", "delete"]);
	assert.deepEqual(pi.tools.get("issueme_manage_milestone").parameters.properties.action.enum, ["create", "update", "close", "reopen", "delete"]);
	assert.deepEqual(pi.tools.get("issueme_close_issue").parameters.properties.reason.enum, ["completed", "not_planned"]);
	assert.deepEqual(pi.tools.get("issueme_bulk_update_issues").parameters.properties.action.enum, ["add_labels", "assign", "set_milestone", "add_to_project", "close"]);
	assert.deepEqual(pi.tools.get("issueme_bulk_update_issues").parameters.properties.reason.enum, ["completed", "not_planned"]);
	assert.equal(pi.tools.get("issueme_bulk_update_issues").parameters.properties.issueNumbers.maxItems, 50);
	assert.equal(pi.tools.get("issueme_update_comment").parameters.properties.issueNumber.type, "integer");
	assert.equal(pi.tools.get("issueme_update_comment").parameters.properties.commentId.type, "integer");
	assert.equal(pi.tools.get("issueme_delete_comment").parameters.properties.issueNumber.type, "integer");
	assert.equal(pi.tools.get("issueme_delete_comment").parameters.properties.commentId.type, "integer");
	assert.equal(pi.tools.get("issueme_update_issue").parameters.properties.milestone, undefined);
	assert.equal(pi.tools.get("issueme_update_issue").parameters.properties.milestoneNumber.type, "integer");
	assert.equal(pi.tools.get("issueme_update_issue").parameters.properties.clearMilestone.type, "boolean");
});

function sortedUnique(values) {
	return [...new Set(values)].sort();
}

function collectForbiddenSchemaPatterns(value, path = "$") {
	if (!value || typeof value !== "object") return [];
	const failures = [];
	for (const combiner of ["anyOf", "oneOf", "allOf"]) {
		if (Array.isArray(value[combiner])) failures.push(`${path}.${combiner}`);
	}
	if (Object.hasOwn(value, "const")) failures.push(`${path}.const`);
	if (value.type === "null") failures.push(`${path}.type:null`);
	if (Array.isArray(value.type) && value.type.includes("null")) failures.push(`${path}.type:null`);
	if (Array.isArray(value.enum) && value.enum.includes(null)) failures.push(`${path}.enum:null`);
	for (const [key, child] of Object.entries(value)) {
		if (typeof child === "object" && child !== null) failures.push(...collectForbiddenSchemaPatterns(child, `${path}.${key}`));
	}
	return failures;
}
