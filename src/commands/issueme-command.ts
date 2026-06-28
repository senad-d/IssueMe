import { constants as fsConstants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { DEFAULT_CONFIG_PATH, EXTENSION_COMMAND_NAME, EXTENSION_DISPLAY_NAME, PROJECT_TRUST_REQUIREMENT } from "../constants.ts";
import { DEFAULT_ISSUEME_CONFIG, getIssueMeConfigPath, loadIssueMeConfig, saveIssueMeConfig } from "../config/config.ts";
import { ISSUEME_ERROR_CODES, IssueMeError, isNodeError } from "../errors.ts";
import { resolveCurrentRepository } from "../github/repository.ts";
import { listIssueFileEntries } from "../issues/store.ts";
import { getGitHubTokenStatus } from "../utils/env.ts";
import { resolveIssueMeProjectRoot } from "../utils/project-root.ts";
import { assertPathInside, toProjectRelativePath } from "../utils/slug.ts";
import type { IssueMeConfig } from "../types.ts";
import { IssueMeConfigTui, type ConfigTuiTheme } from "./config-tui.ts";

const TOOL_NAMES = [
	"issueme_sync_issues",
	"issueme_list_issues",
	"issueme_list_labels",
	"issueme_list_milestones",
	"issueme_list_assignees",
	"issueme_list_projects",
	"issueme_get_project_fields",
	"issueme_add_issue_to_project",
	"issueme_update_project_item",
	"issueme_manage_label",
	"issueme_manage_milestone",
	"issueme_create_issue",
	"issueme_create_sub_issue",
	"issueme_add_sub_issue",
	"issueme_remove_sub_issue",
	"issueme_reorder_sub_issues",
	"issueme_list_sub_issues",
	"issueme_list_issue_development_links",
	"issueme_get_issue",
	"issueme_update_issue",
	"issueme_comment_issue",
	"issueme_update_comment",
	"issueme_delete_comment",
	"issueme_assign_issue",
	"issueme_label_issue",
	"issueme_reopen_issue",
	"issueme_close_issue",
	"issueme_bulk_update_issues",
] as const;

export type IssueMeCommand =
	| { kind: "config" }
	| { kind: "info"; warning?: string }
	| { kind: "start"; skillPath: string }
	| { kind: "start-error"; message: string };

export function registerIssueMeCommand(pi: ExtensionAPI) {
	pi.registerCommand(EXTENSION_COMMAND_NAME, {
		description: "Configure IssueMe, show status, or start an IssueMe skill workflow",
		handler: async (args, ctx) => {
			const command = parseIssueMeCommand(args);
			if (command.kind === "config") return openConfig(pi, ctx);
			if (command.kind === "info") return showInfo(pi, ctx, command.warning);
			if (command.kind === "start-error") return showInfo(pi, ctx, command.message);
			return startWorkflow(pi, ctx, command.skillPath);
		},
	});
}

export function parseIssueMeCommand(args: string): IssueMeCommand {
	const tokens = splitCommandArgs(args.trim());
	if (tokens.length === 0) return { kind: "config" };
	const [subcommand, ...rest] = tokens;
	if (subcommand === "info" || subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
		return { kind: "info" };
	}
	if (subcommand === "start") {
		if (rest.length === 0) return { kind: "start-error", message: "Usage: /issueme start <skill-path>" };
		return { kind: "start", skillPath: rest.join(" ") };
	}
	return { kind: "info", warning: `Unknown /issueme subcommand: ${subcommand}` };
}

async function openConfig(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
	if (!ctx.isProjectTrusted()) {
		const text = `${EXTENSION_DISPLAY_NAME} config was not opened because this project is not trusted. ${PROJECT_TRUST_REQUIREMENT}`;
		if (ctx.hasUI) ctx.ui.notify(text, "warning");
		pi.sendMessage({ customType: "issueme-config", display: true, content: text, details: { trusted: false } });
		return;
	}

	const projectRoot = (await resolveIssueMeProjectRoot(ctx.cwd)).root;
	const config = await loadIssueMeConfig(projectRoot);
	if (ctx.mode !== "tui" || !ctx.hasUI) {
		const reason = ctx.mode === "tui"
			? `${EXTENSION_DISPLAY_NAME} configuration needs UI support, but no UI is available for this command context.`
			: `${EXTENSION_DISPLAY_NAME} configuration is interactive only in TUI mode.`;
		const text = [
			reason,
			`Edit ${toProjectRelativePath(projectRoot, getIssueMeConfigPath(projectRoot))} with non-secret settings only.`,
			"Current config:",
			JSON.stringify(config, null, 2),
		].join("\n");
		pi.sendMessage({ customType: "issueme-config", display: true, content: text, details: { configPath: DEFAULT_CONFIG_PATH, mode: ctx.mode, hasUI: ctx.hasUI } });
		return;
	}

	const nextConfig = await ctx.ui.custom<IssueMeConfig | undefined>((tui, theme, _keybindings, done) => {
		const configTheme: ConfigTuiTheme = {
			fg: (role, text) => theme.fg(role as Parameters<typeof theme.fg>[0], text),
			bold: (text) => theme.bold(text),
		};
		return new IssueMeConfigTui(projectRoot, config, configTheme, done, () => tui.requestRender());
	});

	if (nextConfig === undefined) {
		if (ctx.hasUI) ctx.ui.notify("IssueMe config unchanged.", "info");
		return;
	}

	try {
		await saveIssueMeConfig(projectRoot, nextConfig);
		if (ctx.hasUI) ctx.ui.notify("IssueMe config saved.", "info");
		pi.sendMessage({
			customType: "issueme-config",
			display: true,
			content: `IssueMe config saved to ${DEFAULT_CONFIG_PATH}. Secrets were not accepted for persistence.`,
			details: { configPath: DEFAULT_CONFIG_PATH },
		});
	} catch (error) {
		const safeError = error instanceof IssueMeError
			? error
			: new IssueMeError(ISSUEME_ERROR_CODES.CONFIG_SAVE_FAILED, "IssueMe config could not be saved safely.");
		if (ctx.hasUI) ctx.ui.notify(`IssueMe config not saved: ${safeError.message}`, "error");
		throw safeError;
	}
}

async function showInfo(pi: ExtensionAPI, ctx: ExtensionCommandContext, warning?: string): Promise<void> {
	const trusted = ctx.isProjectTrusted();
	const projectRoot = trusted ? (await resolveIssueMeProjectRoot(ctx.cwd)).root : resolve(ctx.cwd);
	const config = trusted ? await loadIssueMeConfig(projectRoot) : DEFAULT_ISSUEME_CONFIG;
	const tokenStatus = await getGitHubTokenStatus(projectRoot, process.env, { readProjectEnv: trusted });
	let repositoryStatus: string;
	try {
		const repository = await resolveCurrentRepository(projectRoot, process.env, { allowGitConfig: trusted });
		repositoryStatus = repository.fullName;
	} catch (error) {
		repositoryStatus = error instanceof Error ? error.message : String(error);
	}

	const cacheResult = trusted ? await listIssueFileEntries(projectRoot, config) : { files: [], invalidFiles: [] };
	const text = renderIssueMeInfo({
		warning,
		trusted,
		repositoryStatus,
		tokenStatus: tokenStatus.present ? `present (${tokenStatus.source})` : tokenStatus.error ? `error (${tokenStatus.message})` : "missing",
		configPath: DEFAULT_CONFIG_PATH,
		issueDirectory: config.issueDirectory,
		cachedIssues: cacheResult.files.length,
		invalidCacheFiles: cacheResult.invalidFiles.length,
	});
	pi.sendMessage({
		customType: "issueme-info",
		display: true,
		content: text,
		details: {
			warning,
			trusted,
			repositoryStatus,
			tokenPresent: tokenStatus.present,
			configPath: DEFAULT_CONFIG_PATH,
			issueDirectory: config.issueDirectory,
			cachedIssues: cacheResult.files.length,
			invalidCacheFiles: cacheResult.invalidFiles.length,
			tools: [...TOOL_NAMES],
		},
	});
}

export function renderIssueMeInfo(input: {
	warning?: string;
	trusted: boolean;
	repositoryStatus: string;
	tokenStatus: string;
	configPath: string;
	issueDirectory: string;
	cachedIssues: number;
	invalidCacheFiles: number;
}): string {
	return [
		input.warning,
		`${EXTENSION_DISPLAY_NAME} help and status`,
		"",
		"Usage:",
		"/issueme - open the non-secret configuration TUI",
		"/issueme info | help | --help | -h - show this help/status view",
		"/issueme start <skill-path> - ask the agent to use a skill with IssueMe tools",
		"",
		`Project trusted: ${input.trusted ? "yes" : "no (project-local .env/config/cache ignored)"}`,
		`Repository: ${input.repositoryStatus}`,
		`Token: ${input.tokenStatus}`,
		`Config path: ${input.configPath}`,
		`Issue directory: ${input.issueDirectory}`,
		`Cached open issue files: ${input.cachedIssues}`,
		`Invalid cache files: ${input.invalidCacheFiles}`,
		"",
		"Tools:",
		...TOOL_NAMES.map((tool) => `- ${tool}`),
		"",
		"Troubleshooting:",
		"- Run issueme_sync_issues before relying on local issue files.",
		"- Set GH_TOKEN or GITHUB_TOKEN; project .env is used only in trusted projects.",
		"- IssueMe uses GitHub REST and GraphQL APIs directly; no GitHub CLI or webhooks are used.",
	].filter((line): line is string => line !== undefined).join("\n");
}

async function startWorkflow(pi: ExtensionAPI, ctx: ExtensionCommandContext, skillPathArgument: string): Promise<void> {
	if (!ctx.isProjectTrusted()) {
		throw new IssueMeError("project_untrusted", `IssueMe start requires project trust before validating a project-local skill path. ${PROJECT_TRUST_REQUIREMENT}`);
	}
	const projectRoot = (await resolveIssueMeProjectRoot(ctx.cwd)).root;
	const skillPath = resolveSkillPath(projectRoot, skillPathArgument);
	const readableSkillPath = await assertReadableProjectSkillPath(projectRoot, skillPath);
	const prompt = [
		`Read and use the IssueMe workflow skill at @${readableSkillPath}.`,
		"Use the IssueMe tools for GitHub issue management in the current repository.",
		"Start by calling issueme_sync_issues when current issue state matters.",
		"Do not update, comment on, label, assign, or close closed issues.",
	].join("\n");
	if (ctx.isIdle()) pi.sendUserMessage(prompt);
	else pi.sendUserMessage(prompt, { deliverAs: "followUp" });
	if (ctx.hasUI) ctx.ui.notify("IssueMe workflow prompt sent to the agent.", "info");
}

async function assertReadableProjectSkillPath(projectRoot: string, skillPath: string): Promise<string> {
	const relativePath = toProjectRelativePath(projectRoot, skillPath);
	let skillStat: Awaited<ReturnType<typeof stat>>;
	try {
		skillStat = await stat(skillPath);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			throw new IssueMeError("skill_path_not_found", `Skill path does not exist: ${relativePath}`);
		}
		throw new IssueMeError("skill_path_unreadable", `Skill path could not be inspected safely: ${relativePath}`);
	}

	if (!skillStat.isFile()) {
		throw new IssueMeError("skill_path_not_file", `Skill path must be a readable file, not a directory or special file: ${relativePath}`);
	}

	let realSkillPath: string;
	try {
		const [realProjectRoot, resolvedSkillPath] = await Promise.all([realpath(projectRoot), realpath(skillPath)]);
		assertSkillPathInsideProject(realProjectRoot, resolvedSkillPath);
		realSkillPath = resolvedSkillPath;
	} catch (error) {
		if (error instanceof IssueMeError) throw error;
		throw new IssueMeError("skill_path_unreadable", `Skill path could not be resolved safely: ${relativePath}`);
	}

	try {
		await access(realSkillPath, fsConstants.R_OK);
	} catch {
		throw new IssueMeError("skill_path_unreadable", `Skill path is not readable: ${relativePath}`);
	}
	return realSkillPath;
}

function resolveSkillPath(projectRoot: string, rawPath: string): string {
	const stripped = rawPath.trim().replace(/^@/, "");
	if (!stripped || stripped.includes("\0")) throw new IssueMeError("invalid_skill_path", "Skill path is empty or invalid.");
	const absolute = isAbsolute(stripped) ? resolve(stripped) : resolve(projectRoot, stripped);
	assertSkillPathInsideProject(projectRoot, absolute);
	return absolute;
}

function assertSkillPathInsideProject(projectRoot: string, skillPath: string): void {
	try {
		assertPathInside(projectRoot, skillPath, "Skill path must stay inside the current project.");
	} catch (error) {
		if (error instanceof IssueMeError && error.code === "unsafe_path") {
			throw new IssueMeError("unsafe_skill_path", "Skill path must stay inside the current project.");
		}
		throw error;
	}
}

function splitCommandArgs(input: string): string[] {
	const tokens: string[] = [];
	let current = "";
	let quote: "\"" | "'" | undefined;
	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];
		const next = input[index + 1];
		if (char === "\\" && quote !== "'" && isEscapableCommandChar(next, quote)) {
			current += next;
			index += 1;
			continue;
		}
		if ((char === "\"" || char === "'") && quote === undefined) {
			quote = char;
			continue;
		}
		if (quote === char) {
			quote = undefined;
			continue;
		}
		if (/\s/.test(char) && quote === undefined) {
			if (current) tokens.push(current);
			current = "";
			continue;
		}
		current += char;
	}
	if (current) tokens.push(current);
	return tokens;
}

function isEscapableCommandChar(value: string | undefined, quote: "\"" | "'" | undefined): value is string {
	if (value === undefined) return false;
	if (quote === "\"") return value === "\"" || value === "\\";
	return /\s/.test(value) || value === "\"" || value === "'" || value === "\\";
}
