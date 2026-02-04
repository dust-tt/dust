import type { InternalAllowedIconType } from "@app/components/resources/resources_icons";
import {
  getInternalMCPServerIconByName,
  getInternalMCPServerInfo,
  getInternalMCPServerToolStakes,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { CONNECTOR_UI_CONFIGURATIONS } from "@app/lib/connector_providers_ui";
import type { ConnectorProvider } from "@app/types";
import { asDisplayToolName } from "@app/types/shared/utils/string_utils";

import type {
  IntegrationBase,
  IntegrationCategory,
  IntegrationTool,
} from "../types";
import { getToolDescription } from "./toolDescriptions";

// MCP servers to exclude from public pages (internal/system/auto servers)
const EXCLUDED_MCP_SERVERS = new Set([
  // System/internal servers
  "dust_retrieval",
  "include",
  "include_data",
  "data_sources_query",
  "agent_configurations",
  "process_conversation",
  "conversation_list",
  "workspace_search",
  "browsing",
  "toolsets",
  "agent_management",
  "agent_memory",
  "agent_router",
  "scheduled_task_agent",
  "skill_management",
  "run_agent",
  "schedules_management",
  "data_sources_file_system",
  "missing_action_catcher",
  "conversation_files",
  "common_utilities",
  // Auto tools (not user-configurable integrations)
  "image_generation",
  "file_generation",
  "extract_data",
  "interactive_content",
  "slideshow",
  "deep_dive",
  "speech_generator",
  "sound_studio",
  "run_dust_app",
  // Core Dust features (built-in capabilities, not external integrations)
  "search",
  "query_tables_v2",
  "data_warehouses",
  "web_search_&_browse",
  // Bot integrations (internal, not user-facing)
  "slack_bot",
  // Dev/debug tools
  "primitive_types_debugger",
  "jit_testing",
]);

// Connectors to exclude (hidden or bot-only)
const EXCLUDED_CONNECTORS = new Set<ConnectorProvider>([
  "slack_bot",
  "discord_bot",
  "microsoft_bot",
]);

// Category mapping for MCP servers
const MCP_CATEGORY_MAP: Record<string, IntegrationCategory> = {
  // Communication
  slack: "communication",
  slack_bot: "communication",
  microsoft_teams: "communication",
  // Development
  github: "development",
  jira: "development",
  confluence: "development",
  val_town: "development",
  http_client: "development",
  // CRM
  salesforce: "crm",
  hubspot: "crm",
  ashby: "crm",
  salesloft: "crm",
  // Productivity
  notion: "productivity",
  monday: "productivity",
  google_sheets: "productivity",
  microsoft_excel: "productivity",
  slab: "productivity",
  // Email
  gmail: "email",
  outlook: "email",
  // Calendar
  google_calendar: "calendar",
  outlook_calendar: "calendar",
  // Storage
  google_drive: "storage",
  microsoft_drive: "storage",
  // Support
  zendesk: "support",
  freshservice: "support",
  front: "support",
  // Data
  databricks: "data",
  // Security
  vanta: "security",
  // AI
  openai_usage: "ai",
};

// Category mapping for connectors
const CONNECTOR_CATEGORY_MAP: Record<ConnectorProvider, IntegrationCategory> = {
  confluence: "development",
  notion: "productivity",
  google_drive: "storage",
  slack: "communication",
  slack_bot: "communication",
  discord_bot: "communication",
  github: "development",
  intercom: "support",
  microsoft: "storage",
  microsoft_bot: "communication",
  webcrawler: "data",
  snowflake: "data",
  zendesk: "support",
  bigquery: "data",
  salesforce: "crm",
  gong: "transcripts",
  dust_project: "data",
};

// Display names for MCP servers (snake_case to Title Case)
const MCP_DISPLAY_NAMES: Record<string, string> = {
  github: "GitHub",
  google_calendar: "Google Calendar",
  google_drive: "Google Drive",
  google_sheets: "Google Sheets",
  microsoft_excel: "Microsoft Excel",
  microsoft_drive: "Microsoft OneDrive",
  outlook: "Microsoft Outlook",
  outlook_calendar: "Outlook Calendar",
  val_town: "Val Town",
  web_search_browse: "Web Search & Browse",
  http_client: "HTTP Client",
  sound_studio: "Sound Studio",
  speech_generator: "Speech Generator",
  openai_usage: "OpenAI Usage",
  slack_bot: "Slack Bot",
  salesforce: "Salesforce",
  hubspot: "HubSpot",
  ashby: "Ashby",
  salesloft: "Salesloft",
  slab: "Slab",
  vanta: "Vanta",
  front: "Front",
  databricks: "Databricks",
  monday: "Monday.com",
};

// Display names for connectors
const CONNECTOR_DISPLAY_NAMES: Partial<Record<ConnectorProvider, string>> = {
  google_drive: "Google Drive",
  microsoft: "Microsoft 365",
  microsoft_bot: "Microsoft Teams",
  slack_bot: "Slack",
  discord_bot: "Discord",
  webcrawler: "Web Crawler",
};

// Helper to format tool names
function formatToolName(name: string): string {
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Helper to determine if a tool is a write action based on name patterns
function isWriteAction(toolName: string): boolean {
  const writePatterns = [
    "create",
    "update",
    "delete",
    "send",
    "post",
    "add",
    "remove",
    "edit",
    "write",
    "set",
    "modify",
    "reply",
    "assign",
    "close",
    "resolve",
  ];
  const lowerName = toolName.toLowerCase();
  return writePatterns.some((pattern) => lowerName.includes(pattern));
}

// Extract tools from MCP server
function extractToolsFromServer(
  serverName: keyof typeof INTERNAL_MCP_SERVERS
): { tools: IntegrationTool[]; icon: InternalAllowedIconType } {
  const toolStakes = getInternalMCPServerToolStakes(serverName);
  const icon = getInternalMCPServerIconByName(serverName);

  if (!toolStakes) {
    return {
      tools: [],
      icon: icon as InternalAllowedIconType,
    };
  }

  const tools: IntegrationTool[] = Object.keys(toolStakes).map((toolName) => {
    const displayName = asDisplayToolName(toolName);
    return {
      name: toolName,
      displayName,
      description: getToolDescription(serverName, toolName, displayName),
      isWriteAction: isWriteAction(toolName),
    };
  });

  return {
    tools,
    icon: icon as InternalAllowedIconType,
  };
}

function getConnectorIcon(
  provider: ConnectorProvider
): InternalAllowedIconType {
  // Map connector providers to their Sparkle icon names
  const iconMap: Partial<Record<ConnectorProvider, InternalAllowedIconType>> = {
    confluence: "ConfluenceLogo",
    notion: "NotionLogo",
    google_drive: "DriveLogo",
    slack: "SlackLogo",
    slack_bot: "SlackLogo",
    github: "GithubLogo",
    intercom: "IntercomLogo",
    microsoft: "MicrosoftLogo",
    microsoft_bot: "MicrosoftLogo",
    snowflake: "SnowflakeLogo",
    zendesk: "ZendeskLogo",
    bigquery: "BigQueryLogo",
    salesforce: "SalesforceLogo",
    gong: "GongLogo",
    webcrawler: "ActionGlobeAltIcon",
    discord_bot: "ActionMegaphoneIcon",
  };

  return iconMap[provider] ?? "ActionCloudArrowLeftRightIcon";
}

export function buildIntegrationRegistry(): IntegrationBase[] {
  const integrationMap = new Map<string, IntegrationBase>();

  // Add MCP servers
  // Note: For marketing/SEO pages, we include servers that are behind feature flags
  // (isRestricted) or in preview since they are still valid integrations to advertise.
  for (const [name, server] of Object.entries(INTERNAL_MCP_SERVERS)) {
    if (EXCLUDED_MCP_SERVERS.has(name)) {
      continue;
    }

    const serverName = name as keyof typeof INTERNAL_MCP_SERVERS;
    const { tools, icon } = extractToolsFromServer(serverName);
    const displayName = MCP_DISPLAY_NAMES[name] ?? formatToolName(name);
    const serverInfo = getInternalMCPServerInfo(serverName);

    integrationMap.set(name, {
      slug: name,
      name: displayName,
      type: "mcp_server",
      description: serverInfo.description,
      icon,
      documentationUrl: serverInfo.documentationUrl,
      authorizationRequired: !!serverInfo.authorization,
      tools,
      category: MCP_CATEGORY_MAP[name] ?? "productivity",
      isPreview: server.isPreview ?? false,
    });
  }

  // Add connectors (or merge with existing MCP entries)
  // Note: For marketing/SEO pages, we include connectors that are hidden in the app UI
  // (e.g., Salesforce, Slack during rollout) since they are still valid integrations.
  for (const [provider, config] of Object.entries(CONNECTOR_CONFIGURATIONS)) {
    const connectorProvider = provider as ConnectorProvider;

    if (EXCLUDED_CONNECTORS.has(connectorProvider)) {
      continue;
    }

    const uiConfig = CONNECTOR_UI_CONFIGURATIONS[connectorProvider];

    const displayName =
      CONNECTOR_DISPLAY_NAMES[connectorProvider] ?? config.name;

    // Check if we already have an MCP server with this slug
    const existingIntegration = integrationMap.get(provider);

    if (existingIntegration) {
      // Merge: This integration has both MCP tools and connector capabilities
      existingIntegration.type = "both";
      existingIntegration.connectorDescription = uiConfig.description;
      existingIntegration.connectorGuideUrl = uiConfig.guideLink;
    } else {
      // New connector-only integration
      integrationMap.set(provider, {
        slug: provider,
        name: displayName,
        type: "connector",
        description: uiConfig.description,
        icon: getConnectorIcon(connectorProvider),
        documentationUrl: uiConfig.guideLink,
        authorizationRequired: true,
        tools: [], // Connectors don't expose tools the same way
        category: CONNECTOR_CATEGORY_MAP[connectorProvider] ?? "productivity",
      });
    }
  }

  // Add manual transcript integrations (these are special integrations
  // that work via the Labs Transcripts feature)
  const manualTranscriptIntegrations: IntegrationBase[] = [
    {
      slug: "google-meet",
      name: "Google Meet",
      type: "connector",
      description:
        "Connect Google Meet recordings to Dust. AI automatically summarizes your meetings, extracts action items, and syncs insights to your workspace.",
      icon: "GcalLogo", // Using Google Calendar logo as closest match
      documentationUrl: "https://docs.dust.tt/docs/meeting-recordings",
      authorizationRequired: true,
      tools: [],
      category: "transcripts",
    },
    {
      slug: "modjo",
      name: "Modjo",
      type: "connector",
      description:
        "Connect Modjo call recordings to Dust. AI analyzes sales calls, extracts key insights, and helps your team improve performance.",
      icon: "ActionMegaphoneIcon",
      documentationUrl: "https://docs.dust.tt/docs/meeting-recordings",
      authorizationRequired: true,
      tools: [],
      category: "transcripts",
    },
  ];

  for (const integration of manualTranscriptIntegrations) {
    if (!integrationMap.has(integration.slug)) {
      integrationMap.set(integration.slug, integration);
    }
  }

  // Sort by name for consistent ordering
  return Array.from(integrationMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export function getIntegrationBySlug(
  slug: string
): IntegrationBase | undefined {
  const registry = buildIntegrationRegistry();
  return registry.find((i) => i.slug === slug);
}

export function getIntegrationsByCategory(
  category: IntegrationCategory
): IntegrationBase[] {
  const registry = buildIntegrationRegistry();
  return registry.filter((i) => i.category === category);
}

export function getAllCategories(): IntegrationCategory[] {
  const registry = buildIntegrationRegistry();
  const categories = new Set(registry.map((i) => i.category));
  return Array.from(categories).sort();
}

export function getRelatedIntegrations(
  integration: IntegrationBase,
  limit: number = 4
): IntegrationBase[] {
  const registry = buildIntegrationRegistry();

  // Find integrations in the same category, excluding the current one
  const sameCategory = registry.filter(
    (i) => i.category === integration.category && i.slug !== integration.slug
  );

  // If we have enough, return them
  if (sameCategory.length >= limit) {
    return sameCategory.slice(0, limit);
  }

  // Otherwise, fill with other popular integrations
  const others = registry.filter(
    (i) =>
      i.category !== integration.category &&
      i.slug !== integration.slug &&
      !sameCategory.find((s) => s.slug === i.slug)
  );

  return [...sameCategory, ...others].slice(0, limit);
}
