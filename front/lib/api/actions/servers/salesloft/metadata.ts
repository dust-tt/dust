import type {
  InternalMCPToolType,
  ServerMetadata,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const SALESLOFT_TOOLS_METADATA = [
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
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const;

export const SALESLOFT_SERVER = {
  serverInfo: {
    name: "salesloft",
    version: "1.0.0",
    description:
      "Access Salesloft sales cadences (outreach sequences), tasks, and due actions for sales engagement and pipeline outreach.",
    authorization: null,
    icon: "SalesloftLogo",
    documentationUrl: "https://docs.dust.tt/docs/salesloft-mcp",
  },
  tools: SALESLOFT_TOOLS_METADATA,
} as const satisfies ServerMetadata;
