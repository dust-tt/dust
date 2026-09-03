export const WHITELISTABLE_FEATURES_CONFIG = {
  stateful_conversation_window: {
    description:
      "Restore agent-loop context windows from the previous model step checkpoint",
    stage: "dust_only",
    owner: "flvndvd",
  },
  dust_filesystem: {
    description:
      "Allow fresh Pods and standalone conversations to use the database-backed filesystem",
    stage: "dust_only",
    owner: "flvndvd",
  },
  frames_v2: {
    description: "Enable Frames v2",
    stage: "self_serve",
    owner: "fontanierh",
  },
  advanced_notion_management: {
    description:
      "Advanced features for Notion workspace management shown to admins",
    stage: "self_serve",
    owner: "fontanierh",
  },
  anthropic_vertex_fallback: {
    description: "Fallback to Vertex Anthropic for some Anthropic models",
    stage: "dust_only",
    owner: "flvndvd",
  },
  openai_flex_processing: {
    description:
      "Run trigger and wake-up agent runs on OpenAI flex processing (cheaper, slower), falling back to standard processing when flex does not deliver",
    stage: "dust_only",
    owner: "Nils-Fedrigo",
  },
  use_vertex_for_supported_models: {
    description:
      "Route LLM calls through Vertex AI when supported instead of the direct provider's API",
    stage: "self_serve",
    owner: "pmilliotte",
  },
  audit_logs: {
    description: "Enable audit log emission via WorkOS",
    stage: "self_serve",
    owner: "smb2268",
  },
  custom_model_feature: {
    description: "Access to custom models loaded from external config",
    stage: "dust_only",
    owner: "flvndvd",
  },
  dust_internal_global_agents: {
    description:
      "Access to internal global agents (dust-edge, dust-quick, dust-oai, dust-goog, custom model agents and their variants)",
    stage: "dust_only",
    owner: "fontanierh",
  },
  gpt_5_6_terra_long_context: {
    description: "Access to GPT 5.6 Terra with its full context window",
    stage: "self_serve",
    owner: "fontanierh",
  },
  dust_agent_sonnet_5_default: {
    description: "Use Claude Sonnet 5 as the default model for the @dust agent",
    stage: "dust_only",
    owner: "pmilliotte",
  },
  notion_private_integration: {
    description: "Setup Notion private integration tokens",
    stage: "self_serve",
    owner: "fontanierh",
  },
  claude_4_opus_feature: {
    description: "Access to Claude 4 Opus model in the agent builder",
    stage: "self_serve",
    owner: "fontanierh",
  },
  claude_4_5_opus_feature: {
    description:
      "Access to Claude Opus and GPT 5.6 Sol models in the agent builder",
    stage: "self_serve",
    owner: "fontanierh",
  },
  claude_fable_5_feature: {
    description:
      "Access to Claude Fable 5 model (served through the EAP Anthropic key)",
    stage: "dust_only",
    owner: "fontanierh",
  },
  deepseek_feature: {
    description:
      "Access to DeepSeek models (they cannot use tool so can't be selected in the agent builder)",
    stage: "self_serve",
    owner: "fontanierh",
  },
  fireworks_new_model_feature: {
    description: "Access to Fireworks new model",
    stage: "self_serve",
    owner: "pmilliotte",
  },
  exa_people_and_company: {
    description: "Access to Exa MCP server (search_people, search_companies)",
    stage: "dust_only",
    owner: "spolu",
  },
  disable_run_logs: {
    description: "Disable logging of agent runs",
    stage: "dust_only",
    owner: "spolu",
  },
  disable_computer_feature: {
    description: "Disable all Computer sandbox features for this workspace",
    stage: "self_serve",
    owner: "fontanierh",
  },
  google_sheets_tool: {
    description: "Google Sheets MCP tool",
    stage: "ask_owner",
    owner: "frankaloia",
  },
  http_client_tool: {
    description: "HTTP Client MCP tool for making external API requests",
    stage: "self_serve",
    owner: "frankaloia",
  },
  index_private_slack_channel: {
    description: "Allow indexing of private Slack channels",
    stage: "self_serve",
    owner: "spolu",
  },
  labs_transcripts: {
    description: "Transcript feature (Labs)",
    stage: "self_serve",
    owner: "frankaloia",
  },
  openai_o1_feature: {
    description: "Access to OpenAI o1 model",
    stage: "self_serve",
    owner: "fontanierh",
  },
  openai_usage_mcp: {
    description: "OpenAI tool for tracking API consumption and costs",
    stage: "self_serve",
    owner: "frankaloia",
  },
  openai_concise_reasoning_summaries: {
    description:
      "Use concise reasoning summaries for supported OpenAI models in the new LLM router",
    stage: "dust_only",
    owner: "fontanierh",
  },
  salesforce_synced_queries: {
    description: "Salesforce Connection: retrieval on Synchronized queries",
    stage: "ask_owner",
    owner: "PopDaph",
  },
  self_created_slack_app_connector_rollout: {
    description:
      "Slack Connection: rollout for self-created Slack app connector",
    stage: "ask_owner",
    owner: "fabiencelier",
  },
  salesforce_tool: {
    description:
      "Salesforce MCP tool (activated by default on most plans, FF to override the plan config)",
    stage: "self_serve",
    owner: "PopDaph",
  },
  show_debug_tools: {
    description: "Display debug tools in the interface",
    stage: "dust_only",
    owner: "spolu",
  },
  usage_data_api: {
    description:
      "API for accessing usage data (Means that any builder with an API key can access usage data of the workspace from API)",
    stage: "self_serve",
    owner: "flvndvd",
  },
  xai_feature: {
    description: "Access to xAI models in the agent builder",
    stage: "self_serve",
    owner: "fontanierh",
  },
  noop_model_feature: {
    description: "Access to noop model in the agent builder",
    stage: "dust_only",
    owner: "davidebbo",
  },
  slack_message_splitting: {
    description:
      "Enable splitting agent responses into multiple Slack messages for Slack (instead of truncation)",
    stage: "self_serve",
    owner: "frankaloia",
  },
  legacy_dust_apps: {
    description: "Access to legacy Dust Apps (editor and associated tools)",
    stage: "self_serve",
    owner: "spolu",
  },
  power_bi_mcp: {
    description: "Power BI MCP tool for querying semantic models and DAX",
    stage: "self_serve",
    owner: "LeandreLeBizec",
  },
  netsuite_mcp: {
    description:
      "NetSuite MCP tool for querying records and interacting with your NetSuite account",
    stage: "self_serve",
    owner: "LeandreLeBizec",
  },
  dust_internal_dangerous_in_cluster_mcp_servers: {
    description:
      "EXPERIMENTAL FEATURE. DUST INTERNAL ONLY. Allow remote MCP servers pointing at hosts on the MCP_IN_CLUSTER_HOSTS allowlist, reached in-cluster instead of through the untrusted egress proxy.",
    stage: "dust_only",
    owner: "id13",
  },
  discord_bot: {
    description:
      "Discord bot integration for workspace-level Discord integration",
    stage: "dust_only",
    owner: "frankaloia",
  },
  databricks_tool: {
    description: "Databricks MCP tool",
    stage: "self_serve",
    owner: "FlagBenett",
  },
  servicenow_tool: {
    description: "ServiceNow MCP tool",
    stage: "self_serve",
    owner: "thomasvicaire",
  },
  shopify_tool: {
    description: "Shopify MCP tool",
    stage: "self_serve",
    owner: "spolu",
  },
  sandbox_functions: {
    description: "Enable Pod Function invocation endpoints",
    stage: "dust_only",
    owner: "spolu",
  },
  run_tools_from_prompt: {
    description: "Enable /run command to directly call tools without LLM",
    stage: "dust_only",
    owner: "davidebbo",
  },
  conversations_slack_notifications: {
    description: "Enable slack notifications",
    stage: "dust_only",
    owner: "matteotrab",
  },
  reinforced_agents: {
    description:
      "Enable self-improvement (background analysis of conversations to suggest improvements to skills).",
    stage: "self_serve",
    owner: "davidebbo",
  },
  self_improvement_beta_tester: {
    description:
      "Self-improvement runs for free: consumption is not reported to billing (Metronome or programmatic usage).",
    stage: "self_serve",
    owner: "fabiencelier",
  },
  collapsible_messages: {
    description: "Enable collapsible messages in conversations",
    stage: "dust_only",
    owner: "ykmsd",
  },
  conversation_consumption_details: {
    description:
      "Show the detailed credit attribution for agent messages in conversations",
    stage: "dust_only",
    owner: "flvndvd",
  },
  poke_mcp: {
    description: "Enable the Poke MCP server for cross-workspace data access.",
    stage: "dust_only",
    owner: "aubin-tchoi",
  },
  legacy_billing: {
    description:
      "Force this workspace to use legacy Stripe billing, bypassing Metronome credit-priced plans regardless of the global kill switch.",
    stage: "self_serve",
    owner: "tdraier",
  },
  plan_mode: {
    description:
      "Enable the Plan Mode skill: agents maintain a live plan.md for genuinely multi-step tasks, with an optional human-approval checkpoint.",
    stage: "dust_only",
    owner: "PopDaph",
  },
  skill_favorites: {
    description:
      "Enable user favorites for skills, including favorite controls and runtime skill availability.",
    stage: "dust_only",
    owner: "aubin-tchoi",
  },
  allow_old_notion_mcp: {
    description:
      "Allow individual workspaces to keep using the old internal Notion MCP server alongside the official one",
    stage: "self_serve",
    owner: "davidebbo",
  },
  use_dust_keys: {
    description:
      "Force BYOK workspaces to use Dust-managed keys instead of customer-provided keys",
    // Not really self-serve but we want to be able to enable it for customers
    stage: "self_serve",
    owner: "pmilliotte",
  },
  dummy_feature_for_flag_testing: {
    description: "Dummy feature flag used for testing feature flag behavior",
    stage: "dust_only",
    owner: "davidebbo",
  },
  sensitivity_labels: {
    description:
      "Enable Microsoft sensitivity labels for data classification on connectors and MCP servers",
    stage: "self_serve",
    owner: "tdraier",
  },
  restricted_spaces_in_input_bar: {
    description:
      "Allow users to explicitly select Spaces from the conversation input bar.",
    stage: "dust_only",
    owner: "fontanierh",
  },
  disable_formatting_prompt: {
    description:
      "Skip injecting the OpenAI formatting meta prompt entirely (no markdown/paragraph style guidance)",
    stage: "dust_only",
    owner: "fontanierh",
  },
  workspace_default_agent: {
    description:
      "Workspace default agent: admins can pre-select a workspace-wide default agent for new conversations.",
    stage: "self_serve",
    owner: "davidebbo",
  },
  whitelabel_frames: {
    description:
      "Whitelabel frames: customize the workspace logo, favicon and OG image shown on shared Frames.",
    stage: "self_serve",
    owner: "flvndvd",
  },
  activation_force_nudge: {
    description:
      "Bypass the activated-user check in the activation orchestrator so already-activated users are still nudged",
    stage: "dust_only",
    owner: "frankaloia",
  },
  dust_pod_goal: {
    description:
      "Enable the Dust Pod Goal skill for persistent job loops in Pods",
    stage: "dust_only",
    owner: "frankaloia",
  },
  admin_controlled_pods: {
    description:
      "Enable admin-controlled Pods: admins manage membership and attach connected data (Space DataSourceViews) to the Pod itself.",
    stage: "dust_only",
    owner: "Fraggle",
  },
  pod_frame_tabs: {
    description:
      "Allow adding previewable Pod files (frames, markdown, and other previews) as custom tabs (title, icon, order) on the pod.",
    stage: "dust_only",
    owner: "Fraggle",
  },
  pod_applications: {
    description:
      "Enable the Pod Apps UI: browse, import, clone, export and delete the apps published on a Pod.",
    stage: "dust_only",
    owner: "davidebbo",
  },
  group_permissions_shadow: {
    description:
      "Admin Governance: evaluate the new group_permissions checks alongside the legacy ones and log mismatches (shadow mode). Serves the legacy result; safe to toggle.",
    stage: "dust_only",
    owner: "philipperolet",
  },
  user_memory: {
    description:
      "Enable the user_memory internal MCP server: agents can store and retrieve per-user memory in a user-scoped filesystem.",
    stage: "dust_only",
    owner: "PopDaph",
  },
  similar_agents_check: {
    description:
      "Warn users about similar existing agents before they create a duplicate in the agent builder.",
    stage: "self_serve",
    owner: "avervaet",
  },
  enforce_user_spend_limit_rate_cap: {
    description:
      "Enable the Redis fixed-window spend-cap backups (per-user, per-API-key, programmatic, and workspace usage cap): record AWU usage into the counters and enforce them at message send. When off, usage is neither recorded nor enforced.",
    stage: "ask_owner",
    owner: "tdraier",
  },
  enforce_premium_model_message_limit: {
    description:
      "Enforce the premium-model cap: once the user has spent 25 premium-tier messages in the rolling week, run the message on the Standard stream instead, on workspaces with a non-credit-priced (legacy) plan. Usage is counted regardless, so the flag only controls enforcement.",
    stage: "dust_only",
    owner: "id13",
  },
  editable_tool_inputs: {
    description:
      "Allow editing tool inputs before approving a tool call in the tool validation UI.",
    stage: "dust_only",
    owner: "matteotrab",
  },
  skip_free_usage_rate_limit: {
    description:
      "Skip the per-user daily free-usage cost cap enforced at the LLM call site. Escape hatch to unstick legitimate workspaces that legitimately exceed the free-usage limit.",
    stage: "self_serve",
    owner: "fabiencelier",
  },
  disable_fair_use_awu_limit: {
    description:
      "Disable the per-user fair-use AWU credit limit on this workspace: skip both the pre-message enforcement (read) and the usage recording (write). Escape hatch for workspaces that should not be subject to the fair-use cap.",
    stage: "self_serve",
    owner: "tdraier",
  },
  archive_inactive_agents: {
    description:
      "Allow this workspace to preview and archive agents that have not been mentioned for a configurable number of days.",
    stage: "self_serve",
    owner: "achilleburah",
  },
  legacy_trigger_limits: {
    description:
      "Keep the legacy trigger limits: automations may still be charged to personal credits on a non credit-priced plan.",
    stage: "self_serve",
    owner: "adrsimon",
  },
  message_export_from_consumption_index: {
    description:
      "Use the consumption analytics ES index instead of the message analytics index for message exports.",
    stage: "ask_owner",
    owner: "sylvain",
  },
  compact_usage_page: {
    description:
      "Show the compact credit-pool usage page (credit pool cards + compact members table) on the front usage page instead of the legacy usage page.",
    stage: "dust_only",
    owner: "avervaet",
  },
} as const satisfies Record<string, FeatureFlag>;

export type FeatureFlagStage = "dust_only" | "ask_owner" | "self_serve";

export const FEATURE_FLAG_STAGE_LABELS: Record<FeatureFlagStage, string> = {
  dust_only: "Dust-only",
  ask_owner: "Ask owner",
  self_serve: "Self-serve",
};

export const FEATURE_FLAG_STAGE_DESCRIPTIONS: Record<FeatureFlagStage, string> =
  {
    dust_only:
      "Cannot be activated outside Dust workspaces, the feature is not ready.",
    ask_owner: "Ask the eng owner before activating.",
    self_serve:
      "Safe to activate if you understand the feature and its impact on the workspace.",
  };

export const FEATURE_FLAG_STAGES = [
  "dust_only",
  "ask_owner",
  "self_serve",
] as const satisfies readonly FeatureFlagStage[];

export type FeatureFlag = {
  description: string;
  stage: FeatureFlagStage;
  // GitHub handle of the eng owner of the feature.
  owner: string;
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
