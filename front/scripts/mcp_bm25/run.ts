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

import { CONFLUENCE_SERVER } from "@app/lib/api/actions/servers/confluence/metadata";
import { FRESHSERVICE_SERVER } from "@app/lib/api/actions/servers/freshservice/metadata";
import { FRONT_SERVER } from "@app/lib/api/actions/servers/front/metadata";
import { GOOGLE_DRIVE_SERVER } from "@app/lib/api/actions/servers/google_drive/metadata";
import { GOOGLE_SHEETS_SERVER } from "@app/lib/api/actions/servers/google_sheets/metadata";
import { HUBSPOT_SERVER } from "@app/lib/api/actions/servers/hubspot/metadata";
import { INTERACTIVE_CONTENT_SERVER } from "@app/lib/api/actions/servers/interactive_content/metadata";
import { JIRA_SERVER } from "@app/lib/api/actions/servers/jira/metadata";
import { MICROSOFT_DRIVE_SERVER } from "@app/lib/api/actions/servers/microsoft_drive/metadata";
import { MICROSOFT_TEAMS_SERVER } from "@app/lib/api/actions/servers/microsoft_teams/metadata";
import { SALESFORCE_SERVER } from "@app/lib/api/actions/servers/salesforce/metadata";
import { SLACK_BOT_SERVER } from "@app/lib/api/actions/servers/slack_bot/metadata";
import { SLACK_PERSONAL_SERVER } from "@app/lib/api/actions/servers/slack_personal/metadata";
import { SNOWFLAKE_SERVER } from "@app/lib/api/actions/servers/snowflake/metadata";
import { ZENDESK_SERVER } from "@app/lib/api/actions/servers/zendesk/metadata";
import { buildIndex, rank } from "@app/scripts/mcp_bm25/bm25";
import type { ServerEntry } from "@app/scripts/mcp_bm25/corpus";
import { buildDocs } from "@app/scripts/mcp_bm25/corpus";
import { QUERIES } from "@app/scripts/mcp_bm25/queries";

const SERVERS: ServerEntry[] = [
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
  { name: "confluence", tools: CONFLUENCE_SERVER.tools },
  { name: "hubspot", tools: HUBSPOT_SERVER.tools },
  { name: "salesforce", tools: SALESFORCE_SERVER.tools },
  { name: "interactive_content", tools: INTERACTIVE_CONTENT_SERVER.tools },
  { name: "snowflake", tools: SNOWFLAKE_SERVER.tools },
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
