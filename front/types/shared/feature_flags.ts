export const WHITELISTABLE_FEATURES_CONFIG = {
  advanced_notion_management: {
    description:
      "Advanced features for Notion workspace management shown to admins",
    stage: "on_demand",
  },
  analytics_csv_export: {
    description:
      "CSV export buttons on analytics Top Agents and Top Users tables",
    stage: "rolling_out",
  },
  anthropic_vertex_fallback: {
    description: "Fallback to Vertex Anthropic for some Anthropic models",
    stage: "dust_only",
  },
  custom_model_feature: {
    description: "Access to custom models loaded from external config",
    stage: "dust_only",
  },
  dust_internal_global_agents: {
    description:
      "Access to internal global agents (dust-edge, dust-quick, dust-oai, dust-goog, dust-next and their variants)",
    stage: "dust_only",
  },
  notion_private_integration: {
    description: "Setup Notion private integration tokens",
    stage: "on_demand",
  },
  agent_to_yaml: {
    description: "Export and Import agents to/from YAML format",
    stage: "dust_only",
  },
  agent_builder_copilot: {
    description: "Enable Sidekick in Agent Builder (admins only by default)",
    stage: "dust_only",
  },
  agent_builder_copilot_builders: {
    description: "Allow workspace builders to use Sidekick in Agent Builder",
    stage: "dust_only",
  },
  agent_builder_shrink_wrap: {
    description: "Enable 'Turn into agent' button on agent messages",
    stage: "dust_only",
  },
  claude_4_opus_feature: {
    description: "Access to Claude 4 Opus model in the agent builder",
    stage: "on_demand",
  },
  claude_4_5_opus_feature: {
    description: "Access to Claude 4.5 Opus model in the agent builder",
    stage: "on_demand",
  },
  confluence_tool: {
    description: "Confluence MCP tool",
    stage: "on_demand",
  },
  deepseek_feature: {
    description:
      "Access to DeepSeek models (they cannot use tool so can't be selected in the agent builder)",
    stage: "on_demand",
  },
  fireworks_new_model_feature: {
    description: "Access to Fireworks new model",
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
  restrict_agents_publishing: {
    description: "Restrict publishing agents to builders and admins",
    stage: "on_demand",
  },
  google_sheets_tool: {
    description: "Google Sheets MCP tool",
    stage: "rolling_out",
  },
  http_client_tool: {
    description: "HTTP Client MCP tool for making external API requests",
    stage: "on_demand",
  },
  index_private_slack_channel: {
    description: "Allow indexing of private Slack channels",
    stage: "on_demand",
  },
  labs_mcp_actions_dashboard: {
    description: "MCP actions dashboard in Labs section",
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
  openai_o1_high_reasoning_feature: {
    description: "Access to OpenAI o1 high reasoning model",
    stage: "on_demand",
  },
  openai_usage_mcp: {
    description: "OpenAI tool for tracking API consumption and costs",
    stage: "on_demand",
  },
  salesforce_synced_queries: {
    description: "Salesforce Connection: retrieval on Synchronized queries",
    stage: "on_demand",
  },
  self_created_slack_app_connector_rollout: {
    description:
      "Slack Connection: rollout for self-created Slack app connector",
    stage: "rolling_out",
  },
  salesforce_tool: {
    description:
      "Salesforce MCP tool (activated by default on most plans, FF to override the plan config)",
    stage: "on_demand",
  },
  salesforce_tool_write: {
    description: "Salesforce MCP tool: write operations (update_object)",
    stage: "on_demand",
  },
  show_debug_tools: {
    description: "Display debug tools in the interface",
    stage: "dust_only",
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
  noop_model_feature: {
    description: "Access to noop model in the agent builder",
    stage: "dust_only",
  },
  monday_tool: {
    description: "Monday MCP tool",
    stage: "rolling_out",
  },
  gemini_3_1_pro_feature: {
    description: "Access to Gemini 3.1 Pro model in the agent builder",
    stage: "on_demand",
  },
  agent_management_tool: {
    description: "MCP tool for creating and managing agent configurations",
    stage: "dust_only",
  },
  hootl_subscriptions: {
    description: "Subscription feature for Schedule & Triggers.",
    stage: "dust_only",
  },
  slack_enhanced_default_agent: {
    description:
      "Enhanced default agent feature for Slack channels - auto-respond to all messages in channel",
    stage: "on_demand",
  },
  slideshow: {
    description: "Slideshow MCP tool",
    stage: "dust_only",
  },
  snowflake_tool: {
    description: "Snowflake MCP tool for read-only SQL queries",
    stage: "on_demand",
  },
  slack_message_splitting: {
    description:
      "Enable splitting agent responses into multiple Slack messages for Slack (instead of truncation)",
    stage: "dust_only",
  },
  slack_bot_mcp: {
    description: "Slack bot MCP server for workspace-level Slack integration",
    stage: "on_demand",
  },
  legacy_dust_apps: {
    description: "Access to legacy Dust Apps (editor and associated tools)",
    stage: "on_demand",
  },
  discord_bot: {
    description:
      "Discord bot integration for workspace-level Discord integration",
    stage: "dust_only",
  },
  project_butler: {
    description: "Enable user project digest generation in project spaces",
    stage: "dust_only",
  },
  projects: {
    description: "Enable use Spaces as Projects",
    stage: "dust_only",
  },
  databricks_tool: {
    description: "Databricks MCP tool",
    stage: "on_demand",
  },
  sandbox_tools: {
    description:
      "Sandbox MCP tool for executing code in isolated Linux containers",
    stage: "dust_only",
  },
  run_tools_from_prompt: {
    description: "Enable /run command to directly call tools without LLM",
    stage: "dust_only",
  },
  conversation_butler: {
    description:
      "Enable conversation butler for automated conversation management",
    stage: "dust_only",
  },
  conversations_slack_notifications: {
    description: "Enable slack notifications",
    stage: "dust_only",
  },
  anthropic_reasoning_token_count: {
    description:
      "After a response from Anthropic, make an additional API call to get the reasoning token count for better usage tracking",
    // Not really on_demand but we want to be able to enable it for customers
    stage: "on_demand",
  },
  conversation_branches: {
    description: "Enable conversation branches",
    stage: "dust_only",
  },
  user_ask_question_tool: {
    description:
      "Enable ask_user_question tool for agents to ask users questions",
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
