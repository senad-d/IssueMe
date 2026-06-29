import { DEFAULT_CONFIG_PATH } from "../constants.ts";
import type { IssueMeConfig } from "../types.ts";
import { validateIssueMeConfig } from "../config/config.ts";
import { IssueMeError } from "../errors.ts";

export type ConfigPane = "categories" | "settings";
export type ConfigViewMode = "wide" | "narrow-category" | "narrow-settings" | "tiny";

export interface ConfigTuiTheme {
	fg(role: string, text: string): string;
	bold(text: string): string;
}

export interface ConfigTuiState {
	focus: ConfigPane;
	selectedCategory: number;
	selectedSettingByCategory: number[];
	search: string;
	searchActive: boolean;
	editing: boolean;
	editBuffer: string;
	status?: string;
	validationError?: string;
}

export interface ConfigTuiSetting {
	id: keyof IssueMeConfig;
	label: string;
	description: string;
	type: "text" | "list" | "path";
	emptyLabel: string;
}

interface ConfigTuiCategory {
	label: string;
	description: string;
	settings: ConfigTuiSetting[];
}

export const CONFIG_TUI_CATEGORIES: ConfigTuiCategory[] = [
	{
		label: "Cache",
		description: "Local issue-cache behavior.",
		settings: [
			{
				id: "issueDirectory",
				label: "Issue directory",
				description: "Project-local directory for IssueMe issue JSON files.",
				type: "path",
				emptyLabel: "issues",
			},
		],
	},
	{
		label: "Defaults",
		description: "Values applied when tool arguments omit optional fields.",
		settings: [
			{
				id: "defaultLabels",
				label: "Default labels",
				description: "Comma-separated labels used by issueme_create_issue when labels are omitted.",
				type: "list",
				emptyLabel: "not set",
			},
			{
				id: "defaultAssignees",
				label: "Default assignees",
				description: "Comma-separated GitHub usernames used by issueme_create_issue when assignees are omitted.",
				type: "list",
				emptyLabel: "not set",
			},
		],
	},
	{
		label: "Workflow",
		description: "Optional workflow settings.",
		settings: [
			{
				id: "defaultSkillPath",
				label: "Default skill path",
				description: "Optional project-local skill path for IssueMe workflow prompts.",
				type: "path",
				emptyLabel: "not set",
			},
		],
	},
];

export class IssueMeConfigTui {
	private cachedWidth?: number;
	private cachedLines?: string[];
	private readonly draft: IssueMeConfig;
	private readonly state: ConfigTuiState;
	private readonly projectRoot: string;
	private readonly theme: ConfigTuiTheme;
	private readonly done: (result: IssueMeConfig | undefined) => void;
	private readonly requestRender: () => void;

	constructor(
		projectRoot: string,
		initialConfig: IssueMeConfig,
		theme: ConfigTuiTheme,
		done: (result: IssueMeConfig | undefined) => void,
		requestRender: () => void = () => {},
		state?: Partial<ConfigTuiState>,
	) {
		this.projectRoot = projectRoot;
		this.theme = theme;
		this.done = done;
		this.requestRender = requestRender;
		this.draft = cloneConfig(initialConfig);
		this.state = {
			focus: "categories",
			selectedCategory: 0,
			selectedSettingByCategory: CONFIG_TUI_CATEGORIES.map(() => 0),
			search: "",
			searchActive: false,
			editing: false,
			editBuffer: "",
			...state,
		};
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const safeWidth = Math.max(1, width);
		let lines: string[];
		if (safeWidth < 24) lines = this.renderTiny(safeWidth);
		else if (safeWidth >= 72) lines = this.renderWide(safeWidth);
		else lines = this.renderNarrow(safeWidth);
		this.cachedWidth = width;
		this.cachedLines = lines.map((line) => fit(line, safeWidth));
		return this.cachedLines;
	}

	handleInput(data: string): void {
		if (this.state.editing) {
			this.handleEditInput(data);
			return;
		}

		if (data === "q" || data === "\u0003") {
			this.done(undefined);
			return;
		}
		if (this.state.searchActive && data === "\x7f") {
			this.state.search = dropLastGrapheme(this.state.search);
			this.invalidateAndRender();
			return;
		}
		if (this.state.searchActive && isPrintable(data) && data !== "/") {
			this.state.search += data;
			this.invalidateAndRender();
			return;
		}
		if (data === "s") {
			this.save();
			return;
		}
		if (data === "\t") {
			this.state.focus = this.state.focus === "categories" ? "settings" : "categories";
			this.invalidateAndRender();
			return;
		}
		if (data === "\r" || data === "\n") {
			if (this.state.focus === "categories") this.state.focus = "settings";
			else this.startEditing();
			this.invalidateAndRender();
			return;
		}
		if (data === "\u001b") {
			if (this.state.searchActive) {
				this.state.searchActive = false;
				this.state.search = "";
				this.invalidateAndRender();
			} else {
				this.done(undefined);
			}
			return;
		}
		if (data === "/") {
			this.state.searchActive = true;
			this.state.focus = "settings";
			this.invalidateAndRender();
			return;
		}
		if (isUp(data)) this.move(-1);
		else if (isDown(data)) this.move(1);
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private renderWide(width: number): string[] {
		const leftPaneWidth = Math.min(22, Math.max(16, Math.floor(width * 0.27)));
		const rightPaneWidth = Math.max(10, width - leftPaneWidth - 3);
		const bodyHeight = Math.max(CONFIG_TUI_CATEGORIES.length, Math.min(11, this.currentRows().settings.length + 1), 8);
		const lines = [
			this.topBorder(width, "Configuration", this.scopeLabel()),
			this.fullLine(width, sourceLine()),
			this.fullLine(width, this.helpLine("wide")),
			this.wideSeparator(width, leftPaneWidth, "top"),
		];
		const categoryRows = this.renderCategoryRows(leftPaneWidth, bodyHeight);
		const settingsRows = this.renderSettingsRows(rightPaneWidth, bodyHeight);
		for (let index = 0; index < bodyHeight; index += 1) {
			lines.push(this.accent("│") + fit(categoryRows[index] ?? "", leftPaneWidth) + this.accent("│") + fit(settingsRows[index] ?? "", rightPaneWidth) + this.accent("│"));
		}
		lines.push(this.wideSeparator(width, leftPaneWidth, "bottom"));
		lines.push(this.fullLine(width, this.footerText()));
		lines.push(this.bottomBorder(width));
		return lines;
	}

	private renderNarrow(width: number): string[] {
		const settingsView = this.state.focus === "settings" || this.state.searchActive;
		const bodyHeight = settingsView ? Math.max(4, Math.min(11, this.currentRows().settings.length + 1)) : Math.max(4, CONFIG_TUI_CATEGORIES.length);
		const lines = [
			this.topBorder(width, "Configuration", this.scopeLabel()),
			this.fullLine(width, sourceLine()),
			this.fullLine(width, this.helpLine(settingsView ? "narrow-settings" : "narrow-category")),
			this.narrowSeparator(width),
		];
		const rows = settingsView ? this.renderSettingsRows(width - 2, bodyHeight) : this.renderCategoryRows(width - 2, bodyHeight);
		for (const row of rows) lines.push(this.fullLine(width, row));
		lines.push(this.narrowSeparator(width));
		lines.push(this.fullLine(width, this.footerText()));
		lines.push(this.bottomBorder(width));
		return lines;
	}

	private renderTiny(width: number): string[] {
		const selected = this.selectedSetting() ?? CONFIG_TUI_CATEGORIES[this.state.selectedCategory].settings[0];
		const value = selected ? this.valueText(selected) : "";
		return ["Configuration", this.scopeLabel(), selected ? `${selected.label}: ${value}` : "No setting", this.helpLine("tiny")].map((line) => fit(line, width));
	}

	private helpLine(mode: ConfigViewMode): string {
		if (this.state.editing) return mode === "tiny" ? "Enter save  Esc cancel" : "Type value  Enter save  Esc cancel";
		if (this.state.searchActive) return mode === "wide" ? "↑↓ move  Enter edit  Esc clear  q quit" : "Esc clear  q quit  ↑↓ move  Enter edit";
		if (mode === "wide") return "↑↓ move  Tab pane  Enter edit  / search  Esc/q quit  s save";
		if (mode === "narrow-category") return "Esc/q quit  s save  ↑↓ category  Enter open";
		if (mode === "narrow-settings") return "Esc/q quit  s save  ↑↓ move  Enter edit";
		return "s save  Esc/q quit";
	}

	private renderCategoryRows(width: number, height: number): string[] {
		const rows: string[] = [];
		for (let index = 0; index < height; index += 1) {
			const category = CONFIG_TUI_CATEGORIES[index];
			if (!category) {
				rows.push("".padEnd(width));
				continue;
			}
			const selected = index === this.state.selectedCategory;
			const prefix = selected ? this.selectedPrefix(this.state.focus === "categories") : "  ";
			const label = selected ? this.selectedText(category.label, this.state.focus === "categories") : this.dim(category.label);
			rows.push(fit(prefix + label, width));
		}
		return rows;
	}

	private renderSettingsRows(width: number, height: number): string[] {
		const { title, settings, selectedIndex } = this.currentRows();
		const rows = [this.settingsHeader(width, title, selectedIndex, settings.length)];
		if (settings.length === 0) rows.push(fit(`  ${this.warning("No matching settings")}`, width));
		else {
			const visible = visibleWindow(settings.length, selectedIndex, Math.max(1, height - 1));
			for (const index of visible) rows.push(this.settingRow(width, settings[index], index === selectedIndex));
		}
		while (rows.length < height) rows.push("".padEnd(width));
		return rows.slice(0, height);
	}

	private settingsHeader(width: number, title: string, selectedIndex: number, count: number): string {
		const counter = this.dim(count === 0 ? "0/0" : `${selectedIndex + 1}/${count}`);
		const label = (this.state.focus === "settings" ? this.accent(this.theme.bold(title.toUpperCase())) : this.dim(this.theme.bold(title.toUpperCase())));
		const labelWidth = Math.max(1, width - visibleWidth(counter) - 1);
		return fit(fit(label, labelWidth) + " " + counter, width);
	}

	private settingRow(width: number, setting: ConfigTuiSetting, selected: boolean): string {
		const valueWidth = Math.max(0, Math.min(28, Math.floor(width * 0.4)));
		const labelWidth = Math.max(1, width - 2 - 1 - valueWidth);
		const prefix = selected ? this.selectedPrefix(this.state.focus === "settings") : "  ";
		const label = selected ? this.selectedText(setting.label, this.state.focus === "settings") : setting.label;
		const value = this.valueStyled(setting, valueWidth);
		return fit(prefix + fit(label, labelWidth) + " " + fitLeft(value, valueWidth), width);
	}

	private currentRows(): { title: string; settings: ConfigTuiSetting[]; selectedIndex: number } {
		if (this.state.searchActive) {
			const query = this.state.search.trim().toLowerCase();
			const settings = CONFIG_TUI_CATEGORIES.flatMap((category) => category.settings.map((setting) => ({ ...setting, label: `${setting.label} (${category.label})` })));
			const filtered = query ? settings.filter((setting) => setting.label.toLowerCase().includes(query)) : settings;
			return { title: query ? `SEARCH ${query}` : "SEARCH", settings: filtered, selectedIndex: Math.min(this.selectedSettingIndex(), Math.max(0, filtered.length - 1)) };
		}
		const category = CONFIG_TUI_CATEGORIES[this.state.selectedCategory];
		return {
			title: category.label,
			settings: category.settings,
			selectedIndex: Math.min(this.state.selectedSettingByCategory[this.state.selectedCategory] ?? 0, Math.max(0, category.settings.length - 1)),
		};
	}

	private selectedSetting(): ConfigTuiSetting | undefined {
		const rows = this.currentRows();
		return rows.settings[rows.selectedIndex];
	}

	private selectedSettingIndex(): number {
		return this.state.selectedSettingByCategory[this.state.selectedCategory] ?? 0;
	}

	private valueText(setting: ConfigTuiSetting): string {
		const value = this.draft[setting.id];
		if (Array.isArray(value)) return value.length ? value.join(", ") : setting.emptyLabel;
		if (typeof value === "string") return value || setting.emptyLabel;
		return value ?? setting.emptyLabel;
	}

	private valueStyled(setting: ConfigTuiSetting, width: number): string {
		const value = this.valueText(setting);
		const clipped = setting.type === "path" ? tailFit(value, width) : fit(value, width);
		return value === setting.emptyLabel ? this.dim(clipped) : clipped;
	}

	private footerText(): string {
		if (this.state.validationError) return `${this.warning(this.state.validationError)} • ${this.selectionCounter()} • ${this.selectedDescription()}`;
		if (this.state.editing) return `${this.selectionCounter()} • ${this.state.editBuffer ? `Editing ${this.state.editBuffer}` : "Type value"} • Enter save • Esc cancel`;
		if (this.state.status) return `${this.state.status} • ${this.selectionCounter()} • ${this.selectedDescription()}`;
		if (this.state.searchActive) return `${this.state.search ? `Search: ${this.state.search}` : "Search: type to filter all settings"} • ${this.selectionCounter()} • ${this.selectedDescription()}`;
		return `${this.selectionCounter()} • ${this.selectedDescription()}`;
	}

	private selectedDescription(): string {
		return this.selectedSetting()?.description ?? CONFIG_TUI_CATEGORIES[this.state.selectedCategory].description;
	}

	private selectionCounter(): string {
		const rows = this.currentRows();
		return rows.settings.length === 0 ? "0/0" : `${rows.selectedIndex + 1}/${rows.settings.length}`;
	}

	private scopeLabel(): string {
		if (this.state.searchActive && this.state.search) return "Search";
		if (this.state.editing) return "Editing";
		return "Project";
	}

	private move(delta: number): void {
		if (this.state.focus === "categories" && !this.state.searchActive) {
			this.state.selectedCategory = clamp(this.state.selectedCategory + delta, 0, CONFIG_TUI_CATEGORIES.length - 1);
		} else {
			const rows = this.currentRows();
			const next = clamp(rows.selectedIndex + delta, 0, Math.max(0, rows.settings.length - 1));
			this.state.selectedSettingByCategory[this.state.selectedCategory] = next;
		}
		this.invalidateAndRender();
	}

	private startEditing(): void {
		const setting = this.selectedSetting();
		if (!setting) return;
		this.state.editing = true;
		this.state.editBuffer = this.rawValue(setting);
		this.state.validationError = undefined;
	}

	private handleEditInput(data: string): void {
		if (data === "\u001b") {
			this.state.editing = false;
			this.state.editBuffer = "";
			this.state.status = "Edit cancelled";
			this.invalidateAndRender();
			return;
		}
		if (data === "\r" || data === "\n") {
			this.commitEdit();
			return;
		}
		if (data === "\x7f") this.state.editBuffer = dropLastGrapheme(this.state.editBuffer);
		else if (isPrintable(data)) this.state.editBuffer += data;
		this.invalidateAndRender();
	}

	private commitEdit(): void {
		const setting = this.selectedSetting();
		if (!setting) return;
		try {
			this.applySetting(setting, this.state.editBuffer);
			validateIssueMeConfig(this.projectRoot, this.draft);
			this.state.editing = false;
			this.state.editBuffer = "";
			this.state.status = "Setting updated";
			this.state.validationError = undefined;
		} catch (error) {
			this.state.validationError = error instanceof Error ? error.message : String(error);
		}
		this.invalidateAndRender();
	}

	private save(): void {
		try {
			const config = validateIssueMeConfig(this.projectRoot, this.draft);
			this.done(config);
		} catch (error) {
			this.state.validationError = error instanceof Error ? error.message : String(error);
			this.invalidateAndRender();
		}
	}

	private applySetting(setting: ConfigTuiSetting, raw: string): void {
		if (setting.type === "list") {
			const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
			(this.draft[setting.id] as string[]) = [...new Set(values)];
			return;
		}
		const value = raw.trim();
		if (setting.id === "defaultSkillPath") this.draft.defaultSkillPath = value || null;
		else if (setting.id === "issueDirectory") this.draft.issueDirectory = value || "issues";
		else throw new IssueMeError("config_tui_invalid_setting", "Unsupported config setting.");
	}

	private rawValue(setting: ConfigTuiSetting): string {
		const value = this.draft[setting.id];
		if (Array.isArray(value)) return value.join(", ");
		return typeof value === "string" ? value : "";
	}

	private topBorder(width: number, title: string, scope: string): string {
		const innerWidth = Math.max(0, width - 2);
		const left = `─ ${title} `;
		const right = ` ${scope} ─`;
		const fill = "─".repeat(Math.max(0, innerWidth - visibleWidth(left) - visibleWidth(right)));
		return this.accent(fit(`╭${left}${fill}${right}╮`, width, "─"));
	}

	private bottomBorder(width: number): string {
		return this.accent(`╰${"─".repeat(Math.max(0, width - 2))}╯`);
	}

	private fullLine(width: number, content: string): string {
		return this.accent("│") + fit(content, Math.max(0, width - 2)) + this.accent("│");
	}

	private wideSeparator(width: number, leftPaneWidth: number, kind: "top" | "bottom"): string {
		const rightPaneWidth = Math.max(0, width - leftPaneWidth - 3);
		return this.accent(`├${"─".repeat(leftPaneWidth)}${kind === "top" ? "┬" : "┴"}${"─".repeat(rightPaneWidth)}┤`);
	}

	private narrowSeparator(width: number): string {
		return this.accent(`├${"─".repeat(Math.max(0, width - 2))}┤`);
	}

	private accent(text: string): string {
		return this.theme.fg("accent", text);
	}

	private dim(text: string): string {
		return this.theme.fg("dim", text);
	}

	private warning(text: string): string {
		return this.theme.fg("warning", text);
	}

	private selectedPrefix(active: boolean): string {
		return (active ? this.accent("▶") : this.theme.fg("muted", "▶")) + " ";
	}

	private selectedText(text: string, active: boolean): string {
		return active ? this.accent(this.theme.bold(text)) : this.theme.fg("muted", text);
	}

	private invalidateAndRender(): void {
		this.invalidate();
		this.requestRender();
	}
}

export function renderConfigTuiSnapshot(projectRoot: string, config: IssueMeConfig, width: number, state?: Partial<ConfigTuiState>): string[] {
	const theme: ConfigTuiTheme = { fg: (_role, text) => text, bold: (text) => text };
	return new IssueMeConfigTui(projectRoot, config, theme, () => {}, () => {}, state).render(width);
}

function sourceLine(): string {
	return `writes ${DEFAULT_CONFIG_PATH} • external overrides may apply`;
}

function cloneConfig(config: IssueMeConfig): IssueMeConfig {
	return {
		issueDirectory: config.issueDirectory,
		defaultLabels: [...config.defaultLabels],
		defaultAssignees: [...config.defaultAssignees],
		defaultSkillPath: config.defaultSkillPath,
	};
}

function visibleWindow(count: number, selectedIndex: number, height: number): number[] {
	if (count <= height) return Array.from({ length: count }, (_, index) => index);
	const start = clamp(selectedIndex - Math.floor(height / 2), 0, count - height);
	return Array.from({ length: height }, (_, index) => start + index);
}

function fit(value: string, width: number, pad = " "): string {
	const clipped = truncateAnsi(value, width);
	return clipped + pad.repeat(Math.max(0, width - visibleWidth(clipped)));
}

function fitLeft(value: string, width: number): string {
	const clipped = truncateAnsi(value, width);
	return " ".repeat(Math.max(0, width - visibleWidth(clipped))) + clipped;
}

function tailFit(value: string, width: number): string {
	if (width <= 0) return "";
	if (visibleWidth(value) <= width) return value;
	if (width <= visibleWidth("…")) return truncateAnsi("…", width);
	const tailWidth = width - visibleWidth("…");
	let tail = "";
	let used = 0;
	for (const segment of [...graphemes(stripAnsi(value))].reverse()) {
		const segmentWidth = graphemeWidth(segment);
		if (used + segmentWidth > tailWidth) break;
		tail = segment + tail;
		used += segmentWidth;
	}
	return `…${tail}`;
}

function truncateAnsi(value: string, width: number): string {
	if (width <= 0) return "";
	let output = "";
	let visible = 0;
	let index = 0;
	let ansiActive = false;
	let truncated = false;
	while (index < value.length) {
		const ansi = readAnsiAt(value, index);
		if (ansi) {
			output += ansi;
			ansiActive = updateAnsiActive(ansi, ansiActive);
			index += ansi.length;
			continue;
		}
		const { segment, nextIndex } = readGraphemeAt(value, index);
		const segmentWidth = graphemeWidth(segment);
		if (visible + segmentWidth > width) {
			truncated = true;
			break;
		}
		output += segment;
		visible += segmentWidth;
		index = nextIndex;
	}
	if (truncated && ansiActive) output += "\u001b[0m";
	return output;
}

function visibleWidth(value: string): number {
	let width = 0;
	for (const segment of graphemes(stripAnsi(value))) width += graphemeWidth(segment);
	return width;
}

function stripAnsi(value: string): string {
	return value.replace(ANSI_PATTERN, "");
}

function readAnsiAt(value: string, index: number): string | undefined {
	if (value[index] !== "\u001b") return undefined;
	return value.slice(index).match(ANSI_AT_START_PATTERN)?.[0];
}

function updateAnsiActive(sequence: string, current: boolean): boolean {
	if (!sequence.endsWith("m")) return current;
	const body = sequence.slice(2, -1).trim();
	if (!body) return false;
	const codes = body.split(";").map((part) => Number.parseInt(part, 10));
	let active = current;
	for (const code of codes) {
		if (Number.isNaN(code)) continue;
		active = code === 0 ? false : true;
	}
	return active;
}

function readGraphemeAt(value: string, index: number): { segment: string; nextIndex: number } {
	const escapeIndex = value.indexOf("\u001b", index);
	const plainEnd = escapeIndex === -1 ? value.length : escapeIndex;
	const plain = value.slice(index, plainEnd);
	const segment = graphemes(plain)[0] ?? value[index] ?? "";
	return { segment, nextIndex: index + segment.length };
}

function graphemes(value: string): string[] {
	if (!value) return [];
	if (GRAPHEME_SEGMENTER) return [...GRAPHEME_SEGMENTER.segment(value)].map((part) => part.segment);
	return Array.from(value);
}

function dropLastGrapheme(value: string): string {
	const segments = graphemes(value);
	segments.pop();
	return segments.join("");
}

function graphemeWidth(segment: string): number {
	if (!segment) return 0;
	if (isEmojiGrapheme(segment)) return 2;
	let width = 0;
	for (const char of Array.from(segment)) {
		const codePoint = char.codePointAt(0) ?? 0;
		if (isZeroWidthCodePoint(codePoint) || isControlCodePoint(codePoint)) continue;
		width += isFullwidthCodePoint(codePoint) ? 2 : 1;
	}
	return width;
}

function isControlCodePoint(codePoint: number): boolean {
	return codePoint <= 0x1F || (codePoint >= 0x7F && codePoint <= 0x9F);
}

function isZeroWidthCodePoint(codePoint: number): boolean {
	return codePoint === 0x200D
		|| (codePoint >= 0x0300 && codePoint <= 0x036F)
		|| (codePoint >= 0x1AB0 && codePoint <= 0x1AFF)
		|| (codePoint >= 0x1DC0 && codePoint <= 0x1DFF)
		|| (codePoint >= 0x20D0 && codePoint <= 0x20FF)
		|| (codePoint >= 0xFE00 && codePoint <= 0xFE0F)
		|| (codePoint >= 0xFE20 && codePoint <= 0xFE2F)
		|| (codePoint >= 0xE0100 && codePoint <= 0xE01EF);
}

function isFullwidthCodePoint(codePoint: number): boolean {
	return codePoint >= 0x1100 && (
		codePoint <= 0x115F
		|| codePoint === 0x2329
		|| codePoint === 0x232A
		|| (codePoint >= 0x2E80 && codePoint <= 0xA4CF && codePoint !== 0x303F)
		|| (codePoint >= 0xAC00 && codePoint <= 0xD7A3)
		|| (codePoint >= 0xF900 && codePoint <= 0xFAFF)
		|| (codePoint >= 0xFE10 && codePoint <= 0xFE19)
		|| (codePoint >= 0xFE30 && codePoint <= 0xFE6F)
		|| (codePoint >= 0xFF00 && codePoint <= 0xFF60)
		|| (codePoint >= 0xFFE0 && codePoint <= 0xFFE6)
		|| (codePoint >= 0x20000 && codePoint <= 0x3FFFD)
	);
}

const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]/g;
const ANSI_AT_START_PATTERN = /^\u001b\[[0-?]*[ -/]*[@-~]/;
function isEmojiGrapheme(segment: string): boolean {
	return EMOJI_PRESENTATION_PATTERN.test(segment)
		|| (segment.includes("\uFE0F") && EXTENDED_PICTOGRAPHIC_PATTERN.test(segment))
		|| (segment.includes("\u200D") && EXTENDED_PICTOGRAPHIC_PATTERN.test(segment));
}

const EMOJI_PRESENTATION_PATTERN = /\p{Emoji_Presentation}/u;
const EXTENDED_PICTOGRAPHIC_PATTERN = /\p{Extended_Pictographic}/u;

type GraphemeSegmenter = { segment(value: string): Iterable<{ segment: string }> };
const SegmenterConstructor = (Intl as unknown as { Segmenter?: new (locales: string | string[] | undefined, options: { granularity: "grapheme" }) => GraphemeSegmenter }).Segmenter;
const GRAPHEME_SEGMENTER = SegmenterConstructor ? new SegmenterConstructor(undefined, { granularity: "grapheme" }) : undefined;

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}

function isUp(data: string): boolean {
	return data === "\u001b[A" || data === "k";
}

function isDown(data: string): boolean {
	return data === "\u001b[B" || data === "j";
}

function isPrintable(data: string): boolean {
	return data.length > 0 && !/[\u0000-\u001F\u007F]/.test(data);
}
