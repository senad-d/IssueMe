import { isAbsolute, relative, resolve, sep } from "node:path";

import { DEFAULT_ISSUES_DIR, LOCAL_ISSUE_FILE_EXTENSION, MAX_TITLE_SLUG_LENGTH, PROTECTED_ISSUE_DIRECTORIES } from "../constants.ts";
import { IssueMeError } from "../errors.ts";

const PROTECTED_DIRECTORY_SET = new Set<string>(PROTECTED_ISSUE_DIRECTORIES.map((directory) => directory.toLowerCase()));

export function slugifyIssueTitle(title: string, maxLength = MAX_TITLE_SLUG_LENGTH): string {
	const normalized = title
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-");

	const clipped = normalized.slice(0, Math.max(1, maxLength)).replace(/-+$/g, "");
	return clipped || "issue";
}

export function issueFileName(issueNumber: number, title: string): string {
	assertIssueNumber(issueNumber);
	return `${issueNumber}-${slugifyIssueTitle(title)}${LOCAL_ISSUE_FILE_EXTENSION}`;
}

export function parseIssueNumberFromFileName(fileName: string): number | undefined {
	const match = fileName.match(/^(\d+)-.+\.json$/);
	if (!match) return undefined;
	const number = Number(match[1]);
	return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export function normalizeIssueDirectoryValue(issueDirectory: string | undefined): string {
	const cleanDirectory = stripLeadingAt((issueDirectory ?? DEFAULT_ISSUES_DIR).trim() || DEFAULT_ISSUES_DIR);
	if (cleanDirectory.includes("\0")) {
		throw new IssueMeError("unsafe_issue_directory", "Issue directory contains an invalid null byte.");
	}
	return cleanDirectory;
}

export function assertSafeIssueDirectoryValue(issueDirectory: string, options: { allowAbsolute?: boolean } = {}): void {
	const normalized = normalizeIssueDirectoryValue(issueDirectory);
	if (!options.allowAbsolute && isAbsolutePath(normalized)) {
		throw new IssueMeError("unsafe_issue_directory", "Issue directory must be project-relative.");
	}
	if (normalized === ".") {
		throw new IssueMeError("unsafe_issue_directory", "Issue directory cannot be the project root.");
	}
	if (normalized.startsWith("../") || normalized === ".." || normalized.includes("/../") || normalized.includes("\\..\\")) {
		throw new IssueMeError("unsafe_issue_directory", "Issue directory cannot use path traversal.");
	}

	const parts = normalized.split(/[\\/]+/).filter(Boolean);
	for (const part of parts) {
		if (part === "..") {
			throw new IssueMeError("unsafe_issue_directory", "Issue directory cannot use path traversal.");
		}
		const normalizedPart = part.toLowerCase();
		if (PROTECTED_DIRECTORY_SET.has(normalizedPart)) {
			throw new IssueMeError("unsafe_issue_directory", `Issue directory cannot be or contain protected directory: ${part}.`);
		}
	}
}

export function resolveIssueDirectory(cwd: string, issueDirectory = DEFAULT_ISSUES_DIR): string {
	const cleanDirectory = normalizeIssueDirectoryValue(issueDirectory);
	assertSafeIssueDirectoryValue(cleanDirectory);
	const absolute = resolve(cwd, cleanDirectory);
	assertPathInside(cwd, absolute, "Issue directory must stay inside the current project.");
	if (resolve(cwd) === absolute) {
		throw new IssueMeError("unsafe_issue_directory", "Issue directory cannot be the project root.");
	}
	return absolute;
}

export function resolveIssueFilePath(cwd: string, issueDirectory: string, issueNumber: number, title: string): string {
	const directory = resolveIssueDirectory(cwd, issueDirectory);
	const targetPath = resolve(directory, issueFileName(issueNumber, title));
	assertPathInside(directory, targetPath, "Issue file path must stay inside the configured issue directory.");
	return targetPath;
}

export function resolveExistingIssueFilePath(cwd: string, issueDirectory: string, filePath: string): string {
	const directory = resolveIssueDirectory(cwd, issueDirectory);
	const cleanPath = stripLeadingAt(filePath.trim());
	if (!cleanPath || cleanPath.includes("\0")) {
		throw new IssueMeError("unsafe_issue_file", "Issue file path is empty or invalid.");
	}
	const hasPathSeparator = cleanPath.includes("/") || cleanPath.includes("\\");
	const absolute = isAbsolute(cleanPath)
		? resolve(cleanPath)
		: hasPathSeparator
			? resolve(cwd, cleanPath)
			: resolve(directory, cleanPath);
	assertPathInside(directory, absolute, "Issue file lookup must stay inside the configured issue directory.");
	return absolute;
}

export function assertPathInside(parentDirectory: string, childPath: string, message = "Path is outside the allowed directory."): void {
	const parent = resolve(parentDirectory);
	const child = resolve(childPath);
	const rel = relative(parent, child);
	if (rel === "" || (!isParentTraversalRelativePath(rel) && !isAbsolute(rel))) return;
	throw new IssueMeError("unsafe_path", message);
}

function isParentTraversalRelativePath(value: string): boolean {
	return value === ".." || value.startsWith("../") || value.startsWith("..\\");
}

export function assertPathNotEqual(parentDirectory: string, childPath: string, message: string): void {
	if (resolve(parentDirectory) === resolve(childPath)) throw new IssueMeError("unsafe_path", message);
}

function assertIssueNumber(issueNumber: number): void {
	if (!Number.isSafeInteger(issueNumber) || issueNumber <= 0) {
		throw new IssueMeError("invalid_issue_number", "Issue number must be a positive safe integer.");
	}
}

function stripLeadingAt(value: string): string {
	return value.startsWith("@") ? value.slice(1) : value;
}

function isAbsolutePath(value: string): boolean {
	return isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

export function toProjectRelativePath(cwd: string, absolutePath: string): string {
	const rel = relative(cwd, absolutePath);
	if (rel === "") return ".";
	return rel.split(sep).join("/");
}
