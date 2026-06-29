import { ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";

export function assertNotAborted(signal?: AbortSignal): void {
	if (!signal?.aborted) return;
	throw new IssueMeError(ISSUEME_ERROR_CODES.GITHUB_REQUEST_ABORTED, "IssueMe operation aborted before local cache mutation.");
}
