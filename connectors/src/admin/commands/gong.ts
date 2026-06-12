import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  connectorId: z.number().optional().describe("Connector ID"),
  fromTs: z.number().optional().describe("From timestamp"),
  callId: z.string().optional().describe("Call ID"),
});

const SUBCOMMANDS = ["delete-transcript", "force-resync"] as const;

export const gongCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["gong", subcommand],
    description: `Gong ${subcommand}`,
    groupDescription: "Gong connector management",
    schema: argsSchema,
    async run(args) {
      const { gong } = await import("@connectors/connectors/gong/lib/cli");
      return gong({
        majorCommand: "gong",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
