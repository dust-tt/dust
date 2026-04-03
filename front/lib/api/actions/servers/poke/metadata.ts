import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const POKE_SERVER_NAME = "poke" as const;

// ─── Workspace Context ───────────────────────────────────────────────────────

export const GET_WORKSPACE_METADATA_TOOL_NAME = "get_workspace_metadata";
export const GET_WORKSPACE_PLAN_TOOL_NAME =
  "get_workspace_plan_and_subscription";
export const GET_WORKSPACE_FEATURE_FLAGS_TOOL_NAME =
  "get_workspace_feature_flags";
export const GET_WORKSPACE_MEMBERS_TOOL_NAME = "get_workspace_members";
export const GET_WORKSPACE_SPACES_TOOL_NAME = "get_workspace_spaces";
export const GET_WORKSPACE_CREDITS_TOOL_NAME = "get_workspace_credits";

// ─── Connectors & Data Sources ───────────────────────────────────────────────

export const LIST_DATA_SOURCES_TOOL_NAME = "list_data_sources";
export const GET_CONNECTOR_DETAILS_TOOL_NAME = "get_connector_details";
export const CHECK_NOTION_PAGE_TOOL_NAME = "check_notion_page";
export const CHECK_SLACK_CHANNEL_TOOL_NAME = "check_slack_channel";

// ─── Conversations & Agents ──────────────────────────────────────────────────

export const GET_CONVERSATION_DETAILS_TOOL_NAME = "get_conversation_details";
export const GET_MCP_SERVER_DETAILS_TOOL_NAME = "get_mcp_server_details";

// ─── Users & Cross-Reference ─────────────────────────────────────────────────

export const LIST_WORKSPACE_GROUPS_TOOL_NAME = "list_workspace_groups";
export const FIND_WORKSPACE_BY_CONNECTOR_ID_TOOL_NAME =
  "find_workspace_by_connector_id";

// ─── Shared schema fragments ─────────────────────────────────────────────────

const workspaceIdSchema = {
  workspace_id: z.string().describe("The sId of the target workspace."),
};

// ─── Tool Metadata ───────────────────────────────────────────────────────────

export const POKE_TOOLS_METADATA = createToolsRecord({
  // ── Workspace Context ────────────────────────────────────────────────────

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
      "Get full plan and subscription details for a workspace: billing info, " +
      "verified domains, and creation date.",
    schema: { ...workspaceIdSchema },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching plan and subscription",
      done: "Fetched plan and subscription",
    },
  },

  [GET_WORKSPACE_FEATURE_FLAGS_TOOL_NAME]: {
    description: "List all feature flags currently enabled for a workspace.",
    schema: { ...workspaceIdSchema },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching feature flags",
      done: "Fetched feature flags",
    },
  },

  [GET_WORKSPACE_MEMBERS_TOOL_NAME]: {
    description:
      "List workspace members with roles, email, auth provider, and pending invitations.",
    schema: { ...workspaceIdSchema },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching workspace members",
      done: "Fetched workspace members",
    },
  },

  [GET_WORKSPACE_SPACES_TOOL_NAME]: {
    description:
      "List all spaces in a workspace with their kind, permissions, and group IDs.",
    schema: { ...workspaceIdSchema },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching workspace spaces",
      done: "Fetched workspace spaces",
    },
  },

  [GET_WORKSPACE_CREDITS_TOOL_NAME]: {
    description:
      "Get credit balance, usage, and excess credits for a workspace over the last 30 days.",
    schema: { ...workspaceIdSchema },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching workspace credits",
      done: "Fetched workspace credits",
    },
  },

  // ── Connectors & Data Sources ────────────────────────────────────────────

  [LIST_DATA_SOURCES_TOOL_NAME]: {
    description:
      "List all data sources/connectors for a workspace with status, type, and last sync time.",
    schema: { ...workspaceIdSchema },
    stake: "high" as const,
    displayLabels: {
      running: "Listing data sources",
      done: "Listed data sources",
    },
  },

  [GET_CONNECTOR_DETAILS_TOOL_NAME]: {
    description:
      "Get full connector details: config, status, error state, provider, Temporal workflows, " +
      "and core data source info.",
    schema: {
      ...workspaceIdSchema,
      data_source_id: z
        .string()
        .describe("The sId of the data source to inspect."),
    },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching connector details",
      done: "Fetched connector details",
    },
  },

  [CHECK_NOTION_PAGE_TOOL_NAME]: {
    description:
      "Check if a Notion page/DB is synced, accessible, and its parent chain.",
    schema: {
      ...workspaceIdSchema,
      data_source_id: z.string().describe("The sId of the Notion data source."),
      url: z.string().describe("The Notion page or database URL to check."),
    },
    stake: "high" as const,
    displayLabels: {
      running: "Checking Notion page",
      done: "Checked Notion page",
    },
  },

  [CHECK_SLACK_CHANNEL_TOOL_NAME]: {
    description:
      "Verify a Slack channel exists, is synced, and whether it is skipped.",
    schema: {
      ...workspaceIdSchema,
      channel_id: z.string().describe("The Slack channel ID (e.g. C01ABCDEF)."),
    },
    stake: "high" as const,
    displayLabels: {
      running: "Checking Slack channel",
      done: "Checked Slack channel",
    },
  },

  // ── Conversations & Agents ───────────────────────────────────────────────

  [GET_CONVERSATION_DETAILS_TOOL_NAME]: {
    description:
      "Full conversation with messages, tool calls, agent actions, and errors.",
    schema: {
      ...workspaceIdSchema,
      conversation_id: z.string().describe("The sId of the conversation."),
    },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching conversation",
      done: "Fetched conversation",
    },
  },

  [GET_MCP_SERVER_DETAILS_TOOL_NAME]: {
    description:
      "Get MCP server view details, or list all MCP server views in a workspace.",
    schema: {
      ...workspaceIdSchema,
      server_view_id: z
        .string()
        .optional()
        .describe("The sId of a specific MCP server view. Omit to list all."),
    },
    stake: "high" as const,
    displayLabels: {
      running: "Fetching MCP server details",
      done: "Fetched MCP server details",
    },
  },

  // ── Users & Cross-Reference ──────────────────────────────────────────────

  [LIST_WORKSPACE_GROUPS_TOOL_NAME]: {
    description: "List groups in a workspace with their kind and member count.",
    schema: { ...workspaceIdSchema },
    stake: "high" as const,
    displayLabels: {
      running: "Listing groups",
      done: "Listed groups",
    },
  },

  [FIND_WORKSPACE_BY_CONNECTOR_ID_TOOL_NAME]: {
    description: "Reverse-lookup workspace from a connector ID.",
    schema: {
      ...workspaceIdSchema,
      connector_id: z
        .string()
        .describe("The numeric connector ID (as string)."),
    },
    stake: "high" as const,
    displayLabels: {
      running: "Looking up workspace",
      done: "Found workspace",
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
