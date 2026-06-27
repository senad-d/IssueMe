export class IssueMeError extends Error {
	readonly code: string;
	readonly safeDetails?: Record<string, unknown>;

	constructor(code: string, message: string, safeDetails?: Record<string, unknown>) {
		super(message);
		this.name = "IssueMeError";
		this.code = code;
		this.safeDetails = safeDetails;
	}
}

export class ClosedIssueMutationError extends IssueMeError {
	readonly issueNumber: number;
	readonly state: string;

	constructor(issueNumber: number, state: string) {
		super(
			"closed_issue_mutation_refused",
			`Issue #${issueNumber} is ${state}; IssueMe refuses to mutate closed issues.`,
			{ issueNumber, state },
		);
		this.name = "ClosedIssueMutationError";
		this.issueNumber = issueNumber;
		this.state = state;
	}
}

export class GitHubApiError extends IssueMeError {
	readonly status: number | undefined;

	constructor(message: string, options?: { status?: number; path?: string }) {
		super("github_api_error", message, {
			...(options?.status !== undefined ? { status: options.status } : {}),
			...(options?.path ? { path: options.path } : {}),
		});
		this.name = "GitHubApiError";
		this.status = options?.status;
	}
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
	return error instanceof Error && "code" in error;
}
