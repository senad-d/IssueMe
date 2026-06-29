import { ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";

export const ALL_ISSUE_CREATORS = "all";
export const GITHUB_LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export function isValidGitHubLogin(value: unknown): value is string {
	return typeof value === "string" && GITHUB_LOGIN_PATTERN.test(value);
}

export function normalizeAllowedIssueCreatorForLoad(value: unknown, options: { fieldPresent?: boolean } = {}): string {
	if (value === undefined && !options.fieldPresent) return ALL_ISSUE_CREATORS;
	if (value === undefined) return invalidAllowedIssueCreator({ strict: true });
	return normalizeAllowedIssueCreator(value, { strict: true });
}

export function normalizeAllowedIssueCreatorForSave(value: unknown): string {
	return normalizeAllowedIssueCreator(value, { strict: true });
}

export function issueCreatorEquals(left: string, right: string): boolean {
	return left.toLowerCase() === right.toLowerCase();
}

function normalizeAllowedIssueCreator(value: unknown, options: { strict: boolean }): string {
	if (value === undefined) return ALL_ISSUE_CREATORS;
	if (typeof value !== "string") return invalidAllowedIssueCreator(options);
	const trimmed = value.trim();
	if (!trimmed) return invalidAllowedIssueCreator(options);
	if (trimmed.includes("\0")) return invalidAllowedIssueCreator(options, "Allowed issue creator must not contain null bytes.");
	if (/\r|\n/.test(trimmed)) return invalidAllowedIssueCreator(options, "Allowed issue creator must fit on one line.");
	if (/\s/.test(trimmed)) return invalidAllowedIssueCreator(options, "Allowed issue creator must be all or one GitHub username, not a whitespace-separated list.");
	if (trimmed.toLowerCase() === ALL_ISSUE_CREATORS) return ALL_ISSUE_CREATORS;
	if (isValidGitHubLogin(trimmed)) return trimmed;
	return invalidAllowedIssueCreator(options);
}

function invalidAllowedIssueCreator(options: { strict: boolean }, message = "Allowed issue creator must be all or one valid GitHub username."): string {
	if (!options.strict) return ALL_ISSUE_CREATORS;
	throw new IssueMeError(ISSUEME_ERROR_CODES.CONFIG_TUI_INVALID_SETTING, message, { field: "allowedIssueCreator" });
}
