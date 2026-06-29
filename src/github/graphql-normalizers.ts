import { isValidGitHubLogin } from "../utils/github-login.ts";
import { isObject } from "./shared.ts";

export function normalizeGraphQLIssueCreator(value: unknown): string | undefined {
	if (!isObject(value)) return undefined;
	return isValidGitHubLogin(value.login) ? value.login : undefined;
}

export function normalizeGraphQLIssueState(value: unknown): "open" | "closed" | undefined {
	if (value === "OPEN" || value === "open") return "open";
	if (value === "CLOSED" || value === "closed") return "closed";
	return undefined;
}
