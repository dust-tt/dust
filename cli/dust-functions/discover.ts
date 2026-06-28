#!/usr/bin/env bun
// discover — scan a folder of fetch handlers and emit a catalog of their I/O
// contracts as JSON Schema, suitable for LLM tool-use discovery.
//
//   discover ./handlers   →   { handlers: [...], skipped: [...] } on stdout
//
// A handler declares its contract by exporting `schema` (see README):
//   export const schema = { description, input: ZodType, output: ZodType }

import { readdir, stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { z } from "zod";

export interface HandlerSchema {
  name: string;
  description: string | null;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
}

export interface Skipped {
  name: string;
  reason: string;
}

export interface Catalog {
  handlers: HandlerSchema[];
  skipped: Skipped[];
}

/**
 * Convert a Zod schema to JSON Schema, dropping the `$schema` meta key so the
 * result drops cleanly into a tool-use definition. Returns null for anything
 * that is not a Zod type.
 */
export function toJsonSchema(value: unknown): Record<string, unknown> | null {
  if (!(value instanceof z.ZodType)) {
    return null;
  }
  const { $schema, ...rest } = z.toJSONSchema(value) as Record<string, unknown>;
  return rest;
}

const isTestFile = (file: string) => file.endsWith(".test.ts");
const isTsFile = (file: string) => file.endsWith(".ts");
const nameOf = (file: string) => basename(file, ".ts");

/**
 * Scan `folder` and classify every `*.ts` file (excluding `*.test.ts`) into a
 * catalog of documented handlers and a list of skipped files with reasons.
 * Per-file problems never throw; only an invalid folder rejects.
 */
export async function discover(folder: string): Promise<Catalog> {
  // Resolve against the caller's working directory so relative folder args and
  // dynamic import specifiers both point at the right place.
  const dir = resolve(folder);
  const info = await stat(dir); // throws if missing
  if (!info.isDirectory()) {
    throw new Error(`not a directory: ${folder}`);
  }

  const files = (await readdir(dir))
    .filter(isTsFile)
    .filter((f) => !isTestFile(f))
    .sort();

  const handlers: HandlerSchema[] = [];
  const skipped: Skipped[] = [];

  for (const file of files) {
    const name = nameOf(file);

    // Read default/schema inside the try: importing a module that threw can,
    // on a later import in the same process, resolve to a half-initialized
    // namespace whose bindings throw on access (TDZ). Treat that as an import
    // failure too.
    let def: { fetch?: unknown } | undefined;
    let schema:
      | { description?: unknown; input?: unknown; output?: unknown }
      | undefined;
    try {
      const mod = await import(join(dir, file));
      def = mod.default as typeof def;
      schema = mod.schema as typeof schema;
    } catch (e) {
      skipped.push({ name, reason: `import failed: ${(e as Error).message}` });
      continue;
    }

    if (typeof def?.fetch !== "function") {
      skipped.push({ name, reason: "not a handler (no default.fetch export)" });
      continue;
    }

    if (schema === undefined) {
      skipped.push({ name, reason: "handler missing schema export" });
      continue;
    }

    const input_schema = toJsonSchema(schema.input);
    const output_schema = toJsonSchema(schema.output);

    // Report fields that were declared but are not valid Zod types.
    if (schema.input !== undefined && input_schema === null) {
      skipped.push({ name, reason: "invalid schema: input" });
    }
    if (schema.output !== undefined && output_schema === null) {
      skipped.push({ name, reason: "invalid schema: output" });
    }

    handlers.push({
      name,
      description:
        typeof schema.description === "string" ? schema.description : null,
      input_schema,
      output_schema,
    });
  }

  return { handlers, skipped };
}

async function main(): Promise<void> {
  const folder = process.argv[2];
  if (!folder) {
    process.stdout.write(
      JSON.stringify({ error: "usage: discover <folder>" }) + "\n"
    );
    process.exit(2);
  }

  let catalog: Catalog;
  try {
    catalog = await discover(folder);
  } catch (e) {
    process.stdout.write(
      JSON.stringify({ error: (e as Error).message }) + "\n"
    );
    process.exit(2);
  }

  process.stdout.write(JSON.stringify(catalog) + "\n");
}

if (import.meta.main) {
  await main();
}
