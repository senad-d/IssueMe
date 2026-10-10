import { createHash } from "node:crypto";

import { ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { ToolContinuationSummary } from "../types.ts";
import { isObject } from "./shared.ts";

/**
 * Opaque continuation tokens for bounded discovery reads.
 *
 * A token never carries a URL. It carries a position inside one named collection of the
 * resolved repository, bound to a fingerprint of the normalized filters that produced it.
 * REST collections resume by absolute raw index (page number and in-page offset are derived
 * from the current page size), GraphQL connections resume by the cursor of the page start
 * plus the number of raw nodes already consumed on that page.
 */

export const MAX_CONTINUATION_TOKEN_LENGTH = 2048;
export const CONTINUATION_SNAPSHOT_NOTE = "Continuation pages are not an atomic snapshot; GitHub collections can change between calls.";

const CONTINUATION_VERSION = 1;
const CONTINUATION_SALT = "issueme-continuation-v1";
const MAX_REST_CONTINUATION_INDEX = 1_000_000;
const MAX_GRAPHQL_CONTINUATION_SKIP = 100;
const MAX_GRAPHQL_CURSOR_LENGTH = 512;
const CHECKSUM_LENGTH = 16;

export interface RestContinuationPosition {
	kind: "rest";
	/** Absolute 0-based raw index of the next collection member to consume. */
	index: number;
}

export interface GraphQLContinuationPosition {
	kind: "graphql";
	/** The `after` cursor used for the page; undefined means the first page. */
	cursor?: string;
	/** Raw nodes already consumed on that page. */
	skip: number;
}

export type ContinuationPosition = RestContinuationPosition | GraphQLContinuationPosition;
export type ContinuationKind = ContinuationPosition["kind"];

export interface ContinuationBinding {
	collection: string;
	repository: string;
	/** Normalized filters that define the collection order and membership; limits are excluded. */
	filters: Record<string, unknown>;
}

export type GitHubContinuation = ToolContinuationSummary;

interface ContinuationPayload {
	v: number;
	c: string;
	r: string;
	f: string;
	p: unknown;
	h: string;
}

/** Tool-input shape check only; binding validation happens in the client that owns the collection. */
export function normalizeContinuationTokenInput(value: string | undefined, field = "after"): string | undefined {
	if (value === undefined) return undefined;
	if (typeof value !== "string") throw new IssueMeError(ISSUEME_ERROR_CODES.CONTINUATION_TOKEN_INVALID, `${field} must be a continuation token string.`, { field, reason: "malformed" });
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	if (trimmed.length > MAX_CONTINUATION_TOKEN_LENGTH || /[\s\0]/.test(trimmed)) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.CONTINUATION_TOKEN_INVALID, `${field} must be a one-line continuation token of at most ${MAX_CONTINUATION_TOKEN_LENGTH} characters.`, { field, reason: "malformed" });
	}
	return trimmed;
}

export function encodeContinuationToken(binding: ContinuationBinding, position: ContinuationPosition): string {
	const fingerprint = fingerprintFilters(binding.filters);
	const payload: ContinuationPayload = {
		v: CONTINUATION_VERSION,
		c: binding.collection,
		r: binding.repository,
		f: fingerprint,
		p: compactPosition(position),
		h: "",
	};
	payload.h = checksum(payload);
	return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeContinuationToken(
	token: string | undefined,
	binding: ContinuationBinding,
	kind: ContinuationKind,
): ContinuationPosition | undefined {
	if (token === undefined) return undefined;
	if (typeof token !== "string") throw continuationTokenError("malformed", binding, "after must be a continuation token string.");
	const trimmed = token.trim();
	if (!trimmed) return undefined;
	if (trimmed.length > MAX_CONTINUATION_TOKEN_LENGTH) throw continuationTokenError("malformed", binding, "after exceeds the maximum continuation token length.");
	const payload = parseContinuationPayload(trimmed, binding);
	if (payload.h !== checksum(payload)) throw continuationTokenError("checksum", binding, "after is not a continuation token issued by IssueMe for this collection.");
	if (payload.c !== binding.collection) throw continuationTokenError("collection_mismatch", binding, `after was issued for the ${payload.c} collection, not ${binding.collection}.`);
	if (payload.r !== binding.repository) throw continuationTokenError("repository_mismatch", binding, "after was issued for a different repository.");
	if (payload.f !== fingerprintFilters(binding.filters)) throw continuationTokenError("filter_mismatch", binding, "after was issued for different filters; rerun with the original filters or omit after to restart.");
	return parseContinuationPosition(payload.p, kind, binding);
}

export function buildContinuation(
	binding: ContinuationBinding,
	next: ContinuationPosition | undefined,
	pagesRead: number,
	resumed: boolean,
	complete: boolean = next === undefined,
): GitHubContinuation {
	const continuation: GitHubContinuation = { collection: binding.collection, complete, resumed, pagesRead };
	if (next) continuation.nextToken = encodeContinuationToken(binding, next);
	return continuation;
}

export function restContinuationStart(position: ContinuationPosition | undefined): number | undefined {
	if (position?.kind === "rest") return position.index;
	return undefined;
}

export function restNextPosition(index: number | undefined): RestContinuationPosition | undefined {
	if (index === undefined) return undefined;
	return { kind: "rest", index };
}

export function graphqlContinuationStart(position: ContinuationPosition | undefined): { cursor?: string; skip: number } {
	if (position?.kind === "graphql") return { cursor: position.cursor, skip: position.skip };
	return { skip: 0 };
}

export function graphqlNextPosition(cursor: string | undefined, skip: number): GraphQLContinuationPosition {
	const position: GraphQLContinuationPosition = { kind: "graphql", skip };
	if (cursor !== undefined) position.cursor = cursor;
	return position;
}

/** Next position for a single-request GraphQL connection read: mid-page stop keeps the page cursor, a full page advances to endCursor. */
export function graphqlConnectionNextPosition(
	pageCursor: string | undefined,
	stoppedAt: number | undefined,
	hasNextPage: boolean,
	endCursor: string | undefined,
): GraphQLContinuationPosition | undefined {
	if (stoppedAt !== undefined) return graphqlNextPosition(pageCursor, stoppedAt);
	if (hasNextPage && endCursor) return graphqlNextPosition(endCursor, 0);
	return undefined;
}

export interface TextWindow {
	text: string;
	offset: number;
	truncated: boolean;
	continuation: GitHubContinuation;
}

/** Bounded window over one long text (for example a comment body); the token stores the next character offset. */
export function readTextWindow(text: string, after: string | undefined, limit: number, binding: ContinuationBinding): TextWindow {
	const position = decodeContinuationToken(after, binding, "rest");
	const offset = Math.min(restContinuationStart(position) ?? 0, text.length);
	const end = Math.min(offset + limit, text.length);
	const next = end < text.length ? restNextPosition(end) : undefined;
	return {
		text: text.slice(offset, end),
		offset,
		truncated: next !== undefined,
		continuation: buildContinuation(binding, next, 1, position !== undefined, next === undefined),
	};
}

export interface ConnectionConsumption<T> {
	items: T[];
	/** Raw index of the first node not consumed because the limit was reached; undefined when the page was exhausted. */
	stoppedAt?: number;
	/** Skip that still has to be applied to the following page when this page was shorter than the skip. */
	carriedSkip: number;
}

export function consumeConnectionNodes<T>(
	rawNodes: unknown[],
	skip: number,
	remaining: number,
	normalize: (node: unknown) => T | undefined,
): ConnectionConsumption<T> {
	const items: T[] = [];
	if (skip >= rawNodes.length) return { items, carriedSkip: skip - rawNodes.length };
	for (let index = skip; index < rawNodes.length; index += 1) {
		const item = normalize(rawNodes[index]);
		if (item === undefined) continue;
		if (items.length >= remaining) return { items, stoppedAt: index, carriedSkip: 0 };
		items.push(item);
	}
	return { items, carriedSkip: 0 };
}

export function fingerprintFilters(filters: Record<string, unknown>): string {
	return createHash("sha256").update(canonicalJson(filters)).digest("hex").slice(0, CHECKSUM_LENGTH);
}

function checksum(payload: ContinuationPayload): string {
	const material = [payload.v, payload.c, payload.r, payload.f, canonicalJson(payload.p), CONTINUATION_SALT].join("\n");
	return createHash("sha256").update(material).digest("hex").slice(0, CHECKSUM_LENGTH);
}

function parseContinuationPayload(token: string, binding: ContinuationBinding): ContinuationPayload {
	let parsed: unknown;
	try {
		parsed = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
	} catch {
		throw continuationTokenError("malformed", binding, "after is not a valid continuation token.");
	}
	if (!isObject(parsed) || parsed.v !== CONTINUATION_VERSION || typeof parsed.c !== "string" || typeof parsed.r !== "string"
		|| typeof parsed.f !== "string" || typeof parsed.h !== "string" || !isObject(parsed.p)) {
		throw continuationTokenError("malformed", binding, "after is not a valid continuation token.");
	}
	return { v: parsed.v, c: parsed.c, r: parsed.r, f: parsed.f, p: parsed.p, h: parsed.h };
}

function parseContinuationPosition(value: unknown, kind: ContinuationKind, binding: ContinuationBinding): ContinuationPosition {
	if (!isObject(value)) throw continuationTokenError("malformed", binding, "after is not a valid continuation token.");
	if (value.k === "r") {
		if (kind !== "rest") throw continuationTokenError("kind_mismatch", binding, "after was issued for a different collection type.");
		const index = value.i;
		if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 || index > MAX_REST_CONTINUATION_INDEX) {
			throw continuationTokenError("out_of_bounds", binding, "after points outside the supported collection range.");
		}
		return { kind: "rest", index };
	}
	if (value.k === "g") {
		if (kind !== "graphql") throw continuationTokenError("kind_mismatch", binding, "after was issued for a different collection type.");
		const skip = value.s;
		if (typeof skip !== "number" || !Number.isSafeInteger(skip) || skip < 0 || skip > MAX_GRAPHQL_CONTINUATION_SKIP) {
			throw continuationTokenError("out_of_bounds", binding, "after points outside the supported page range.");
		}
		const cursor = value.c;
		if (cursor === undefined) return { kind: "graphql", skip };
		if (typeof cursor !== "string" || !cursor.trim() || cursor.length > MAX_GRAPHQL_CURSOR_LENGTH || /[\r\n\0]/.test(cursor)) {
			throw continuationTokenError("out_of_bounds", binding, "after carries an unusable GraphQL cursor.");
		}
		return { kind: "graphql", cursor, skip };
	}
	throw continuationTokenError("malformed", binding, "after is not a valid continuation token.");
}

function compactPosition(position: ContinuationPosition): Record<string, unknown> {
	if (position.kind === "rest") return { k: "r", i: position.index };
	const compact: Record<string, unknown> = { k: "g", s: position.skip };
	if (position.cursor !== undefined) compact.c = position.cursor;
	return compact;
}

function continuationTokenError(reason: string, binding: ContinuationBinding, message: string): IssueMeError {
	return new IssueMeError(ISSUEME_ERROR_CODES.CONTINUATION_TOKEN_INVALID, message, {
		field: "after",
		reason,
		collection: binding.collection,
		repository: binding.repository,
	});
}

function canonicalJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (!isObject(value)) return value;
	const output: Record<string, unknown> = {};
	for (const key of Object.keys(value).sort(compareCanonicalKeys)) {
		const child = value[key];
		if (child === undefined) continue;
		output[key] = canonicalize(child);
	}
	return output;
}

/** Preserve version-1 UTF-16 key ordering; locale collation would invalidate existing token fingerprints. */
function compareCanonicalKeys(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}
