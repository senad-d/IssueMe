import { lstat, mkdir, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import type {
	InvalidIssueFileDiagnostic,
	IssueFileListResult,
	IssueFileMetadata,
	IssueLookupResult,
	IssueMeConfig,
	IssueRecord,
	IssueWriteResult,
} from "../types.ts";
import { IssueMeError, isNodeError } from "../errors.ts";
import {
	assertPathInside,
	parseIssueNumberFromFileName,
	resolveExistingIssueFilePath,
	resolveIssueDirectory,
	resolveIssueFilePath,
	toProjectRelativePath,
} from "../utils/slug.ts";
import { withCanonicalFileMutationQueue } from "../utils/mutation-queue.ts";

export async function writeIssueRecord(projectRoot: string, config: IssueMeConfig, record: IssueRecord): Promise<IssueWriteResult> {
	if (record.state !== "open") {
		const removedPaths = await removeIssueByNumber(projectRoot, config, record.number, record.repository);
		return { action: "removed", removedPaths };
	}

	const targetPath = resolveIssueFilePath(projectRoot, config.issueDirectory, record.number, record.title);
	await ensureIssueDirectorySafe(projectRoot, config, true);
	const writeResult = await withCanonicalFileMutationQueue(targetPath, async () => {
		await mkdir(dirname(targetPath), { recursive: true });
		const safeDirectory = await ensureIssueDirectorySafe(projectRoot, config, false);
		await ensureTargetFileSafe(targetPath, safeDirectory, projectRoot);
		const existingRecord = await readIssueFileIfExists(targetPath, safeDirectory, projectRoot);
		if (existingRecord && existingRecord.repository !== record.repository) {
			throw new IssueMeError(
				"issue_cache_repository_collision",
				`Issue cache file ${basename(targetPath)} already belongs to ${existingRecord.repository}; refusing to overwrite it with ${record.repository}.`,
				{ fileName: basename(targetPath), existingRepository: existingRecord.repository, repository: record.repository, issueNumber: record.number },
			);
		}

		const recordToWrite = existingRecord && equivalentIssueRecordsIgnoringSyncedAt(existingRecord, record)
			? { ...record, synced_at: existingRecord.synced_at }
			: record;
		const nextText = `${JSON.stringify(orderIssueRecord(recordToWrite), null, 2)}\n`;
		let currentText: string | undefined;
		try {
			await ensureTargetFileSafe(targetPath, safeDirectory, projectRoot);
			currentText = await readFile(targetPath, "utf8");
		} catch (error) {
			if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
		}

		if (currentText === nextText) return { action: "unchanged" as const, path: targetPath, removedPaths: [] };
		await ensureTargetFileSafe(targetPath, safeDirectory, projectRoot);
		await writeFile(targetPath, nextText, "utf8");
		const action = currentText === undefined ? "created" as const : "updated" as const;
		return { action, path: targetPath, removedPaths: [] };
	});

	const staleFiles = (await listIssueFiles(projectRoot, config, { repository: record.repository })).filter(
		(file) => file.number === record.number && resolve(file.path) !== resolve(targetPath),
	);
	const removedPaths = await removeIssueFiles(projectRoot, config, staleFiles);
	const action = writeResult.action === "created" && removedPaths.length > 0 ? "renamed" : writeResult.action;
	return { ...writeResult, action, removedPaths };
}

export async function readIssueByNumber(
	projectRoot: string,
	config: IssueMeConfig,
	issueNumber: number,
	repository?: string,
): Promise<IssueRecord | undefined> {
	const files = await listIssueFiles(projectRoot, config, { repository });
	const matches = files.filter((file) => file.number === issueNumber);
	if (matches.length === 0) return undefined;
	if (!repository && matches.length > 1) {
		throw new IssueMeError("issue_lookup_ambiguous", `Issue #${issueNumber} matches multiple repositories in the local IssueMe cache.`);
	}
	const directory = await ensureIssueDirectorySafe(projectRoot, config, false);
	return readIssueFile(matches[0].path, directory, projectRoot);
}

export async function findIssueByLookup(
	projectRoot: string,
	config: IssueMeConfig,
	lookup: string,
	repository?: string,
): Promise<IssueLookupResult | undefined> {
	const cleanLookup = lookup.trim();
	if (!cleanLookup) return undefined;
	const numeric = Number(cleanLookup.replace(/^#/, ""));
	if (Number.isSafeInteger(numeric) && numeric > 0) return findIssueByNumber(projectRoot, config, numeric, repository);

	if (cleanLookup.endsWith(".json") || cleanLookup.includes("/") || cleanLookup.includes("\\")) {
		try {
			const path = resolveExistingIssueFilePath(projectRoot, config.issueDirectory, cleanLookup);
			const directory = await ensureIssueDirectorySafe(projectRoot, config, false);
			await ensureTargetFileSafe(path, directory, projectRoot);
			const record = await readIssueFile(path, directory, projectRoot);
			if (repository && record.repository !== repository) return undefined;
			return { record, path, metadata: issueMetadataFromRecord(path, record) };
		} catch (error) {
			if (isNodeError(error) && error.code === "ENOENT") return undefined;
			throw error;
		}
	}

	const needle = cleanLookup.toLowerCase();
	const files = await listIssueFiles(projectRoot, config, { repository });
	const matches = files.filter((file) => file.fileName.toLowerCase().includes(needle) || file.title.toLowerCase().includes(needle));
	if (matches.length === 0) return undefined;
	if (matches.length > 1) {
		throw new IssueMeError("issue_lookup_ambiguous", `Issue lookup "${cleanLookup}" matches multiple local IssueMe files.`);
	}
	const metadata = matches[0];
	const directory = await ensureIssueDirectorySafe(projectRoot, config, false);
	return { record: await readIssueFile(metadata.path, directory, projectRoot), path: metadata.path, metadata };
}

export async function readIssueByLookup(projectRoot: string, config: IssueMeConfig, lookup: string): Promise<IssueRecord | undefined> {
	return (await findIssueByLookup(projectRoot, config, lookup))?.record;
}

export async function findIssueByNumber(
	projectRoot: string,
	config: IssueMeConfig,
	issueNumber: number,
	repository?: string,
): Promise<IssueLookupResult | undefined> {
	const files = await listIssueFiles(projectRoot, config, { repository });
	const matches = files.filter((file) => file.number === issueNumber);
	if (matches.length === 0) return undefined;
	if (!repository && matches.length > 1) {
		throw new IssueMeError("issue_lookup_ambiguous", `Issue #${issueNumber} matches multiple repositories in the local IssueMe cache.`);
	}
	const metadata = matches[0];
	const directory = await ensureIssueDirectorySafe(projectRoot, config, false);
	return { record: await readIssueFile(metadata.path, directory, projectRoot), path: metadata.path, metadata };
}

export async function listIssueFiles(
	projectRoot: string,
	config: IssueMeConfig,
	options: { repository?: string } = {},
): Promise<IssueFileMetadata[]> {
	return (await listIssueFileEntries(projectRoot, config, options)).files;
}

export async function listIssueFileEntries(
	projectRoot: string,
	config: IssueMeConfig,
	options: { repository?: string } = {},
): Promise<IssueFileListResult> {
	const directory = await ensureIssueDirectorySafe(projectRoot, config, false);
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return { files: [], invalidFiles: [] };
		throw error;
	}

	const files: IssueFileMetadata[] = [];
	const invalidFiles: InvalidIssueFileDiagnostic[] = [];
	for (const entry of entries) {
		if (!entry.name.endsWith(".json")) continue;
		const path = resolve(directory, entry.name);
		if (!entry.isFile() && !entry.isSymbolicLink()) {
			invalidFiles.push({ path, fileName: entry.name, reason: "issue_file_not_regular" });
			continue;
		}
		const issueNumber = parseIssueNumberFromFileName(entry.name);
		if (!issueNumber) {
			invalidFiles.push({ path, fileName: entry.name, reason: "issue_file_name_invalid" });
			continue;
		}
		try {
			await ensureTargetFileSafe(path, directory, projectRoot);
			const record = await readIssueFile(path, directory, projectRoot);
			if (record.number !== issueNumber) {
				invalidFiles.push({ path, fileName: entry.name, reason: "issue_file_number_mismatch" });
				continue;
			}
			if (options.repository && record.repository !== options.repository) continue;
			files.push(issueMetadataFromRecord(path, record));
		} catch (error) {
			invalidFiles.push({ path, fileName: entry.name, reason: issueFileDiagnosticReason(error) });
		}
	}
	files.sort((a, b) => a.number - b.number || a.repository.localeCompare(b.repository));
	invalidFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));
	return { files, invalidFiles };
}

export async function readIssueFile(path: string, safeDirectory?: string, projectRoot?: string): Promise<IssueRecord> {
	await ensureTargetFileSafe(path, safeDirectory, projectRoot);
	const text = await readFile(path, "utf8");
	let parsed: unknown;
	try {
		parsed = JSON.parse(text) as unknown;
	} catch {
		throw new IssueMeError("issue_file_parse_failed", `Issue file ${basename(path)} is not valid JSON.`, {
			fileName: basename(path),
			reason: "issue_file_parse_failed",
		});
	}
	const validationFailure = validateIssueRecord(parsed);
	if (validationFailure) {
		throw new IssueMeError(
			"issue_file_invalid",
			`Issue file ${basename(path)} is not a valid IssueMe issue JSON file (${validationFailure.field}).`,
			{ fileName: basename(path), ...validationFailure },
		);
	}
	return parsed as IssueRecord;
}

export function issueFileDiagnosticReason(error: unknown): string {
	if (error instanceof IssueMeError) {
		const reason = error.safeDetails?.reason;
		return typeof reason === "string" ? reason : error.code;
	}
	return "issue_file_read_failed";
}

export async function removeIssueByNumber(
	projectRoot: string,
	config: IssueMeConfig,
	issueNumber: number,
	repository?: string,
): Promise<string[]> {
	const files = (await listIssueFiles(projectRoot, config, { repository })).filter((file) => file.number === issueNumber);
	if (!repository && files.length > 1) {
		throw new IssueMeError("issue_lookup_ambiguous", `Issue #${issueNumber} matches multiple repositories in the local IssueMe cache.`);
	}
	return removeIssueFiles(projectRoot, config, files);
}

export async function removeClosedIssueFiles(
	projectRoot: string,
	config: IssueMeConfig,
	openIssueNumbers: ReadonlySet<number>,
	repository?: string,
): Promise<string[]> {
	const files = await listIssueFiles(projectRoot, config, { repository });
	return removeIssueFiles(projectRoot, config, files.filter((file) => file.state === "closed" || !openIssueNumbers.has(file.number)));
}

export function relativeIssuePath(projectRoot: string, absolutePath: string | undefined): string | undefined {
	return absolutePath ? toProjectRelativePath(projectRoot, absolutePath) : undefined;
}

async function removeIssueFiles(projectRoot: string, config: IssueMeConfig, files: IssueFileMetadata[]): Promise<string[]> {
	const removed: string[] = [];
	for (const file of files) {
		await withCanonicalFileMutationQueue(file.path, async () => {
			const directory = await ensureIssueDirectorySafe(projectRoot, config, false);
			await ensureTargetFileSafe(file.path, directory, projectRoot);
			await rm(file.path, { force: true });
		});
		removed.push(file.path);
	}
	return removed;
}

async function ensureIssueDirectorySafe(projectRoot: string, config: IssueMeConfig, forWrite: boolean): Promise<string> {
	const directory = resolveIssueDirectory(projectRoot, config.issueDirectory);
	const rootRealPath = await realpath(projectRoot);
	try {
		const directoryStat = await lstat(directory);
		if (directoryStat.isSymbolicLink()) {
			throw new IssueMeError("unsafe_issue_directory", "Issue directory cannot be a symlink.");
		}
		if (!directoryStat.isDirectory()) {
			throw new IssueMeError("unsafe_issue_directory", "Issue directory path exists but is not a directory.");
		}
		assertPathInside(rootRealPath, await realpath(directory), "Issue directory must resolve inside the current project.");
		return directory;
	} catch (error) {
		if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
		if (!forWrite) return directory;
		const parentRealPath = await nearestExistingParentRealPath(projectRoot, directory);
		assertPathInside(rootRealPath, parentRealPath, "Issue directory parent must resolve inside the current project.");
		return directory;
	}
}

async function nearestExistingParentRealPath(projectRoot: string, target: string): Promise<string> {
	let current = dirname(target);
	while (true) {
		try {
			const stat = await lstat(current);
			if (stat.isSymbolicLink()) throw new IssueMeError("unsafe_issue_directory", "Issue directory parent cannot be a symlink.");
			return await realpath(current);
		} catch (error) {
			if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
		}
		const parent = dirname(current);
		if (parent === current || resolve(current) === resolve(projectRoot)) return await realpath(projectRoot);
		current = parent;
	}
}

async function ensureTargetFileSafe(path: string, safeDirectory?: string, projectRoot?: string): Promise<void> {
	const rootRealPath = projectRoot === undefined ? undefined : await realpath(projectRoot);
	const safeDirectoryRealPath = safeDirectory === undefined ? undefined : await realpath(safeDirectory);
	if (rootRealPath !== undefined && safeDirectoryRealPath !== undefined) {
		assertPathInside(rootRealPath, safeDirectoryRealPath, "Issue directory must resolve inside the current project.");
	}

	try {
		const stat = await lstat(path);
		if (stat.isSymbolicLink()) throw new IssueMeError("unsafe_issue_file", "IssueMe refuses to read or mutate symlinked issue files.");
		if (!stat.isFile()) throw new IssueMeError("unsafe_issue_file", "Issue cache path exists but is not a regular file.");
		const fileRealPath = await realpath(path);
		if (rootRealPath !== undefined) {
			assertPathInside(rootRealPath, fileRealPath, "Issue cache file must resolve inside the current project.");
		}
		if (safeDirectoryRealPath !== undefined) {
			assertPathInside(
				safeDirectoryRealPath,
				fileRealPath,
				"Issue cache file must resolve inside the configured issue directory.",
			);
		}
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") {
			if (safeDirectoryRealPath !== undefined) {
				const parentRealPath = await realpath(dirname(path));
				if (rootRealPath !== undefined) {
					assertPathInside(rootRealPath, parentRealPath, "Issue cache file parent must resolve inside the current project.");
				}
				assertPathInside(safeDirectoryRealPath, parentRealPath, "Issue cache file parent must resolve inside the configured issue directory.");
			}
			return;
		}
		throw error;
	}
}

async function readIssueFileIfExists(path: string, safeDirectory?: string, projectRoot?: string): Promise<IssueRecord | undefined> {
	try {
		return await readIssueFile(path, safeDirectory, projectRoot);
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return undefined;
		throw error;
	}
}

function issueMetadataFromRecord(path: string, record: IssueRecord): IssueFileMetadata {
	return {
		path,
		fileName: basename(path),
		repository: record.repository,
		number: record.number,
		title: record.title,
		state: record.state,
		updated_at: record.updated_at,
	};
}

function equivalentIssueRecordsIgnoringSyncedAt(left: IssueRecord, right: IssueRecord): boolean {
	return JSON.stringify({ ...orderIssueRecord(left), synced_at: "" }) === JSON.stringify({ ...orderIssueRecord(right), synced_at: "" });
}

interface IssueValidationFailure {
	reason: string;
	field: string;
}

function validateIssueRecord(value: unknown): IssueValidationFailure | undefined {
	if (!isObject(value)) return validationFailure("issue_file_schema_invalid", "root");
	const record = value as Partial<IssueRecord>;
	if (record.schemaVersion !== 1) return validationFailure("issue_file_schema_version_invalid", "schemaVersion");
	if (!isRepositoryName(record.repository)) return validationFailure("issue_file_repository_invalid", "repository");
	if (typeof record.number !== "number" || !Number.isSafeInteger(record.number) || record.number <= 0) return validationFailure("issue_file_number_invalid", "number");
	if (!isNonEmptySafeString(record.title)) return validationFailure("issue_file_title_invalid", "title");
	if (record.state !== "open" && record.state !== "closed") return validationFailure("issue_file_state_invalid", "state");
	if (typeof record.body !== "string") return validationFailure("issue_file_body_invalid", "body");
	if (!isLabelList(record.labels)) return validationFailure("issue_file_labels_invalid", "labels");
	if (!isAssigneeList(record.assignees)) return validationFailure("issue_file_assignees_invalid", "assignees");
	if (record.milestone !== null && !isNonEmptySafeString(record.milestone)) return validationFailure("issue_file_milestone_invalid", "milestone");
	if (record.parent_issue !== undefined && record.parent_issue !== null && !isIssueRelationshipSummary(record.parent_issue)) return validationFailure("issue_file_relationship_invalid", "parent_issue");
	if (record.sub_issues !== undefined && !isIssueRelationshipSummaryList(record.sub_issues)) return validationFailure("issue_file_relationship_invalid", "sub_issues");
	if (record.sub_issues_count !== undefined && !isNonNegativeSafeInteger(record.sub_issues_count)) return validationFailure("issue_file_relationship_invalid", "sub_issues_count");
	if (typeof record.sub_issues_count === "number" && record.sub_issues !== undefined && record.sub_issues_count < record.sub_issues.length) return validationFailure("issue_file_relationship_invalid", "sub_issues_count");
	if (!Array.isArray(record.comments)) return validationFailure("issue_file_comments_invalid", "comments");
	if (record.comments_truncated !== undefined && typeof record.comments_truncated !== "boolean") return validationFailure("issue_file_comments_metadata_invalid", "comments_truncated");
	if (record.comments_count !== undefined && !isNonNegativeSafeInteger(record.comments_count)) return validationFailure("issue_file_comments_metadata_invalid", "comments_count");
	if (record.comments_fetch_limit !== undefined && !isNonNegativeSafeInteger(record.comments_fetch_limit)) return validationFailure("issue_file_comments_metadata_invalid", "comments_fetch_limit");
	if (typeof record.comments_count === "number" && record.comments_count < record.comments.length) return validationFailure("issue_file_comments_metadata_invalid", "comments_count");
	for (let index = 0; index < record.comments.length; index += 1) {
		const commentFailure = validateIssueCommentRecord(record.comments[index], record.repository, record.number, index);
		if (commentFailure) return commentFailure;
	}
	if (!isGitHubIssueUrl(record.html_url, record.repository, record.number)) return validationFailure("issue_file_url_invalid", "html_url");
	if (!isIsoTimestamp(record.created_at)) return validationFailure("issue_file_timestamp_invalid", "created_at");
	if (!isIsoTimestamp(record.updated_at)) return validationFailure("issue_file_timestamp_invalid", "updated_at");
	if (record.closed_at !== null && !isIsoTimestamp(record.closed_at)) return validationFailure("issue_file_timestamp_invalid", "closed_at");
	if (!isIsoTimestamp(record.synced_at)) return validationFailure("issue_file_timestamp_invalid", "synced_at");
	return undefined;
}

function validateIssueCommentRecord(
	value: unknown,
	repository: string,
	issueNumber: number,
	index: number,
): IssueValidationFailure | undefined {
	const fieldPrefix = `comments[${index}]`;
	if (!isObject(value)) return validationFailure("issue_file_comment_invalid", fieldPrefix);
	const comment = value as Record<string, unknown>;
	if (typeof comment.id !== "number" || !Number.isSafeInteger(comment.id) || comment.id <= 0) return validationFailure("issue_file_comment_id_invalid", `${fieldPrefix}.id`);
	if (!isGitHubLogin(comment.author)) return validationFailure("issue_file_comment_author_invalid", `${fieldPrefix}.author`);
	if (typeof comment.body !== "string") return validationFailure("issue_file_comment_body_invalid", `${fieldPrefix}.body`);
	if (!isIsoTimestamp(comment.created_at)) return validationFailure("issue_file_timestamp_invalid", `${fieldPrefix}.created_at`);
	if (!isIsoTimestamp(comment.updated_at)) return validationFailure("issue_file_timestamp_invalid", `${fieldPrefix}.updated_at`);
	if (!isGitHubCommentUrl(comment.html_url, repository, issueNumber, comment.id)) return validationFailure("issue_file_comment_url_invalid", `${fieldPrefix}.html_url`);
	return undefined;
}

function validationFailure(reason: string, field: string): IssueValidationFailure {
	return { reason, field };
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRepositoryName(value: unknown): value is string {
	if (typeof value !== "string") return false;
	const [owner, repo, extra] = value.split("/");
	return extra === undefined && isGitHubLogin(owner) && typeof repo === "string" && /^[A-Za-z0-9._-]+$/.test(repo);
}

function isGitHubLogin(value: unknown): value is string {
	return typeof value === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value);
}

function isNonNegativeSafeInteger(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNonEmptySafeString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0 && !value.includes("\0");
}

function isLabelList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((label) => isNonEmptySafeString(label));
}

function isAssigneeList(value: unknown): value is string[] {
	return Array.isArray(value) && value.every(isGitHubLogin);
}

function isIssueRelationshipSummary(value: unknown): boolean {
	if (!isObject(value)) return false;
	const issue = value as Record<string, unknown>;
	if (typeof issue.number !== "number" || !Number.isSafeInteger(issue.number) || issue.number <= 0) return false;
	if (!isNonEmptySafeString(issue.title)) return false;
	if (issue.state !== undefined && issue.state !== "open" && issue.state !== "closed") return false;
	if (typeof issue.html_url !== "string") return false;
	return parseHttpsGitHubUrl(issue.html_url) !== undefined;
}

function isIssueRelationshipSummaryList(value: unknown): boolean {
	return Array.isArray(value) && value.every(isIssueRelationshipSummary);
}

function isIsoTimestamp(value: unknown): value is string {
	if (typeof value !== "string") return false;
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)) return false;
	return !Number.isNaN(Date.parse(value));
}

function isGitHubIssueUrl(value: unknown, repository: string, issueNumber: number): value is string {
	const url = parseHttpsGitHubUrl(value);
	if (!url) return false;
	const [owner, repo, type, number, ...rest] = url.pathname.split("/").filter(Boolean);
	return rest.length === 0 && ownerRepoMatches(repository, owner, repo) && type === "issues" && number === String(issueNumber);
}

function isGitHubCommentUrl(value: unknown, repository: string, issueNumber: number, commentId: number): value is string {
	const url = parseHttpsGitHubUrl(value);
	if (!url) return false;
	const [owner, repo, type, number, ...rest] = url.pathname.split("/").filter(Boolean);
	return rest.length === 0 && ownerRepoMatches(repository, owner, repo) && type === "issues" && number === String(issueNumber) && url.hash === `#issuecomment-${commentId}`;
}

function parseHttpsGitHubUrl(value: unknown): URL | undefined {
	if (typeof value !== "string") return undefined;
	try {
		const url = new URL(value);
		return url.protocol === "https:" && url.hostname === "github.com" ? url : undefined;
	} catch {
		return undefined;
	}
}

function ownerRepoMatches(repository: string, owner: string | undefined, repo: string | undefined): boolean {
	const [expectedOwner, expectedRepo] = repository.split("/");
	return owner?.toLowerCase() === expectedOwner.toLowerCase() && repo?.toLowerCase() === expectedRepo.toLowerCase();
}

function orderIssueRecord(record: IssueRecord): IssueRecord {
	return {
		schemaVersion: 1,
		repository: record.repository,
		number: record.number,
		title: record.title,
		state: record.state,
		body: record.body,
		labels: record.labels,
		assignees: record.assignees,
		milestone: record.milestone,
		...(record.parent_issue !== undefined ? { parent_issue: record.parent_issue } : {}),
		...(record.sub_issues !== undefined ? { sub_issues: record.sub_issues } : {}),
		...(record.sub_issues_count !== undefined ? { sub_issues_count: record.sub_issues_count } : {}),
		comments: record.comments,
		...(record.comments_truncated !== undefined ? { comments_truncated: record.comments_truncated } : {}),
		...(record.comments_count !== undefined ? { comments_count: record.comments_count } : {}),
		...(record.comments_fetch_limit !== undefined ? { comments_fetch_limit: record.comments_fetch_limit } : {}),
		html_url: record.html_url,
		created_at: record.created_at,
		updated_at: record.updated_at,
		closed_at: record.closed_at,
		synced_at: record.synced_at,
	};
}
