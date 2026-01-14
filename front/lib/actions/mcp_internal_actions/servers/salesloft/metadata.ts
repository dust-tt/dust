import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const SALESLOFT_TOOL_NAME = "salesloft" as const;

export const getActionsSchema = {
  include_due_actions_only: z
    .boolean()
    .describe(
      "Whether to only include actions that are currently due or overdue. Defaults to true."
    )
    .default(true),
};

export const SALESLOFT_TOOLS: MCPToolType[] = [
  {
    name: "get_actions",
    description:
      "Get actions owned by the current user with complete related information for full context. " +
      "By default, returns only currently due or overdue actions, but can be configured to return all actions. " +
      "Follows Salesloft best practices: " +
      "1. Gets steps (with has_due_actions filter when configured) " +
      "2. Gets cadences associated with those steps (complete cadence information) " +
      "3. Gets actions for those steps using step_id filter (more efficient than querying all actions) " +
      "4. Gets person/contact information for each action (complete contact details) " +
      "This provides comprehensive context needed to understand and execute each action.",
    inputSchema: zodToJsonSchema(z.object(getActionsSchema)) as JSONSchema,
  },
];

export const SALESLOFT_SERVER_INFO = {
  name: "salesloft" as const,
  version: "1.0.0",
  description: "Access Salesloft cadences, tasks, and actions.",
  authorization: null,
  icon: "ActionDocumentTextIcon" as const,
  documentationUrl: null,
  instructions: null,
  developerSecretSelection: "required" as const,
};

export const SALESLOFT_TOOL_STAKES = {
  get_actions: "never_ask",
} as const satisfies Record<string, MCPToolStakeLevelType>;
