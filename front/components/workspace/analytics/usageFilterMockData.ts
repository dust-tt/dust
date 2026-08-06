import type {
  UsageFilterEntity,
  UsageFilterGroup,
  UsageModelLab,
} from "@app/components/workspace/analytics/usageFilter";
import {
  USAGE_FILTER_SCOPES,
  USAGE_MODEL_TIERS,
} from "@app/components/workspace/analytics/usageFilter";
import type { ConnectorProvider } from "@app/types/data_source";

const MOCK_MODEL_LAB: Record<string, UsageModelLab> = {
  "Claude Sonnet 5": "anthropic",
  "Claude Opus 5": "anthropic",
  "Claude Haiku 4.5": "anthropic",
  "Claude Fable 5": "anthropic",
  "GPT-5": "openai",
  "GPT-5 mini": "openai",
  "Gemini 3 Pro": "google",
  "Gemini 3 Flash": "google",
  "Llama 4 Maverick": "meta",
  "Mistral Large 3": "mistral",
  "Command R+": "cohere",
  "DeepSeek V4": "deepseek",
};

const MOCK_GROUP_NAMES = [
  "Engineering",
  "Sales",
  "Product",
  "Design",
  "Support",
  "Finance",
  "Legal",
  "HR",
  "Marketing",
  "Leadership",
  "Customer Success",
  "Operations",
];

export const USAGE_FILTER_MOCK_GROUPS: UsageFilterGroup[] =
  MOCK_GROUP_NAMES.map((name, index) => ({
    id: `group_${index + 1}`,
    name,
  }));

// Placeholder data for categories not yet wired to a real backend endpoint.
// Members are fetched live in UsageFilterPanel via useSearchMembers. Lists
// are long enough to exercise scrolling in the preview.
const MOCK_ENTITY_NAMES = {
  agent: [
    "SupportBot",
    "SalesAssistant",
    "Data Digest - Weekly",
    "Onboarding Helper",
    "Legal Reviewer",
    "HR Assistant",
    "Finance Copilot",
    "Marketing Brainstorm",
    "Product Spec Writer",
    "Customer Success Bot",
    "Engineering Standup",
    "Recruiting Screener",
    "Meeting Notes Summarizer",
    "Competitive Analysis",
    "Contract Drafting",
    "Incident Responder",
    "Release Notes Writer",
    "Design Feedback",
    "Sales Call Coach",
    "Expense Auditor",
    "Content Localization",
    "Churn Risk Analyzer",
    "Roadmap Planner",
    "QA Test Generator",
  ],
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
    "Command R+",
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

function buildMockEntities(
  category: keyof typeof MOCK_ENTITY_NAMES,
  names: string[]
): UsageFilterEntity[] {
  return names.map((name, index) => ({
    id: `${category}_${index + 1}`,
    name,
    scope:
      category === "agent"
        ? USAGE_FILTER_SCOPES[index % USAGE_FILTER_SCOPES.length]
        : undefined,
    lab: category === "model" ? MOCK_MODEL_LAB[name] : undefined,
    tier:
      category === "model"
        ? USAGE_MODEL_TIERS[index % USAGE_MODEL_TIERS.length]
        : undefined,
  }));
}

export const USAGE_FILTER_MOCK_ENTITIES = {
  agent: buildMockEntities("agent", MOCK_ENTITY_NAMES.agent),
  model: buildMockEntities("model", MOCK_ENTITY_NAMES.model),
  tool: buildMockEntities("tool", MOCK_ENTITY_NAMES.tool),
  skill: buildMockEntities("skill", MOCK_ENTITY_NAMES.skill),
  source: MOCK_SOURCE_CONNECTORS.map((connector, index) => ({
    id: `source_${index + 1}`,
    name: connector.name,
    connectorProvider: connector.connectorProvider,
  })),
};
