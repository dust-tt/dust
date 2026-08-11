import type {
  UsageFilterModelOption,
  UsageFilterSkillOption,
  UsageFilterSourceOption,
  UsageFilterToolOption,
} from "@app/components/workspace/analytics/usageFilter";
import { USAGE_MODEL_TIERS } from "@app/components/workspace/analytics/usageFilter";
import type { ModelMakerIdType } from "@app/types/assistant/models/types";
import type { ConnectorProvider } from "@app/types/data_source";

const MOCK_MODEL_LAB: Record<string, ModelMakerIdType> = {
  "Claude Sonnet 5": "anthropic",
  "Claude Opus 5": "anthropic",
  "Claude Haiku 4.5": "anthropic",
  "Claude Fable 5": "anthropic",
  "GPT-5": "openai",
  "GPT-5 mini": "openai",
  "Gemini 3 Pro": "google_ai_studio",
  "Gemini 3 Flash": "google_ai_studio",
  "Llama 4 Maverick": "fireworks",
  "Mistral Large 3": "mistral",
  "Grok 4": "xai",
  "DeepSeek V4": "deepseek",
};

// Placeholder data for categories not yet wired to a real backend endpoint.
// Agents are fetched live in UsageFilterPanel (useConsumptionTop); members
// and groups via useSearchMembers and useGroups. Lists are long enough to
// exercise scrolling in the preview.
const MOCK_ENTITY_NAMES = {
  model: [
    "Claude Sonnet 5",
    "Claude Opus 5",
    "Claude Haiku 4.5",
    "Claude Fable 5",
    "GPT-5",
    "GPT-5 mini",
    "Gemini 3 Pro",
    "Gemini 3 Flash",
    "Llama 4 Maverick",
    "Mistral Large 3",
    "Grok 4",
    "DeepSeek V4",
  ],
  tool: [
    "web_search",
    "file_search",
    "run_code",
    "browse_page",
    "generate_image",
    "send_email",
    "create_calendar_event",
    "query_database",
    "read_spreadsheet",
    "post_to_slack",
    "create_jira_ticket",
    "translate_text",
    "summarize_document",
    "extract_table",
    "fetch_url",
  ],
  skill: [
    "Summarize",
    "Translate",
    "Extract data",
    "Draft email",
    "Brainstorm ideas",
    "Review code",
    "Analyze spreadsheet",
    "Write SQL",
    "Proofread",
    "Generate outline",
  ],
};

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

function buildModelOptions(names: string[]): UsageFilterModelOption[] {
  return names.map((name, index) => ({
    id: `model_${index + 1}`,
    name,
    kind: "model",
    lab: MOCK_MODEL_LAB[name],
    tier: USAGE_MODEL_TIERS[index % USAGE_MODEL_TIERS.length],
  }));
}

function buildToolOptions(names: string[]): UsageFilterToolOption[] {
  return names.map((name, index) => ({
    id: `tool_${index + 1}`,
    name,
    kind: "tool",
  }));
}

function buildSkillOptions(names: string[]): UsageFilterSkillOption[] {
  return names.map((name, index) => ({
    id: `skill_${index + 1}`,
    name,
    kind: "skill",
  }));
}

export const USAGE_FILTER_MOCK_OPTIONS = {
  model: buildModelOptions(MOCK_ENTITY_NAMES.model),
  tool: buildToolOptions(MOCK_ENTITY_NAMES.tool),
  skill: buildSkillOptions(MOCK_ENTITY_NAMES.skill),
  source: MOCK_SOURCE_CONNECTORS.map<UsageFilterSourceOption>(
    (connector, index) => ({
      id: `source_${index + 1}`,
      name: connector.name,
      kind: "source",
      connectorProvider: connector.connectorProvider,
    })
  ),
};
