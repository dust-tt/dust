import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  connectorId: z.string().optional().describe("Connector ID"),
  crawlFrequency: z.string().optional().describe("Crawl frequency"),
  actions: z.string().optional().describe("Actions"),
});

const SUBCOMMANDS = [
  "set-actions",
  "start-scheduler",
  "update-frequency",
] as const;

export const webcrawlerCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["webcrawler", subcommand],
    description: `Webcrawler ${subcommand}`,
    groupDescription: "Web crawler connector management",
    schema: argsSchema,
    async run(args) {
      const { webcrawler } = await import("@connectors/lib/cli");
      return webcrawler({
        majorCommand: "webcrawler",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
