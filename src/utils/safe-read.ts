import { constants, promises as fs } from "node:fs";
import type { FileHandle } from "node:fs/promises";

import { IssueMeError, isNodeError } from "../errors.ts";
import { assertPathInside } from "./slug.ts";

export interface TrustedTextFileReadOptions {
	projectRoot?: string;
	safeDirectory?: string;
	unsafeCode?: string;
	unsafeMessage?: string;
	notFileMessage?: string;
	raceSwapMessage?: string;
}

interface SafeReadValidationOptions extends Required<Pick<TrustedTextFileReadOptions, "unsafeCode" | "unsafeMessage" | "notFileMessage" | "raceSwapMessage">> {
	projectRoot?: string;
	safeDirectory?: string;
}

const READ_ONLY_NOFOLLOW_FLAGS = constants.O_RDONLY | (typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0);

export async function readTrustedTextFile(path: string, options: TrustedTextFileReadOptions = {}): Promise<string> {
	const normalizedOptions = normalizeOptions(options);
	let handle: FileHandle;
	try {
		handle = await fs.open(path, READ_ONLY_NOFOLLOW_FLAGS);
	} catch (error) {
		if (isNodeError(error) && error.code === "ELOOP") throw unsafeFileError(normalizedOptions, normalizedOptions.unsafeMessage);
		throw error;
	}
	try {
		await validateOpenedFile(path, handle, normalizedOptions);
		return await handle.readFile("utf8");
	} finally {
		await handle.close();
	}
}

async function validateOpenedFile(path: string, handle: FileHandle, options: SafeReadValidationOptions): Promise<void> {
	const openedStat = await handle.stat();
	if (!openedStat.isFile()) throw unsafeFileError(options, options.notFileMessage);

	let pathStat;
	try {
		pathStat = await fs.lstat(path);
	} catch (error) {
		if (isNodeError(error) && (error.code === "ENOENT" || error.code === "ENOTDIR")) {
			throw unsafeFileError(options, options.raceSwapMessage);
		}
		throw error;
	}
	if (pathStat.isSymbolicLink()) throw unsafeFileError(options, options.unsafeMessage);
	if (!pathStat.isFile()) throw unsafeFileError(options, options.notFileMessage);
	if (!sameFile(openedStat, pathStat)) throw unsafeFileError(options, options.raceSwapMessage);

	const fileRealPath = await fs.realpath(path);
	const pathStatAfterRealpath = await fs.lstat(path);
	if (pathStatAfterRealpath.isSymbolicLink()) throw unsafeFileError(options, options.unsafeMessage);
	if (!pathStatAfterRealpath.isFile()) throw unsafeFileError(options, options.notFileMessage);
	if (!sameFile(openedStat, pathStatAfterRealpath)) throw unsafeFileError(options, options.raceSwapMessage);

	if (options.projectRoot !== undefined) {
		assertTrustedPathInside(options, await fs.realpath(options.projectRoot), fileRealPath, "Trusted file must resolve inside the current project.");
	}
	if (options.safeDirectory !== undefined) {
		const safeDirectoryRealPath = await fs.realpath(options.safeDirectory);
		if (options.projectRoot !== undefined) {
			assertTrustedPathInside(options, await fs.realpath(options.projectRoot), safeDirectoryRealPath, "Trusted file directory must resolve inside the current project.");
		}
		assertTrustedPathInside(options, safeDirectoryRealPath, fileRealPath, "Trusted file must resolve inside the expected directory.");
	}
}

function normalizeOptions(options: TrustedTextFileReadOptions): SafeReadValidationOptions {
	const normalizedOptions: SafeReadValidationOptions = {
		unsafeCode: options.unsafeCode ?? "unsafe_path",
		unsafeMessage: options.unsafeMessage ?? "Refusing to read a symlinked trusted local state file.",
		notFileMessage: options.notFileMessage ?? "Trusted local state path exists but is not a regular file.",
		raceSwapMessage: options.raceSwapMessage ?? "Trusted local state file changed while it was being opened for reading.",
	};
	assignSafeReadPathOption(normalizedOptions, "projectRoot", options.projectRoot);
	assignSafeReadPathOption(normalizedOptions, "safeDirectory", options.safeDirectory);
	return normalizedOptions;
}

function assignSafeReadPathOption(options: SafeReadValidationOptions, field: "projectRoot" | "safeDirectory", value: string | undefined): void {
	if (typeof value === "string") options[field] = value;
}

function assertTrustedPathInside(options: SafeReadValidationOptions, parentDirectory: string, childPath: string, message: string): void {
	try {
		assertPathInside(parentDirectory, childPath, message);
	} catch (error) {
		if (error instanceof IssueMeError && error.code === "unsafe_path") throw unsafeFileError(options, message);
		throw error;
	}
}

function unsafeFileError(options: SafeReadValidationOptions, message: string): IssueMeError {
	return new IssueMeError(options.unsafeCode, message);
}

function sameFile(left: { dev: number; ino: number }, right: { dev: number; ino: number }): boolean {
	return left.dev === right.dev && left.ino === right.ino;
}
