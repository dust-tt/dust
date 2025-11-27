/**
 * SQL queries for extracting data for agent evaluation.
 *
 * These queries are designed to be run against the Dust database to extract:
 * - Agent prompt/configuration
 * - Conversations with messages
 * - User feedback
 *
 * Usage: Copy these queries and run them in your database client, replacing
 * the placeholders with actual values. Export results as JSON files to the
 * runs/[clientName]/ folder.
 *
 * SQL files:
 * - 1_prompt.sql -> runs/[clientName]/prompt.json
 * - 1_conversations.sql -> runs/[clientName]/conversations.json
 * - 1_feedback.sql -> runs/[clientName]/feedback.json
 */

import * as fs from "fs";
import * as path from "path";

const SQL_FILES = {
  PROMPT: "1_prompt.sql",
  CONVERSATIONS: "1_conversations.sql",
  FEEDBACK: "1_feedback.sql",
} as const;

function loadQuery(filename: string): string {
  const filePath = path.join(__dirname, filename);
  return fs.readFileSync(filePath, "utf-8");
}

export const QUERIES = {
  get PROMPT() {
    return loadQuery(SQL_FILES.PROMPT);
  },
  get CONVERSATIONS() {
    return loadQuery(SQL_FILES.CONVERSATIONS);
  },
  get FEEDBACK() {
    return loadQuery(SQL_FILES.FEEDBACK);
  },
} as const;

/**
 * Helper to print a query with parameters replaced.
 */
export function getQueryWithParams(
  queryName: keyof typeof QUERIES,
  params: {
    workspaceSId: string;
    agentSId: string;
    conversationLimit?: number;
  }
): string {
  let query: string = QUERIES[queryName];

  query = query.replace(/WORKSPACE_SID/g, params.workspaceSId);
  query = query.replace(/AGENT_SID/g, params.agentSId);

  if (params.conversationLimit !== undefined) {
    query = query.replace(
      /CONVERSATION_LIMIT/g,
      params.conversationLimit.toString()
    );
  }

  return query;
}

// Print queries when run directly
if (require.main === module) {
  console.log("=".repeat(80));
  console.log("SQL QUERIES FOR AGENT EVALUATION");
  console.log("=".repeat(80));
  console.log("\nReplace the following placeholders with actual values:");
  console.log("  - WORKSPACE_SID: Your workspace sId");
  console.log("  - AGENT_SID: The agent configuration sId");
  console.log("  - CONVERSATION_LIMIT: Number of conversations to fetch");
  console.log("\n");

  for (const [name, filename] of Object.entries(SQL_FILES)) {
    console.log("=".repeat(80));
    console.log(`QUERY: ${name} (from ${filename})`);
    console.log("=".repeat(80));
    console.log(loadQuery(filename));
    console.log("\n");
  }
}
