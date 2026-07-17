import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { TSchema } from "typebox";

import { registerAssignIssueTool } from "./assign-issue.ts";
import { registerBulkIssueOperationsTool } from "./bulk-issues.ts";
import { registerCloseIssueTool } from "./close-issue.ts";
import { registerCommentIssueTool, registerDeleteCommentTool, registerUpdateCommentTool } from "./comment-issue.ts";
import { registerCreateIssueTool } from "./create-issue.ts";
import { registerDeleteIssueTool } from "./delete-issue.ts";
import { registerListIssueDevelopmentLinksTool } from "./development-links.ts";
import { registerGetIssueTool } from "./get-issue.ts";
import { registerLabelIssueTool } from "./label-issue.ts";
import { registerListAssigneesTool } from "./list-assignees.ts";
import { registerListIssuesTool } from "./list-issues.ts";
import { registerListLabelsTool } from "./list-labels.ts";
import { registerListMilestonesTool } from "./list-milestones.ts";
import { registerManageLabelTool } from "./manage-label.ts";
import { registerManageMilestoneTool } from "./manage-milestone.ts";
import { registerProjectTools } from "./projects.ts";
import { registerReopenIssueTool } from "./reopen-issue.ts";
import { registerSubIssueTools } from "./sub-issue.ts";
import { registerSyncIssuesTool } from "./sync-issues.ts";
import { registerUpdateIssueTool } from "./update-issue.ts";
import { issueMeResultPolicyPromptGuideline, type IssueMeToolRegistrationOptions } from "./runtime.ts";

export function registerIssueMeTools(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	const piWithResultPolicy = withIssueMeResultPolicyPrompt(pi);
	registerSyncIssuesTool(piWithResultPolicy, options);
	registerListIssuesTool(piWithResultPolicy, options);
	registerListLabelsTool(piWithResultPolicy, options);
	registerListMilestonesTool(piWithResultPolicy, options);
	registerListAssigneesTool(piWithResultPolicy, options);
	registerProjectTools(piWithResultPolicy, options);
	registerManageLabelTool(piWithResultPolicy, options);
	registerManageMilestoneTool(piWithResultPolicy, options);
	registerCreateIssueTool(piWithResultPolicy, options);
	registerSubIssueTools(piWithResultPolicy, options);
	registerListIssueDevelopmentLinksTool(piWithResultPolicy, options);
	registerGetIssueTool(piWithResultPolicy, options);
	registerUpdateIssueTool(piWithResultPolicy, options);
	registerCommentIssueTool(piWithResultPolicy, options);
	registerUpdateCommentTool(piWithResultPolicy, options);
	registerDeleteCommentTool(piWithResultPolicy, options);
	registerAssignIssueTool(piWithResultPolicy, options);
	registerLabelIssueTool(piWithResultPolicy, options);
	registerReopenIssueTool(piWithResultPolicy, options);
	registerCloseIssueTool(piWithResultPolicy, options);
	registerDeleteIssueTool(piWithResultPolicy, options);
	registerBulkIssueOperationsTool(piWithResultPolicy, options);
}

function withIssueMeResultPolicyPrompt(pi: ExtensionAPI): ExtensionAPI {
	function registerToolWithResultPolicy<TParams extends TSchema, TDetails = unknown, TState = unknown>(tool: ToolDefinition<TParams, TDetails, TState>) {
		pi.registerTool<TParams, TDetails, TState>(withResultPolicyGuideline(tool));
	}

	return new Proxy(pi, {
		get(target, property, receiver) {
			if (property === "registerTool") return registerToolWithResultPolicy;
			return Reflect.get(target, property, receiver);
		},
	});
}

function withResultPolicyGuideline<TParams extends TSchema, TDetails, TState>(
	tool: ToolDefinition<TParams, TDetails, TState>,
): ToolDefinition<TParams, TDetails, TState> {
	return {
		...tool,
		promptGuidelines: [
			...(tool.promptGuidelines ?? []),
			issueMeResultPolicyPromptGuideline(tool.name),
		],
	};
}
