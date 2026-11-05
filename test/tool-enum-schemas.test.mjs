import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { Type } from "typebox";
import { Value } from "typebox/value";

import { registerIssueMeTools } from "../src/tools/issueme-tools.ts";

const scope = ["repository", "organization", "user"];
const closeReasons = ["completed", "not_planned"];
const enumFields = [
	["issueme_get_overview", "sections", ["issues", "labels", "milestones", "assignees", "projects"], false, undefined, true],
	["issueme_list_issues", "state", ["open", "closed", "all"], false, "Issue state. Default open."],
	["issueme_list_issues", "sort", ["created", "updated", "comments"], false, "Sort field."],
	["issueme_list_issues", "direction", ["asc", "desc"], false, "Sort direction."],
	["issueme_list_milestones", "state", ["open", "closed", "all"], false, "Milestone state. Default open."],
	["issueme_list_milestones", "sort", ["due_on", "completeness"], false, "Sort field."],
	["issueme_list_milestones", "direction", ["asc", "desc"], false, "Sort direction."],
	["issueme_list_projects", "scope", scope, false, "Owner scope. Default repository."],
	["issueme_get_project_fields", "scope", scope, false, "Owner scope. Default repository."],
	["issueme_add_issue_to_project", "scope", scope, false, "Owner scope. Default repository."],
	["issueme_update_project_item", "valueType", ["single_select", "iteration", "date", "text", "number"], true, "Field value type; IDs required for select/iteration."],
	["issueme_list_project_items", "scope", scope, false, "Owner scope. Default repository."],
	["issueme_archive_project_item", "action", ["archive", "unarchive"], true, "Archive or restore the item."],
	["issueme_manage_label", "action", ["create", "update", "delete"], true, "Label action."],
	["issueme_manage_milestone", "action", ["create", "update", "close", "reopen", "delete"], true, "Milestone action."],
	["issueme_list_issue_dependencies", "direction", ["blocked_by", "blocking", "both"], false, "Edge direction. Default both."],
	["issueme_assign_issue", "action", ["add", "remove", "set"], true, "Assignment action; set [] clears all."],
	["issueme_label_issue", "action", ["add", "remove", "set"], true, "Label action; set [] clears all."],
	["issueme_close_issue", "reason", closeReasons, false, "Close reason; omit for GitHub default."],
	["issueme_bulk_update_issues", "action", ["add_labels", "remove_labels", "assign", "unassign", "set_milestone", "clear_milestone", "add_to_project", "close", "reopen"], true, "Bulk action."],
	["issueme_bulk_update_issues", "reason", closeReasons, false, "Close reason for close; omit for default."],
];

function registeredTools() {
	const tools = new Map();
	registerIssueMeTools({ registerTool(tool) { tools.set(tool.name, tool); } });
	return tools;
}

// Inspect the actual contextual execute parameter types, without exporting private schemas
// or reproducing their definitions in a separate TypeScript fixture.
function collectExecuteParams(node, checker, params) {
	if (ts.isCallExpression(node) && node.expression.getText() === "defineTool") {
		const definition = node.arguments[0];
		const name = definition.properties.find((property) => property.name?.getText() === "name");
		const execute = definition.properties.find((property) => property.name?.getText() === "execute");
		params.set(name.initializer.text, checker.getTypeAtLocation(execute.parameters[1]));
	}
	ts.forEachChild(node, (child) => collectExecuteParams(child, checker, params));
}

function executeParamTypes() {
	const configPath = fileURLToPath(new URL("../tsconfig.json", import.meta.url));
	const config = ts.readConfigFile(configPath, ts.sys.readFile);
	assert.equal(config.error, undefined);
	const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, fileURLToPath(new URL("../", import.meta.url)));
	assert.deepEqual(parsed.errors, []);
	const program = ts.createProgram(parsed.fileNames, parsed.options);
	const checker = program.getTypeChecker();
	const params = new Map();
	for (const source of program.getSourceFiles()) {
		if (!source.isDeclarationFile && source.fileName.includes("/src/tools/")) collectExecuteParams(source, checker, params);
	}
	return { checker, params };
}

test("all registered enum fields preserve their literal handler parameter types", () => {
	const { checker, params } = executeParamTypes();
	for (const [name, field, values, required, , array] of enumFields) {
		const label = `${name}.${field}`;
		const propertyType = checker.getTypeOfPropertyOfType(params.get(name), field);
		assert.ok(propertyType, label);
		const members = propertyType.isUnion() ? propertyType.types : [propertyType];
		assert.equal(members.some((member) => member.flags === ts.TypeFlags.Undefined), !required, `${label} optionality`);
		const valueType = array
			? checker.getIndexTypeOfType(checker.getNonNullableType(propertyType), ts.IndexKind.Number)
			: propertyType;
		const literals = (valueType.isUnion() ? valueType.types : [valueType]).filter((member) => member.flags !== ts.TypeFlags.Undefined);
		assert.ok(literals.every((member) => member.isStringLiteral()), `${label} must be a literal union, got ${checker.typeToString(valueType)}`);
		assert.deepEqual(literals.map((member) => member.value).sort(), [...values].sort(), label);
	}
});

test("registered enum schemas keep their JSON shape, values, and required fields", () => {
	const tools = registeredTools();
	const actualFields = [];
	for (const tool of tools.values()) {
		for (const [field, property] of Object.entries(tool.parameters.properties)) {
			if ((property.items ?? property).enum) actualFields.push(`${tool.name}.${field}`);
		}
	}
	assert.deepEqual(actualFields, enumFields.map(([name, field]) => `${name}.${field}`));
	for (const [name, field, values, required, description, array] of enumFields) {
		const parameters = tools.get(name).parameters;
		const property = parameters.properties[field];
		const schema = array ? property.items : property;
		assert.deepEqual(JSON.parse(JSON.stringify(schema)), {
			type: "string",
			enum: values,
			...(description === undefined ? {} : { description }),
		}, `${name}.${field}`);
		assert.equal(parameters.required?.includes(field) ?? false, required, `${name}.${field} required`);
		const fieldSchema = Type.Object({ [field]: property });
		assert.equal(Value.Check(fieldSchema, {}), !required, `${name}.${field} omission`);
		for (const value of values) assert.equal(Value.Check(fieldSchema, { [field]: array ? [value] : value }), true, `${name}.${field} accepts ${value}`);
		for (const value of ["invalid", "", null, 1, true, {}]) {
			assert.equal(Value.Check(fieldSchema, { [field]: array ? [value] : value }), false, `${name}.${field} rejects ${JSON.stringify(value)}`);
		}
	}
});

test("overview enum arrays retain their bounds and uniqueness validation", () => {
	const schema = registeredTools().get("issueme_get_overview").parameters;
	assert.equal(Value.Check(schema, {}), true);
	assert.equal(Value.Check(schema, { sections: ["issues", "labels", "milestones", "assignees", "projects"] }), true);
	for (const sections of [[], ["issues", "issues"], ["issues", "labels", "milestones", "assignees", "projects", "issues"], "issues"]) {
		assert.equal(Value.Check(schema, { sections }), false);
	}
});
