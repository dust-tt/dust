import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const AI_GUARD_TOOL_NAME = "ai_guard" as const;

export const AI_GUARD_TOOLS_METADATA = createToolsRecord({
  ai_guard: {
    description:
      "Evaluates a user message for prompt attacks using Datadog AI Guard. " +
      "Detects jailbreak, prompt injection, authority override, data exfiltration, " +
      "system prompt extraction, obfuscation, role-play, and other attack patterns. " +
      "Returns an evaluation result indicating whether the prompt should be allowed, denied, or aborted.",
    schema: {
      message: z
        .string()
        .describe("The user message to evaluate for prompt attacks"),
      raw_response: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "When true, returns the full Datadog AI Guard response including all detected attack categories and scores. " +
            "When false (default), returns only the action (ALLOW/DENY/ABORT) and reason."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Running Datadog AI Guard (preview)",
      done: "AI Guard (Preview)",
    },
  },
});

export const AI_GUARD_SERVER = {
  serverInfo: {
    name: "ai_guard",
    version: "1.0.0",
    description:
      "Evaluate prompts for attacks using Datadog AI Guard.",
    authorization: null,
    icon: "ActionLockIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(AI_GUARD_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(AI_GUARD_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
