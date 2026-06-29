import { ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import { isValidIsoDateOnly } from "./date.ts";

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

export function invalidToolInput(message: string, safeDetails: Record<string, unknown> = {}): IssueMeError {
	return new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, message, safeDetails);
}

export function normalizePositiveSafeInteger(value: number | undefined, field: string, options: IntegerValidationOptions = {}): number {
	if (Number.isSafeInteger(value) && value !== undefined && value > 0) return value;
	throw invalidToolInput(options.message ?? `${field} must be a positive integer.`, { field, ...(options.details ?? {}) });
}

export function normalizeBoundedInteger(
	value: number | undefined,
	field: string,
	options: { min?: number; max: number; defaultValue?: number; message?: string; details?: Record<string, unknown> },
): number {
	if (value === undefined && options.defaultValue !== undefined) return options.defaultValue;
	const min = options.min ?? 1;
	if (Number.isSafeInteger(value) && value !== undefined && value >= min && value <= options.max) return value;
	throw invalidToolInput(options.message ?? `${field} must be an integer between ${min} and ${options.max}.`, { field, ...(options.details ?? {}) });
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
		throw invalidToolInput(options.requiredMessage ?? `${field} is required.`, { field, ...(options.details ?? {}) });
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw invalidToolInput(options.emptyMessage ?? `${field} must not be empty.`, { field, ...(options.details ?? {}) });
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
	if (/\r|\n/.test(value)) throw invalidToolInput(message, { field, ...details });
}

export function assertMaxLength(value: string, field: string, maxLength: number, message = `${field} must be ${maxLength} characters or fewer.`, details: Record<string, unknown> = {}): void {
	if (value.length > maxLength) throw invalidToolInput(message, { field, maxLength, ...details });
}

export function normalizeRequiredIsoDateOnly(value: string | undefined, field: string, options: TextValidationOptions & { invalidMessage?: string } = {}): string {
	const date = normalizeRequiredTrimmedText(value, field, options);
	if (!isValidIsoDateOnly(date)) {
		throw invalidToolInput(options.invalidMessage ?? `${field} must be a valid YYYY-MM-DD date.`, { field, ...(options.details ?? {}) });
	}
	return date;
}

function assertValidatedText(value: string, field: string, options: TextValidationOptions): void {
	const details = options.details ?? {};
	assertNoNullBytes(value, field, options.nullByteMessage ?? `${field} must not contain null bytes.`, details);
	if (options.oneLine) assertOneLine(value, field, options.oneLineMessage ?? `${field} must fit on one line.`, details);
	if (options.maxLength !== undefined) assertMaxLength(value, field, options.maxLength, options.maxLengthMessage, details);
}
