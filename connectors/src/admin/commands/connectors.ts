import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  wId: z.string().optional().describe("Workspace ID"),
  dsId: z.string().optional().describe("Data source ID"),
  connectorId: z.string().optional().describe("Connector ID"),
  fromTs: z.string().optional().describe("Sync from this Unix timestamp (ms)"),
  error: z.string().optional().describe("Error type to set"),
  permissionKey: z.string().optional().describe("Permission key"),
  permissionValue: z.string().optional().describe("Permission value"),
  permissionsFile: z
    .string()
    .optional()
    .describe("Path to permissions JSON file"),
});

const SUBCOMMANDS = [
  "clear-error",
  "delete",
  "full-resync",
  "garbage-collect",
  "get-parents",
  "pause",
  "restart",
  "resume",
  "set-error",
  "set-permission",
  "stop",
  "unpause",
] as const;

export const connectorsCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["connectors", subcommand],
    description: `${subcommand} connector`,
    groupDescription: "Generic connector lifecycle operations",
    schema: argsSchema,
    async run(args) {
      const { connectors } = await import("@connectors/lib/cli");
      return connectors({
        majorCommand: "connectors",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
