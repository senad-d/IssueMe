import assert from "node:assert/strict";
import test from "node:test";

import {
	ClosedIssueMutationError,
	GitHubApiError,
	ISSUEME_ERROR_CODES,
	IssueMeError,
	getIssueMeErrorRecoveryHint,
	getIssueMeErrorTaxonomy,
	isRemoteMutationSuccessKnown,
	markMutationSettlement,
	mutationSettlementOf,
} from "../src/errors.ts";
import { partialSuccessToolError, safeToolError } from "../src/tools/runtime.ts";

const representativeCodes = [
	[ISSUEME_ERROR_CODES.CONFIG_PARSE_FAILED, "config"],
	[ISSUEME_ERROR_CODES.PROJECT_UNTRUSTED, "trust"],
	[ISSUEME_ERROR_CODES.MISSING_GITHUB_TOKEN, "auth"],
	[ISSUEME_ERROR_CODES.REPOSITORY_NOT_FOUND, "repository"],
	[ISSUEME_ERROR_CODES.GITHUB_API_ERROR, "github_api"],
	[ISSUEME_ERROR_CODES.CLOSED_ISSUE_MUTATION_REFUSED, "closed_issue"],
	[ISSUEME_ERROR_CODES.ISSUE_FILE_INVALID, "local_cache"],
	[ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "validation"],
	[ISSUEME_ERROR_CODES.PARTIAL_SUCCESS_CACHE_SYNC_REQUIRED, "partial_success"],
];

test("IssueMe error taxonomy provides stable categories and recovery hints", () => {
	for (const [code, category] of representativeCodes) {
		const taxonomy = getIssueMeErrorTaxonomy(code);
		assert.equal(taxonomy.category, category, code);
		assert.equal(typeof taxonomy.recoveryHint, "string", code);
		assert.ok(taxonomy.recoveryHint.length > 20, code);
	}
});

test("unknown IssueMe error codes infer recovery categories safely", () => {
	assert.equal(getIssueMeErrorTaxonomy("partial_success_after_write").category, "partial_success");
	assert.equal(getIssueMeErrorTaxonomy("closed_issue_external").category, "closed_issue");
	assert.equal(getIssueMeErrorTaxonomy("project_untrusted_custom").category, "trust");
	assert.equal(getIssueMeErrorTaxonomy("token_missing_custom").category, "auth");
	assert.equal(getIssueMeErrorTaxonomy("config_custom").category, "config");
	assert.equal(getIssueMeErrorTaxonomy("repository_custom").category, "repository");
	assert.equal(getIssueMeErrorTaxonomy("github_custom").category, "github_api");
	assert.equal(getIssueMeErrorTaxonomy("issue_cache_custom").category, "local_cache");
	assert.equal(getIssueMeErrorTaxonomy("invalid_custom").category, "validation");
	assert.equal(getIssueMeErrorTaxonomy("surprising_custom").category, "runtime");
	assert.match(getIssueMeErrorRecoveryHint("token_missing_custom"), /GH_TOKEN|GITHUB_TOKEN/);
});

test("IssueMeError and safeToolError expose safe recovery guidance", () => {
	const error = new IssueMeError(
		ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT,
		"Issue title must not be empty.",
		{ field: "title", body: "PRIVATE ISSUE BODY", token: "ghp_secret_token" },
	);
	const safeError = safeToolError(error);

	assert.equal(error.category, "validation");
	assert.equal(error.safeDetails.category, "validation");
	assert.match(error.safeDetails.recoveryHint, /Correct/);
	assert.equal(safeError.code, ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT);
	assert.equal(safeError.category, "validation");
	assert.match(safeError.recoveryHint, /Correct/);
	assert.equal(safeError.details.field, "title");
	assert.equal(safeError.details.body, "[REDACTED]");
	assert.equal(safeError.details.token, "[REDACTED]");
	assert.doesNotMatch(JSON.stringify(safeError), /PRIVATE ISSUE BODY|ghp_secret_token/);
});

test("GitHubApiError and closed issue errors include actionable safe details", () => {
	const rateLimitError = new GitHubApiError("GitHub REST API request failed with 403 Forbidden.", {
		code: ISSUEME_ERROR_CODES.GITHUB_RATE_LIMIT,
		status: 403,
		path: "https://api.github.com/repos/owner/repo/issues",
		rateLimit: { limited: true, remaining: "0", reset: "12345", retryPolicy: "fail_fast" },
	});
	assert.equal(rateLimitError.code, ISSUEME_ERROR_CODES.GITHUB_RATE_LIMIT);
	assert.equal(rateLimitError.category, "github_api");
	assert.match(rateLimitError.recoveryHint, /rate limit|Retry-After/i);
	assert.equal(rateLimitError.safeDetails.rateLimit.remaining, "0");

	const closedError = new ClosedIssueMutationError(7, "closed", {
		repository: "owner/repo",
		number: 7,
		title: "Closed task",
		state: "closed",
		labels: [],
		assignees: [],
		html_url: "https://github.com/owner/repo/issues/7",
	});
	assert.equal(closedError.code, ISSUEME_ERROR_CODES.CLOSED_ISSUE_MUTATION_REFUSED);
	assert.equal(closedError.category, "closed_issue");
	assert.equal(closedError.safeDetails.status, ISSUEME_ERROR_CODES.CLOSED_ISSUE_MUTATION_REFUSED);
	assert.match(closedError.recoveryHint, /not mutate closed issues|open issue/i);
});

test("mutation settlement markers preserve the strongest known remote phase", () => {
	const error = new GitHubApiError("Mutation request failed.", { mutationSettlement: "not_started" });
	assert.equal(mutationSettlementOf(error), "not_started");
	markMutationSettlement(error, "indeterminate");
	assert.equal(mutationSettlementOf(error), "indeterminate");
	markMutationSettlement(error, "remote_success_known");
	markMutationSettlement(error, "no_remote_success_known");
	assert.equal(mutationSettlementOf(error), "remote_success_known");
	assert.equal(error.safeDetails.mutationSettlement, "remote_success_known");
	assert.equal(isRemoteMutationSuccessKnown(error), true);
});

test("partial success errors retain the local cause and add sync recovery guidance", () => {
	const partialError = partialSuccessToolError(
		new IssueMeError(ISSUEME_ERROR_CODES.UNSAFE_ISSUE_DIRECTORY, "Issue directory cannot be a symlink."),
		"closed_now_partial_success",
	);

	assert.equal(partialError.code, ISSUEME_ERROR_CODES.UNSAFE_ISSUE_DIRECTORY);
	assert.equal(partialError.category, "local_cache");
	assert.match(partialError.recoveryHint, /Do not repeat the remote mutation blindly/);
	assert.equal(partialError.details.partialSuccessCode, ISSUEME_ERROR_CODES.PARTIAL_SUCCESS_CACHE_SYNC_REQUIRED);
	assert.equal(partialError.details.partialSuccessStatus, "closed_now_partial_success");
	assert.match(partialError.details.partialSuccessRecoveryHint, /issueme_sync_issues/);
});
