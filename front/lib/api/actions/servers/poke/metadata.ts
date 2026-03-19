import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const POKE_SERVER_NAME = "poke" as const;

// Tool name constants.
export const GET_WORKSPACE_METADATA_TOOL_NAME = "get_workspace_metadata";
export const GET_WORKSPACE_PLAN_TOOL_NAME =
  "get_workspace_plan_and_subscription";
export const GET_WORKSPACE_FEATURE_FLAGS_TOOL_NAME =
  "get_workspace_feature_flags";
export const GET_WORKSPACE_MEMBERS_TOOL_NAME = "get_workspace_members";
export const GET_WORKSPACE_SPACES_TOOL_NAME = "get_workspace_spaces";
export const GET_WORKSPACE_CREDITS_TOOL_NAME = "get_workspace_credits";

export const POKE_TOOLS_METADATA = createToolsRecord({
  [GET_WORKSPACE_METADATA_TOOL_NAME]: {
    description:
      "Fetch metadata for a target Dust workspace. Requires Dust super user privileges.",
    schema: {
      workspace_id: z
        .string()
        .describe("The sId of the target workspace to fetch metadata for."),
    },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching workspace metadata",
      done: "Fetched workspace metadata",
    },
  },

  [GET_WORKSPACE_PLAN_TOOL_NAME]: {
    description:
      "Get full plan and subscription details for a workspace: billing info, Stripe subscription, " +
      "programmatic usage config, verified domains, and creation date.",
    schema: {
      workspace_id: z.string().describe("The sId of the target workspace."),
    },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching plan and subscription",
      done: "Fetched plan and subscription",
    },
  },

  [GET_WORKSPACE_FEATURE_FLAGS_TOOL_NAME]: {
    description: "List all feature flags currently enabled for a workspace.",
    schema: {
      workspace_id: z.string().describe("The sId of the target workspace."),
    },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching feature flags",
      done: "Fetched feature flags",
    },
  },

  [GET_WORKSPACE_MEMBERS_TOOL_NAME]: {
    description:
      "List workspace members with roles, email, auth provider, and pending invitations.",
    schema: {
      workspace_id: z.string().describe("The sId of the target workspace."),
    },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching workspace members",
      done: "Fetched workspace members",
    },
  },

  [GET_WORKSPACE_SPACES_TOOL_NAME]: {
    description:
      "List all spaces in a workspace with their kind, permissions, and group IDs.",
    schema: {
      workspace_id: z.string().describe("The sId of the target workspace."),
    },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching workspace spaces",
      done: "Fetched workspace spaces",
    },
  },

  [GET_WORKSPACE_CREDITS_TOOL_NAME]: {
    description:
      "Get credit balance, usage, and excess credits for a workspace over the last 30 days.",
    schema: {
      workspace_id: z.string().describe("The sId of the target workspace."),
    },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching workspace credits",
      done: "Fetched workspace credits",
    },
  },
});

export const POKE_SERVER = {
  serverInfo: {
    name: POKE_SERVER_NAME,
    version: "1.0.0",
    description:
      "Dust-internal tools for cross-workspace data access (poke). Requires super user privileges.",
    authorization: null,
    icon: "ActionLightbulbIcon",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(POKE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(POKE_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
