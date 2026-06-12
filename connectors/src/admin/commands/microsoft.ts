import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  wId: z.string().optional().describe("Workspace ID"),
  dsId: z.string().optional().describe("Data source ID"),
  connectorId: z.string().optional().describe("Connector ID"),
  folderId: z.string().optional().describe("Folder ID"),
  internalId: z.string().optional().describe("Internal node ID"),
  idsFile: z
    .string()
    .optional()
    .describe("Path to JSON file containing array of IDs"),
  reason: z.string().optional().describe("Reason"),
});

const SUBCOMMANDS = [
  "check-file",
  "garbage-collect-all",
  "get-parents",
  "restart-all-incremental-sync-workflows",
  "skip-file",
  "start-full-sync",
  "start-incremental-sync",
  "sync-node",
  "update-core-parents",
  "update-parent-in-node-table",
] as const;

export const microsoftCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["microsoft", subcommand],
    description: `Microsoft ${subcommand}`,
    groupDescription: "Microsoft connector management",
    schema: argsSchema,
    async run(args) {
      const { microsoft } = await import(
        "@connectors/connectors/microsoft/lib/cli"
      );
      return microsoft({
        majorCommand: "microsoft",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
