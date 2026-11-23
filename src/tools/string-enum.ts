import { Type } from "typebox";

export function StringEnum<const Values extends string[]>(
	values: readonly [...Values],
	options?: { description?: string; default?: NoInfer<Values[number]> },
) {
	// Providers expect a string type alongside the enum values.
	return Type.Enum(values, { ...options, type: "string" });
}
