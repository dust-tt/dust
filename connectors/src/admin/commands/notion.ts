import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  wId: z.string().optional().describe("Workspace ID"),
  dsId: z.string().optional().describe("Data source ID"),
  connectorId: z.string().optional().describe("Connector ID"),
  pageId: z.string().optional().describe("Page ID"),
  databaseId: z.string().optional().describe("Database ID"),
  query: z.string().optional().describe("Search query"),
  url: z.string().optional().describe("URL"),
  method: z.string().optional().describe("HTTP method (GET | POST)"),
  body: z.string().optional().describe("Request body (JSON string)"),
  remove: z.string().optional().describe("Remove skip reason (true/false)"),
  reason: z.string().optional().describe("Skip reason"),
  all: z.string().optional().describe("Apply to all connectors (true/false)"),
  resetToDate: z
    .string()
    .optional()
    .describe("Reset parentsLastUpdatedAt to this date"),
  forceResync: z.string().optional().describe("Force resync (true/false)"),
});

const SUBCOMMANDS = [
  "api-request",
  "check-url",
  "clear-parents-last-updated-at",
  "delete-url",
  "find-url",
  "me",
  "search-pages",
  "skip-database",
  "skip-page",
  "stop-all-garbage-collectors",
  "update-core-parents",
  "update-orphaned-resources-parents",
  "update-parents-fields",
  "upsert-database",
  "upsert-page",
] as const;

export const notionCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["notion", subcommand],
    description: `Notion ${subcommand}`,
    groupDescription: "Notion connector management",
    schema: argsSchema,
    async run(args) {
      const { notion } = await import("@connectors/connectors/notion/lib/cli");
      return notion({
        majorCommand: "notion",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
