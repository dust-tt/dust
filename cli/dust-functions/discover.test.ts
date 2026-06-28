import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { z } from "zod";
import { discover, toJsonSchema } from "./discover.ts";

const catalogDir = join(import.meta.dir, "fixtures", "catalog");

describe("toJsonSchema", () => {
  test("converts a Zod object, dropping the $schema key", () => {
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

  test("returns null for a non-Zod value", () => {
    expect(toJsonSchema({ name: "string" } as any)).toBeNull();
    expect(toJsonSchema(undefined)).toBeNull();
  });
});

describe("discover", () => {
  test("catalogs a fully documented handler", async () => {
    const { handlers } = await discover(catalogDir);
    const greet = handlers.find((h) => h.name === "greet");
    expect(greet).toBeDefined();
    expect(greet!.description).toBe("Greet a user by name");
    expect(greet!.input_schema).toMatchObject({
      type: "object",
      properties: { name: { type: "string" }, formal: { type: "boolean" } },
      required: ["name"],
    });
    expect(greet!.output_schema).toMatchObject({
      properties: { greeting: { type: "string" } },
    });
  });

  test("derives the name from the file name", async () => {
    const { handlers } = await discover(catalogDir);
    expect(handlers.map((h) => h.name)).toContain("greet");
  });

  test("skips and reports a handler with no schema export", async () => {
    const { handlers, skipped } = await discover(catalogDir);
    expect(handlers.find((h) => h.name === "undocumented")).toBeUndefined();
    expect(skipped).toContainEqual({
      name: "undocumented",
      reason: "handler missing schema export",
    });
  });

  test("skips and reports a non-handler helper file", async () => {
    const { skipped } = await discover(catalogDir);
    expect(skipped).toContainEqual({
      name: "helpers",
      reason: "not a handler (no default.fetch export)",
    });
  });

  test("skips and reports a file that throws at import", async () => {
    const { skipped } = await discover(catalogDir);
    const entry = skipped.find((s) => s.name === "broken");
    expect(entry).toBeDefined();
    // The exact upstream message varies with module-cache state across repeated
    // imports; the guaranteed contract is that it is reported as an import failure.
    expect(entry!.reason).toStartWith("import failed:");
  });

  test("catalogs a handler with a malformed schema field but also reports it", async () => {
    const { handlers, skipped } = await discover(catalogDir);
    const bad = handlers.find((h) => h.name === "bad-schema");
    expect(bad).toBeDefined();
    expect(bad!.input_schema).toBeNull();
    expect(bad!.output_schema).toBeNull();
    expect(skipped).toContainEqual({
      name: "bad-schema",
      reason: "invalid schema: input",
    });
  });

  test("ignores *.test.ts files entirely", async () => {
    const { handlers, skipped } = await discover(catalogDir);
    const names = [...handlers, ...skipped].map((x) => x.name);
    expect(names).not.toContain("ignored.test");
    expect(names).not.toContain("ignored");
  });

  test("rejects a path that is not a directory", async () => {
    await expect(
      discover(join(import.meta.dir, "fixtures", "catalog", "greet.ts"))
    ).rejects.toThrow();
  });
});

describe("CLI end-to-end", () => {
  test("prints the catalog as JSON for a folder argument", async () => {
    const proc = Bun.spawn(
      ["bun", join(import.meta.dir, "discover.ts"), catalogDir],
      { stdout: "pipe", stderr: "pipe" }
    );
    const stdout = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    const out = JSON.parse(stdout);
    expect(out.handlers.find((h: any) => h.name === "greet")).toBeDefined();
    expect(Array.isArray(out.skipped)).toBe(true);
  });
});
