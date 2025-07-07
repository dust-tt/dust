export const WHITELISTABLE_FEATURES_CONFIG = {
  advanced_notion_management: {
    description: "Advanced features for Notion workspace management",
  },
  advanced_search: {
    description: "Enhanced search capabilities across workspaces",
  },
  agent_builder_v2: {
    description: "Version 2 of the agent builder interface",
  },
  claude_3_7_reasoning: {
    description: "Claude 3.7 reasoning capabilities",
  },
  claude_4_opus_feature: {
    description: "Access to Claude 4 Opus model",
  },
  co_edition: {
    description: "Collaborative editing features",
  },
  deepseek_feature: {
    description: "Access to DeepSeek models",
  },
  deepseek_r1_global_agent_feature: {
    description: "Access to DeepSeek R1 model as global agent",
  },
  dev_mcp_actions: {
    description: "MCP tools currently in development",
  },
  disable_run_logs: {
    description: "Disable logging of agent runs",
  },
  disallow_agent_creation_to_users: {
    description: "Restrict agent creation to admins only",
  },
  exploded_tables_query: {
    description: "Enhanced table querying with exploded views",
  },
  extended_max_steps_per_run: {
    description: "Increase maximum steps allowed per agent run",
  },
  google_ai_studio_experimental_models_feature: {
    description: "Access to experimental Google AI Studio models",
  },
  index_private_slack_channel: {
    description: "Allow indexing of private Slack channels",
  },
  labs_mcp_actions_dashboard: {
    description: "MCP actions dashboard in Labs section",
  },
  labs_trackers: {
    description: "Tracker feature (Labs)",
  },
  labs_transcripts: {
    description: "Transcript feature (Labs)",
  },
  okta_enterprise_connection: {
    description: "Okta SSO enterprise connection",
  },
  openai_o1_custom_assistants_feature: {
    description: "OpenAI o1 model for custom assistants",
  },
  openai_o1_feature: {
    description: "Access to OpenAI o1 model",
  },
  openai_o1_high_reasoning_custom_assistants_feature: {
    description: "OpenAI o1 high reasoning model for custom assistants",
  },
  openai_o1_high_reasoning_feature: {
    description: "Access to OpenAI o1 high reasoning model",
  },
  openai_o1_mini_feature: {
    description: "Access to OpenAI o1-mini model",
  },
  salesforce_synced_queries: {
    description: "Salesforce Connection: retrieval on Synchronized queries",
  },
  salesforce_tool: {
    description: "Salesforce MCP tool",
  },
  show_debug_tools: {
    description: "Display debug tools in the interface",
  },
  usage_data_api: {
    description: "API for accessing usage data",
  },
  workos: {
    description: "WorkOS authentication integration",
  },
  workos_user_provisioning: {
    description: "WorkOS user provisioning features",
  },
  xai_feature: {
    description: "Access to xAI models",
  },
} as const;

export const WHITELISTABLE_FEATURES = Object.keys(
  WHITELISTABLE_FEATURES_CONFIG
) as WhitelistableFeature[];

export type WhitelistableFeature = keyof typeof WHITELISTABLE_FEATURES_CONFIG;

export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
