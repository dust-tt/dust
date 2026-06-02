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
  use_vertex_for_supported_models: {
    description:
      "Route LLM calls through Vertex AI when supported instead of the direct provider's API",
    stage: "dust_only",
  },
  audit_logs: {
    description: "Enable audit log emission via WorkOS",
    stage: "dust_only",
  },
  custom_model_feature: {
    description: "Access to custom models loaded from external config",
    stage: "dust_only",
  },
  dust_internal_global_agents: {
    description:
      "Access to internal global agents (dust-edge, dust-quick, dust-oai, dust-goog, custom model agents and their variants)",
    stage: "dust_only",
  },
  dust_agent_gpt_5_5_default: {
    description:
      "Use GPT 5.5 (medium reasoning) as the default model for the @dust agent",
    stage: "dust_only",
  },
  notion_private_integration: {
    description: "Setup Notion private integration tokens",
    stage: "on_demand",
  },
  claude_4_opus_feature: {
    description: "Access to Claude 4 Opus model in the agent builder",
    stage: "on_demand",
  },
  claude_4_5_opus_feature: {
    description: "Access to Claude 4.5 Opus model in the agent builder",
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
  restrict_agents_publishing_to_admins: {
    description: "Restrict publishing agents to admins only",
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
  gemini_3_1_pro_feature: {
    description: "Access to Gemini 3.1 Pro model in the agent builder",
    stage: "on_demand",
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
  frames_skill_v2: {
    description:
      "Use the merged Frames skill v2 prose for every agent in the workspace. Temporary, remove after global rollout.",
    stage: "dust_only",
  },
  slack_message_splitting: {
    description:
      "Enable splitting agent responses into multiple Slack messages for Slack (instead of truncation)",
    stage: "dust_only",
  },
  legacy_dust_apps: {
    description: "Access to legacy Dust Apps (editor and associated tools)",
    stage: "on_demand",
  },
  power_bi_mcp: {
    description: "Power BI MCP tool for querying semantic models and DAX",
    stage: "on_demand",
  },
  netsuite_mcp: {
    description:
      "NetSuite MCP tool for querying records and interacting with your NetSuite account",
    stage: "on_demand",
  },
  discord_bot: {
    description:
      "Discord bot integration for workspace-level Discord integration",
    stage: "dust_only",
  },
  databricks_tool: {
    description: "Databricks MCP tool",
    stage: "on_demand",
  },
  sandbox_tools: {
    description:
      "Computer MCP tool for executing code in isolated Linux containers (sandbox)",
    stage: "dust_only",
  },
  sandbox_dsbx_tools: {
    description:
      "Programmatic access to MCP tools from inside the Computer (sandbox) via the dsbx CLI",
    stage: "dust_only",
  },
  sandbox_workspace_admin: {
    description:
      "Workspace admin configuration for the Computer (sandbox): whitelisted domains, environment variables, and the agent egress request setting/tool",
    stage: "dust_only",
  },
  run_tools_from_prompt: {
    description: "Enable /run command to directly call tools without LLM",
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
  reinforced_agents: {
    description:
      "Enable reinforcement: background analysis of conversations to suggest improvements to skills.",
    stage: "dust_only",
  },
  reinforcement_ui: {
    description:
      "Enable the reinforcement suggestions UI panel in the Skills Builder.",
    stage: "dust_only",
  },
  self_improving_skills_report_usage: {
    description:
      "Report reinforcement LLM costs to Metronome, ES analytics, and programmatic usage tracking.",
    stage: "dust_only",
  },
  collapsible_messages: {
    description: "Enable collapsible messages in conversations",
    stage: "dust_only",
  },
  poke_mcp: {
    description: "Enable the Poke MCP server for cross-workspace data access.",
    stage: "dust_only",
  },
  metronome_billing: {
    description:
      "Enable Metronome usage event emission (llm_usage, tool_use) for this workspace.",
    stage: "dust_only",
  },
  clari_copilot_mcp: {
    description:
      "Enable the Clari Copilot MCP server for call transcript and summary access.",
    stage: "on_demand",
  },
  plan_mode: {
    description:
      "Enable the Plan Mode skill: agents maintain a live plan.md for non-trivial tasks, with an optional human-approval checkpoint.",
    stage: "dust_only",
  },
  allow_old_notion_mcp: {
    description:
      "Allow individual workspaces to keep using the old internal Notion MCP server alongside the official one",
    stage: "dust_only",
  },
  use_dust_keys: {
    description:
      "Force BYOK workspaces to use Dust-managed keys instead of customer-provided keys",
    // Not really on_demand but we want to be able to enable it for customers
    stage: "on_demand",
  },
  dummy_feature_for_flag_testing: {
    description: "Dummy feature flag used for testing feature flag behavior",
    stage: "dust_only",
  },
  browser_extension_mcp_tools: {
    description:
      "Show the browser extension MCP tools toggle in workspace access settings",
    stage: "dust_only",
  },
  sensitivity_labels: {
    description:
      "Enable Microsoft sensitivity labels for data classification on connectors and MCP servers",
    stage: "on_demand",
  },
  deferred_conversation_creation: {
    description:
      "Create conversations in two steps (conversation first, first message in background) for faster navigation to the conversation page",
    stage: "dust_only",
  },
  conversation_search_indexing: {
    description: "Enable ES indexing of conversations on mutation (write path)",
    stage: "dust_only",
  },
  conversation_search_read: {
    description:
      "Enable ES-backed conversation listing in the sidebar (read path)",
    stage: "dust_only",
  },
  new_file_explorer: {
    description:
      "Unified GCS-backed file explorer with folder hierarchy, replacing the two-tab files panel.",
    stage: "dust_only",
  },
  user_settings_v2: {
    description: "Enable the new user settings v2 experience",
    stage: "dust_only",
  },
  force_us_api_url: {
    description:
      "Force the SPA to use the regional API subdomain (us-api/eu-api.dust.tt) " +
      "as its backend for this workspace",
    stage: "on_demand",
  },
  disable_formatting_prompt: {
    description:
      "Skip injecting the OpenAI formatting meta prompt entirely (no markdown/paragraph style guidance)",
    stage: "dust_only",
  },
  metronome_cp_checkout: {
    description:
      "Enable the Metronome-owned payment-gated checkout flow for Business plan activation (replaces direct Stripe charge).",
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
