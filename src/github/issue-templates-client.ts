import { GITHUB_API_BASE_URL, MAX_ISSUE_TEMPLATE_FILE_BYTES, MAX_TOOL_ISSUE_TEMPLATE_FORM_ELEMENTS } from "../constants.ts";
import { GitHubApiError, ISSUEME_ERROR_CODES, IssueMeError } from "../errors.ts";
import type { ToolIssueTemplateConfigSummary, ToolIssueTemplateContactLinkSummary, ToolIssueTemplateFormElementSummary, ToolIssueTemplateFormat, ToolIssueTemplateSummary } from "../types.ts";
import { isObject } from "./shared.ts";

/**
 * Issue template discovery reads the repository's own template files through the REST contents endpoint. GitHub's GraphQL
 * `issueTemplates` field omits YAML issue forms entirely (live-verified 2026-10-10 on a repository with four forms), so it
 * cannot be the source. Organization-level default templates live in another repository and are outside IssueMe's
 * request boundary; they are reported as unresolved, never guessed.
 */
export const ISSUE_TEMPLATE_DIRECTORY = ".github/ISSUE_TEMPLATE";
export const LEGACY_ISSUE_TEMPLATE_PATHS = [".github/ISSUE_TEMPLATE.md", "ISSUE_TEMPLATE.md", "docs/ISSUE_TEMPLATE.md"] as const;
export const ISSUE_TEMPLATE_INHERITANCE_NOTE = "Organization default templates (from the owner's .github repository) are not resolved; only this repository's own files are read.";

const TEMPLATE_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
// Keep value whitespace in the capture and trim it later: adjacent whitespace/value quantifiers can backtrack quadratically.
const TOP_LEVEL_KEY_PATTERN = /^([A-Za-z_][A-Za-z0-9_-]*):(.*)$/;
const BLOCK_LIST_ITEM_PATTERN = /^[ \t]+-[ \t](.*)$/;
const FORM_ELEMENT_PATTERN = /^[ \t]*-[ \t]+type:(.+)$/;

export interface GitHubContentsEntry {
	name: string;
	path: string;
	type: string;
	size: number;
}

export interface GitHubContentsFile extends GitHubContentsEntry {
	content: string;
	encoding: string;
}

export function normalizeTemplateFilename(value: unknown, field = "filename"): string {
	if (typeof value !== "string" || !value.trim()) throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `${field} must be a non-empty template file name.`, { field });
	const trimmed = value.trim();
	if (!TEMPLATE_FILENAME_PATTERN.test(trimmed) || trimmed.includes("..")) {
		throw new IssueMeError(ISSUEME_ERROR_CODES.INVALID_TOOL_INPUT, `${field} must be a plain file name inside ${ISSUE_TEMPLATE_DIRECTORY} (letters, digits, dot, underscore, dash); directories are not allowed.`, { field });
	}
	return trimmed;
}

export function classifyTemplateFilename(filename: string): ToolIssueTemplateFormat {
	const lower = filename.toLowerCase();
	if (lower === "config.yml" || lower === "config.yaml") return "config";
	if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown";
	if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "issue_form";
	return "unsupported";
}

export function assertGitHubContentsDirectoryResponse(value: unknown, path: string): GitHubContentsEntry[] {
	if (!Array.isArray(value)) throw contentsShapeError(path, "expected a directory listing");
	return value.map((entry) => {
		if (!isObject(entry) || typeof entry.name !== "string" || typeof entry.path !== "string" || typeof entry.type !== "string" || typeof entry.size !== "number") {
			throw contentsShapeError(path, "directory entries must carry name, path, type, and size");
		}
		return { name: entry.name, path: entry.path, type: entry.type, size: entry.size };
	});
}

export function assertGitHubContentsFileResponse(value: unknown, path: string): GitHubContentsFile {
	if (!isObject(value) || value.type !== "file" || typeof value.name !== "string" || typeof value.path !== "string" || typeof value.size !== "number" || typeof value.content !== "string" || typeof value.encoding !== "string") {
		throw contentsShapeError(path, "expected a file with base64 content");
	}
	return { name: value.name, path: value.path, type: value.type, size: value.size, content: value.content, encoding: value.encoding };
}

export function decodeContentsFile(file: GitHubContentsFile): string {
	if (file.encoding !== "base64") throw contentsShapeError(file.path, `unsupported content encoding ${file.encoding}`);
	return Buffer.from(file.content.replace(/\s+/g, ""), "base64").toString("utf8").replaceAll("\0", "");
}

export function isTemplateFileTooLarge(size: number): boolean {
	return size > MAX_ISSUE_TEMPLATE_FILE_BYTES;
}

/** Metadata for one template file; `text` is undefined when the file was not read (too large or unsupported). */
export function summarizeIssueTemplate(entry: GitHubContentsEntry, text: string | undefined): ToolIssueTemplateSummary {
	const format = classifyTemplateFilename(entry.name);
	const summary: ToolIssueTemplateSummary = { filename: entry.name, path: entry.path, format, size: entry.size };
	if (text === undefined) {
		if (isTemplateFileTooLarge(entry.size)) summary.tooLarge = true;
		return summary;
	}
	summary.contentLength = text.length;
	if (format === "markdown") applyMetadata(summary, parseMarkdownTemplate(text));
	if (format === "issue_form") applyMetadata(summary, parseIssueFormTemplate(text));
	return summary;
}

interface ParsedTemplateMetadata {
	name?: string;
	about?: string;
	title?: string;
	labels?: string[];
	assignees?: string[];
	formElements?: ToolIssueTemplateFormElementSummary[];
	formElementsCount?: number;
}

function applyMetadata(summary: ToolIssueTemplateSummary, parsed: ParsedTemplateMetadata): void {
	if (parsed.name) summary.name = parsed.name;
	if (parsed.about) summary.about = parsed.about;
	if (parsed.title) summary.title = parsed.title;
	if (parsed.labels && parsed.labels.length > 0) summary.labels = parsed.labels;
	if (parsed.assignees && parsed.assignees.length > 0) summary.assignees = parsed.assignees;
	if (parsed.formElements) summary.formElements = parsed.formElements;
	if (parsed.formElementsCount !== undefined) summary.formElementsCount = parsed.formElementsCount;
}

/** Legacy Markdown template: optional `---` front matter with name/about/title/labels/assignees, then the body. */
export function parseMarkdownTemplate(text: string): ParsedTemplateMetadata & { body: string } {
	const lines = text.split(/\r?\n/);
	if (lines[0]?.trim() !== "---") return { body: text };
	const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
	if (end === -1) return { body: text };
	const scalars = parseTopLevelValues(lines.slice(1, end));
	return { ...metadataFromValues(scalars, "about"), body: lines.slice(end + 1).join("\n") };
}

/** Issue form: top-level name/description/title/labels/assignees plus element headers under `body:`; the form is not validated. */
export function parseIssueFormTemplate(text: string): ParsedTemplateMetadata {
	const lines = text.split(/\r?\n/);
	const scalars = parseTopLevelValues(lines);
	const bodyStart = lines.findIndex((line) => /^body:[ \t]*$/.test(line));
	const bodyLines = bodyStart === -1 ? [] : takeBlock(lines, bodyStart + 1);
	const elements = parseFormElements(bodyLines);
	return { ...metadataFromValues(scalars, "description"), formElements: elements.slice(0, MAX_TOOL_ISSUE_TEMPLATE_FORM_ELEMENTS), formElementsCount: elements.length };
}

/** `config.yml`: `blank_issues_enabled` and the `contact_links` entries. */
export function parseTemplateConfig(path: string, text: string): ToolIssueTemplateConfigSummary {
	const lines = text.split(/\r?\n/);
	const summary: ToolIssueTemplateConfigSummary = { path, contactLinks: [] };
	const blank = lines.map((line) => /^blank_issues_enabled:[ \t]*(true|false)\b/i.exec(line)).find((match) => match !== null);
	if (blank) summary.blankIssuesEnabled = blank[1].toLowerCase() === "true";
	const start = lines.findIndex((line) => /^contact_links:[ \t]*$/.test(line));
	if (start === -1) return summary;
	let current: ToolIssueTemplateContactLinkSummary | undefined;
	for (const line of takeBlock(lines, start + 1)) {
		const item = /^[ \t]*-[ \t](.*)$/.exec(line);
		if (item) {
			current = {};
			summary.contactLinks.push(current);
			assignContactField(current, item[1]);
			continue;
		}
		if (current) assignContactField(current, line.trim());
	}
	return summary;
}

function assignContactField(link: ToolIssueTemplateContactLinkSummary, line: string): void {
	const match = /^(name|url|about):(.*)$/.exec(line.trimStart());
	if (!match) return;
	const value = unquote(match[2]);
	if (value) link[match[1] as "name" | "url" | "about"] = value;
}

function metadataFromValues(values: Map<string, string | string[]>, aboutKey: "about" | "description"): ParsedTemplateMetadata {
	const parsed: ParsedTemplateMetadata = {};
	const name = scalarValue(values.get("name"));
	const about = scalarValue(values.get(aboutKey));
	const title = scalarValue(values.get("title"));
	if (name) parsed.name = name;
	if (about) parsed.about = about;
	if (title) parsed.title = title;
	const labels = listValue(values.get("labels"));
	const assignees = listValue(values.get("assignees"));
	if (labels.length > 0) parsed.labels = labels;
	if (assignees.length > 0) parsed.assignees = assignees;
	return parsed;
}

/** Column-zero `key: value` pairs; empty values collect a following block list or block scalar. Nested mappings are ignored. */
function parseTopLevelValues(lines: string[]): Map<string, string | string[]> {
	const values = new Map<string, string | string[]>();
	for (let index = 0; index < lines.length; index++) {
		const match = TOP_LEVEL_KEY_PATTERN.exec(lines[index]);
		if (!match) continue;
		const [, key, rawValue] = match;
		const value = rawValue.trim();
		if (value && value !== "|" && value !== ">" && value !== "|-" && value !== ">-") {
			values.set(key, value);
			continue;
		}
		const block = takeBlock(lines, index + 1);
		const listItems = block.map((line) => BLOCK_LIST_ITEM_PATTERN.exec(line)).filter((item): item is RegExpExecArray => item !== null).map((item) => unquote(item[1]));
		if (listItems.length > 0 && listItems.length === block.filter((line) => line.trim()).length) values.set(key, listItems);
		else if (value) values.set(key, block.map((line) => line.trim()).filter(Boolean).join(" "));
	}
	return values;
}

/** Lines after `start` that are indented or blank, up to the next column-zero line. */
function takeBlock(lines: string[], start: number): string[] {
	const block: string[] = [];
	for (let index = start; index < lines.length; index++) {
		const line = lines[index];
		if (line.trim() && !/^[ \t]/.test(line)) break;
		block.push(line);
	}
	return block;
}

function parseFormElements(bodyLines: string[]): ToolIssueTemplateFormElementSummary[] {
	const elements: ToolIssueTemplateFormElementSummary[] = [];
	let current: ToolIssueTemplateFormElementSummary | undefined;
	for (const line of bodyLines) {
		const header = FORM_ELEMENT_PATTERN.exec(line);
		if (header) {
			current = { type: unquote(header[1]) };
			elements.push(current);
			continue;
		}
		if (!current) continue;
		const id = /^[ \t]+id:(.+)$/.exec(line);
		if (id && current.id === undefined) current.id = unquote(id[1]);
		const label = /^[ \t]+label:(.+)$/.exec(line);
		if (label && current.label === undefined) current.label = unquote(label[1]);
		const required = /^[ \t]+required:[ \t]*(true|false)\b/i.exec(line);
		if (required) current.required = required[1].toLowerCase() === "true";
	}
	return elements;
}

/** Quoted scalars keep their inner whitespace: a template title like `"bug: "` is a prefix GitHub preserves. */
function scalarValue(value: string | string[] | undefined): string | undefined {
	if (value === undefined) return undefined;
	const text = Array.isArray(value) ? value.join(", ") : unquote(value);
	return text.trim() ? text : undefined;
}

function listValue(value: string | string[] | undefined): string[] {
	if (value === undefined) return [];
	const items = Array.isArray(value) ? value : splitInlineList(value);
	return items.map((item) => unquote(item).trim()).filter(Boolean);
}

function splitInlineList(value: string): string[] {
	const trimmed = value.trim();
	const inner = trimmed.startsWith("[") && trimmed.endsWith("]") ? trimmed.slice(1, -1) : trimmed;
	return inner.split(",");
}

function unquote(value: string): string {
	const trimmed = value.trim();
	if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) return trimmed.slice(1, -1);
	return trimmed;
}

function contentsShapeError(path: string, detail: string): GitHubApiError {
	return new GitHubApiError(`GitHub contents API returned an unexpected response for ${path}: ${detail}.`, { code: ISSUEME_ERROR_CODES.GITHUB_RESPONSE_SHAPE_INVALID, path: `${GITHUB_API_BASE_URL}/repos` });
}
