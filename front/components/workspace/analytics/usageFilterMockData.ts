import type { UsageFilterSourceOption } from "@app/components/workspace/analytics/usageFilter";
import type { ConnectorProvider } from "@app/types/data_source";

// Placeholder data for "source", the only category not yet wired to a real
// backend endpoint. Agents are fetched live in UsageFilterPanel
// (useAgentConfigurations); members via useSearchMembers; groups via
// useGroups; models via useModels; tools via useMCPServers; skills via
// useSkills.

// Fake connectors, standing in for the real per-workspace data source list
// until "source" is wired to a real db call. Covers a broad mix of
// connector providers (plus a couple of non-connector folders) so the
// filter panel's logo rendering and scrolling can be exercised.
const MOCK_SOURCE_CONNECTORS: Array<{
  name: string;
  connectorProvider?: ConnectorProvider;
}> = [
  { name: "Slack — #general", connectorProvider: "slack" },
  { name: "Slack — #engineering", connectorProvider: "slack" },
  { name: "Notion — Product docs", connectorProvider: "notion" },
  { name: "GitHub — dust-tt/dust", connectorProvider: "github" },
  { name: "Google Drive — Shared drive", connectorProvider: "google_drive" },
  { name: "Confluence — Engineering wiki", connectorProvider: "confluence" },
  { name: "Zendesk — Support tickets", connectorProvider: "zendesk" },
  { name: "Salesforce — CRM", connectorProvider: "salesforce" },
  { name: "Snowflake — Analytics warehouse", connectorProvider: "snowflake" },
  { name: "BigQuery — Data warehouse", connectorProvider: "bigquery" },
  { name: "Intercom — Customer conversations", connectorProvider: "intercom" },
  { name: "Microsoft — SharePoint", connectorProvider: "microsoft" },
  { name: "Gong — Call recordings", connectorProvider: "gong" },
  { name: "Website — docs.dust.tt", connectorProvider: "webcrawler" },
  { name: "Discord — Community server", connectorProvider: "discord_bot" },
  { name: "Uploaded files — Onboarding kit", connectorProvider: undefined },
  { name: "Uploaded files — Legal templates", connectorProvider: undefined },
];

export const USAGE_FILTER_MOCK_OPTIONS = {
  source: MOCK_SOURCE_CONNECTORS.map<UsageFilterSourceOption>(
    (connector, index) => ({
      id: `source_${index + 1}`,
      name: connector.name,
      kind: "source",
      connectorProvider: connector.connectorProvider,
    })
  ),
};
