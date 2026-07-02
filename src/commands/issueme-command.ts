import { constants as fsConstants } from "node:fs";
import { access, realpath, stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { DEFAULT_CONFIG_PATH, EXTENSION_COMMAND_NAME, EXTENSION_DISPLAY_NAME, PROJECT_TRUST_REQUIREMENT } from "../constants.ts";
import { DEFAULT_ISSUEME_CONFIG, getIssueMeConfigPath, loadIssueMeConfig, saveIssueMeConfig } from "../config/config.ts";
import { ISSUEME_ERROR_CODES, IssueMeError, isNodeError } from "../errors.ts";
import { resolveCurrentRepository } from "../github/repository.ts";
import { listIssueFileEntries } from "../issues/store.ts";
import { ISSUEME_TOOL_NAMES } from "../tools/inventory.ts";
import { getGitHubTokenStatus } from "../utils/env.ts";
import { resolveIssueMeProjectRoot } from "../utils/project-root.ts";
import { assertPathInside, toProjectRelativePath } from "../utils/slug.ts";
import type { IssueMeConfig } from "../types.ts";
import { IssueMeConfigTui, type ConfigTuiTheme } from "./config-tui.ts";

export type IssueMeCommand =
	| { kind: "config" }
	| { kind: "info"; warning?: string }
	| { kind: "start"; skillPath?: string };

export function registerIssueMeCommand(pi: ExtensionAPI) {
	pi.registerCommand(EXTENSION_COMMAND_NAME, {
		description: "Configure IssueMe, show status, or start an IssueMe skill workflow",
		handler: async (args, ctx) => {
			const command = parseIssueMeCommand(args);
			if (command.kind === "config") return openConfig(pi, ctx);
			if (command.kind === "info") return showInfo(pi, ctx, command.warning);
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
		if (rest.length === 0) return { kind: "start" };
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
	const projectRoot = await resolveInfoProjectRoot(ctx, trusted);
	const { config, configError } = await loadInfoConfigForTrust(projectRoot, trusted);
	const tokenStatus = await getGitHubTokenStatus(projectRoot, process.env, { readProjectEnv: trusted });
	const repositoryStatus = await resolveInfoRepositoryStatus(projectRoot, trusted);
	const cacheResult = await listInfoCache(projectRoot, config, trusted, configError);
	const display = configDisplayValues(config, configError);
	const combinedWarning = combineInfoWarnings(warning, configError);
	const text = renderIssueMeInfo({
		warning: combinedWarning,
		trusted,
		repositoryStatus,
		tokenStatus: formatGitHubTokenStatus(tokenStatus),
		configPath: DEFAULT_CONFIG_PATH,
		configStatus: configError ? `error (${configError.message})` : undefined,
		issueDirectory: display.issueDirectory,
		allowedIssueCreator: display.allowedIssueCreator,
		defaultSkillPath: display.defaultSkillPath,
		cachedIssues: cacheResult.files.length,
		invalidCacheFiles: cacheResult.invalidFiles.length,
	});
	pi.sendMessage({
		customType: "issueme-info",
		display: true,
		content: text,
		details: {
			warning: combinedWarning,
			trusted,
			repositoryStatus,
			tokenPresent: tokenStatus.present,
			configPath: DEFAULT_CONFIG_PATH,
			configStatus: configError ? "error" : "ok",
			...(configError ? { configError: safeConfigErrorDetails(configError) } : {}),
			issueDirectory: display.issueDirectory,
			allowedIssueCreator: display.allowedIssueCreator,
			defaultSkillPath: display.defaultSkillPath,
			cachedIssues: cacheResult.files.length,
			invalidCacheFiles: cacheResult.invalidFiles.length,
			tools: [...ISSUEME_TOOL_NAMES],
		},
	});
}

async function resolveInfoProjectRoot(ctx: ExtensionCommandContext, trusted: boolean): Promise<string> {
	return trusted ? (await resolveIssueMeProjectRoot(ctx.cwd)).root : resolve(ctx.cwd);
}

async function loadInfoConfigForTrust(projectRoot: string, trusted: boolean): Promise<{ config: IssueMeConfig; configError?: IssueMeError }> {
	if (!trusted) return { config: DEFAULT_ISSUEME_CONFIG, configError: undefined };
	return loadInfoConfig(projectRoot);
}

async function resolveInfoRepositoryStatus(projectRoot: string, trusted: boolean): Promise<string> {
	try {
		const repository = await resolveCurrentRepository(projectRoot, process.env, { allowGitConfig: trusted });
		return repository.fullName;
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}
}

async function listInfoCache(projectRoot: string, config: IssueMeConfig, trusted: boolean, configError: IssueMeError | undefined): ReturnType<typeof listIssueFileEntries> {
	if (!trusted || configError) return { files: [], invalidFiles: [] };
	return listIssueFileEntries(projectRoot, config);
}

function configDisplayValues(config: IssueMeConfig, configError: IssueMeError | undefined): { issueDirectory: string; allowedIssueCreator: string; defaultSkillPath: string | null } {
	if (configError) {
		return {
			issueDirectory: INFO_CONFIG_UNAVAILABLE,
			allowedIssueCreator: INFO_CONFIG_UNAVAILABLE,
			defaultSkillPath: INFO_CONFIG_UNAVAILABLE,
		};
	}
	return {
		issueDirectory: config.issueDirectory,
		allowedIssueCreator: config.allowedIssueCreator,
		defaultSkillPath: config.defaultSkillPath,
	};
}

function combineInfoWarnings(warning: string | undefined, configError: IssueMeError | undefined): string | undefined {
	return [warning, configError ? `IssueMe config error: ${configError.message}` : undefined]
		.filter((line): line is string => line !== undefined && line.length > 0)
		.join("\n") || undefined;
}

function formatGitHubTokenStatus(tokenStatus: Awaited<ReturnType<typeof getGitHubTokenStatus>>): string {
	if (tokenStatus.present) return `present (${tokenStatus.source})`;
	if (tokenStatus.error) return `error (${tokenStatus.message})`;
	return "missing";
}

const INFO_CONFIG_UNAVAILABLE = "unavailable until config is fixed";

async function loadInfoConfig(projectRoot: string): Promise<{ config: IssueMeConfig; configError?: IssueMeError }> {
	try {
		return { config: await loadIssueMeConfig(projectRoot) };
	} catch (error) {
		return { config: DEFAULT_ISSUEME_CONFIG, configError: normalizeConfigError(error) };
	}
}

function normalizeConfigError(error: unknown): IssueMeError {
	if (error instanceof IssueMeError) return error;
	return new IssueMeError(ISSUEME_ERROR_CODES.CONFIG_READ_FAILED, "Unable to read IssueMe config.");
}

function safeConfigErrorDetails(error: IssueMeError): Record<string, unknown> {
	return {
		code: error.code,
		category: error.category,
		message: error.message,
		recoveryHint: error.recoveryHint,
		details: error.safeDetails,
	};
}

export function renderIssueMeInfo(input: {
	warning?: string;
	trusted: boolean;
	repositoryStatus: string;
	tokenStatus: string;
	configPath: string;
	configStatus?: string;
	issueDirectory: string;
	allowedIssueCreator: string;
	defaultSkillPath: string | null;
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
		"/issueme start [skill-path] - use an explicit skill path, or configured defaultSkillPath when omitted",
		"",
		`Project trusted: ${input.trusted ? "yes" : "no (project-local .env/config/cache ignored)"}`,
		`Repository: ${input.repositoryStatus}`,
		`Token: ${input.tokenStatus}`,
		`Config path: ${input.configPath}`,
		input.configStatus ? `Config status: ${input.configStatus}` : undefined,
		`Issue directory: ${input.issueDirectory}`,
		`Allowed issue creator: ${input.allowedIssueCreator}`,
		`Default skill path: ${input.defaultSkillPath ?? "not set"}`,
		`Cached open issue files: ${input.cachedIssues}`,
		`Invalid cache files: ${input.invalidCacheFiles}`,
		"",
		"Tools:",
		...ISSUEME_TOOL_NAMES.map((tool) => `- ${tool}`),
		"",
		"Troubleshooting:",
		"- Run issueme_sync_issues before relying on local issue files.",
		"- Set GH_TOKEN or GITHUB_TOKEN; project .env is used only in trusted projects.",
		"- IssueMe uses GitHub REST and GraphQL APIs directly; no GitHub CLI or webhooks are used.",
	].filter((line): line is string => line !== undefined).join("\n");
}

async function startWorkflow(pi: ExtensionAPI, ctx: ExtensionCommandContext, skillPathArgument?: string): Promise<void> {
	if (!ctx.isProjectTrusted()) {
		throw new IssueMeError("project_untrusted", `IssueMe start requires project trust before validating a project-local skill path. ${PROJECT_TRUST_REQUIREMENT}`);
	}
	const projectRoot = (await resolveIssueMeProjectRoot(ctx.cwd)).root;
	const explicitSkillPath = skillPathArgument?.trim();
	const configuredSkillPath = explicitSkillPath ? undefined : (await loadIssueMeConfig(projectRoot)).defaultSkillPath;
	const rawSkillPath = explicitSkillPath || configuredSkillPath;
	if (!rawSkillPath) {
		return showInfo(pi, ctx, `Usage: /issueme start [skill-path]. Pass a skill path or set defaultSkillPath in ${DEFAULT_CONFIG_PATH}.`);
	}
	const skillPath = resolveSkillPath(projectRoot, rawSkillPath);
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

	let realProjectRoot: string;
	let realSkillPath: string;
	try {
		[realProjectRoot, realSkillPath] = await Promise.all([realpath(projectRoot), realpath(skillPath)]);
		assertSkillPathInsideProject(realProjectRoot, realSkillPath);
	} catch (error) {
		if (error instanceof IssueMeError) throw error;
		throw new IssueMeError("skill_path_unreadable", `Skill path could not be resolved safely: ${relativePath}`);
	}

	try {
		await access(realSkillPath, fsConstants.R_OK);
	} catch {
		throw new IssueMeError("skill_path_unreadable", `Skill path is not readable: ${relativePath}`);
	}
	return toProjectRelativePath(realProjectRoot, realSkillPath);
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
