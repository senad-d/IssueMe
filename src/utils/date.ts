export function isValidIsoDateOnly(value: string): boolean {
	const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (!match) return false;
	const [, rawYear, rawMonth, rawDay] = match;
	const year = Number(rawYear);
	const month = Number(rawMonth);
	const day = Number(rawDay);
	const date = new Date(0);
	date.setUTCHours(0, 0, 0, 0);
	date.setUTCFullYear(year, month - 1, day);
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
