import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SANDBOX_FUNCTIONS_SERVER_NAME = "sandbox_functions" as const;

export const SANDBOX_FUNCTIONS_TOOLS_METADATA = createToolsRecord({
  list: {
    description:
      "List the sandbox functions published in the current pod, with their " +
      "name and input/output schemas.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing sandbox functions...",
      done: "Listed sandbox functions",
    },
  },
  // TODO(SANDBOX_FUNCTION) Add publish tool once we have pod's sandboxes.
});

export const SANDBOX_FUNCTIONS_SERVER = {
  serverInfo: {
    name: SANDBOX_FUNCTIONS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Sandbox functions: schema-typed callables bundled and run on the pod's " +
      "sandbox.",
    icon: "CommandLineIcon",
    authorization: null,
    documentationUrl: null,
  },
  tools: Object.values(SANDBOX_FUNCTIONS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SANDBOX_FUNCTIONS_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
