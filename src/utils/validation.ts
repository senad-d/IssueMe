import { ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import { isValidIsoDateOnly } from "./date.ts";

export const MAX_GITHUB_OPAQUE_ID_LENGTH = 512;

const ISO_DATE_OR_TIMESTAMP_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

interface IntegerValidationOptions {
	message?: string;
	details?: Record<string, unknown>;
}

interface TextValidationOptions {
	requiredMessage?: string;
	emptyMessage?: string;
	nullByteMessage?: string;
	oneLine?: boolean;
	oneLineMessage?: string;
	maxLength?: number;
	maxLengthMessage?: string;
	details?: Record<string, unknown>;
}

interface BoundedToolLimitOptions {
	field?: string;
	min?: number;
	max: number;
	defaultValue: number;
	message?: string;
	details?: Record<string, unknown>;
}

interface IsoDateTimeValidationOptions extends TextValidationOptions {
	invalidMessage?: string;
}

interface GitHubOpaqueIdValidationOptions extends TextValidationOptions {
	maxLength?: number;
}

export function invalidToolInput(message: string, safeDetails: Record<string, unknown> = {}): IssueMeError {
	return new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, message, safeDetails);
}

export function normalizePositiveSafeInteger(value: number | undefined, field: string, options: IntegerValidationOptions = {}): number {
	if (Number.isSafeInteger(value) && value !== undefined && value > 0) return value;
	throw invalidToolInput(options.message ?? `${field} must be a positive integer.`, validationErrorDetails(field, options.details));
}

export function normalizeBoundedInteger(
	value: number | undefined,
	field: string,
	options: { min?: number; max: number; defaultValue?: number; message?: string; details?: Record<string, unknown> },
): number {
	if (value === undefined && options.defaultValue !== undefined) return options.defaultValue;
	const min = options.min ?? 1;
	if (Number.isSafeInteger(value) && value !== undefined && value >= min && value <= options.max) return value;
	throw invalidToolInput(options.message ?? `${field} must be an integer between ${min} and ${options.max}.`, validationErrorDetails(field, options.details));
}

export function normalizeBoundedToolLimit(value: number | undefined, options: BoundedToolLimitOptions): number {
	return normalizeBoundedInteger(value, options.field ?? "limit", {
		min: options.min,
		max: options.max,
		defaultValue: options.defaultValue,
		message: options.message,
		details: options.details,
	});
}

export function normalizeOptionalTrimmedText(value: string | undefined, field: string, options: TextValidationOptions = {}): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	assertValidatedText(trimmed, field, options);
	return trimmed;
}

export function normalizeRequiredTrimmedText(value: string | undefined, field: string, options: TextValidationOptions = {}): string {
	if (typeof value !== "string") {
		throw invalidToolInput(options.requiredMessage ?? `${field} is required.`, validationErrorDetails(field, options.details));
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw invalidToolInput(options.emptyMessage ?? `${field} must not be empty.`, validationErrorDetails(field, options.details));
	}
	assertValidatedText(trimmed, field, options);
	return trimmed;
}

export function normalizeOptionalTextFilter(value: string | undefined, field: string, options: TextValidationOptions = {}): string | undefined {
	return normalizeOptionalTrimmedText(value, field, options);
}

export function normalizeOptionalLowercaseTextFilter(value: string | undefined, field: string, options: TextValidationOptions = {}): string | undefined {
	return normalizeOptionalTextFilter(value, field, options)?.toLowerCase();
}

export function assertNoNullBytes(value: string, field: string, message = `${field} must not contain null bytes.`, details: Record<string, unknown> = {}): void {
	if (value.includes("\0")) throw invalidToolInput(message, { field, ...details });
}

export function assertOneLine(value: string, field: string, message = `${field} must fit on one line.`, details: Record<string, unknown> = {}): void {
	if (/[\r\n]/.test(value)) throw invalidToolInput(message, { field, ...details });
}

export function assertMaxLength(value: string, field: string, maxLength: number, message = `${field} must be ${maxLength} characters or fewer.`, details: Record<string, unknown> = {}): void {
	if (value.length > maxLength) throw invalidToolInput(message, { field, maxLength, ...details });
}

export function normalizeOptionalIsoDateOrTimestamp(value: string | undefined, field: string, options: IsoDateTimeValidationOptions = {}): string | undefined {
	const normalized = normalizeOptionalTrimmedText(value, field, { ...options, oneLine: true, maxLength: options.maxLength ?? 64 });
	if (!normalized) return undefined;
	if (!isValidIsoDateOrTimestamp(normalized)) {
		throw invalidToolInput(options.invalidMessage ?? `${field} must be a valid ISO YYYY-MM-DD date or ISO 8601 timestamp with timezone.`, validationErrorDetails(field, options.details));
	}
	return normalized;
}

export function normalizeRequiredIsoDateOnly(value: string | undefined, field: string, options: TextValidationOptions & { invalidMessage?: string } = {}): string {
	const date = normalizeRequiredTrimmedText(value, field, options);
	if (!isValidIsoDateOnly(date)) {
		throw invalidToolInput(options.invalidMessage ?? `${field} must be a valid YYYY-MM-DD date.`, validationErrorDetails(field, options.details));
	}
	return date;
}

export function normalizeOptionalGitHubOpaqueId(value: string | undefined, field: string, options: GitHubOpaqueIdValidationOptions = {}): string | undefined {
	return normalizeOptionalTrimmedText(value, field, githubOpaqueIdTextOptions(field, options));
}

export function normalizeRequiredGitHubOpaqueId(value: string | undefined, field: string, options: GitHubOpaqueIdValidationOptions = {}): string {
	return normalizeRequiredTrimmedText(value, field, githubOpaqueIdTextOptions(field, options));
}

export function isValidIsoDateOrTimestamp(value: string): boolean {
	if (isValidIsoDateOnly(value)) return true;
	const match = ISO_DATE_OR_TIMESTAMP_PATTERN.exec(value);
	if (!match) return false;
	const [, date, rawHour, rawMinute, rawSecond, timezone] = match;
	if (!isValidIsoDateOnly(date)) return false;
	const hour = Number(rawHour);
	const minute = Number(rawMinute);
	const second = Number(rawSecond);
	if (hour > 23 || minute > 59 || second > 59) return false;
	if (timezone !== "Z") {
		const offsetHour = Number(timezone.slice(1, 3));
		const offsetMinute = Number(timezone.slice(4, 6));
		if (offsetHour > 23 || offsetMinute > 59) return false;
	}
	return true;
}

function validationErrorDetails(field: string, details: Record<string, unknown> | undefined): Record<string, unknown> {
	if (details) return { field, ...details };
	return { field };
}

function githubOpaqueIdTextOptions(field: string, options: GitHubOpaqueIdValidationOptions): TextValidationOptions {
	const maxLength = options.maxLength ?? MAX_GITHUB_OPAQUE_ID_LENGTH;
	return {
		...options,
		oneLine: true,
		maxLength,
		requiredMessage: options.requiredMessage ?? `${field} is required.`,
		emptyMessage: options.emptyMessage ?? `${field} must not be empty.`,
		nullByteMessage: options.nullByteMessage ?? `${field} must not contain null bytes.`,
		oneLineMessage: options.oneLineMessage ?? `${field} must be a one-line GitHub ID.`,
		maxLengthMessage: options.maxLengthMessage ?? `${field} must be ${maxLength} characters or fewer.`,
	};
}

function assertValidatedText(value: string, field: string, options: TextValidationOptions): void {
	const details = options.details ?? {};
	assertNoNullBytes(value, field, options.nullByteMessage ?? `${field} must not contain null bytes.`, details);
	if (options.oneLine) assertOneLine(value, field, options.oneLineMessage ?? `${field} must fit on one line.`, details);
	if (options.maxLength !== undefined) assertMaxLength(value, field, options.maxLength, options.maxLengthMessage, details);
}
