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
  agent_to_yaml: {
    description: "Export and Import agents to/from YAML format",
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
  confluence_tool: {
    description: "Confluence MCP tool",
    stage: "on_demand",
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
  labs_mcp_actions_dashboard: {
    description: "MCP actions dashboard in Labs section",
    stage: "on_demand",
  },
  labs_trackers: {
    description:
      "Tracker feature. Check with Henry or eng oncall before activating to a new workspace.",
    stage: "rolling_out",
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
  openai_usage_mcp: {
    description: "OpenAI tool for tracking API consumption and costs",
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
  freshservice_tool: {
    description: "Freshservice MCP tool",
    stage: "rolling_out",
  },
  agent_management_tool: {
    description: "MCP tool for creating and managing agent configurations",
    stage: "dust_only",
  },
  research_agent: {
    description: "Activate @deepDive agent.",
    stage: "rolling_out",
  },
  deep_research_as_a_tool: {
    description: "Activate Deep Dive tool",
    stage: "dust_only",
  },
  hootl_subscriptions: {
    description: "Subscription feature for Schedule & Triggers.",
    stage: "dust_only",
  },
  hootl_dev_webhooks: {
    description: "GitHub webhooks for Human Out Of The Loop (aka Triggers)",
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
  slack_message_splitting: {
    description:
      "Enable splitting agent responses into multiple Slack messages for Slack (instead of truncation)",
    stage: "dust_only",
  },
  hootl_webhooks: {
    description: "Webhooks for Human Out Of The Loop (aka Triggers) / webhooks",
    stage: "dust_only",
  },
  slack_bot_mcp: {
    description: "Slack bot MCP server for workspace-level Slack integration",
    stage: "on_demand",
  },
  slack_semantic_search: {
    description: "Slack semantic search feature",
    stage: "on_demand",
  },
  web_summarization: {
    description: "AI-powered web page summarization in the web browser tool",
    stage: "on_demand",
  },
  elevenlabs_tool: {
    description: "Elevenlabs MCP tool for voice synthesis",
    stage: "on_demand",
  },
  microsoft_teams_bot: {
    description: "Microsoft Teams bot connector for workspace integration",
    stage: "dust_only",
  },
  microsoft_drive_mcp_server: {
    description: "Microsoft Drive MCP server",
    stage: "dust_only",
  },
  agent_builder_observability: {
    description:
      "Observability tab in the Agent Builder (charts powered by Elasticsearch)",
    stage: "dust_only",
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
  llm_router_direct_requests: {
    description: "Use direct LLM call over Dust app run in a conversation.",
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
