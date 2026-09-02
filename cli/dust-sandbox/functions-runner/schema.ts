// Extract a single function's JSON-Schema I/O contract from its `schema` export.

import { basename, extname } from "node:path";
import { z } from "zod";

export interface FunctionSchema {
  name: string;
  description: string | null;
  userIdentity:
    | "optional"
    | "workspace_user_required"
    | "interactive_workspace_user_required"
    | "pod_member_required"
    | "frame_author_required";
  input_schema: Record<string, unknown> | null;
  output_schema: Record<string, unknown> | null;
}

function parseUserIdentityPolicy(
  value: unknown
): FunctionSchema["userIdentity"] {
  if (value === undefined || value === "optional") {
    return "optional";
  }
  if (
    value === "workspace_user_required" ||
    value === "interactive_workspace_user_required" ||
    value === "pod_member_required" ||
    value === "frame_author_required"
  ) {
    return value;
  }
  throw new Error(
    "`schema.userIdentity` must be `optional`, `workspace_user_required`, " +
      "`interactive_workspace_user_required`, `pod_member_required`, or " +
      "`frame_author_required`"
  );
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
    | {
        description?: unknown;
        userIdentity?: unknown;
        input?: unknown;
        output?: unknown;
      }
    | undefined;
  if (schema === undefined) {
    throw new Error("function declares no `schema` export");
  }
  return {
    name: basename(handlerPath, extname(handlerPath)),
    description:
      typeof schema.description === "string" ? schema.description : null,
    userIdentity: parseUserIdentityPolicy(schema.userIdentity),
    input_schema: toJsonSchema(schema.input),
    output_schema: toJsonSchema(schema.output),
  };
}
