import { realpath } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";

import { isNodeError } from "../errors.ts";

export async function resolveFileMutationQueuePath(filePath: string): Promise<string> {
	const absolutePath = resolve(filePath);
	try {
		return await realpath(absolutePath);
	} catch (error) {
		if (!isMissingPathError(error)) throw error;
	}

	let current = dirname(absolutePath);
	const suffix = [basename(absolutePath)];
	while (true) {
		try {
			return resolve(await realpath(current), ...suffix);
		} catch (error) {
			if (!isMissingPathError(error)) throw error;
		}

		const parent = dirname(current);
		if (parent === current) return absolutePath;
		suffix.unshift(basename(current));
		current = parent;
	}
}

export async function withCanonicalFileMutationQueue<T>(filePath: string, fn: () => Promise<T>): Promise<T> {
	return withFileMutationQueue(await resolveFileMutationQueuePath(filePath), fn);
}

function isMissingPathError(error: unknown): boolean {
	return isNodeError(error) && (error.code === "ENOENT" || error.code === "ENOTDIR");
}
