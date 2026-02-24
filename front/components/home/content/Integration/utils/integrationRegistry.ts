import type { InternalAllowedIconType } from "@app/components/resources/resources_icons";
import { INTERNAL_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/constants";
import { DEFAULT_REMOTE_MCP_SERVERS } from "@app/lib/actions/mcp_internal_actions/remote_servers";
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
  "agent_management",
  "missing_action_catcher",
  "conversation_files",
  "data_sources_file_system",
  "data_warehouses",
  "toolsets",
  "skill_management",
  "schedules_management",
  "common_utilities",
  "project_context_management",
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
  // Feature-flagged/preview (not generally available)
  "slack_bot",
  "openai_usage",
  "http_client",
]);

// Connectors to exclude (hidden or bot-only or internal)
const EXCLUDED_CONNECTORS = new Set<ConnectorProvider>([
  "slack_bot",
  "discord_bot",
  "microsoft_bot",
  "dust_project", // Internal connector for Dust projects
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
  // CRM & Sales
  salesforce: "crm",
  hubspot: "crm",
  salesloft: "crm",
  // Recruiting
  ashby: "recruiting",
  // Productivity
  notion: "productivity",
  monday: "productivity",
  google_sheets: "productivity",
  microsoft_excel: "productivity",
  slab: "productivity",
  productboard: "productivity",
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

// Category mapping for remote MCP servers (by name, lowercased)
const REMOTE_MCP_CATEGORY_MAP: Record<string, IntegrationCategory> = {
  stripe: "crm",
  linear: "development",
  asana: "productivity",
  supabase: "development",
  guru: "productivity",
  granola: "transcripts",
  intercom: "support",
  attio: "crm",
  gitlab: "development",
  datadog: "development",
  "datadog europe": "development",
  canva: "productivity",
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
  webcrawler: "storage",
  snowflake: "data",
  zendesk: "support",
  bigquery: "data",
  salesforce: "crm",
  gong: "transcripts",
  dust_project: "development", // Internal connector
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
  productboard: "Productboard",
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
): { tools: IntegrationTool[]; icon: InternalAllowedIconType } | null {
  const server = INTERNAL_MCP_SERVERS[
    serverKey as keyof typeof INTERNAL_MCP_SERVERS
  ] as
    | {
        metadata?: {
          serverInfo: { icon: string; description: string };
          tools_stakes: Record<string, string>;
        };
        tools_stakes?: Record<string, string>;
        serverInfo?: { icon: string; description: string };
      }
    | undefined;

  // serverInfo and tools_stakes can be at top level or inside metadata
  const serverInfo = server?.metadata?.serverInfo ?? server?.serverInfo;
  if (!serverInfo) {
    return null;
  }

  const stakes = server?.tools_stakes ?? server?.metadata?.tools_stakes ?? {};

  const tools: IntegrationTool[] = Object.entries(stakes).map(
    ([name, level]) => ({
      name,
      displayName: formatToolName(name),
      description: "",
      isWriteAction: level !== "never_ask",
    })
  );

  return {
    tools,
    icon: serverInfo.icon as InternalAllowedIconType,
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
    bigquery: "ActionTableIcon", // No BigQueryLogo available
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
  for (const [name, serverRaw] of Object.entries(INTERNAL_MCP_SERVERS)) {
    // Only include user-facing (manual) servers, skip auto/internal ones
    const entry = serverRaw as { availability: string };
    if (entry.availability !== "manual" || EXCLUDED_MCP_SERVERS.has(name)) {
      continue;
    }

    // serverInfo can be at top level or inside metadata
    const server = serverRaw as {
      metadata?: {
        serverInfo: {
          description: string;
          documentationUrl: string | null;
          authorization: unknown;
        };
      };
      serverInfo?: {
        description: string;
        documentationUrl: string | null;
        authorization: unknown;
      };
    };

    const serverInfo = server.metadata?.serverInfo ?? server.serverInfo;
    if (!serverInfo) {
      continue;
    }

    const extracted = extractToolsFromServer(name);
    if (!extracted) {
      continue;
    }

    const { tools, icon } = extracted;
    const displayName = MCP_DISPLAY_NAMES[name] ?? formatToolName(name);

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
    });
  }

  // Add remote MCP servers
  for (const remote of DEFAULT_REMOTE_MCP_SERVERS) {
    const slug = remote.name.toLowerCase().replace(/\s+/g, "_");

    // Skip if already added (e.g., from internal servers)
    if (integrationMap.has(slug)) {
      continue;
    }

    const tools: IntegrationTool[] = Object.entries(
      remote.toolStakes ?? {}
    ).map(([name, level]) => ({
      name,
      displayName: formatToolName(name),
      description: "",
      isWriteAction: level !== "never_ask",
    }));

    integrationMap.set(slug, {
      slug,
      name: remote.name,
      type: "mcp_server",
      description: remote.description,
      icon: remote.icon,
      documentationUrl: remote.documentationUrl ?? null,
      authorizationRequired: remote.authMethod !== null,
      tools,
      category:
        REMOTE_MCP_CATEGORY_MAP[remote.name.toLowerCase()] ?? "productivity",
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

  // Filter out the current integration, then prioritize same category
  const candidates = registry.filter((i) => i.slug !== integration.slug);

  // Sort by category match (same category first), then take limit
  return candidates
    .sort((a, b) => {
      const aMatch = a.category === integration.category ? 0 : 1;
      const bMatch = b.category === integration.category ? 0 : 1;
      return aMatch - bMatch;
    })
    .slice(0, limit);
}
