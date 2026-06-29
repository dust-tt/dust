// Extract a single function's JSON-Schema I/O contract from its `schema` export.

import { basename } from "node:path";
import { z } from "zod";

export interface FunctionSchema {
  name: string;
  description: string | null;
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
}

export function toJsonSchema(value: unknown): Record<string, unknown> | null {
  if (!(value instanceof z.ZodType)) {
    return null;
  }
  const { $schema, ...rest } = z.toJSONSchema(value) as Record<string, unknown>;
  return rest;
}

export async function getFunctionSchema(
  handlerPath: string
): Promise<FunctionSchema> {
  const mod = await import(handlerPath);
  const schema = mod.schema as
    | { description?: unknown; input?: unknown; output?: unknown }
    | undefined;
  if (schema === undefined) {
    throw new Error("function declares no `schema` export");
  }
  return {
    name: basename(handlerPath, ".ts"),
    description:
      typeof schema.description === "string" ? schema.description : null,
    input_schema: toJsonSchema(schema.input),
    output_schema: toJsonSchema(schema.output),
  };
}
