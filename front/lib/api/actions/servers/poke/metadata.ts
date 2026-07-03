import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

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

// ─── Search ──────────────────────────────────────────────────────────────────

export const SEARCH_WORKSPACES_TOOL_NAME = "search_workspaces";

// ─── Users & Cross-Reference ─────────────────────────────────────────────────

export const LIST_WORKSPACE_GROUPS_TOOL_NAME = "list_workspace_groups";
export const FIND_WORKSPACE_BY_CONNECTOR_ID_TOOL_NAME =
  "find_workspace_by_connector_id";

// ─── Agents & Skills ─────────────────────────────────────────────────────────

export const LIST_WORKSPACE_AGENTS_TOOL_NAME = "list_workspace_agents";
export const GET_WORKSPACE_AGENT_TOOL_NAME = "get_workspace_agent";
export const LIST_WORKSPACE_SKILLS_TOOL_NAME = "list_workspace_skills";
export const GET_WORKSPACE_SKILL_TOOL_NAME = "get_workspace_skill";

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
    stake: "low",
    displayLabels: {
      running: "Fetching workspace metadata",
      done: "Fetched workspace metadata",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  [GET_WORKSPACE_PLAN_TOOL_NAME]: {
    description:
      "Get full plan and subscription details for a workspace: billing info, " +
      "verified domains, and creation date.",
    schema: { ...workspaceIdSchema },
    stake: "low",
    displayLabels: {
      running: "Fetching plan and subscription",
      done: "Fetched plan and subscription",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  [GET_WORKSPACE_FEATURE_FLAGS_TOOL_NAME]: {
    description: "List all feature flags currently enabled for a workspace.",
    schema: { ...workspaceIdSchema },
    stake: "low",
    displayLabels: {
      running: "Fetching feature flags",
      done: "Fetched feature flags",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  [GET_WORKSPACE_MEMBERS_TOOL_NAME]: {
    description:
      "List workspace members with roles, email, auth provider, and pending invitations.",
    schema: { ...workspaceIdSchema },
    stake: "low",
    displayLabels: {
      running: "Fetching workspace members",
      done: "Fetched workspace members",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  [GET_WORKSPACE_SPACES_TOOL_NAME]: {
    description:
      "List all spaces in a workspace with their kind, permissions, and group IDs.",
    schema: { ...workspaceIdSchema },
    stake: "low",
    displayLabels: {
      running: "Fetching workspace spaces",
      done: "Fetched workspace spaces",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  [GET_WORKSPACE_CREDITS_TOOL_NAME]: {
    description:
      "Get credit balance, usage, and excess credits for a workspace over the last 30 days.",
    schema: { ...workspaceIdSchema },
    stake: "low",
    displayLabels: {
      running: "Fetching workspace credits",
      done: "Fetched workspace credits",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  // ── Connectors & Data Sources ────────────────────────────────────────────

  [LIST_DATA_SOURCES_TOOL_NAME]: {
    description:
      "List all data sources/connectors for a workspace with status, type, and last sync time.",
    schema: { ...workspaceIdSchema },
    stake: "low",
    displayLabels: {
      running: "Listing data sources",
      done: "Listed data sources",
    },
    toolCostCategory: "basic",
    freeUsage: true,
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
    stake: "low",
    displayLabels: {
      running: "Fetching connector details",
      done: "Fetched connector details",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  [CHECK_NOTION_PAGE_TOOL_NAME]: {
    description:
      "Check if a Notion page/DB is synced, accessible, and its parent chain.",
    schema: {
      ...workspaceIdSchema,
      data_source_id: z.string().describe("The sId of the Notion data source."),
      url: z.string().describe("The Notion page or database URL to check."),
    },
    stake: "low",
    displayLabels: {
      running: "Checking Notion page",
      done: "Checked Notion page",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  [CHECK_SLACK_CHANNEL_TOOL_NAME]: {
    description:
      "Verify a Slack channel exists, is synced, and whether it is skipped.",
    schema: {
      ...workspaceIdSchema,
      channel_id: z.string().describe("The Slack channel ID (e.g. C01ABCDEF)."),
    },
    stake: "low",
    displayLabels: {
      running: "Checking Slack channel",
      done: "Checked Slack channel",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  // ── Conversations & Agents ───────────────────────────────────────────────

  [GET_CONVERSATION_DETAILS_TOOL_NAME]: {
    description:
      "Get the full conversation with messages, tool calls, agent actions, and errors.",
    schema: {
      ...workspaceIdSchema,
      conversation_id: z.string().describe("The sId of the conversation."),
    },
    stake: "low",
    displayLabels: {
      running: "Fetching conversation",
      done: "Fetched conversation",
    },
    toolCostCategory: "basic",
    freeUsage: true,
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
    stake: "low",
    displayLabels: {
      running: "Fetching MCP server details",
      done: "Fetched MCP server details",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  // ── Search ───────────────────────────────────────────────────────────────

  [SEARCH_WORKSPACES_TOOL_NAME]: {
    description:
      "Search workspaces by name (exact), verified domain, or member email. " +
      "Returns matching workspaces with links to poke, WorkOS, Metronome, and health dashboards.",
    schema: {
      query: z
        .string()
        .describe(
          "Search term: workspace name (e.g. 'Acme'), verified domain (e.g. 'acme.com'), " +
            "or member email (e.g. 'alice@acme.com')."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Searching workspaces",
      done: "Searched workspaces",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  // ── Users & Cross-Reference ──────────────────────────────────────────────

  [LIST_WORKSPACE_GROUPS_TOOL_NAME]: {
    description: "List groups in a workspace with their kind and member count.",
    schema: { ...workspaceIdSchema },
    stake: "low",
    displayLabels: {
      running: "Listing groups",
      done: "Listed groups",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  [FIND_WORKSPACE_BY_CONNECTOR_ID_TOOL_NAME]: {
    description: "Reverse-lookup workspace from a connector ID.",
    schema: {
      ...workspaceIdSchema,
      connector_id: z
        .string()
        .describe("The numeric connector ID (as string)."),
    },
    stake: "low",
    displayLabels: {
      running: "Looking up workspace",
      done: "Found workspace",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  // ── Agents & Skills ──────────────────────────────────────────────────────

  [LIST_WORKSPACE_AGENTS_TOOL_NAME]: {
    description:
      "List agents in a workspace sorted by version creation date (most recent first). " +
      "Returns instructionsLength and requestedSpaceCount per agent. " +
      "Use get_workspace_agent for full details on a single agent.",
    schema: {
      ...workspaceIdSchema,
      status: z
        .enum(["active", "archived"])
        .optional()
        .describe("Filter by status. Defaults to 'active'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Max agents per page (default: 50, max: 200)."),
      next_page_cursor: z
        .string()
        .optional()
        .describe(
          "Opaque cursor from the previous response to fetch the next page."
        ),
    },
    stake: "low",
    displayLabels: { running: "Listing agents", done: "Listed agents" },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  [GET_WORKSPACE_AGENT_TOOL_NAME]: {
    description:
      "Get full details for a single agent: instructions, tools, author, and editors.",
    schema: {
      ...workspaceIdSchema,
      agent_id: z.string().describe("The sId of the agent."),
    },
    stake: "low",
    displayLabels: { running: "Fetching agent", done: "Fetched agent" },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  [LIST_WORKSPACE_SKILLS_TOOL_NAME]: {
    description:
      "List custom skills in a workspace sorted by last update (most recent first). " +
      "Returns instructionsLength per skill. " +
      "Use get_workspace_skill for full details on a single skill.",
    schema: {
      ...workspaceIdSchema,
      status: z
        .enum(["active", "archived"])
        .optional()
        .describe("Filter by status. Defaults to 'active'."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Max skills per page (default: 50, max: 200)."),
      next_page_cursor: z
        .string()
        .optional()
        .describe(
          "Opaque cursor from the previous response to fetch the next page."
        ),
    },
    stake: "low",
    displayLabels: { running: "Listing skills", done: "Listed skills" },
    toolCostCategory: "basic",
    freeUsage: true,
  },

  [GET_WORKSPACE_SKILL_TOOL_NAME]: {
    description:
      "Get full details for a single skill: instructions, MCP server count, and editors.",
    schema: {
      ...workspaceIdSchema,
      skill_id: z.string().describe("The sId of the skill."),
    },
    stake: "low",
    displayLabels: { running: "Fetching skill", done: "Fetched skill" },
    toolCostCategory: "basic",
    freeUsage: true,
  },
});

export const POKE_SERVER = {
  serverInfo: {
    name: "poke",
    version: "1.0.0",
    description:
      "Dust-internal tools for cross-workspace data access (poke). Requires super user privileges.",
    authorization: null,
    icon: "ActionLightbulbIcon",
    documentationUrl: null,
  },
  tools: Object.values(POKE_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
    toolCostCategory: t.toolCostCategory,
    freeUsage: t.freeUsage,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(POKE_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
