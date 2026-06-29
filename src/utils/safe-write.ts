import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { basename, dirname, join } from "node:path";

export interface AtomicSafeWriteOptions {
	validateBeforeCreate?: () => Promise<void>;
	validateBeforeRename?: () => Promise<void>;
	validateAfterRename?: () => Promise<void>;
}

export async function writeFileAtomicSafe(targetPath: string, text: string, options: AtomicSafeWriteOptions = {}): Promise<void> {
	const tempPath = join(dirname(targetPath), `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`);
	let tempCreated = false;
	try {
		await options.validateBeforeCreate?.();
		const handle = await fs.open(tempPath, "wx");
		tempCreated = true;
		try {
			await handle.writeFile(text, "utf8");
		} finally {
			await handle.close();
		}
		await options.validateBeforeRename?.();
		await fs.rename(tempPath, targetPath);
		tempCreated = false;
		await options.validateAfterRename?.();
	} finally {
		if (tempCreated) {
			await fs.rm(tempPath, { force: true }).catch(() => undefined);
		}
	}
}
