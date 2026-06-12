import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  provider: z.string().optional().describe("Connector provider type"),
  fromTs: z.string().optional().describe("Sync from this Unix timestamp (ms)"),
});

const SUBCOMMANDS = [
  "full-resync",
  "restart-all",
  "stop-all",
  "resume-all",
] as const;

export const batchCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["batch", subcommand],
    description: `Batch ${subcommand} across all connectors`,
    groupDescription:
      "Batch operations across all connectors of a given provider",
    schema: argsSchema,
    async run(args) {
      const { batch } = await import("@connectors/lib/cli");
      return batch({
        majorCommand: "batch",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
