import assert from "node:assert/strict";
import test from "node:test";

import issueMeExtension from "../src/extension.ts";

const expectedDescriptions = new Map([
	["issueme_sync_issues", "Sync open issues to local cache; remove stale closed issue files."],
	["issueme_get_overview", "Read a compact repo overview of issues, labels, milestones, assignees, and projects."],
	["issueme_list_issues", "List/search repo issues with filters; read-only summaries."],
	["issueme_list_labels", "List/search repo labels with metadata."],
	["issueme_list_milestones", "List repo milestones with state, dates, and issue counts."],
	["issueme_list_assignees", "List users assignable to repo issues."],
	["issueme_list_issue_types", "List the organization's native issue types."],
	["issueme_list_issue_templates", "Read the repository's issue templates and forms."],
	["issueme_list_projects", "Discover Projects v2 boards for repo/org/user."],
	["issueme_get_project_fields", "List Projects v2 fields, options, and iterations."],
	["issueme_add_issue_to_project", "Add an open issue to a Projects v2 board."],
	["issueme_update_project_item", "Update one Projects v2 item field."],
	["issueme_list_project_items", "List Projects v2 items with current field values."],
	["issueme_get_project_item", "Read one Projects v2 item and its field values."],
	["issueme_remove_issue_from_project", "Remove one issue item from a Projects v2 board."],
	["issueme_clear_project_item_field", "Clear one Projects v2 item field value."],
	["issueme_archive_project_item", "Archive or unarchive one Projects v2 item."],
	["issueme_move_project_item", "Move one Projects v2 item to top or after another item."],
	["issueme_manage_label", "Create, update, or delete repo labels."],
	["issueme_manage_milestone", "Create, update, close, reopen, or delete milestones."],
	["issueme_create_issue", "Create repo issue and local cache file."],
	["issueme_create_sub_issue", "Create native sub-issue under a parent issue."],
	["issueme_add_sub_issue", "Attach existing issue as native sub-issue."],
	["issueme_remove_sub_issue", "Detach native sub-issue relationship."],
	["issueme_reorder_sub_issues", "Reorder native sub-issues under a parent issue."],
	["issueme_list_sub_issues", "Inspect native parent/sub-issue relationships."],
	["issueme_list_issue_development_links", "Inspect linked PRs, branches, commits, and references."],
	["issueme_list_issue_timeline", "Inspect bounded issue history events with actors."],
	["issueme_list_issue_dependencies", "Inspect native blocked-by/blocking issue dependencies."],
	["issueme_add_issue_dependency", "Mark an open issue as blocked by another open issue."],
	["issueme_remove_issue_dependency", "Remove a native blocked-by dependency between open issues."],
	["issueme_list_related_issues", "Inspect native related-issue links for one issue."],
	["issueme_add_related_issue", "Link two open issues as native related issues."],
	["issueme_remove_related_issue", "Remove a native related-issue link between open issues."],
	["issueme_get_issue", "Read cached issue or refresh known issue."],
	["issueme_update_issue", "Update open issue fields and refresh cache."],
	["issueme_comment_issue", "Comment on open issue and refresh cache."],
	["issueme_update_comment", "Edit verified comment on open issue."],
	["issueme_delete_comment", "Delete verified comment on open issue."],
	["issueme_list_issue_comments", "List issue comments with IDs and bounded bodies."],
	["issueme_get_comment", "Read one verified issue comment in full."],
	["issueme_assign_issue", "Add, remove, or set issue assignees."],
	["issueme_label_issue", "Add, remove, or set issue labels."],
	["issueme_reopen_issue", "Reopen closed issue, optionally with comment."],
	["issueme_close_issue", "Close open issue and remove local cache."],
	["issueme_delete_issue", "Permanently delete one GitHub issue."],
	["issueme_bulk_update_issues", "Apply one safe mutation to explicit issue numbers."],
]);

const baselineApproxTokens = {
	// Recorded before the lite-description refactor with the same stable chars/4 heuristic.
	topDescriptions: 818,
	parameterDescriptions: 1947,
	promptSnippets: 723,
	promptGuidelines: 1907,
	combined: 5395,
};

const firstLiteApproxTokens = {
	// First passing lite measurement after compaction with the same heuristic.
	topDescriptions: 314,
	parameterDescriptions: 836,
	promptSnippets: 215,
	promptGuidelines: 880,
	combined: 2245,
};

const continuationBaselineApproxTokens = {
	// Recorded after discovery tools gained bounded continuation (`after` inputs) with the same heuristic.
	// Re-record deliberately when a task adds tools or inputs; the drift guard below scales per registered tool.
	combined: 3679,
	toolCount: 30,
};

const firstLiteToolCount = 28;
// Hard cap: 20% below the pre-lite baseline, expressed per registered tool so added tools keep the same per-tool budget.
const maxCombinedApproxTokens = Math.floor(baselineApproxTokens.combined * 0.8 * (expectedDescriptions.size / firstLiteToolCount));
// Drift guard: at most 25% above the latest recorded baseline, scaled per registered tool.
const maxLiteRegressionApproxTokens = Math.ceil(continuationBaselineApproxTokens.combined * 1.25 * (expectedDescriptions.size / continuationBaselineApproxTokens.toolCount));
// Top-description word cap scaled per registered tool from the original 250-word cap for 28 tools.
const maxTopDescriptionWords = Math.ceil(250 * (expectedDescriptions.size / firstLiteToolCount));

function fakePi() {
	const tools = new Map();
	return {
		tools,
		registerCommand() {},
		registerTool(tool) {
			tools.set(tool.name, tool);
		},
	};
}

function registeredTools() {
	const pi = fakePi();
	issueMeExtension(pi);
	return pi.tools;
}

function collectToolContext(tools) {
	const topDescriptions = [];
	const parameterDescriptions = [];
	const promptSnippets = [];
	const promptGuidelines = [];

	function walkSchema(value) {
		if (!value || typeof value !== "object") return;
		if (typeof value.description === "string") parameterDescriptions.push(value.description);
		for (const child of Object.values(value)) {
			if (child && typeof child === "object") walkSchema(child);
		}
	}

	for (const tool of tools.values()) {
		topDescriptions.push(tool.description ?? "");
		if (tool.promptSnippet) promptSnippets.push(tool.promptSnippet);
		if (Array.isArray(tool.promptGuidelines)) promptGuidelines.push(...tool.promptGuidelines);
		walkSchema(tool.parameters);
	}

	return { topDescriptions, parameterDescriptions, promptSnippets, promptGuidelines };
}

function estimate(texts) {
	const text = texts.join("\n");
	return {
		chars: text.length,
		words: text.match(/\S+/g)?.length ?? 0,
		approxTokens: Math.ceil(text.length / 4),
	};
}

test("IssueMe top-level tool descriptions use lite wording", () => {
	const tools = registeredTools();
	assert.deepEqual([...tools.keys()], [...expectedDescriptions.keys()]);
	for (const [name, expected] of expectedDescriptions) {
		assert.equal(tools.get(name)?.description, expected, `${name} description drifted`);
	}
});

test("IssueMe shared prompt preamble is centralized", () => {
	const tools = registeredTools();
	const guidelines = [...tools.values()].flatMap((tool) => tool.promptGuidelines ?? []);
	const shared = guidelines.filter((guideline) => guideline.startsWith("IssueMe shared for issueme_sync_issues"));
	assert.equal(shared.length, 1);
	assert.match(shared[0], /issue means GitHub issue/);
	assert.match(shared[0], /cache means local IssueMe JSON/);
	assert.match(shared[0], /existing-issue mutations require open issues except label changes, explicit reopen, or permanent deletion/);
});

test("IssueMe tool schema prompt stays under budget", () => {
	const context = collectToolContext(registeredTools());
	const top = estimate(context.topDescriptions);
	const parameters = estimate(context.parameterDescriptions);
	const snippets = estimate(context.promptSnippets);
	const guidelines = estimate(context.promptGuidelines);
	const combined = estimate([
		...context.topDescriptions,
		...context.parameterDescriptions,
		...context.promptSnippets,
		...context.promptGuidelines,
	]);

	assert.ok(top.words <= maxTopDescriptionWords, `top descriptions use ${top.words} words; max ${maxTopDescriptionWords}`);
	assert.ok(
		combined.approxTokens <= maxCombinedApproxTokens,
		`IssueMe context estimate ${JSON.stringify({ top, parameters, snippets, guidelines, combined })} exceeds ${maxCombinedApproxTokens}`,
	);
	assert.ok(
		combined.approxTokens <= maxLiteRegressionApproxTokens,
		`IssueMe context estimate ${combined.approxTokens} grew too far beyond the recorded baseline ${continuationBaselineApproxTokens.combined} (first lite measurement ${firstLiteApproxTokens.combined})`,
	);
});
