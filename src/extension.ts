import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerIssueMeCommand } from "./commands/issueme-command.ts";
import { registerIssueMeTools } from "./tools/issueme-tools.ts";

export default function issueMeExtension(pi: ExtensionAPI) {
	registerIssueMeCommand(pi);
	registerIssueMeTools(pi);
}
