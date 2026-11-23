import assert from "node:assert/strict";
import test from "node:test";
import { Type } from "typebox";
import { Check } from "typebox/value";

import { StringEnum } from "../src/tools/string-enum.ts";

test("string enums are native TypeBox enums with provider-compatible JSON and annotations", () => {
	const schema = StringEnum(["asc", "desc"], { description: "Sort direction.", default: "asc" });
	assert.ok(Type.IsEnum(schema));
	assert.deepEqual(JSON.parse(JSON.stringify(schema)), {
		type: "string",
		enum: ["asc", "desc"],
		description: "Sort direction.",
		default: "asc",
	});
});

test("string enums constrain values inside optional arrays", () => {
	const schema = Type.Object({ sections: Type.Optional(Type.Array(StringEnum(["issues", "labels"]))) });
	assert.equal(Check(schema, {}), true);
	assert.equal(Check(schema, { sections: ["issues", "labels"] }), true);
	assert.equal(Check(schema, { sections: ["unknown"] }), false);
});
