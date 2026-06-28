import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerAssignIssueTool } from "./assign-issue.ts";
import { registerBulkIssueOperationsTool } from "./bulk-issues.ts";
import { registerCloseIssueTool } from "./close-issue.ts";
import { registerCommentIssueTool, registerDeleteCommentTool, registerUpdateCommentTool } from "./comment-issue.ts";
import { registerCreateIssueTool } from "./create-issue.ts";
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
import type { IssueMeToolRegistrationOptions } from "./runtime.ts";

export function registerIssueMeTools(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	registerSyncIssuesTool(pi, options);
	registerListIssuesTool(pi, options);
	registerListLabelsTool(pi, options);
	registerListMilestonesTool(pi, options);
	registerListAssigneesTool(pi, options);
	registerProjectTools(pi, options);
	registerManageLabelTool(pi, options);
	registerManageMilestoneTool(pi, options);
	registerCreateIssueTool(pi, options);
	registerSubIssueTools(pi, options);
	registerListIssueDevelopmentLinksTool(pi, options);
	registerGetIssueTool(pi, options);
	registerUpdateIssueTool(pi, options);
	registerCommentIssueTool(pi, options);
	registerUpdateCommentTool(pi, options);
	registerDeleteCommentTool(pi, options);
	registerAssignIssueTool(pi, options);
	registerLabelIssueTool(pi, options);
	registerReopenIssueTool(pi, options);
	registerCloseIssueTool(pi, options);
	registerBulkIssueOperationsTool(pi, options);
}
