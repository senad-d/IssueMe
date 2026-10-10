import assert from "node:assert/strict";
import test from "node:test";

import { buildIssueDevelopmentLinksQuery } from "../src/github/development-links-client.ts";
import {
	buildAddIssueToProjectV2Mutation,
	buildArchiveProjectV2ItemMutation,
	buildClearProjectV2ItemFieldValueMutation,
	buildDeleteProjectV2ItemMutation,
	buildMoveProjectV2ItemMutation,
	buildProjectV2AddValidationQuery,
	buildProjectV2FieldsByIdQuery,
	buildProjectV2FieldsByNumberQuery,
	buildProjectV2FieldValidationQuery,
	buildProjectV2ItemByIdQuery,
	buildProjectV2ItemByIssueQuery,
	buildProjectV2ItemFieldValueValidationQuery,
	buildProjectV2ItemsByIdQuery,
	buildProjectV2ItemsByNumberQuery,
	buildProjectV2ItemValidationQuery,
	buildProjectsV2ListQuery,
	buildUpdateProjectV2ItemFieldValueMutation,
} from "../src/github/projects-client.ts";
import { buildSubIssueRelationshipsQuery } from "../src/github/sub-issues-client.ts";

/**
 * Mocks never parse GraphQL, so two live-only failures slipped through on 2026-10-10: a fragment definition nested
 * inside a query body ("Field 'fragment' doesn't exist on type 'Query'") and a fragment spread on a type the parent
 * interface does not implement. This test checks the document structure every builder produces without a parser.
 */

function documents() {
	const scopes = ["repository", "organization", "user"];
	return [
		...scopes.map((scope) => [`buildProjectsV2ListQuery(${scope})`, buildProjectsV2ListQuery(scope)]),
		["buildProjectV2FieldsByIdQuery", buildProjectV2FieldsByIdQuery()],
		...scopes.map((scope) => [`buildProjectV2FieldsByNumberQuery(${scope})`, buildProjectV2FieldsByNumberQuery(scope)]),
		["buildProjectV2ItemsByIdQuery", buildProjectV2ItemsByIdQuery()],
		...scopes.map((scope) => [`buildProjectV2ItemsByNumberQuery(${scope})`, buildProjectV2ItemsByNumberQuery(scope)]),
		["buildProjectV2ItemByIdQuery", buildProjectV2ItemByIdQuery()],
		["buildProjectV2ItemByIssueQuery", buildProjectV2ItemByIssueQuery()],
		["buildProjectV2AddValidationQuery", buildProjectV2AddValidationQuery()],
		["buildAddIssueToProjectV2Mutation", buildAddIssueToProjectV2Mutation()],
		["buildUpdateProjectV2ItemFieldValueMutation", buildUpdateProjectV2ItemFieldValueMutation()],
		["buildProjectV2ItemValidationQuery", buildProjectV2ItemValidationQuery()],
		["buildProjectV2ItemFieldValueValidationQuery", buildProjectV2ItemFieldValueValidationQuery()],
		["buildProjectV2FieldValidationQuery", buildProjectV2FieldValidationQuery()],
		["buildDeleteProjectV2ItemMutation", buildDeleteProjectV2ItemMutation()],
		["buildClearProjectV2ItemFieldValueMutation", buildClearProjectV2ItemFieldValueMutation()],
		["buildArchiveProjectV2ItemMutation(archive)", buildArchiveProjectV2ItemMutation("archive")],
		["buildArchiveProjectV2ItemMutation(unarchive)", buildArchiveProjectV2ItemMutation("unarchive")],
		["buildMoveProjectV2ItemMutation", buildMoveProjectV2ItemMutation()],
		["buildIssueDevelopmentLinksQuery", buildIssueDevelopmentLinksQuery()],
		["buildSubIssueRelationshipsQuery", buildSubIssueRelationshipsQuery()],
	];
}

/** Brace depth at each character offset; GraphQL documents here contain no string literals with braces. */
function depthAt(document, offset) {
	let depth = 0;
	for (let index = 0; index < offset; index++) {
		if (document[index] === "{") depth += 1;
		else if (document[index] === "}") depth -= 1;
	}
	return depth;
}

test("every GraphQL document balances braces and starts with exactly one operation definition", () => {
	for (const [name, document] of documents()) {
		assert.equal(depthAt(document, document.length), 0, `${name} has unbalanced braces`);
		assert.match(document.trimStart(), /^(query|mutation) IssueMe[A-Za-z0-9]+/, `${name} must start with a named IssueMe operation`);
		assert.equal((document.match(/^\s*(query|mutation) /gm) ?? []).length, 1, `${name} must define one operation`);
	}
});

test("every fragment definition sits at the top level, is defined once, and is actually spread", () => {
	for (const [name, document] of documents()) {
		const definitions = [...document.matchAll(/\bfragment (IssueMe[A-Za-z0-9]+) on ([A-Za-z0-9]+)/g)];
		const names = definitions.map((match) => match[1]);
		assert.deepEqual(names, [...new Set(names)], `${name} defines a fragment twice: ${names.join(", ")}`);
		for (const match of definitions) {
			assert.equal(depthAt(document, match.index), 0, `${name}: fragment ${match[1]} is nested inside a selection set`);
		}
		const spreads = [...document.matchAll(/\.\.\.(IssueMe[A-Za-z0-9]+)/g)].map((match) => match[1]);
		for (const spread of spreads) assert.ok(names.includes(spread), `${name} spreads undefined fragment ${spread}`);
		for (const defined of names) assert.ok(spreads.includes(defined), `${name} defines unused fragment ${defined}`);
	}
});

test("ProjectV2 owner selections only name types that implement ProjectV2Owner", () => {
	for (const [name, document] of documents()) {
		const owner = document.match(/owner \{\s*__typename([\s\S]*?)\n\s*\}\n/);
		if (!owner) continue;
		const typed = [...owner[1].matchAll(/\.\.\. on ([A-Za-z0-9]+)/g)].map((match) => match[1]).sort();
		assert.deepEqual(typed, ["Organization", "User"], `${name}: ProjectV2Owner is implemented by Organization and User only`);
	}
});
