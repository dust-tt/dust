// Diagnostic: runs the BM25 retrieval check over the registered MCP servers and
// the labeled query set, printing the rank of each expected tool, the queries
// that miss (expected tool outside its allowed rank), and a top-1 summary.
//
// It reads descriptions from the live server metadata, so the numbers reflect
// what a tool-search index would actually see (full input schema included).
// A miss usually means a description lacks the intent vocabulary, collides with
// a sibling/cross-server tool, or is diluted by an oversized parameter
// description (BM25 length normalization). Always exits 0; it is a tool to guide
// description work, not a CI gate.
//
// Usage: npx tsx scripts/mcp_bm25/run.ts   (from the front/ directory)

import { AGENT_MEMORY_SERVER } from "@app/lib/api/actions/servers/agent_memory/metadata";
import { ASHBY_SERVER } from "@app/lib/api/actions/servers/ashby/metadata";
import { CLARI_COPILOT_SERVER } from "@app/lib/api/actions/servers/clari_copilot/metadata";
import { CONFLUENCE_SERVER } from "@app/lib/api/actions/servers/confluence/metadata";
import { CONVERSATION_FILES_SERVER } from "@app/lib/api/actions/servers/conversation_files/metadata";
import { DATA_WAREHOUSES_SERVER } from "@app/lib/api/actions/servers/data_warehouses/metadata";
import { FRESHSERVICE_SERVER } from "@app/lib/api/actions/servers/freshservice/metadata";
import { FRONT_SERVER } from "@app/lib/api/actions/servers/front/metadata";
import { GOOGLE_DRIVE_SERVER } from "@app/lib/api/actions/servers/google_drive/metadata";
import { GOOGLE_SHEETS_SERVER } from "@app/lib/api/actions/servers/google_sheets/metadata";
import { HUBSPOT_SERVER } from "@app/lib/api/actions/servers/hubspot/metadata";
import { INCLUDE_DATA_SERVER } from "@app/lib/api/actions/servers/include_data/metadata";
import { INTERACTIVE_CONTENT_SERVER } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { JIRA_SERVER } from "@app/lib/api/actions/servers/jira/metadata";
import { MICROSOFT_DRIVE_SERVER } from "@app/lib/api/actions/servers/microsoft_drive/metadata";
import { MICROSOFT_TEAMS_SERVER } from "@app/lib/api/actions/servers/microsoft_teams/metadata";
import { MONDAY_SERVER } from "@app/lib/api/actions/servers/monday/metadata";
import { NOTION_SERVER } from "@app/lib/api/actions/servers/notion/metadata";
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
import { SLAB_SERVER } from "@app/lib/api/actions/servers/slab/metadata";
import { SLACK_BOT_SERVER } from "@app/lib/api/actions/servers/slack_bot/metadata";
import { SLACK_PERSONAL_SERVER } from "@app/lib/api/actions/servers/slack_personal/metadata";
import { SNOWFLAKE_SERVER } from "@app/lib/api/actions/servers/snowflake/metadata";
import { SOUND_STUDIO_SERVER } from "@app/lib/api/actions/servers/sound_studio/metadata";
import { SPEECH_GENERATOR_SERVER } from "@app/lib/api/actions/servers/speech_generator/metadata";
import { STATUSPAGE_SERVER } from "@app/lib/api/actions/servers/statuspage/metadata";
import { UKG_READY_SERVER } from "@app/lib/api/actions/servers/ukg_ready/metadata";
import { VAL_TOWN_SERVER } from "@app/lib/api/actions/servers/val_town/metadata";
import { VANTA_SERVER } from "@app/lib/api/actions/servers/vanta/metadata";
import { WAKEUPS_SERVER } from "@app/lib/api/actions/servers/wakeups/metadata";
import { WEB_SEARCH_BROWSE_SERVER } from "@app/lib/api/actions/servers/web_search_browse/metadata";
import { WORKDAY_SERVER } from "@app/lib/api/actions/servers/workday/metadata";
import { WORKSPACE_ANALYTICS_SERVER } from "@app/lib/api/actions/servers/workspace_analytics/metadata";
import { ZENDESK_SERVER } from "@app/lib/api/actions/servers/zendesk/metadata";
import { buildIndex, rank } from "@app/scripts/mcp_bm25/bm25";
import type { ServerEntry } from "@app/scripts/mcp_bm25/corpus";
import { buildDocs } from "@app/scripts/mcp_bm25/corpus";
import { QUERIES } from "@app/scripts/mcp_bm25/queries";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const RUN_AGENT_SAMPLE_TOOL_SCHEMA = zodToJsonSchema(
  z.object({
    ...RUN_AGENT_TOOL_SCHEMA,
    ...RUN_AGENT_CONFIGURABLE_PROPERTIES,
  })
) as JSONSchema;

// run_agent tools are dynamic: one tool per configured child agent. The static
// server metadata only contains the builder placeholder, which is never exposed
// to an agent, so the harness adds representative child-agent tools instead.
const RUN_AGENT_SAMPLE_TOOLS: ServerEntry["tools"] = [
  {
    name: "run_ResearchAnalyst",
    description: getRunAgentToolDescription({
      executionMode: "run-agent",
      childAgentName: "ResearchAnalyst",
      childAgentDescription:
        "Competitive market and customer research specialist for pricing, positioning, and source gathering.",
    }),
    inputSchema: RUN_AGENT_SAMPLE_TOOL_SCHEMA,
  },
  {
    name: "run_SupportTriage",
    description: getRunAgentToolDescription({
      executionMode: "run-agent",
      childAgentName: "SupportTriage",
      childAgentDescription:
        "Customer support specialist that investigates tickets, refunds, escalations, and account issues.",
    }),
    inputSchema: RUN_AGENT_SAMPLE_TOOL_SCHEMA,
  },
  {
    name: "run_CodeReviewer",
    description: getRunAgentToolDescription({
      executionMode: "run-agent",
      childAgentName: "CodeReviewer",
      childAgentDescription:
        "Engineering reviewer for pull requests, regressions, implementation risks, and test coverage.",
    }),
    inputSchema: RUN_AGENT_SAMPLE_TOOL_SCHEMA,
  },
];

const SERVERS: ServerEntry[] = [
  { name: "agent_memory", tools: AGENT_MEMORY_SERVER.tools },
  { name: "conversation_files", tools: CONVERSATION_FILES_SERVER.tools },
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
  { name: "workday", tools: WORKDAY_SERVER.tools },
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
];

function out(line: string): void {
  process.stdout.write(line + "\n");
}

function main(): void {
  const docs = buildDocs(SERVERS);
  const idx = buildIndex(docs);

  out(
    `Corpus: ${docs.length} tools across ${SERVERS.length} servers, ${QUERIES.length} queries\n`
  );
  out(
    "query".padEnd(54) +
      "expected".padEnd(38) +
      "rank".padStart(5) +
      "  top hit"
  );
  out("-".repeat(130));

  let passed = 0;
  let top1 = 0;
  for (const { query, expected, maxRank = 1 } of QUERIES) {
    const ranked = rank(query, idx);
    const pos = ranked.findIndex((r) => r.name === expected) + 1;
    const ok = pos >= 1 && pos <= maxRank;
    if (ok) {
      passed++;
    }
    if (pos === 1) {
      top1++;
    }
    const flag = ok ? "" : "  <-- MISS";
    out(
      query.padEnd(54) +
        expected.padEnd(38) +
        String(pos).padStart(5) +
        "  " +
        (ranked[0]?.name ?? "(none)") +
        flag
    );
  }

  out("-".repeat(130));
  out(
    `top-1: ${top1}/${QUERIES.length}  |  within maxRank: ${passed}/${QUERIES.length}`
  );
}

main();
