import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { loadIssueMeConfig } from "../config/config.ts";
import { GitHubClient } from "../github/client.ts";
import { resolveCurrentRepository } from "../github/repository.ts";
import { githubIssueToRecord } from "../issues/format.ts";
import { relativeIssuePath, writeIssueRecord } from "../issues/store.ts";
import type { GitHubIssueResponse, IssueMeConfig, IssueRecord, IssueMeToolDetails, ToolIssueSummary } from "../types.ts";
import { resolveGitHubToken } from "../utils/env.ts";
import { issueRecordToToolSummary } from "../issues/format.ts";

export interface IssueMeRuntime {
	config: IssueMeConfig;
	client: GitHubClient;
	repository: string;
}

export async function createIssueMeRuntime(ctx: ExtensionContext): Promise<IssueMeRuntime> {
	const config = await loadIssueMeConfig(ctx.cwd);
	const token = await resolveGitHubToken(ctx.cwd);
	const repository = await resolveCurrentRepository(ctx.cwd);
	return {
		config,
		client: new GitHubClient({ repository, token: token.token }),
		repository: repository.fullName,
	};
}

export async function fetchIssueRecord(
	runtime: IssueMeRuntime,
	issue: GitHubIssueResponse,
	signal?: AbortSignal,
): Promise<IssueRecord> {
	const number = typeof issue.number === "number" ? issue.number : undefined;
	const comments = number ? await runtime.client.listComments(number, signal) : [];
	return githubIssueToRecord(runtime.client.repository, issue, comments);
}

export async function refreshIssueRecord(
	runtime: IssueMeRuntime,
	issueNumber: number,
	signal?: AbortSignal,
): Promise<IssueRecord> {
	const issue = await runtime.client.getIssue(issueNumber, signal);
	return fetchIssueRecord(runtime, issue, signal);
}

export async function writeAndSummarizeIssue(
	ctx: ExtensionContext,
	runtime: IssueMeRuntime,
	record: IssueRecord,
): Promise<{ summary: ToolIssueSummary; path?: string; removedPaths: string[] }> {
	const writeResult = await writeIssueRecord(ctx.cwd, runtime.config, record);
	const path = relativeIssuePath(ctx.cwd, writeResult.path);
	return {
		summary: issueRecordToToolSummary(record, path),
		path,
		removedPaths: writeResult.removedPaths.map((removedPath) => relativeIssuePath(ctx.cwd, removedPath) ?? removedPath),
	};
}

export function toolText(text: string, details: IssueMeToolDetails = {}) {
	return {
		content: [{ type: "text" as const, text }],
		details,
	};
}

export function listChangedFields(input: Record<string, unknown>): string[] {
	return Object.entries(input)
		.filter(([, value]) => value !== undefined)
		.map(([key]) => key);
}

export function requireNonEmptyStrings(values: string[] | undefined, fieldName: string): string[] {
	const normalized = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
	if (normalized.length === 0) throw new Error(`${fieldName} must include at least one non-empty value.`);
	return normalized;
}
