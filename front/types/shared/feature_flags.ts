export const WHITELISTABLE_FEATURES_CONFIG = {
  dust_filesystem: {
    description:
      "Allow fresh Pods and standalone conversations to use the database-backed filesystem",
    stage: "dust_only",
  },
  allow_sso: {
    description:
      "Allow this workspace to configure SSO, independently of the plan's isSSOAllowed flag. Enable on demand for Business plan workspaces.",
    stage: "on_demand",
  },
  allow_scim: {
    description:
      "Allow this workspace to configure SCIM user provisioning, independently of the plan's isSCIMAllowed flag. Enable on demand.",
    stage: "on_demand",
  },
  live_speech_to_text: {
    description:
      "Enable real-time speech-to-text in the input bar via ElevenLabs WebSocket streaming",
    stage: "dust_only",
  },
  advanced_notion_management: {
    description:
      "Advanced features for Notion workspace management shown to admins",
    stage: "on_demand",
  },
  anthropic_vertex_fallback: {
    description: "Fallback to Vertex Anthropic for some Anthropic models",
    stage: "dust_only",
  },
  anthropic_cache_diagnostics: {
    description:
      "Opt into Anthropic prompt-cache diagnostics to report cache-miss reasons on agent-loop steps",
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
  dust_agent_gpt_5_6_luna_default: {
    description:
      "Use GPT 5.6 Luna (high reasoning) as the default model for the @dust agent",
    stage: "on_demand",
  },
  gpt_5_6_terra_long_context: {
    description: "Access to GPT 5.6 Terra with its full context window",
    stage: "on_demand",
  },
  dust_agent_sonnet_5_default: {
    description: "Use Claude Sonnet 5 as the default model for the @dust agent",
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
    description:
      "Access to Claude Opus and GPT 5.6 Sol models in the agent builder",
    stage: "on_demand",
  },
  claude_fable_5_feature: {
    description:
      "Access to Claude Fable 5 model (served through the EAP Anthropic key)",
    stage: "dust_only",
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
  exa_people_and_company: {
    description: "Access to Exa MCP server (search_people, search_companies)",
    stage: "dust_only",
  },
  disable_run_logs: {
    description: "Disable logging of agent runs",
    stage: "dust_only",
  },
  disable_computer_feature: {
    description: "Disable all Computer sandbox features for this workspace",
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
  labs_transcripts: {
    description: "Transcript feature (Labs)",
    stage: "on_demand",
  },
  openai_o1_feature: {
    description: "Access to OpenAI o1 model",
    stage: "on_demand",
  },
  openai_usage_mcp: {
    description: "OpenAI tool for tracking API consumption and costs",
    stage: "on_demand",
  },
  openai_concise_reasoning_summaries: {
    description:
      "Use concise reasoning summaries for supported OpenAI models in the new LLM router",
    stage: "dust_only",
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
  usage_page_read_only: {
    description:
      "Allow legacy-contract workspaces to view the Usage page in read-only mode (analytics and member spend visible; all actions disabled).",
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
  dust_internal_dangerous_in_cluster_mcp_servers: {
    description:
      "EXPERIMENTAL FEATURE. DUST INTERNAL ONLY. Allow remote MCP servers pointing at hosts on the MCP_IN_CLUSTER_HOSTS allowlist, reached in-cluster instead of through the untrusted egress proxy.",
    stage: "dust_only",
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
  servicenow_tool: {
    description: "ServiceNow MCP tool",
    stage: "on_demand",
  },
  shopify_tool: {
    description: "Shopify MCP tool",
    stage: "on_demand",
  },
  workday_mcp: {
    description: "Workday MCP tool",
    stage: "on_demand",
  },
  sandbox_functions: {
    description: "Enable Pod Function invocation endpoints",
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
  reinforced_agents: {
    description:
      "Enable self-improvement (background analysis of conversations to suggest improvements to skills).",
    stage: "dust_only",
  },
  self_improvement_beta_tester: {
    description:
      "Self-improvement runs for free: consumption is not reported to billing (Metronome or programmatic usage).",
    stage: "dust_only",
  },
  collapsible_messages: {
    description: "Enable collapsible messages in conversations",
    stage: "dust_only",
  },
  conversation_consumption_details: {
    description:
      "Show the detailed credit attribution for agent messages in conversations",
    stage: "dust_only",
  },
  poke_mcp: {
    description: "Enable the Poke MCP server for cross-workspace data access.",
    stage: "dust_only",
  },
  legacy_billing: {
    description:
      "Force this workspace to use legacy Stripe billing, bypassing Metronome credit-priced plans regardless of the global kill switch.",
    stage: "dust_only",
  },
  plan_mode: {
    description:
      "Enable the Plan Mode skill: agents maintain a live plan.md for genuinely multi-step tasks, with an optional human-approval checkpoint.",
    stage: "dust_only",
  },
  skill_favorites: {
    description:
      "Enable user favorites for skills, including favorite controls and runtime skill availability.",
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
  sensitivity_labels: {
    description:
      "Enable Microsoft sensitivity labels for data classification on connectors and MCP servers",
    stage: "on_demand",
  },
  restricted_spaces_in_input_bar: {
    description:
      "Allow users to explicitly select Spaces from the conversation input bar.",
    stage: "dust_only",
  },
  disable_formatting_prompt: {
    description:
      "Skip injecting the OpenAI formatting meta prompt entirely (no markdown/paragraph style guidance)",
    stage: "dust_only",
  },
  workspace_default_agent: {
    description:
      "Workspace default agent: admins can pre-select a workspace-wide default agent for new conversations.",
    stage: "on_demand",
  },
  whitelabel_frames: {
    description:
      "Whitelabel frames: customize the workspace logo, favicon and OG image shown on shared Frames.",
    stage: "on_demand",
  },
  models_picker: {
    description:
      "Model picker in the conversation input bar: keep Auto (the agent's configured model) or pick a specific model and reasoning effort.",
    stage: "dust_only",
  },
  activation_force_nudge: {
    description:
      "Bypass the activated-user check in the activation orchestrator so already-activated users are still nudged",
    stage: "dust_only",
  },
  dust_pod_goal: {
    description:
      "Enable the Dust Pod Goal skill for persistent job loops in Pods",
    stage: "dust_only",
  },
  admin_controlled_pods: {
    description:
      "Enable admin-controlled Pods: admins manage membership and attach connected data (Space DataSourceViews) to the Pod itself.",
    stage: "dust_only",
  },
  pod_frame_tabs: {
    description:
      "Allow adding frames from the pod file system as custom tabs (title, icon, order) on the pod.",
    stage: "dust_only",
  },
  pod_applications: {
    description:
      "Enable the Pod Apps UI: browse, import, clone, export and delete the apps published on a Pod.",
    stage: "dust_only",
  },
  group_permissions_shadow: {
    description:
      "Admin Governance: evaluate the new group_permissions checks alongside the legacy ones and log mismatches (shadow mode). Serves the legacy result; safe to toggle.",
    stage: "dust_only",
  },
  user_memory: {
    description:
      "Enable the user_memory internal MCP server: agents can store and retrieve per-user memory in a user-scoped filesystem.",
    stage: "dust_only",
  },
  similar_agents_check: {
    description:
      "Warn users about similar existing agents before they create a duplicate in the agent builder.",
    stage: "dust_only",
  },
  enforce_user_spend_limit_rate_cap: {
    description:
      "Enable the Redis fixed-window spend-cap backups (per-user, per-API-key, programmatic, and workspace usage cap): record AWU usage into the counters and enforce them at message send. When off, usage is neither recorded nor enforced.",
    stage: "dust_only",
  },
  enforce_premium_model_message_limit: {
    description:
      "Enforce the premium-model cap: once the user has spent 25 premium-tier messages in the rolling week, run the message on the Standard stream instead, on workspaces with a non-credit-priced (legacy) plan. Usage is counted regardless, so the flag only controls enforcement.",
    stage: "dust_only",
  },
  editable_tool_inputs: {
    description:
      "Allow editing tool inputs before approving a tool call in the tool validation UI.",
    stage: "dust_only",
  },
  skip_free_usage_rate_limit: {
    description:
      "Skip the per-user daily free-usage cost cap enforced at the LLM call site. Escape hatch to unstick legitimate workspaces that legitimately exceed the free-usage limit.",
    stage: "on_demand",
  },
  disable_fair_use_awu_limit: {
    description:
      "Disable the per-user fair-use AWU credit limit on this workspace: skip both the pre-message enforcement (read) and the usage recording (write). Escape hatch for workspaces that should not be subject to the fair-use cap.",
    stage: "on_demand",
  },
} as const satisfies Record<string, FeatureFlag>;

export type FeatureFlagStage = "dust_only" | "rolling_out" | "on_demand";

export const FEATURE_FLAG_STAGE_LABELS: Record<FeatureFlagStage, string> = {
  dust_only: "Dust-only",
  rolling_out: "Rolling out",
  on_demand: "On demand",
};

export const FEATURE_FLAG_STAGES = [
  "dust_only",
  "rolling_out",
  "on_demand",
] as const satisfies readonly FeatureFlagStage[];

export type FeatureFlag = {
  description: string;
  stage: FeatureFlagStage;
};

export type WhitelistableFeature = keyof typeof WHITELISTABLE_FEATURES_CONFIG;

export const WHITELISTABLE_FEATURES = Object.keys(
  WHITELISTABLE_FEATURES_CONFIG
) as WhitelistableFeature[];

const DISABLE_COMPUTER_FEATURE =
  "disable_computer_feature" as const satisfies WhitelistableFeature;

export function isComputerFeatureEnabled(
  featureFlags: WhitelistableFeature[]
): boolean {
  return !featureFlags.includes(DISABLE_COMPUTER_FEATURE);
}

export function isWhitelistableFeature(
  feature: unknown
): feature is WhitelistableFeature {
  return WHITELISTABLE_FEATURES.includes(feature as WhitelistableFeature);
}
