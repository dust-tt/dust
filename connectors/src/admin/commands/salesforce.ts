import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  wId: z.string().optional().describe("Workspace ID"),
  dsId: z.string().optional().describe("Data source ID"),
  soql: z.string().optional().describe("SOQL query"),
  limit: z.number().optional().describe("Result limit"),
  lastModifiedDateOrder: z
    .union([z.literal("ASC"), z.literal("DESC")])
    .optional()
    .describe("Last modified date order (ASC | DESC)"),
  offset: z.number().optional().describe("Result offset"),
  rootNodeName: z.string().optional().describe("Root node name"),
  titleTemplate: z.string().optional().describe("Title template"),
  contentTemplate: z.string().optional().describe("Content template"),
  tagsTemplate: z.string().optional().describe("Tags template"),
  execute: z.boolean().optional().describe("Execute the query"),
  queryId: z.number().optional().describe("Query ID"),
  full: z.boolean().optional().describe("Full sync"),
});

const SUBCOMMANDS = [
  "check-connection",
  "run-soql",
  "setup-synced-query",
  "sync-query",
] as const;

export const salesforceCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["salesforce", subcommand],
    description: `Salesforce ${subcommand}`,
    groupDescription: "Salesforce connector management",
    schema: argsSchema,
    async run(args) {
      const { salesforce } = await import(
        "@connectors/connectors/salesforce/lib/cli"
      );
      return salesforce({
        majorCommand: "salesforce",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
