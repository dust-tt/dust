export const WHITELISTABLE_FEATURES_CONFIG = {
  advanced_notion_management: {
    description:
      "Advanced features for Notion workspace management shown to admins",
  },
  anthropic_vertex_fallback: {
    description: "Fallback to Vertex Anthropic for some Anthropic models",
  },
  notion_private_integration: {
    description: "Setup Notion private integration tokens",
  },
  advanced_search: {
    description:
      "Activates the advanced search option: browse selected data like a file system",
  },
  agent_builder_v2: {
    description: "[Dust-only] Version 2 of the agent builder interface (wip)",
  },
  agent_builder_instructions_autocomplete: {
    description:
      "[Dust-only] Autocomplete feature for agent builder instructions (wip)",
  },
  claude_4_opus_feature: {
    description: "Access to Claude 4 Opus model in the agent builder",
  },
  co_edition: {
    description: "Collaborative editing features",
  },
  deepseek_feature: {
    description:
      "Access to DeepSeek models (they cannot use tool so can't be selected in the agent builder)",
  },
  deepseek_r1_global_agent_feature: {
    description: "Access to DeepSeek R1 model as global agent",
  },
  dev_mcp_actions: {
    description: "[Dust-only] MCP tools currently in development",
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
  interactive_content_server: {
    description:
      "Interactive content MCP server - gives access to the new visualization layout",
  },
  google_ai_studio_experimental_models_feature: {
    description: "Access to experimental Google AI Studio models",
  },
  google_sheets_tool: {
    description: "Google Sheets MCP tool",
  },
  index_private_slack_channel: {
    description: "Allow indexing of private Slack channels",
  },
  jira_tool: {
    description: "Jira MCP tool",
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
  salesforce_synced_queries: {
    description: "Salesforce Connection: retrieval on Synchronized queries",
  },
  salesforce_tool: {
    description:
      "Salesforce MCP tool (activated by default on most plans, FF to override the plan config)",
  },
  show_debug_tools: {
    description: "[Dust-only] Display debug tools in the interface",
  },
  usage_data_api: {
    description:
      "API for accessing usage data (Means that any builder with an API key can access usage data of the workspace from API)",
  },
  workos_user_provisioning: {
    description: "WorkOS user provisioning features",
  },
  xai_feature: {
    description: "Access to xAI models in the agent builder",
  },
  monday_tool: {
    description: "Monday MCP tool",
  },
  outlook_tool: {
    description: "Outlook MCP tool",
  },
  async_loop: {
    description: "Asynchronous loop for conversation processing",
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
