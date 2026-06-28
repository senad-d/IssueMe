import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execFileAsync = promisify(execFile);
const rootPath = fileURLToPath(new URL("../", import.meta.url));
const expectedTools = [
	"issueme_sync_issues",
	"issueme_list_issues",
	"issueme_list_labels",
	"issueme_list_milestones",
	"issueme_list_assignees",
	"issueme_list_projects",
	"issueme_get_project_fields",
	"issueme_add_issue_to_project",
	"issueme_update_project_item",
	"issueme_manage_label",
	"issueme_manage_milestone",
	"issueme_create_issue",
	"issueme_create_sub_issue",
	"issueme_add_sub_issue",
	"issueme_remove_sub_issue",
	"issueme_reorder_sub_issues",
	"issueme_list_sub_issues",
	"issueme_list_issue_development_links",
	"issueme_get_issue",
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
