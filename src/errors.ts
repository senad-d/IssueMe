import { DEFAULT_CONFIG_PATH } from "./constants.ts";
import type { ToolIssueSummary } from "./types.ts";

export type IssueMeErrorCategory =
	| "auth"
	| "closed_issue"
	| "config"
	| "github_api"
	| "local_cache"
	| "partial_success"
	| "repository"
	| "runtime"
	| "trust"
	| "validation";

export interface IssueMeErrorTaxonomyEntry {
	category: IssueMeErrorCategory;
	recoveryHint: string;
}

export type MutationSettlement = "not_started" | "no_remote_success_known" | "remote_success_known" | "indeterminate";

export interface IssueMeErrorOptions {
	category?: IssueMeErrorCategory;
	recoveryHint?: string;
	mutationSettlement?: MutationSettlement;
}

export const ISSUEME_ERROR_CODES = {
	CONFIG_PARSE_FAILED: "config_parse_failed",
	CONFIG_ROOT_INVALID: "config_root_invalid",
	CONFIG_READ_FAILED: "config_read_failed",
	CONFIG_SAVE_FAILED: "config_save_failed",
	CONFIG_SECRET_KEY_REFUSED: "config_secret_key_refused",
	CONFIG_TUI_INVALID_SETTING: "config_tui_invalid_setting",
	PROJECT_UNTRUSTED: "project_untrusted",
	MISSING_GITHUB_TOKEN: "missing_github_token",
	INVALID_GITHUB_TOKEN: "invalid_github_token",
	ENV_READ_FAILED: "env_read_failed",
	INVALID_GITHUB_REPOSITORY: "invalid_github_repository",
	INVALID_GITHUB_REPOSITORY_ENV: "invalid_github_repository_env",
	REPOSITORY_UNTRUSTED_PROJECT: "repository_untrusted_project",
	REPOSITORY_NOT_FOUND: "repository_not_found",
	REPOSITORY_ORIGIN_MISSING: "repository_origin_missing",
	REPOSITORY_ORIGIN_NOT_GITHUB: "repository_origin_not_github",
	REPOSITORY_ORIGIN_MALFORMED: "repository_origin_malformed",
	REPOSITORY_READ_FAILED: "repository_read_failed",
	REPOSITORY_GIT_ENTRY_INVALID: "repository_git_entry_invalid",
	REPOSITORY_GITDIR_INVALID: "repository_gitdir_invalid",
	REPOSITORY_COMMON_DIR_READ_FAILED: "repository_common_dir_read_failed",
	PROJECT_ROOT_READ_FAILED: "project_root_read_failed",
	GITHUB_API_ERROR: "github_api_error",
	GITHUB_RATE_LIMIT: "github_rate_limit",
	GITHUB_NETWORK_ERROR: "github_network_error",
	GITHUB_REQUEST_ABORTED: "github_request_aborted",
	GITHUB_INVALID_JSON: "github_invalid_json",
	GITHUB_RESPONSE_SHAPE_INVALID: "github_response_shape_invalid",
	GITHUB_URL_MALFORMED: "github_url_malformed",
	GITHUB_BOUNDARY_VIOLATION: "github_boundary_violation",
	GITHUB_ISSUE_SHAPE_INVALID: "github_issue_shape_invalid",
	GITHUB_ISSUE_DELETE_FORBIDDEN: "github_issue_delete_forbidden",
	GITHUB_ISSUE_DELETE_UNSUPPORTED: "github_issue_delete_unsupported",
	GITHUB_SUB_ISSUE_FORBIDDEN: "github_sub_issue_forbidden",
	GITHUB_SUB_ISSUE_UNSUPPORTED: "github_sub_issue_unsupported",
	GITHUB_PROJECTS_V2_FORBIDDEN: "github_projects_v2_forbidden",
	GITHUB_DEVELOPMENT_LINKS_FORBIDDEN: "github_development_links_forbidden",
	GITHUB_DEVELOPMENT_LINKS_UNSUPPORTED: "github_development_links_unsupported",
	COMMENT_ISSUE_MISMATCH: "comment_issue_mismatch",
	CLOSED_ISSUE_MUTATION_REFUSED: "closed_issue_mutation_refused",
	ISSUE_CREATOR_NOT_ALLOWED: "issue_creator_not_allowed",
	ISSUE_FILE_PARSE_FAILED: "issue_file_parse_failed",
	ISSUE_FILE_INVALID: "issue_file_invalid",
	ISSUE_CACHE_REPOSITORY_COLLISION: "issue_cache_repository_collision",
	ISSUE_LOOKUP_AMBIGUOUS: "issue_lookup_ambiguous",
	ISSUE_NOT_FOUND: "issue_not_found",
	LOCAL_CACHE_ERROR: "local_cache_error",
	UNSAFE_ISSUE_DIRECTORY: "unsafe_issue_directory",
	UNSAFE_ISSUE_FILE: "unsafe_issue_file",
	INVALID_TOOL_INPUT: "invalid_tool_input",
	INVALID_ISSUE_NUMBER: "invalid_issue_number",
	INVALID_SKILL_PATH: "invalid_skill_path",
	UNSAFE_SKILL_PATH: "unsafe_skill_path",
	UNSAFE_PATH: "unsafe_path",
	SKILL_PATH_NOT_FOUND: "skill_path_not_found",
	SKILL_PATH_NOT_FILE: "skill_path_not_file",
	SKILL_PATH_UNREADABLE: "skill_path_unreadable",
	RUNTIME_REPOSITORY_MISMATCH: "runtime_repository_mismatch",
	PARTIAL_SUCCESS_CACHE_SYNC_REQUIRED: "partial_success_cache_sync_required",
} as const;

const DEFAULT_RECOVERY_HINTS: Record<IssueMeErrorCategory, string> = {
	auth: "Set GH_TOKEN or GITHUB_TOKEN with access to the resolved repository, then rerun the command or tool.",
	closed_issue: "Sync the issue state and choose a new/open issue; use issueme_reopen_issue only when an explicit reopen is intended.",
	config: `Fix ${DEFAULT_CONFIG_PATH} or reopen /issueme in a trusted project to save valid non-secret settings.`,
	github_api: "Check repository access, token scopes, GitHub status/rate limits, and rerun the tool only after the remote condition is resolved.",
	local_cache: "Inspect the configured issue directory, fix unsafe/corrupt local cache files if needed, then run issueme_sync_issues.",
	partial_success: "Do not repeat the remote mutation blindly; run issueme_sync_issues, inspect local cache state, then retry only missing local work.",
	repository: "Set GITHUB_REPOSITORY to owner/repo or run IssueMe from a trusted GitHub checkout with an origin remote.",
	runtime: "Verify the IssueMe runtime injection/context and rerun after the mismatch is corrected.",
	trust: "Mark the project as trusted in Pi before IssueMe reads project-local config, .env, Git metadata, or issue cache files.",
	validation: "Correct the invalid input/path and rerun the command or tool.",
};

export const ISSUEME_ERROR_TAXONOMY: Record<string, IssueMeErrorTaxonomyEntry> = {
	[ISSUEME_ERROR_CODES.CONFIG_PARSE_FAILED]: {
		category: "config",
		recoveryHint: `Fix JSON syntax in ${DEFAULT_CONFIG_PATH} or delete it to use IssueMe defaults.`,
	},
	[ISSUEME_ERROR_CODES.CONFIG_ROOT_INVALID]: {
		category: "config",
		recoveryHint: `Replace ${DEFAULT_CONFIG_PATH} with a JSON object or delete it to use IssueMe defaults.`,
	},
	[ISSUEME_ERROR_CODES.CONFIG_READ_FAILED]: {
		category: "config",
		recoveryHint: `Check permissions for ${DEFAULT_CONFIG_PATH} and rerun /issueme in a trusted project.`,
	},
	[ISSUEME_ERROR_CODES.CONFIG_SAVE_FAILED]: {
		category: "config",
		recoveryHint: `Check ${DEFAULT_CONFIG_PATH} parent directory permissions and save only non-secret IssueMe settings.`,
	},
	[ISSUEME_ERROR_CODES.CONFIG_SECRET_KEY_REFUSED]: {
		category: "config",
		recoveryHint: "Remove token/secret/password-style keys from IssueMe config; keep credentials in GH_TOKEN or GITHUB_TOKEN.",
	},
	[ISSUEME_ERROR_CODES.CONFIG_TUI_INVALID_SETTING]: {
		category: "config",
		recoveryHint: "Reopen /issueme and edit one of the supported non-secret settings.",
	},
	[ISSUEME_ERROR_CODES.PROJECT_UNTRUSTED]: {
		category: "trust",
		recoveryHint: DEFAULT_RECOVERY_HINTS.trust,
	},
	[ISSUEME_ERROR_CODES.MISSING_GITHUB_TOKEN]: {
		category: "auth",
		recoveryHint: DEFAULT_RECOVERY_HINTS.auth,
	},
	[ISSUEME_ERROR_CODES.INVALID_GITHUB_TOKEN]: {
		category: "auth",
		recoveryHint: "Use a raw GitHub token value with no embedded whitespace or control characters, then rerun the command or tool.",
	},
	[ISSUEME_ERROR_CODES.ENV_READ_FAILED]: {
		category: "auth",
		recoveryHint: "Fix permissions or type of the trusted project .env file, or remove it and use process GH_TOKEN/GITHUB_TOKEN.",
	},
	[ISSUEME_ERROR_CODES.INVALID_GITHUB_REPOSITORY]: {
		category: "repository",
		recoveryHint: "Use a valid GitHub owner/repo value for the injected IssueMe repository.",
	},
	[ISSUEME_ERROR_CODES.INVALID_GITHUB_REPOSITORY_ENV]: {
		category: "repository",
		recoveryHint: "Set GITHUB_REPOSITORY to a valid owner/repo value, for example owner/repo.",
	},
	[ISSUEME_ERROR_CODES.REPOSITORY_UNTRUSTED_PROJECT]: {
		category: "trust",
		recoveryHint: "Trust the project or set GITHUB_REPOSITORY before IssueMe needs local Git metadata.",
	},
	[ISSUEME_ERROR_CODES.REPOSITORY_NOT_FOUND]: {
		category: "repository",
		recoveryHint: DEFAULT_RECOVERY_HINTS.repository,
	},
	[ISSUEME_ERROR_CODES.REPOSITORY_ORIGIN_MISSING]: {
		category: "repository",
		recoveryHint: "Add a GitHub origin remote or set GITHUB_REPOSITORY to owner/repo.",
	},
	[ISSUEME_ERROR_CODES.REPOSITORY_ORIGIN_NOT_GITHUB]: {
		category: "repository",
		recoveryHint: "Use a GitHub origin remote or set GITHUB_REPOSITORY to the target GitHub owner/repo.",
	},
	[ISSUEME_ERROR_CODES.REPOSITORY_ORIGIN_MALFORMED]: {
		category: "repository",
		recoveryHint: "Fix the Git origin URL or set GITHUB_REPOSITORY to owner/repo.",
	},
	[ISSUEME_ERROR_CODES.REPOSITORY_READ_FAILED]: {
		category: "repository",
		recoveryHint: "Check local Git metadata permissions, or set GITHUB_REPOSITORY to avoid local Git config reads.",
	},
	[ISSUEME_ERROR_CODES.REPOSITORY_GIT_ENTRY_INVALID]: {
		category: "repository",
		recoveryHint: "Use IssueMe from a normal Git checkout/worktree or set GITHUB_REPOSITORY.",
	},
	[ISSUEME_ERROR_CODES.REPOSITORY_GITDIR_INVALID]: {
		category: "repository",
		recoveryHint: "Repair the .git gitdir file/worktree metadata or set GITHUB_REPOSITORY.",
	},
	[ISSUEME_ERROR_CODES.REPOSITORY_COMMON_DIR_READ_FAILED]: {
		category: "repository",
		recoveryHint: "Check Git worktree metadata permissions or set GITHUB_REPOSITORY.",
	},
	[ISSUEME_ERROR_CODES.PROJECT_ROOT_READ_FAILED]: {
		category: "repository",
		recoveryHint: "Check project directory/Git metadata permissions and rerun from a readable project path.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_API_ERROR]: {
		category: "github_api",
		recoveryHint: DEFAULT_RECOVERY_HINTS.github_api,
	},
	[ISSUEME_ERROR_CODES.GITHUB_RATE_LIMIT]: {
		category: "github_api",
		recoveryHint: "Wait for the GitHub rate limit or Retry-After window, then rerun the tool or sync later.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_NETWORK_ERROR]: {
		category: "github_api",
		recoveryHint: "Check network connectivity to GitHub APIs and rerun the tool after connectivity is restored.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_REQUEST_ABORTED]: {
		category: "github_api",
		recoveryHint: "The request was cancelled; rerun the tool if the operation is still needed.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_INVALID_JSON]: {
		category: "github_api",
		recoveryHint: "Retry later; if it repeats, inspect GitHub API availability for the resolved repository.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID]: {
		category: "github_api",
		recoveryHint: "Retry later or update IssueMe if GitHub changed the REST response shape.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_URL_MALFORMED]: {
		category: "github_api",
		recoveryHint: "Check repository resolution and IssueMe GitHub URL construction before rerunning.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_BOUNDARY_VIOLATION]: {
		category: "github_api",
		recoveryHint: "Stop and inspect repository resolution; IssueMe refused to send tokens outside the resolved repository boundary.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_ISSUE_SHAPE_INVALID]: {
		category: "github_api",
		recoveryHint: "Retry sync later or update IssueMe if GitHub issue fields changed shape.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_ISSUE_DELETE_FORBIDDEN]: {
		category: "github_api",
		recoveryHint: "Use a token user with repository administrator permission and issue write access, then explicitly confirm the exact issue deletion again.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_ISSUE_DELETE_UNSUPPORTED]: {
		category: "github_api",
		recoveryHint: "Use a GitHub environment that supports the GraphQL deleteIssue mutation, or ask a repository administrator to delete the issue in GitHub's UI.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_SUB_ISSUE_FORBIDDEN]: {
		category: "github_api",
		recoveryHint: "Use a token/user with access to the repository and permission for GitHub native sub-issues, then rerun the IssueMe sub-issue tool.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_SUB_ISSUE_UNSUPPORTED]: {
		category: "github_api",
		recoveryHint: "Use a GitHub environment that exposes native sub-issues through GraphQL, or manage the relationship in GitHub UI; IssueMe will not create body-only relationship fallbacks.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_PROJECTS_V2_FORBIDDEN]: {
		category: "github_api",
		recoveryHint: "Use a token/user with access to the requested GitHub Projects v2 board and project read permissions, then rerun the IssueMe project discovery tool.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_DEVELOPMENT_LINKS_FORBIDDEN]: {
		category: "github_api",
		recoveryHint: "Use a token/user with access to the repository, linked pull requests, and referenced commits, then rerun issueme_list_issue_development_links.",
	},
	[ISSUEME_ERROR_CODES.GITHUB_DEVELOPMENT_LINKS_UNSUPPORTED]: {
		category: "github_api",
		recoveryHint: "Inspect linked development in GitHub UI or update IssueMe when GitHub exposes stable issue development-link GraphQL fields; IssueMe will not invent body-only development links.",
	},
	[ISSUEME_ERROR_CODES.COMMENT_ISSUE_MISMATCH]: {
		category: "validation",
		recoveryHint: "Use the comment ID from the target issue's comment list/cache and rerun the comment tool with the matching issue number.",
	},
	[ISSUEME_ERROR_CODES.CLOSED_ISSUE_MUTATION_REFUSED]: {
		category: "closed_issue",
		recoveryHint: DEFAULT_RECOVERY_HINTS.closed_issue,
	},
	[ISSUEME_ERROR_CODES.ISSUE_CREATOR_NOT_ALLOWED]: {
		category: "validation",
		recoveryHint: "Change /issueme Cache > Allowed issue creator to all or the intended GitHub username, then rerun the operation.",
	},
	[ISSUEME_ERROR_CODES.ISSUE_FILE_PARSE_FAILED]: {
		category: "local_cache",
		recoveryHint: "Fix or move the invalid JSON issue cache file, then run issueme_sync_issues.",
	},
	[ISSUEME_ERROR_CODES.ISSUE_FILE_INVALID]: {
		category: "local_cache",
		recoveryHint: "Fix or move the invalid IssueMe cache file, then run issueme_sync_issues.",
	},
	[ISSUEME_ERROR_CODES.ISSUE_CACHE_REPOSITORY_COLLISION]: {
		category: "local_cache",
		recoveryHint: "Move or rename the conflicting local issue file before syncing this repository again.",
	},
	[ISSUEME_ERROR_CODES.ISSUE_LOOKUP_AMBIGUOUS]: {
		category: "local_cache",
		recoveryHint: "Use a specific issue number, filename, or repository-scoped lookup to disambiguate the local cache entry.",
	},
	[ISSUEME_ERROR_CODES.ISSUE_NOT_FOUND]: {
		category: "local_cache",
		recoveryHint: "Run issueme_sync_issues or use refresh with an issue number before reading the issue again.",
	},
	[ISSUEME_ERROR_CODES.LOCAL_CACHE_ERROR]: {
		category: "local_cache",
		recoveryHint: DEFAULT_RECOVERY_HINTS.local_cache,
	},
	[ISSUEME_ERROR_CODES.UNSAFE_ISSUE_DIRECTORY]: {
		category: "local_cache",
		recoveryHint: "Choose a project-local, non-symlinked issue directory such as issues/ and rerun the operation.",
	},
	[ISSUEME_ERROR_CODES.UNSAFE_ISSUE_FILE]: {
		category: "local_cache",
		recoveryHint: "Remove symlinked/special issue cache files or move cache files back under the configured issue directory.",
	},
	[ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT]: {
		category: "validation",
		recoveryHint: "Correct the tool input fields described by the message and call the tool again.",
	},
	[ISSUEME_ERROR_CODES.INVALID_ISSUE_NUMBER]: {
		category: "validation",
		recoveryHint: "Use a positive GitHub issue number.",
	},
	[ISSUEME_ERROR_CODES.INVALID_SKILL_PATH]: {
		category: "validation",
		recoveryHint: "Pass a non-empty project-local skill file path to /issueme start.",
	},
	[ISSUEME_ERROR_CODES.UNSAFE_SKILL_PATH]: {
		category: "validation",
		recoveryHint: "Use a readable skill file inside the current trusted project.",
	},
	[ISSUEME_ERROR_CODES.UNSAFE_PATH]: {
		category: "validation",
		recoveryHint: "Use a path that stays inside the permitted project directory.",
	},
	[ISSUEME_ERROR_CODES.SKILL_PATH_NOT_FOUND]: {
		category: "validation",
		recoveryHint: "Create the skill file or pass the correct project-local path to /issueme start.",
	},
	[ISSUEME_ERROR_CODES.SKILL_PATH_NOT_FILE]: {
		category: "validation",
		recoveryHint: "Pass a readable SKILL.md file, not a directory or special file.",
	},
	[ISSUEME_ERROR_CODES.SKILL_PATH_UNREADABLE]: {
		category: "validation",
		recoveryHint: "Fix file permissions or choose a readable project-local skill file.",
	},
	[ISSUEME_ERROR_CODES.RUNTIME_REPOSITORY_MISMATCH]: {
		category: "runtime",
		recoveryHint: DEFAULT_RECOVERY_HINTS.runtime,
	},
	[ISSUEME_ERROR_CODES.PARTIAL_SUCCESS_CACHE_SYNC_REQUIRED]: {
		category: "partial_success",
		recoveryHint: DEFAULT_RECOVERY_HINTS.partial_success,
	},
};

export class IssueMeError extends Error {
	readonly code: string;
	readonly category: IssueMeErrorCategory;
	readonly recoveryHint: string;
	readonly safeDetails: Record<string, unknown>;
	mutationSettlement: MutationSettlement | undefined;

	constructor(code: string, message: string, safeDetails?: Record<string, unknown>, options: IssueMeErrorOptions = {}) {
		super(message);
		this.name = "IssueMeError";
		this.code = code;
		const taxonomy = getIssueMeErrorTaxonomy(code);
		this.category = options.category ?? taxonomy.category;
		this.recoveryHint = options.recoveryHint ?? taxonomy.recoveryHint;
		this.mutationSettlement = options.mutationSettlement;
		this.safeDetails = buildSafeDetails(withMutationSettlement(safeDetails, options.mutationSettlement), this.category, this.recoveryHint);
	}
}

export function markMutationSettlement(error: unknown, settlement: MutationSettlement): IssueMeError {
	if (error instanceof IssueMeError) {
		const resolved = resolveMutationSettlement(error.mutationSettlement, settlement);
		error.mutationSettlement = resolved;
		error.safeDetails.mutationSettlement = resolved;
		return error;
	}
	return new IssueMeError(
		ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID,
		"GitHub accepted the mutation, but IssueMe could not process the response safely.",
		{ mutationSettlement: settlement },
		{
			category: "github_api",
			mutationSettlement: settlement,
			recoveryHint: "Do not repeat the mutation blindly; inspect GitHub remote state and synchronize IssueMe before retrying only missing work.",
		},
	);
}

export function mutationSettlementOf(error: unknown): MutationSettlement | undefined {
	if (error instanceof IssueMeError) return error.mutationSettlement;
	return undefined;
}

export function isRemoteMutationSuccessKnown(error: unknown): boolean {
	return mutationSettlementOf(error) === "remote_success_known";
}

export class ClosedIssueMutationError extends IssueMeError {
	readonly issueNumber: number;
	readonly state: string;

	constructor(issueNumber: number, state: string, issue?: ToolIssueSummary) {
		super(
			ISSUEME_ERROR_CODES.CLOSED_ISSUE_MUTATION_REFUSED,
			`Issue #${issueNumber} is ${state}; IssueMe refuses this closed-issue mutation. Use issueme_reopen_issue only when an explicit reopen is intended.`,
			{
				issueNumber,
				state,
				status: ISSUEME_ERROR_CODES.CLOSED_ISSUE_MUTATION_REFUSED,
				cacheUpdated: false,
				needsSync: true,
				...(issue ? { repository: issue.repository, issue } : {}),
			},
		);
		this.name = "ClosedIssueMutationError";
		this.issueNumber = issueNumber;
		this.state = state;
	}
}

export interface GitHubApiErrorOptions {
	status?: number;
	path?: string;
	rateLimit?: Record<string, unknown>;
	code?: string;
	recoveryHint?: string;
	mutationSettlement?: MutationSettlement;
}

export class GitHubApiError extends IssueMeError {
	readonly status: number | undefined;

	constructor(message: string, options?: GitHubApiErrorOptions) {
		super(
			options?.code ?? ISSUEME_ERROR_CODES.GITHUB_API_ERROR,
			message,
			githubApiErrorDetails(options),
			{
				category: "github_api",
				recoveryHint: options?.recoveryHint ?? recoveryHintForGitHubApi(options),
				mutationSettlement: options?.mutationSettlement,
			},
		);
		this.name = "GitHubApiError";
		this.status = options?.status;
	}
}

function githubApiErrorDetails(options: GitHubApiErrorOptions | undefined): Record<string, unknown> {
	const details: Record<string, unknown> = {};
	if (typeof options?.status === "number") details.status = options.status;
	if (options?.path) details.path = options.path;
	if (options?.rateLimit) details.rateLimit = options.rateLimit;
	return details;
}

export function getIssueMeErrorTaxonomy(code: string): IssueMeErrorTaxonomyEntry {
	return ISSUEME_ERROR_TAXONOMY[code] ?? inferIssueMeErrorTaxonomy(code);
}

export function getIssueMeErrorRecoveryHint(code: string): string {
	return getIssueMeErrorTaxonomy(code).recoveryHint;
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}

function recoveryHintForGitHubApi(options: GitHubApiErrorOptions | undefined): string {
	if (isRateLimited(options?.rateLimit)) return ISSUEME_ERROR_TAXONOMY[ISSUEME_ERROR_CODES.GITHUB_RATE_LIMIT].recoveryHint;
	if (options?.status === 401 || options?.status === 403) {
		return "Check GH_TOKEN/GITHUB_TOKEN permissions and GitHub rate-limit status before rerunning the tool.";
	}
	if (options?.status === 404) return "Confirm the repository/issue exists and the token can access it, then rerun or sync.";
	if (options?.status === 422) return "Adjust the requested issue fields, labels, assignees, or milestone and rerun the tool.";
	return DEFAULT_RECOVERY_HINTS.github_api;
}

function withMutationSettlement(
	details: Record<string, unknown> | undefined,
	settlement: MutationSettlement | undefined,
): Record<string, unknown> | undefined {
	if (settlement === undefined) return details;
	return { ...details, mutationSettlement: settlement };
}

function resolveMutationSettlement(
	current: MutationSettlement | undefined,
	next: MutationSettlement,
): MutationSettlement {
	if (current === "remote_success_known" || next === "remote_success_known") return "remote_success_known";
	if (current === "indeterminate" || next === "indeterminate") return "indeterminate";
	if (current === "no_remote_success_known" || next === "no_remote_success_known") return "no_remote_success_known";
	return "not_started";
}

function buildSafeDetails(
	details: Record<string, unknown> | undefined,
	category: IssueMeErrorCategory,
	recoveryHint: string,
): Record<string, unknown> {
	const safeDetails = sanitizeSafeDetails(details);
	if (safeDetails === undefined) return { category, recoveryHint };
	return { ...safeDetails, category, recoveryHint };
}

function sanitizeSafeDetails(value: unknown): Record<string, unknown> | undefined {
	const sanitized = sanitizeSafeDetailValue(value);
	return isRecord(sanitized) ? sanitized : undefined;
}

function sanitizeSafeDetailValue(value: unknown): unknown {
	if (value === undefined) return undefined;
	if (value === null || typeof value === "number" || typeof value === "boolean") return value;
	if (typeof value === "string") return redactKnownSensitiveText(value);
	if (Array.isArray(value)) return value.map((item) => sanitizeSafeDetailValue(item));
	if (!isRecord(value)) return undefined;
	const output: Record<string, unknown> = {};
	for (const [key, child] of Object.entries(value)) {
		if (isSensitiveDetailKey(key)) {
			output[key] = "[REDACTED]";
			continue;
		}
		const sanitized = sanitizeSafeDetailValue(child);
		if (sanitized !== undefined) output[key] = sanitized;
	}
	return output;
}

function isSensitiveDetailKey(key: string): boolean {
	return /(token|secret|password|credential|api[_-]?key|env|body|comment|comments|config)/i.test(key);
}

function redactKnownSensitiveText(text: string): string {
	return text
		.replace(/github_pat_\w+/g, "[REDACTED]")
		.replace(/gh[pousr]_\w+/g, "[REDACTED]");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inferIssueMeErrorTaxonomy(code: string): IssueMeErrorTaxonomyEntry {
	const normalized = code.toLowerCase();
	if (normalized.includes("partial_success")) return { category: "partial_success", recoveryHint: DEFAULT_RECOVERY_HINTS.partial_success };
	if (normalized.includes("closed_issue")) return { category: "closed_issue", recoveryHint: DEFAULT_RECOVERY_HINTS.closed_issue };
	if (normalized.includes("untrusted")) return { category: "trust", recoveryHint: DEFAULT_RECOVERY_HINTS.trust };
	if (normalized.includes("token") || normalized.startsWith("env_")) return { category: "auth", recoveryHint: DEFAULT_RECOVERY_HINTS.auth };
	if (normalized.startsWith("config_")) return { category: "config", recoveryHint: DEFAULT_RECOVERY_HINTS.config };
	if (normalized.startsWith("repository_") || normalized.startsWith("project_root_") || normalized.includes("github_repository")) {
		return { category: "repository", recoveryHint: DEFAULT_RECOVERY_HINTS.repository };
	}
	if (normalized.startsWith("github_")) return { category: "github_api", recoveryHint: DEFAULT_RECOVERY_HINTS.github_api };
	if (normalized.startsWith("issue_") || normalized.startsWith("unsafe_issue_") || normalized.includes("cache")) {
		return { category: "local_cache", recoveryHint: DEFAULT_RECOVERY_HINTS.local_cache };
	}
	if (normalized.includes("invalid") || normalized.includes("skill_path") || normalized === "unsafe_path") {
		return { category: "validation", recoveryHint: DEFAULT_RECOVERY_HINTS.validation };
	}
	return { category: "runtime", recoveryHint: DEFAULT_RECOVERY_HINTS.runtime };
}

function isRateLimited(rateLimit: Record<string, unknown> | undefined): boolean {
	return rateLimit?.limited === true || rateLimit?.remaining === "0" || rateLimit?.retryAfter !== undefined;
}
