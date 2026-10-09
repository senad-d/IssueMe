import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";

import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import { isObject } from "../github/shared.ts";
import { githubIssueToRecord, issueRecordToToolSummary, isPullRequestIssue } from "../issues/format.ts";
import { OVERVIEW_SECTIONS, type GitHubIssueResponse, type IssueMeToolDetails, type OverviewSectionName, type ToolIssueSummary, type ToolOverviewSection } from "../types.ts";
import { normalizeBoundedToolLimit } from "../utils/validation.ts";
import { summarizeAssignees } from "./list-assignees.ts";
import { summarizeLabels } from "./list-labels.ts";
import { summarizeMilestones } from "./list-milestones.ts";
import { overviewToolText } from "./overview-format.ts";
import { assertNotAborted, boundToolDetails, createIssueMeRuntime, issueCreatorMatchesConfig, issueCreatorScopeLabel, safeToolError, type IssueMeRuntime, type IssueMeToolRegistrationOptions } from "./runtime.ts";

const OverviewParams = Type.Object({
	sections: Type.Optional(Type.Array(StringEnum(OVERVIEW_SECTIONS), { minItems: 1, maxItems: 5, uniqueItems: true, description: "Sections to read; default all five." })),
	limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 25, description: "Rows per section. Default 10; max 25. One page per section." })),
}, { additionalProperties: false });

type OverviewParams = Static<typeof OverviewParams>;

const DRILL_DOWN: Record<OverviewSectionName, string> = {
	issues: "issueme_list_issues",
	labels: "issueme_list_labels",
	milestones: "issueme_list_milestones",
	assignees: "issueme_list_assignees",
	projects: "issueme_list_projects",
};

interface SectionRead {
	name: OverviewSectionName;
	metadata: ToolOverviewSection;
	data: IssueMeToolDetails;
}

interface SectionData {
	data: IssueMeToolDetails;
	truncated: boolean;
}

export function registerGetOverviewTool(pi: ExtensionAPI, options: IssueMeToolRegistrationOptions = {}) {
	pi.registerTool(defineTool({
		name: "issueme_get_overview",
		label: "IssueMe Overview",
		description: "Read a compact repo overview of issues, labels, milestones, assignees, and projects.",
		promptSnippet: "Read repository overview before drilling down.",
		promptGuidelines: [
			"Use issueme_get_overview for initial planning without cache sync; inspect section status and drill down only where needed. Counts are returned rows, not repository totals.",
		],
		parameters: OverviewParams,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const request = normalizeOverviewParams(params);
			assertNotAborted(signal);
			const runtime = await createIssueMeRuntime(ctx, options.runtime);
			const startedAt = new Date().toISOString();
			// Fixed fan-out: at most five concurrent single-page reads, never per-issue reads.
			// Settle every reader before returning/throwing; no work outlives this call.
			const outcomes = await Promise.allSettled(request.sections.map((section) => readOverviewSection(runtime, section, request.limit, signal)));
			assertNotAborted(signal);
			const results = outcomes.map(requireSectionResult);
			return overviewToolText(buildOverviewDetails(runtime, results, startedAt));
		},
	}));
}

function normalizeOverviewParams(params: OverviewParams): { sections: OverviewSectionName[]; limit: number } {
	if (Object.keys(params).some((key) => key !== "sections" && key !== "limit")) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "Overview accepts only sections and limit.");
	}
	const sections = params.sections ?? [...OVERVIEW_SECTIONS];
	if (params.sections === null || !Array.isArray(sections) || sections.length < 1 || sections.length > 5
		|| new Set(sections).size !== sections.length || sections.some((section) => !OVERVIEW_SECTIONS.includes(section))) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, "sections must contain unique overview section names (issues, labels, milestones, assignees, projects).");
	}
	return {
		sections: OVERVIEW_SECTIONS.filter((section) => sections.includes(section)),
		limit: normalizeBoundedToolLimit(params.limit, { max: 25, defaultValue: 10 }),
	};
}

function requireSectionResult(outcome: PromiseSettledResult<SectionRead>): SectionRead {
	if (outcome.status === "rejected") throw outcome.reason;
	return outcome.value;
}

async function readOverviewSection(runtime: IssueMeRuntime, name: OverviewSectionName, limit: number, signal?: AbortSignal): Promise<SectionRead> {
	assertNotAborted(signal);
	try {
		const result = await fetchOverviewSection(runtime, name, limit, signal);
		assertNotAborted(signal);
		const data = boundToolDetails(result.data);
		return {
			name,
			data,
			metadata: {
				status: result.truncated || data.truncated ? "truncated" : "complete",
				returned: data[name]?.length ?? 0,
				limit,
				drillDown: DRILL_DOWN[name],
			},
		};
	} catch (error) {
		assertNotAborted(signal);
		if (!isIndependentReadFailure(error)) throw error;
		return { name, data: {}, metadata: { status: "unavailable", limit, drillDown: DRILL_DOWN[name], error: safeToolError(error) } };
	}
}

function isIndependentReadFailure(error: unknown): boolean {
	if (!(error instanceof IssueMeError)) return false;
	if (error instanceof GitHubApiError && (error.status === 401 || error.status === 429)) return false;
	return ([
		ISSUEME_ERROR_CODES.GITHUB_API_ERROR,
		ISSUEME_ERROR_CODES.GITHUB_NETWORK_ERROR,
		ISSUEME_ERROR_CODES.GITHUB_INVALID_JSON,
		ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID,
		ISSUEME_ERROR_CODES.GITHUB_ISSUE_SHAPE_INVALID,
		ISSUEME_ERROR_CODES.GITHUB_PROJECTS_V2_FORBIDDEN,
	] as readonly string[]).includes(error.code);
}

async function fetchOverviewSection(runtime: IssueMeRuntime, name: OverviewSectionName, limit: number, signal?: AbortSignal): Promise<SectionData> {
	const budget = { limit, maxPages: 1 };
	switch (name) {
		case "issues": {
			const scope = issueCreatorScopeLabel(runtime.config);
			const result = await runtime.client.listIssues({ ...budget, state: "open", sort: "updated", direction: "desc", ...(scope === "all" ? {} : { creator: scope }) }, signal);
			const issues = result.issues
				.filter((issue) => !isPullRequestIssue(issue) && issueCreatorMatchesConfig(runtime.config, issue))
				.map((issue) => summarizeOverviewIssue(runtime, issue));
			return { data: { issues }, truncated: result.truncated };
		}
		case "labels": {
			const result = await runtime.client.listLabels(budget, signal);
			return { data: { labels: summarizeLabels(result.labels) }, truncated: result.truncated };
		}
		case "milestones": {
			const result = await runtime.client.listMilestones({ ...budget, state: "open", sort: "due_on", direction: "asc" }, signal);
			return { data: { milestones: summarizeMilestones(result.milestones) }, truncated: result.truncated };
		}
		case "assignees": {
			const result = await runtime.client.listAssignees(budget, signal);
			return { data: { assignees: summarizeAssignees(result.assignees) }, truncated: result.truncated };
		}
		case "projects": {
			const result = await runtime.client.listProjectsV2({ ...budget, scope: "repository", includeClosed: false }, signal);
			return { data: { projects: result.projects }, truncated: result.truncated };
		}
	}
}

function summarizeOverviewIssue(runtime: IssueMeRuntime, issue: GitHubIssueResponse): ToolIssueSummary {
	const record = githubIssueToRecord(runtime.client.repository, issue);
	const summary = issueRecordToToolSummary(record);
	// This is metadata discovery, not a comment-cache result or relationship inspection.
	delete summary.commentsTruncated;
	delete summary.commentsFetchLimit;
	delete summary.parentIssue;
	delete summary.subIssues;
	summary.updatedAt = record.updated_at;
	if (issue.milestone === null) summary.milestone = null;
	else if (issue.milestone !== undefined) {
		if (!isObject(issue.milestone) || !Number.isSafeInteger(issue.milestone.number) || Number(issue.milestone.number) < 1 || typeof issue.milestone.title !== "string" || !issue.milestone.title.trim()) {
			throw new GitHubApiError("GitHub returned malformed issue milestone metadata.", { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID });
		}
		summary.milestone = { number: Number(issue.milestone.number), title: issue.milestone.title };
	}
	return summary;
}

function buildOverviewDetails(runtime: IssueMeRuntime, results: SectionRead[], startedAt: string): IssueMeToolDetails {
	const sections = Object.fromEntries(OVERVIEW_SECTIONS.map((name) => [name, { status: "omitted", drillDown: DRILL_DOWN[name] }])) as Record<OverviewSectionName, ToolOverviewSection>;
	const details: IssueMeToolDetails = {
		repository: runtime.repository,
		creatorScope: issueCreatorScopeLabel(runtime.config),
		cacheUpdated: false,
		needsSync: false,
		overview: { startedAt, fetchedAt: new Date().toISOString(), maxRequests: results.length, sections },
	};
	for (const result of results) {
		sections[result.name] = result.metadata;
		// Copy only the section's collection, not another reader's common result envelope.
		Object.assign(details, { [result.name]: result.data[result.name] });
	}
	const failed = results.filter((result) => result.metadata.status === "unavailable");
	if (failed.length === 0) {
		details.result = "success";
		details.status = "overview";
	} else {
		const allUnavailable = failed.length === results.length;
		details.result = allUnavailable ? "error" : "partial_success";
		details.status = allUnavailable ? "overview_unavailable" : "overview_partial";
		details.error = failed[0].metadata.error;
	}
	details.truncated = results.some((result) => result.metadata.status === "truncated");
	return details;
}
