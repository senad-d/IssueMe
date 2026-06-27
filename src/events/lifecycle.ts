import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * IssueMe intentionally registers no lifecycle hooks in the first implementation.
 * The extension starts no background resources, timers, sockets, watchers, or
 * webhook listeners from the extension factory.
 */
export function registerIssueMeLifecyclePlaceholders(_pi: ExtensionAPI) {
	// No lifecycle behavior is required.
}
