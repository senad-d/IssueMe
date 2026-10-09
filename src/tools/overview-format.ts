import { MAX_TOOL_TEXT_CHARS } from "../constants.ts";
import { OVERVIEW_SECTIONS, type IssueMeToolDetails, type OverviewSectionName, type ToolIssueSummary, type ToolLabelSummary, type ToolOverviewSection } from "../types.ts";
import { sanitizeTerminalText } from "../utils/terminal-text.ts";
import { toolText } from "./runtime.ts";

export function overviewToolText(details: IssueMeToolDetails) {
	const overview = details.overview;
	if (!overview) throw new Error("Overview metadata is required.");
	const selected = OVERVIEW_SECTIONS.filter((name) => overview.sections[name].status !== "omitted");
	const sectionBudget = Math.floor((MAX_TOOL_TEXT_CHARS - 2000) / selected.length);
	const lines = [
		`Repository overview: ${details.repository} (${details.result}).`,
		`Fetched: ${overview.fetchedAt}; live reads, not an atomic snapshot.`,
		`Open issues: creator scope ${details.creatorScope}, most recently updated first. Other metadata and milestone counts are repository-wide.`,
		"Read-only; no cache writes. Counts below are returned rows, not repository totals. One page per selected section.",
	];
	for (const name of OVERVIEW_SECTIONS) {
		const section = overview.sections[name];
		if (section.status === "omitted") {
			lines.push(`${name}: omitted (not requested).`);
			continue;
		}
		lines.push(renderSection(name, section, overviewRows(name, details), sectionBudget));
		if (section.displayTruncated) details.truncated = true;
	}
	lines.push(
		"Drill down: issueme_get_issue(number, refresh:true) reads current detail and updates its cache; issueme_list_sub_issues(issueNumber) and issueme_list_issue_development_links(issueNumber) inspect relationships/work.",
		"Projects: issueme_get_project_fields(projectId) reads field options. Board items/values, comments, full relationship/timeline data, CI, reviews, releases, and unlinked branches are not inspected here.",
		"Use issueme_sync_issues only when local cache synchronization is needed; unavailable overview sections do not require sync. Recheck targets before mutations.",
	);
	return toolText(lines.join("\n"), details);
}

function renderSection(name: OverviewSectionName, section: ToolOverviewSection, rows: string[], budget: number): string {
	if (section.status === "unavailable") {
		return `${name}: unavailable (${section.error?.code}). ${shortLine(section.error?.message ?? "GitHub read failed.", 240)} Retry with ${section.drillDown}.`;
	}
	const lines = [`${name}: ${section.returned} returned; ${section.status}; drill down: ${section.drillDown}.`];
	let remaining = budget - lines[0].length - 160;
	let shown = 0;
	for (const row of rows) {
		const line = shortLine(row, 300);
		if (line.length + 1 > remaining) break;
		if (line !== sanitizeTerminalText(row)) section.displayTruncated = true;
		lines.push(line);
		remaining -= line.length + 1;
		shown += 1;
	}
	if (shown < rows.length) section.displayTruncated = true;
	if (section.displayTruncated) lines.push(`Display shortened (${shown}/${rows.length} rows); use ${section.drillDown} for focused output and exact values.`);
	if (section.status === "truncated") lines.push("More data may exist beyond this page or summary bounds; do not infer absence.");
	return lines.join("\n");
}

function shortLine(text: string, limit: number): string {
	const clean = sanitizeTerminalText(text);
	return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}

function overviewRows(name: OverviewSectionName, details: IssueMeToolDetails): string[] {
	switch (name) {
		case "issues": return (details.issues ?? []).map(formatIssue);
		case "labels": return (details.labels ?? []).map(formatLabel);
		case "milestones": return (details.milestones ?? []).map((milestone) => `- #${milestone.number} ${milestone.title}; due ${milestone.due_on ?? "none"}; GitHub counts: ${milestone.open_issues ?? "?"} open, ${milestone.closed_issues ?? "?"} closed`);
		case "assignees": return (details.assignees ?? []).map((assignee) => `- ${assignee.login}`);
		case "projects": return (details.projects ?? []).map((project) => `- ${project.id} (#${project.number}) ${project.title}; owner ${project.owner}`);
	}
}

function formatLabel(label: ToolLabelSummary): string {
	const description = label.description ? ` — ${label.description}` : "";
	return `- ${label.name}${description}`;
}

function formatIssue(issue: ToolIssueSummary): string {
	const missingMilestone = issue.milestone === null ? "none" : "unknown";
	const milestone = issue.milestone ? `#${issue.milestone.number} ${issue.milestone.title}` : missingMilestone;
	return `- #${issue.number} ${issue.title}; labels: ${issue.labels.join(", ") || "none"}; assignees: ${issue.assignees.join(", ") || "unassigned"}; milestone: ${milestone}; updated ${issue.updatedAt ?? "unknown"}`;
}
