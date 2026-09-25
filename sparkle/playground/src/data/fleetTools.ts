// Catalog of tools / connectors an agent or a skill can be configured with.
// In the product these are MCP server views; here the id stands in for the
// view sId and drives both the filter and the row icons.

export interface FleetTool {
  id: string;
  label: string;
  // "connector" tools come from a data integration, "capability" ones are
  // built into Dust. Only used to group the filter menu.
  kind: "connector" | "capability";
}

export const FLEET_TOOLS: FleetTool[] = [
  { id: "salesforce", label: "Salesforce", kind: "connector" },
  { id: "hubspot", label: "HubSpot", kind: "connector" },
  { id: "slack", label: "Slack", kind: "connector" },
  { id: "notion", label: "Notion", kind: "connector" },
  { id: "google_drive", label: "Google Drive", kind: "connector" },
  { id: "gmail", label: "Gmail", kind: "connector" },
  { id: "gcal", label: "Google Calendar", kind: "connector" },
  { id: "github", label: "GitHub", kind: "connector" },
  { id: "jira", label: "Jira", kind: "connector" },
  { id: "linear", label: "Linear", kind: "connector" },
  { id: "zendesk", label: "Zendesk", kind: "connector" },
  { id: "intercom", label: "Intercom", kind: "connector" },
  { id: "confluence", label: "Confluence", kind: "connector" },
  { id: "snowflake", label: "Snowflake", kind: "connector" },
  { id: "bigquery", label: "BigQuery", kind: "connector" },
  { id: "gong", label: "Gong", kind: "connector" },
  { id: "stripe", label: "Stripe", kind: "connector" },
  { id: "asana", label: "Asana", kind: "connector" },
  { id: "figma", label: "Figma", kind: "connector" },
  { id: "monday", label: "Monday", kind: "connector" },
  { id: "web_search", label: "Web search", kind: "capability" },
  { id: "browse", label: "Browse", kind: "capability" },
  { id: "search", label: "Search company data", kind: "capability" },
  { id: "frame", label: "Create a Frame", kind: "capability" },
  { id: "image_generation", label: "Image generation", kind: "capability" },
  { id: "run_agent", label: "Run agent", kind: "capability" },
  { id: "data_warehouse", label: "Query warehouse", kind: "capability" },
  { id: "extract_data", label: "Extract data", kind: "capability" },
];

export const FLEET_TOOLS_BY_ID = new Map(
  FLEET_TOOLS.map((tool) => [tool.id, tool])
);

export function getToolLabel(id: string): string {
  return FLEET_TOOLS_BY_ID.get(id)?.label ?? id;
}
