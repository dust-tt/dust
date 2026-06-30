import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { z } from "zod";
import { getFunctionSchema, toJsonSchema } from "./schema.ts";

const fx = (n: string) => join(import.meta.dir, "fixtures", n);

describe("toJsonSchema", () => {
  test("converts a Zod object and drops $schema", () => {
    const js = toJsonSchema(
      z.object({ name: z.string(), age: z.number().optional() })
    );
    expect(js).toEqual({
      type: "object",
      properties: { name: { type: "string" }, age: { type: "number" } },
      required: ["name"],
      additionalProperties: false,
    });
  });

  test("returns null for non-Zod values", () => {
    expect(toJsonSchema({ name: "string" })).toBeNull();
    expect(toJsonSchema(undefined)).toBeNull();
  });
});

describe("getFunctionSchema", () => {
  test("returns the tool-definition object for a documented function", async () => {
    const s = await getFunctionSchema(fx("greet.ts"));
    expect(s.name).toBe("greet");
    expect(s.description).toBe("Greet a user by name");
    expect(s.input_schema).toMatchObject({ required: ["name"] });
    expect(s.output_schema).toMatchObject({ required: ["greeting"] });
  });

  test("nulls a malformed (non-Zod) schema field", async () => {
    const s = await getFunctionSchema(fx("bad-schema.ts"));
    expect(s.input_schema).toBeNull();
    expect(s.output_schema).toBeNull();
  });

  test("throws when the function declares no schema", async () => {
    await expect(getFunctionSchema(fx("no-schema.ts"))).rejects.toThrow(
      /schema/
    );
  });

  test("throws when the file cannot be imported", async () => {
    await expect(getFunctionSchema(fx("nope.ts"))).rejects.toThrow();
  });
});
