import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { SANDBOX_FUNCTION_SLUG_REGEX } from "@app/types/api/sandbox_functions";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SANDBOX_FUNCTIONS_SERVER_NAME = "sandbox_functions" as const;

export const SANDBOX_FUNCTIONS_TOOLS_METADATA = createToolsRecord({
  list: {
    description:
      "List the sandbox functions published in the current pod, with their " +
      "slug and description. Use the get tool to retrieve a function's input " +
      "and output schemas.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing sandbox functions...",
      done: "Listed sandbox functions",
    },
  },
  get: {
    description:
      "Get a sandbox function's input and output JSON schemas by its slug.",
    schema: {
      slug: z
        .string()
        .min(1)
        .describe(
          "The slug of the sandbox function, as shown by the list tool."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting sandbox function...",
      done: "Got sandbox function",
    },
  },
  publish: {
    description:
      "Publish a sandbox function from a TypeScript source file in the current pod. The source " +
      "must default-export a `fetch(request: Request): Promise<Response>` handler and export a " +
      "`schema` with zod `input` and `output`. It is bundled on the pod sandbox (only `zod` is " +
      "available to import) and its input and output JSON schemas are extracted from the `schema` " +
      "export. Re-publishing the same slug replaces the previous version.",
    schema: {
      slug: z
        .string()
        .regex(SANDBOX_FUNCTION_SLUG_REGEX)
        .describe(
          "Unique function identifier within the pod: lowercase alphanumeric with single hyphen " +
            "separators (e.g. `send-slack-message`)."
        ),
      description: z
        .string()
        .min(1)
        .describe(
          "Short description of what the function does, shown by the list tool."
        ),
      path: z
        .string()
        .min(1)
        .describe(
          "Scoped path to the function's TypeScript source in the pod, as shown by the files " +
            "tools (e.g. `pod-<id>/greet.ts`)."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Publishing sandbox function...",
      done: "Published sandbox function",
    },
  },
  call: {
    description:
      "Call a sandbox function published in the current pod by its slug, passing its input " +
      "payload, and get back the function's output. Use the get tool first to see the function's " +
      "input schema. Input is validated inside the sandbox.",
    schema: {
      slug: z
        .string()
        .min(1)
        .describe(
          "The slug of the sandbox function to call, as shown by the list tool."
        ),
      input: z
        .record(z.unknown())
        .optional()
        .describe(
          "The function's input payload as a JSON object, matching its input schema (see the get tool)."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Calling sandbox function...",
      done: "Called sandbox function",
    },
  },
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
    toolCategory: "advanced",
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
