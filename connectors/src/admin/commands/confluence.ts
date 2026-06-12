import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  connectorId: z.number().optional().describe("Connector ID"),
  pageId: z.number().optional().describe("Page ID"),
  spaceId: z.number().optional().describe("Space ID"),
  file: z.string().optional().describe("File path"),
  keyInFile: z.string().optional().describe("Key in file"),
  url: z.string().optional().describe("URL"),
  forceUpsert: z.literal("true").optional().describe('Force upsert ("true")'),
  skipReason: z.string().optional().describe("Skip reason"),
  skipFetch: z.literal("true").optional().describe('Skip fetch ("true")'),
});

const SUBCOMMANDS = [
  "check-page-exists",
  "check-space-access",
  "ignore-near-rate-limit",
  "me",
  "resolve-space-from-url",
  "skip-page",
  "sync-space",
  "unignore-near-rate-limit",
  "update-parents",
  "upsert-page",
  "upsert-pages",
] as const;

export const confluenceCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["confluence", subcommand],
    description: `Confluence ${subcommand}`,
    groupDescription: "Confluence connector management",
    schema: argsSchema,
    async run(args) {
      const { confluence } = await import(
        "@connectors/connectors/confluence/lib/cli"
      );
      return confluence({
        majorCommand: "confluence",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
