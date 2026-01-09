import type { InternalAllowedIconType } from "@app/components/resources/resources_icons";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import { CONNECTOR_CONFIGURATIONS } from "@app/lib/connector_providers";
import { CONNECTOR_UI_CONFIGURATIONS } from "@app/lib/connector_providers_ui";
import type { ConnectorProvider } from "@app/types";

import type {
  IntegrationBase,
  IntegrationCategory,
  IntegrationTool,
} from "../types";

// MCP servers to exclude from public integration pages
const EXCLUDED_MCP_SERVERS = new Set([
  // Hidden/auto servers (not user-facing)
  "agent_router",
  "missing_action_catcher",
  "conversation_files",
  "data_sources_file_system",
  "data_warehouses",
  "toolsets",
  "skill_management",
  "schedules_management",
  "common_utilities",
  // Debug/dev only
  "primitive_types_debugger",
  "jit_testing",
  // Auto/core (not user-configurable, always available)
  "search",
  "query_tables_v2",
  "include_data",
  "extract_data",
  "file_generation",
  "image_generation",
  "run_agent",
  "run_dust_app",
  "agent_memory",
  "deep_dive",
  "interactive_content",
  "slideshow",
  "speech_generator",
  "sound_studio",
  // Web search is internal
  "web_search_&_browse",
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
  gong: "crm",
};

// Display names for MCP servers (snake_case to Title Case)
const MCP_DISPLAY_NAMES: Record<string, string> = {
  github: "GitHub",
  hubspot: "HubSpot",
  notion: "Notion",
  salesforce: "Salesforce",
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  slack: "Slack",
  slack_bot: "Slack Bot",
  google_sheets: "Google Sheets",
  monday: "Monday.com",
  jira: "Jira",
  outlook: "Outlook",
  outlook_calendar: "Outlook Calendar",
  freshservice: "Freshservice",
  google_drive: "Google Drive",
  openai_usage: "OpenAI Usage",
  confluence: "Confluence",
  microsoft_drive: "Microsoft OneDrive",
  microsoft_teams: "Microsoft Teams",
  microsoft_excel: "Microsoft Excel",
  http_client: "HTTP Client",
  ashby: "Ashby",
  salesloft: "Salesloft",
  zendesk: "Zendesk",
  slab: "Slab",
  vanta: "Vanta",
  val_town: "Val Town",
  front: "Front",
  databricks: "Databricks",
};

// Connector display names override
const CONNECTOR_DISPLAY_NAMES: Partial<Record<ConnectorProvider, string>> = {
  google_drive: "Google Drive",
  webcrawler: "Web Crawler",
  bigquery: "BigQuery",
};

function formatToolName(name: string): string {
  // Convert snake_case to Title Case
  return name
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function extractToolsFromServer(
  serverKey: string
): { tools: IntegrationTool[]; icon: InternalAllowedIconType } {
  const server = INTERNAL_MCP_SERVERS[serverKey as keyof typeof INTERNAL_MCP_SERVERS];
  const stakes = server.tools_stakes ?? {};

  const tools: IntegrationTool[] = Object.entries(stakes).map(
    ([name, level]) => ({
      name,
      displayName: formatToolName(name),
      description: "", // Tool descriptions are fetched dynamically
      isWriteAction: level !== "never_ask",
    })
  );

  return {
    tools,
    icon: server.serverInfo.icon as InternalAllowedIconType,
  };
}

function getConnectorIcon(provider: ConnectorProvider): InternalAllowedIconType {
  // Map connector providers to their Sparkle icon names
  const iconMap: Partial<Record<ConnectorProvider, InternalAllowedIconType>> = {
    confluence: "ConfluenceLogo",
    notion: "NotionLogo",
    google_drive: "DriveLogo",
    slack: "SlackLogo",
    slack_bot: "SlackLogo",
    github: "GithubLogo",
    intercom: "ActionMegaphoneIcon",
    microsoft: "MicrosoftLogo",
    microsoft_bot: "MicrosoftLogo",
    snowflake: "ActionTableIcon",
    zendesk: "ZendeskLogo",
    bigquery: "ActionTableIcon",
    salesforce: "SalesforceLogo",
    gong: "ActionMegaphoneIcon",
    webcrawler: "ActionGlobeAltIcon",
    discord_bot: "ActionMegaphoneIcon",
  };

  return iconMap[provider] ?? "ActionCloudArrowLeftRightIcon";
}

export function buildIntegrationRegistry(): IntegrationBase[] {
  const integrationMap = new Map<string, IntegrationBase>();

  // Add MCP servers
  for (const [name, server] of Object.entries(INTERNAL_MCP_SERVERS)) {
    if (EXCLUDED_MCP_SERVERS.has(name)) {
      continue;
    }

    // Skip restricted/preview servers that require feature flags
    // These are generally not ready for public marketing
    if (server.isRestricted !== undefined || server.isPreview) {
      continue;
    }

    const { tools, icon } = extractToolsFromServer(name);
    const displayName = MCP_DISPLAY_NAMES[name] ?? formatToolName(name);

    integrationMap.set(name, {
      slug: name,
      name: displayName,
      type: "mcp_server",
      description: server.serverInfo.description,
      icon,
      documentationUrl: server.serverInfo.documentationUrl,
      authorizationRequired: !!server.serverInfo.authorization,
      tools,
      category: MCP_CATEGORY_MAP[name] ?? "productivity",
    });
  }

  // Add connectors (or merge with existing MCP entries)
  for (const [provider, config] of Object.entries(CONNECTOR_CONFIGURATIONS)) {
    const connectorProvider = provider as ConnectorProvider;

    if (EXCLUDED_CONNECTORS.has(connectorProvider)) {
      continue;
    }

    const uiConfig = CONNECTOR_UI_CONFIGURATIONS[connectorProvider];
    if (uiConfig.hide) {
      continue;
    }

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

  // If not enough, add from other categories
  if (sameCategory.length >= limit) {
    return sameCategory.slice(0, limit);
  }

  const others = registry.filter(
    (i) =>
      i.category !== integration.category &&
      i.slug !== integration.slug &&
      !sameCategory.includes(i)
  );

  return [...sameCategory, ...others].slice(0, limit);
}
