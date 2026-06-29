export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function compactObject<T extends object>(input: T): Partial<T> {
	return Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export function extractConnectionNodes(connection: unknown): unknown[] {
	if (!isObject(connection) || !Array.isArray(connection.nodes)) return [];
	return connection.nodes;
}

export function connectionHasNextPage(connection: unknown): boolean {
	if (!isObject(connection)) return false;
	const pageInfo = connection.pageInfo;
	return isObject(pageInfo) && pageInfo.hasNextPage === true;
}

export function connectionEndCursor(connection: unknown): string | undefined {
	if (!isObject(connection)) return undefined;
	const pageInfo = connection.pageInfo;
	if (!isObject(pageInfo)) return undefined;
	return typeof pageInfo.endCursor === "string" && pageInfo.endCursor.trim() ? pageInfo.endCursor : undefined;
}

export function normalizeConnectionTotalCount(connection: unknown): number | undefined {
	if (!isObject(connection)) return undefined;
	const total = connection.totalCount ?? connection.total_count ?? connection.total;
	return typeof total === "number" && Number.isSafeInteger(total) && total >= 0 ? total : undefined;
}
