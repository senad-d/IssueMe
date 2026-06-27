import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

import type { IssueMeConfig, IssueFileMetadata, IssueRecord, IssueWriteResult } from "../types.ts";
import { IssueMeError, isNodeError } from "../errors.ts";
import {
	parseIssueNumberFromFileName,
	resolveExistingIssueFilePath,
	resolveIssueDirectory,
	resolveIssueFilePath,
	toProjectRelativePath,
} from "../utils/slug.ts";

export async function writeIssueRecord(cwd: string, config: IssueMeConfig, record: IssueRecord): Promise<IssueWriteResult> {
	if (record.state !== "open") {
		const removedPaths = await removeIssueByNumber(cwd, config, record.number);
		return { action: "removed", removedPaths };
	}

	const targetPath = resolveIssueFilePath(cwd, config.issueDirectory, record.number, record.title);
	return withFileMutationQueue(targetPath, async () => {
		await mkdir(dirname(targetPath), { recursive: true });
		const staleFiles = (await listIssueFiles(cwd, config)).filter(
			(file) => file.number === record.number && resolve(file.path) !== resolve(targetPath),
		);
		const removedPaths: string[] = [];
		for (const stale of staleFiles) {
			await rm(stale.path, { force: true });
			removedPaths.push(stale.path);
		}

		const nextText = `${JSON.stringify(orderIssueRecord(record), null, 2)}\n`;
		let currentText: string | undefined;
		try {
			currentText = await readFile(targetPath, "utf8");
		} catch (error) {
			if (!(isNodeError(error) && error.code === "ENOENT")) throw error;
		}

		if (currentText === nextText) return { action: "unchanged", path: targetPath, removedPaths };
		await writeFile(targetPath, nextText, "utf8");
		return { action: currentText === undefined ? "created" : "updated", path: targetPath, removedPaths };
	});
}

export async function readIssueByNumber(cwd: string, config: IssueMeConfig, issueNumber: number): Promise<IssueRecord | undefined> {
	const files = await listIssueFiles(cwd, config);
	const match = files.find((file) => file.number === issueNumber);
	return match ? readIssueFile(match.path) : undefined;
}

export async function readIssueByLookup(cwd: string, config: IssueMeConfig, lookup: string): Promise<IssueRecord | undefined> {
	const cleanLookup = lookup.trim();
	if (!cleanLookup) return undefined;
	const numeric = Number(cleanLookup.replace(/^#/, ""));
	if (Number.isSafeInteger(numeric) && numeric > 0) return readIssueByNumber(cwd, config, numeric);

	if (cleanLookup.endsWith(".json") || cleanLookup.includes("/") || cleanLookup.includes("\\")) {
		const path = resolveExistingIssueFilePath(cwd, config.issueDirectory, cleanLookup);
		return readIssueFile(path);
	}

	const needle = cleanLookup.toLowerCase();
	const files = await listIssueFiles(cwd, config);
	for (const file of files) {
		if (file.fileName.toLowerCase().includes(needle) || file.title.toLowerCase().includes(needle)) {
			return readIssueFile(file.path);
		}
	}
	return undefined;
}

export async function listIssueFiles(cwd: string, config: IssueMeConfig): Promise<IssueFileMetadata[]> {
	const directory = resolveIssueDirectory(cwd, config.issueDirectory);
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch (error) {
		if (isNodeError(error) && error.code === "ENOENT") return [];
		throw error;
	}

	const files: IssueFileMetadata[] = [];
	for (const entry of entries) {
		if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
		const issueNumber = parseIssueNumberFromFileName(entry.name);
		if (!issueNumber) continue;
		const path = resolve(directory, entry.name);
		try {
			const record = await readIssueFile(path);
			files.push({
				path,
				fileName: entry.name,
				number: record.number,
				title: record.title,
				state: record.state,
				updated_at: record.updated_at,
			});
		} catch {
			// Ignore invalid local JSON files instead of surfacing private contents in errors.
		}
	}
	return files.sort((a, b) => a.number - b.number);
}

export async function readIssueFile(path: string): Promise<IssueRecord> {
	const text = await readFile(path, "utf8");
	const parsed = JSON.parse(text) as unknown;
	if (!isIssueRecord(parsed)) {
		throw new IssueMeError("issue_file_invalid", `Issue file ${basename(path)} is not a valid IssueMe issue JSON file.`);
	}
	return parsed;
}

export async function removeIssueByNumber(cwd: string, config: IssueMeConfig, issueNumber: number): Promise<string[]> {
	const files = (await listIssueFiles(cwd, config)).filter((file) => file.number === issueNumber);
	const removed: string[] = [];
	for (const file of files) {
		await withFileMutationQueue(file.path, async () => {
			await rm(file.path, { force: true });
		});
		removed.push(file.path);
	}
	return removed;
}

export async function removeClosedIssueFiles(cwd: string, config: IssueMeConfig, openIssueNumbers: ReadonlySet<number>): Promise<string[]> {
	const files = await listIssueFiles(cwd, config);
	const removed: string[] = [];
	for (const file of files) {
		if (file.state === "closed" || !openIssueNumbers.has(file.number)) {
			await withFileMutationQueue(file.path, async () => {
				await rm(file.path, { force: true });
			});
			removed.push(file.path);
		}
	}
	return removed;
}

export function relativeIssuePath(cwd: string, absolutePath: string | undefined): string | undefined {
	return absolutePath ? toProjectRelativePath(cwd, absolutePath) : undefined;
}

function isIssueRecord(value: unknown): value is IssueRecord {
	if (typeof value !== "object" || value === null) return false;
	const record = value as Partial<IssueRecord>;
	return (
		record.schemaVersion === 1 &&
		typeof record.repository === "string" &&
		typeof record.number === "number" &&
		typeof record.title === "string" &&
		(record.state === "open" || record.state === "closed") &&
		typeof record.body === "string" &&
		Array.isArray(record.labels) &&
		Array.isArray(record.assignees) &&
		Array.isArray(record.comments) &&
		typeof record.html_url === "string" &&
		typeof record.created_at === "string" &&
		typeof record.updated_at === "string" &&
		typeof record.synced_at === "string"
	);
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
		comments: record.comments,
		html_url: record.html_url,
		created_at: record.created_at,
		updated_at: record.updated_at,
		closed_at: record.closed_at,
		synced_at: record.synced_at,
	};
}
