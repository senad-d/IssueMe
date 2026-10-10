import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { ISSUEME_TOOL_NAMES } from "../src/tools/inventory.ts";

const guideUrl = new URL("../docs/workflows.md", import.meta.url);
const diagramsUrl = new URL("../docs/diagrams/", import.meta.url);

async function readGuide() {
	return readFile(guideUrl, "utf8");
}

test("visual guide maps every registered tool exactly once and family counts agree", async () => {
	const guide = await readGuide();
	const toolMap = guide.split("## Tool map\n")[1];
	assert.ok(toolMap, "guide must have a complete tool map");
	const rows = toolMap.split("\n").filter((line) => /^\| [^|]+ \| \d+ \|/.test(line));
	assert.equal(rows.length, 9);
	const names = [];
	let total = 0;
	for (const row of rows) {
		const count = Number(row.split("|")[2].trim());
		const tools = [...row.matchAll(/`(issueme_[a-z_]+)`/g)].map((match) => match[1]);
		assert.equal(tools.length, count, row);
		names.push(...tools);
		total += count;
	}
	assert.equal(total, ISSUEME_TOOL_NAMES.length);
	assert.equal(new Set(names).size, names.length, "tools must not appear in multiple families");
	assert.deepEqual(names.toSorted(), [...ISSUEME_TOOL_NAMES].toSorted());
});

test("each guide diagram has a final SVG, editable source, and descriptive image text", async () => {
	const guide = await readGuide();
	const images = [...guide.matchAll(/!\[([^\]]+)\]\((diagrams\/[^)]+\.svg)\)/g)];
	assert.equal(images.length, 7);
	const expected = [];
	for (const [, alt, path] of images) {
		assert.ok(alt.length > 40, "diagram needs a meaningful text alternative");
		const sourcePath = path.replace(/\.svg$/, ".drawio");
		assert.ok(guide.includes(`](${sourcePath})`), "guide must link the editable source");
		const svg = await readFile(new URL(path, guideUrl), "utf8");
		const source = await readFile(new URL(sourcePath, guideUrl), "utf8");
		assert.match(svg, /<svg\b/);
		assert.match(source, /<mxfile\b/);
		assert.match(source, /<mxGraphModel\b/, "source must remain uncompressed for linting");
		expected.push(path.split("/").at(-1), sourcePath.split("/").at(-1));
	}
	const assets = (await readdir(diagramsUrl)).filter((name) => name !== "README.md");
	assert.deepEqual(assets.toSorted(), expected.toSorted(), "only final SVG/source pairs belong in diagrams; no preview residue");
});

test("package includes diagram images and editable sources alongside Markdown", async () => {
	const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
	assert.ok(pkg.files.includes("docs/**/*.md"));
	assert.ok(pkg.files.includes("docs/diagrams/*.svg"));
	assert.ok(pkg.files.includes("docs/diagrams/*.drawio"));
});
