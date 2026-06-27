import { access } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { EXTENSION_COMMAND_NAME, EXTENSION_DISPLAY_NAME } from "../constants.ts";
import { loadIssueMeConfig, saveIssueMeConfig } from "../config/config.ts";
import { IssueMeError } from "../errors.ts";
import { resolveCurrentRepository } from "../github/repository.ts";
import { listIssueFiles } from "../issues/store.ts";
import { getGitHubTokenStatus } from "../utils/env.ts";
import { assertPathInside } from "../utils/slug.ts";

const TOOL_NAMES = [
	"issueme_sync_issues",
	"issueme_create_issue",
	"issueme_get_issue",
	"issueme_update_issue",
	"issueme_comment_issue",
	"issueme_assign_issue",
	"issueme_label_issue",
	"issueme_close_issue",
] as const;

export function registerIssueMeCommand(pi: ExtensionAPI) {
	pi.registerCommand(EXTENSION_COMMAND_NAME, {
		description: "Configure IssueMe, show status, or start an IssueMe skill workflow",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			if (!trimmed) return openConfig(pi, ctx);
			if (trimmed === "info") return showInfo(pi, ctx);
			if (trimmed === "help" || trimmed === "--help" || trimmed === "-h") return showUsage(pi, ctx);
			if (trimmed.startsWith("start")) return startWorkflow(pi, ctx, trimmed.slice("start".length).trim());
			return showUsage(pi, ctx, `Unknown /issueme subcommand: ${trimmed}`);
		},
	});
}

async function openConfig(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const config = await loadIssueMeConfig(ctx.cwd);
	const prefill = `${JSON.stringify(config, null, 2)}\n`;
	if (!ctx.hasUI) {
		pi.sendMessage({
			customType: "issueme-config",
			display: true,
			content: `Edit ${EXTENSION_DISPLAY_NAME} non-secret config at .pi/agent/issueme.json. Current config:\n\n${prefill}`,
			details: { configPath: ".pi/agent/issueme.json" },
		});
		return;
	}

	const edited = await ctx.ui.editor(`${EXTENSION_DISPLAY_NAME} config (non-secret JSON)`, prefill);
	if (edited === undefined) {
		ctx.ui.notify("IssueMe config unchanged.", "info");
		return;
	}

	try {
		const parsed = JSON.parse(edited) as unknown;
		await saveIssueMeConfig(ctx.cwd, parsed);
		ctx.ui.notify("IssueMe config saved.", "info");
		pi.sendMessage({
			customType: "issueme-config",
			display: true,
			content: "IssueMe config saved to .pi/agent/issueme.json. Secrets were not accepted for persistence.",
			details: { configPath: ".pi/agent/issueme.json" },
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		ctx.ui.notify(`IssueMe config not saved: ${message}`, "error");
		throw error;
	}
}

async function showInfo(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	const config = await loadIssueMeConfig(ctx.cwd);
	const tokenStatus = await getGitHubTokenStatus(ctx.cwd);
	let repositoryStatus: string;
	try {
		const repository = await resolveCurrentRepository(ctx.cwd);
		repositoryStatus = repository.fullName;
	} catch (error) {
		repositoryStatus = error instanceof Error ? error.message : String(error);
	}
	const cacheFiles = await listIssueFiles(ctx.cwd, config);
	const text = [
		`${EXTENSION_DISPLAY_NAME} status`,
		"",
		"Usage:",
		"/issueme - edit non-secret config",
		"/issueme info - show this status",
		"/issueme start <skill-path> - ask the agent to use a skill with IssueMe tools",
		"",
		`Repository: ${repositoryStatus}`,
		`Token: ${tokenStatus.present ? `present (${tokenStatus.source})` : "missing"}`,
		`Config path: .pi/agent/issueme.json`,
		`Issue directory: ${config.issueDirectory}`,
		`Cached open issue files: ${cacheFiles.length}`,
		"",
		"Tools:",
		...TOOL_NAMES.map((tool) => `- ${tool}`),
	].join("\n");
	pi.sendMessage({
		customType: "issueme-info",
		display: true,
		content: text,
		details: {
			repositoryStatus,
			tokenPresent: tokenStatus.present,
			configPath: ".pi/agent/issueme.json",
			issueDirectory: config.issueDirectory,
			cachedIssues: cacheFiles.length,
			tools: [...TOOL_NAMES],
		},
	});
}

async function startWorkflow(pi: ExtensionAPI, ctx: ExtensionCommandContext, skillPathArgument: string): Promise<void> {
	if (!skillPathArgument) return showUsage(pi, ctx, "Usage: /issueme start <skill-path>");
	const skillPath = resolveSkillPath(ctx.cwd, skillPathArgument);
	try {
		await access(skillPath);
	} catch {
		throw new IssueMeError("skill_path_not_found", `Skill path does not exist: ${skillPath}`);
	}
	const prompt = [
		`Read and use the IssueMe workflow skill at @${skillPath}.`,
		"Use the IssueMe tools for GitHub issue management in the current repository.",
		"Start by calling issueme_sync_issues when current issue state matters.",
		"Do not update, comment on, label, assign, or close closed issues.",
	].join("\n");
	if (ctx.isIdle()) pi.sendUserMessage(prompt);
	else pi.sendUserMessage(prompt, { deliverAs: "followUp" });
	ctx.ui.notify("IssueMe workflow prompt sent to the agent.", "info");
}

function showUsage(pi: ExtensionAPI, ctx: ExtensionCommandContext, prefix?: string): void {
	const text = [
		prefix,
		`${EXTENSION_DISPLAY_NAME} commands:`,
		"/issueme",
		"/issueme info",
		"/issueme start <skill-path>",
	].filter(Boolean).join("\n");
	if (ctx.hasUI) ctx.ui.notify(text, prefix ? "warning" : "info");
	pi.sendMessage({ customType: "issueme-usage", display: true, content: text, details: {} });
}

function resolveSkillPath(cwd: string, rawPath: string): string {
	const stripped = rawPath.trim().replace(/^@/, "");
	if (!stripped || stripped.includes("\0")) throw new IssueMeError("invalid_skill_path", "Skill path is empty or invalid.");
	const absolute = isAbsolute(stripped) ? resolve(stripped) : resolve(cwd, stripped);
	if (!isAbsolute(stripped)) assertPathInside(cwd, absolute, "Project-relative skill path must stay inside the current project.");
	return absolute;
}
