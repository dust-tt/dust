import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  queue: z.string().optional().describe("Task queue name"),
});

const SUBCOMMANDS = ["check-queue", "find-unprocessed-workflows"] as const;

export const temporalCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["temporal", subcommand],
    description: `Temporal ${subcommand}`,
    groupDescription: "Temporal workflow inspection",
    schema: argsSchema,
    async run(args) {
      const { temporal } = await import("@connectors/lib/cli");
      return temporal({
        majorCommand: "temporal",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
