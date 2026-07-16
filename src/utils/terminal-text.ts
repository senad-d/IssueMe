const TERMINAL_CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/u;
const TERMINAL_CONTROL_GLOBAL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/gu;

export function containsTerminalControl(value: string): boolean {
	return TERMINAL_CONTROL_PATTERN.test(value);
}

export function sanitizeTerminalText(value: string): string {
	return value.replace(TERMINAL_CONTROL_GLOBAL_PATTERN, "�");
}
