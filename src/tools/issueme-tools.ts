import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerAssignIssueTool } from "./assign-issue.ts";
import { registerCloseIssueTool } from "./close-issue.ts";
import { registerCommentIssueTool } from "./comment-issue.ts";
import { registerCreateIssueTool } from "./create-issue.ts";
import { registerGetIssueTool } from "./get-issue.ts";
import { registerLabelIssueTool } from "./label-issue.ts";
import { registerSyncIssuesTool } from "./sync-issues.ts";
import { registerUpdateIssueTool } from "./update-issue.ts";

export function registerIssueMeTools(pi: ExtensionAPI) {
	registerSyncIssuesTool(pi);
	registerCreateIssueTool(pi);
	registerGetIssueTool(pi);
	registerUpdateIssueTool(pi);
	registerCommentIssueTool(pi);
	registerAssignIssueTool(pi);
	registerLabelIssueTool(pi);
	registerCloseIssueTool(pi);
}
