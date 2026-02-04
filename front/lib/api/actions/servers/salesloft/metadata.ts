import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const SALESLOFT_TOOL_NAME = "salesloft" as const;

export const SALESLOFT_TOOLS_METADATA = createToolsRecord({
  get_actions: {
    description:
      "Get actions owned by the current user with complete related information for full context. " +
      "By default, returns only currently due or overdue actions, but can be configured to return all actions. " +
      "Follows Salesloft best practices: " +
      "1. Gets steps (with has_due_actions filter when configured) " +
      "2. Gets cadences associated with those steps (complete cadence information) " +
      "3. Gets actions for those steps using step_id filter (more efficient than querying all actions) " +
      "4. Gets person/contact information for each action (complete contact details) " +
      "This provides comprehensive context needed to understand and execute each action.",
    schema: {
      include_due_actions_only: z
        .boolean()
        .describe(
          "Whether to only include actions that are currently due or overdue. Defaults to true."
        )
        .default(true),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Salesloft actions",
      done: "Get Salesloft actions",
    },
  },
});

export const SALESLOFT_SERVER = {
  serverInfo: {
    name: "salesloft",
    version: "1.0.0",
    description: "Access Salesloft cadences, tasks, and actions.",
    authorization: null,
    icon: "ActionDocumentTextIcon",
    documentationUrl: null,
    instructions: null,
    developerSecretSelection: "required",
  },
  tools: Object.values(SALESLOFT_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SALESLOFT_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
