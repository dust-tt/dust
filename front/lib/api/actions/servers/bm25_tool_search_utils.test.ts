import type { ToolMeta } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { AGENT_MEMORY_SERVER } from "@app/lib/api/actions/servers/agent_memory/metadata";
import { ASHBY_SERVER } from "@app/lib/api/actions/servers/ashby/metadata";
import type { ServerEntry } from "@app/lib/api/actions/servers/bm25";
import { CLARI_COPILOT_SERVER } from "@app/lib/api/actions/servers/clari_copilot/metadata";
import { COMMON_UTILITIES_SERVER } from "@app/lib/api/actions/servers/common_utilities/metadata";
import { CONFLUENCE_SERVER } from "@app/lib/api/actions/servers/confluence/metadata";
import { CONVERSATION_FILES_SERVER } from "@app/lib/api/actions/servers/conversation_files/metadata";
import { CONVERSATION_SIDE_PANEL_SERVER } from "@app/lib/api/actions/servers/conversation_side_panel/metadata";
import { DATA_SOURCES_FILE_SYSTEM_SERVER } from "@app/lib/api/actions/servers/data_sources_file_system/metadata";
import { DATA_WAREHOUSES_SERVER } from "@app/lib/api/actions/servers/data_warehouses/metadata";
import { EXA_SERVER } from "@app/lib/api/actions/servers/exa/metadata";
import { EXTRACT_DATA_SERVER } from "@app/lib/api/actions/servers/extract_data/metadata";
import { FATHOM_SERVER } from "@app/lib/api/actions/servers/fathom/metadata";
import { FILE_GENERATION_SERVER } from "@app/lib/api/actions/servers/file_generation/metadata";
import { FILES_SERVER } from "@app/lib/api/actions/servers/files/metadata";
import { FRESHSERVICE_SERVER } from "@app/lib/api/actions/servers/freshservice/metadata";
import { FRONT_SERVER } from "@app/lib/api/actions/servers/front/metadata";
import { GITHUB_SERVER } from "@app/lib/api/actions/servers/github/metadata";
import { GMAIL_SERVER } from "@app/lib/api/actions/servers/gmail/metadata";
import { GONG_SERVER } from "@app/lib/api/actions/servers/gong/metadata";
import { GOOGLE_CALENDAR_SERVER } from "@app/lib/api/actions/servers/google_calendar/metadata";
import { GOOGLE_DRIVE_SERVER } from "@app/lib/api/actions/servers/google_drive/metadata";
import { GOOGLE_SHEETS_SERVER } from "@app/lib/api/actions/servers/google_sheets/metadata";
import {
  HTTP_CLIENT_SERVER,
  HTTP_CLIENT_TOOL_NAME,
} from "@app/lib/api/actions/servers/http_client/metadata";
import { HUBSPOT_SERVER } from "@app/lib/api/actions/servers/hubspot/metadata";
import { IMAGE_GENERATION_SERVER } from "@app/lib/api/actions/servers/image_generation/metadata";
import { INCLUDE_DATA_SERVER } from "@app/lib/api/actions/servers/include_data/metadata";
import { INTERACTIVE_CONTENT_SERVER } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { JIRA_SERVER } from "@app/lib/api/actions/servers/jira/metadata";
import { LUMA_SERVER } from "@app/lib/api/actions/servers/luma/metadata";
import { MICROSOFT_DRIVE_SERVER } from "@app/lib/api/actions/servers/microsoft_drive/metadata";
import { MICROSOFT_EXCEL_SERVER } from "@app/lib/api/actions/servers/microsoft_excel/metadata";
import { MICROSOFT_TEAMS_SERVER } from "@app/lib/api/actions/servers/microsoft_teams/metadata";
import { MONDAY_SERVER } from "@app/lib/api/actions/servers/monday/metadata";
import { NOTION_SERVER } from "@app/lib/api/actions/servers/notion/metadata";
import { OPENAI_USAGE_SERVER } from "@app/lib/api/actions/servers/openai_usage/metadata";
import { OUTLOOK_CALENDAR_SERVER } from "@app/lib/api/actions/servers/outlook/calendar_metadata";
import { OUTLOOK_MAIL_SERVER } from "@app/lib/api/actions/servers/outlook/mail_metadata";
import { POD_MANAGER_SERVER } from "@app/lib/api/actions/servers/pod_manager/metadata";
import { PRODUCTBOARD_SERVER } from "@app/lib/api/actions/servers/productboard/metadata";
import { QUERY_TABLES_V2_SERVER } from "@app/lib/api/actions/servers/query_tables_v2/metadata";
import {
  getRunAgentToolDescription,
  RUN_AGENT_CONFIGURABLE_PROPERTIES,
  RUN_AGENT_TOOL_SCHEMA,
} from "@app/lib/api/actions/servers/run_agent/metadata";
import { SALESFORCE_SERVER } from "@app/lib/api/actions/servers/salesforce/metadata";
import { SALESLOFT_SERVER } from "@app/lib/api/actions/servers/salesloft/metadata";
import { SERVICENOW_SERVER } from "@app/lib/api/actions/servers/servicenow/metadata";
import { SHOPIFY_SERVER } from "@app/lib/api/actions/servers/shopify/metadata";
import { SLAB_SERVER } from "@app/lib/api/actions/servers/slab/metadata";
import { SLACK_BOT_SERVER } from "@app/lib/api/actions/servers/slack_bot/metadata";
import { SLACK_PERSONAL_SERVER } from "@app/lib/api/actions/servers/slack_personal/metadata";
import { SNOWFLAKE_SERVER } from "@app/lib/api/actions/servers/snowflake/metadata";
import { SOUND_STUDIO_SERVER } from "@app/lib/api/actions/servers/sound_studio/metadata";
import { SPEECH_GENERATOR_SERVER } from "@app/lib/api/actions/servers/speech_generator/metadata";
import { STATUSPAGE_SERVER } from "@app/lib/api/actions/servers/statuspage/metadata";
import { UKG_READY_SERVER } from "@app/lib/api/actions/servers/ukg_ready/metadata";
import { USER_MEMORY_SERVER } from "@app/lib/api/actions/servers/user_memory/metadata";
import { VAL_TOWN_SERVER } from "@app/lib/api/actions/servers/val_town/metadata";
import { VANTA_SERVER } from "@app/lib/api/actions/servers/vanta/metadata";
import { WAKEUPS_SERVER } from "@app/lib/api/actions/servers/wakeups/metadata";
import { WEB_SEARCH_BROWSE_SERVER } from "@app/lib/api/actions/servers/web_search_browse/metadata";
import { WORKSPACE_ANALYTICS_SERVER } from "@app/lib/api/actions/servers/workspace_analytics/metadata";
import { ZENDESK_SERVER } from "@app/lib/api/actions/servers/zendesk/metadata";
import type { JSONSchema7 } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export interface LabeledQuery {
  query: string;
  expected: string;
  maxRank?: number;
}

const RUN_AGENT_SAMPLE_TOOL_SCHEMA = {
  ...RUN_AGENT_TOOL_SCHEMA,
  ...RUN_AGENT_CONFIGURABLE_PROPERTIES,
};

type ToolSource = Pick<ToolMeta, "name" | "description" | "schema">;

const RUN_AGENT_SAMPLE_TOOLS = [
  {
    name: "run_ResearchAnalyst",
    description: getRunAgentToolDescription({
      executionMode: "run-agent",
      childAgentName: "ResearchAnalyst",
      childAgentDescription:
        "Competitive market and customer research specialist for pricing, positioning, and source gathering.",
    }),
    schema: RUN_AGENT_SAMPLE_TOOL_SCHEMA,
  },
  {
    name: "run_SupportTriage",
    description: getRunAgentToolDescription({
      executionMode: "run-agent",
      childAgentName: "SupportTriage",
      childAgentDescription:
        "Customer support specialist that investigates tickets, refunds, escalations, and account issues.",
    }),
    schema: RUN_AGENT_SAMPLE_TOOL_SCHEMA,
  },
  {
    name: "run_CodeReviewer",
    description: getRunAgentToolDescription({
      executionMode: "run-agent",
      childAgentName: "CodeReviewer",
      childAgentDescription:
        "Engineering reviewer for pull requests, regressions, implementation risks, and test coverage.",
    }),
    schema: RUN_AGENT_SAMPLE_TOOL_SCHEMA,
  },
] as const satisfies readonly ToolSource[];

const SERVER_SOURCES: Array<{
  name: string;
  tools: readonly ToolSource[];
}> = [
  { name: "agent_memory", tools: AGENT_MEMORY_SERVER.tools },
  { name: "conversation_files", tools: CONVERSATION_FILES_SERVER.tools },
  {
    name: "conversation_side_panel",
    tools: CONVERSATION_SIDE_PANEL_SERVER.tools,
  },
  { name: "google_drive", tools: GOOGLE_DRIVE_SERVER.tools },
  { name: "google_sheets", tools: GOOGLE_SHEETS_SERVER.tools },
  { name: "microsoft_drive", tools: MICROSOFT_DRIVE_SERVER.tools },
  { name: "jira", tools: JIRA_SERVER.tools },
  { name: "zendesk", tools: ZENDESK_SERVER.tools },
  { name: "front", tools: FRONT_SERVER.tools },
  { name: "freshservice", tools: FRESHSERVICE_SERVER.tools },
  { name: "slack", tools: SLACK_PERSONAL_SERVER.tools },
  { name: "slack_bot", tools: SLACK_BOT_SERVER.tools },
  { name: "microsoft_teams", tools: MICROSOFT_TEAMS_SERVER.tools },
  { name: "monday", tools: MONDAY_SERVER.tools },
  { name: "notion", tools: NOTION_SERVER.tools },
  { name: "outlook", tools: OUTLOOK_MAIL_SERVER.tools },
  { name: "outlook_calendar", tools: OUTLOOK_CALENDAR_SERVER.tools },
  { name: "wakeups", tools: WAKEUPS_SERVER.tools },
  { name: "confluence", tools: CONFLUENCE_SERVER.tools },
  { name: "hubspot", tools: HUBSPOT_SERVER.tools },
  { name: "include_data", tools: INCLUDE_DATA_SERVER.tools },
  { name: "salesforce", tools: SALESFORCE_SERVER.tools },
  { name: "salesloft", tools: SALESLOFT_SERVER.tools },
  { name: "servicenow", tools: SERVICENOW_SERVER.tools },
  { name: "shopify", tools: SHOPIFY_SERVER.tools },
  { name: "slab", tools: SLAB_SERVER.tools },
  { name: "sound_studio", tools: SOUND_STUDIO_SERVER.tools },
  { name: "speech_generator", tools: SPEECH_GENERATOR_SERVER.tools },
  { name: "statuspage", tools: STATUSPAGE_SERVER.tools },
  { name: "ukg_ready", tools: UKG_READY_SERVER.tools },
  { name: "interactive_content", tools: INTERACTIVE_CONTENT_SERVER.tools },
  { name: "snowflake", tools: SNOWFLAKE_SERVER.tools },
  {
    name: "run_agent",
    tools: RUN_AGENT_SAMPLE_TOOLS,
  },
  { name: "data_warehouses", tools: DATA_WAREHOUSES_SERVER.tools },
  { name: "query_tables_v2", tools: QUERY_TABLES_V2_SERVER.tools },
  { name: "pod_manager", tools: POD_MANAGER_SERVER.tools },
  { name: "productboard", tools: PRODUCTBOARD_SERVER.tools },
  { name: "sound_studio", tools: SOUND_STUDIO_SERVER.tools },
  { name: "speech_generator", tools: SPEECH_GENERATOR_SERVER.tools },
  { name: "statuspage", tools: STATUSPAGE_SERVER.tools },
  { name: "val_town", tools: VAL_TOWN_SERVER.tools },
  { name: "vanta", tools: VANTA_SERVER.tools },
  {
    name: "workspace_analytics",
    tools: WORKSPACE_ANALYTICS_SERVER.tools,
  },
  { name: "ashby", tools: ASHBY_SERVER.tools },
  {
    name: "web_search_&_browse",
    tools: WEB_SEARCH_BROWSE_SERVER.tools,
  },
  { name: "clari_copilot", tools: CLARI_COPILOT_SERVER.tools },
  { name: "image_generation", tools: IMAGE_GENERATION_SERVER.tools },
  { name: "file_generation", tools: FILE_GENERATION_SERVER.tools },
  { name: "fathom", tools: FATHOM_SERVER.tools },
  { name: "luma", tools: LUMA_SERVER.tools },
  { name: "extract_data", tools: EXTRACT_DATA_SERVER.tools },
  { name: "gong", tools: GONG_SERVER.tools },
  { name: "files", tools: FILES_SERVER.tools },
  { name: "gmail", tools: GMAIL_SERVER.tools },
  { name: "google_calendar", tools: GOOGLE_CALENDAR_SERVER.tools },
  { name: "github", tools: GITHUB_SERVER.tools },
  {
    // http_client re-exports the web_search_&_browse tools, which are already
    // indexed under their own server above; only index its own send_request
    // tool here to avoid duplicate documents.
    name: HTTP_CLIENT_TOOL_NAME,
    tools: HTTP_CLIENT_SERVER.tools.filter((t) => t.name === "send_request"),
  },
  { name: "common_utilities", tools: COMMON_UTILITIES_SERVER.tools },
  { name: "exa_people_and_company", tools: EXA_SERVER.tools },
  { name: "microsoft_excel", tools: MICROSOFT_EXCEL_SERVER.tools },
  { name: "openai_usage", tools: OPENAI_USAGE_SERVER.tools },
  {
    name: "data_sources_file_system",
    tools: DATA_SOURCES_FILE_SYSTEM_SERVER.tools,
  },
  { name: "user_memory", tools: USER_MEMORY_SERVER.tools },
];

export const SERVERS: ServerEntry[] = SERVER_SOURCES.map(({ name, tools }) => ({
  name,
  tools: tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: zodToJsonSchema(z.object(tool.schema)) as JSONSchema7,
  })),
}));
