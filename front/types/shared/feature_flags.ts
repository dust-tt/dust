export const WHITELISTABLE_FEATURES_CONFIG = {
  advanced_notion_management: {
    description:
      "Advanced features for Notion workspace management shown to admins",
    stage: "on_demand",
  },
  anthropic_vertex_fallback: {
    description: "Fallback to Vertex Anthropic for some Anthropic models",
    stage: "dust_only",
  },
  notion_private_integration: {
    description: "Setup Notion private integration tokens",
    stage: "on_demand",
  },
  advanced_search: {
    description:
      "Activates the advanced search option: browse selected data like a file system",
    stage: "on_demand",
  },
  agent_builder_v2: {
    description: "Version 2 of the agent builder interface (wip)",
    stage: "dust_only",
  },
  agent_builder_instructions_autocomplete: {
    description: "Autocomplete feature for agent builder instructions (wip)",
    stage: "dust_only",
  },
  claude_4_opus_feature: {
    description: "Access to Claude 4 Opus model in the agent builder",
    stage: "on_demand",
  },
  co_edition: {
    description: "Collaborative editing features",
    stage: "dust_only",
  },
  deepseek_feature: {
    description:
      "Access to DeepSeek models (they cannot use tool so can't be selected in the agent builder)",
    stage: "on_demand",
  },
  deepseek_r1_global_agent_feature: {
    description: "Access to DeepSeek R1 model as global agent",
    stage: "on_demand",
  },
  dev_mcp_actions: {
    description: "MCP tools currently in development",
    stage: "dust_only",
  },
  disable_run_logs: {
    description: "Disable logging of agent runs",
    stage: "dust_only",
  },
  disallow_agent_creation_to_users: {
    description:
      "Prevent users from creating agents, allowing only admins and builders",
    stage: "on_demand",
  },
  exploded_tables_query: {
    description: "Enhanced table querying with exploded views",
    stage: "on_demand",
  },
  interactive_content_server: {
    description:
      "Interactive content MCP server - gives access to the new visualization layout",
    stage: "on_demand",
  },
  google_ai_studio_experimental_models_feature: {
    description: "Access to experimental Google AI Studio models",
    stage: "on_demand",
  },
  google_sheets_tool: {
    description: "Google Sheets MCP tool",
    stage: "rolling_out",
  },
  index_private_slack_channel: {
    description: "Allow indexing of private Slack channels",
    stage: "on_demand",
  },
  jira_tool: {
    description: "Jira MCP tool",
    stage: "rolling_out",
  },
  labs_mcp_actions_dashboard: {
    description: "MCP actions dashboard in Labs section",
    stage: "on_demand",
  },
  labs_trackers: {
    description: "Tracker feature (Labs)",
    stage: "on_demand",
  },
  labs_transcripts: {
    description: "Transcript feature (Labs)",
    stage: "on_demand",
  },
  openai_o1_custom_assistants_feature: {
    description: "OpenAI o1 model for custom assistants",
    stage: "on_demand",
  },
  openai_o1_feature: {
    description: "Access to OpenAI o1 model",
    stage: "on_demand",
  },
  openai_o1_high_reasoning_custom_assistants_feature: {
    description: "OpenAI o1 high reasoning model for custom assistants",
    stage: "on_demand",
  },
  openai_o1_high_reasoning_feature: {
    description: "Access to OpenAI o1 high reasoning model",
    stage: "on_demand",
  },
  salesforce_synced_queries: {
    description: "Salesforce Connection: retrieval on Synchronized queries",
    stage: "on_demand",
  },
  salesforce_tool: {
    description:
      "Salesforce MCP tool (activated by default on most plans, FF to override the plan config)",
    stage: "on_demand",
  },
  show_debug_tools: {
    description: "Display debug tools in the interface",
    stage: "dust_only",
  },
  slack_semantic_search: {
    description: "Enable semantic search in Slack",
    stage: "on_demand",
  },
  usage_data_api: {
    description:
      "API for accessing usage data (Means that any builder with an API key can access usage data of the workspace from API)",
    stage: "on_demand",
  },
  xai_feature: {
    description: "Access to xAI models in the agent builder",
    stage: "on_demand",
  },
  monday_tool: {
    description: "Monday MCP tool",
    stage: "rolling_out",
  },
  freshservice_tool: {
    description: "Freshservice MCP tool",
    stage: "rolling_out",
  },
  agent_management_tool: {
    description: "MCP tool for creating and managing agent configurations",
    stage: "dust_only",
  },

  research_agent: {
    description: "Activate @research agent.",
    stage: "dust_only",
  },
  data_warehouses_tool: {
    description:
      "Data warehouses file system navigation with hierarchical warehouse structure",
    stage: "dust_only",
  },
  hootl: {
    description: "Human Out Of The Loop (aka Triggers)",
    stage: "dust_only",
  },
} as const satisfies Record<string, FeatureFlag>;

export type FeatureFlagStage = "dust_only" | "rolling_out" | "on_demand";

export const FEATURE_FLAG_STAGE_LABELS: Record<FeatureFlagStage, string> = {
  dust_only: "Dust-only",
  rolling_out: "Rolling out",
  on_demand: "On demand",
};

export type FeatureFlag = {
  description: string;
  stage: FeatureFlagStage;
};

export type WhitelistableFeature = keyof typeof WHITELISTABLE_FEATURES_CONFIG;

export const WHITELISTABLE_FEATURES = Object.keys(
  WHITELISTABLE_FEATURES_CONFIG
) as WhitelistableFeature[];

export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
