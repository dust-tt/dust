import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  force: z.literal("true").optional().describe('Force ("true")'),
  connectorId: z.number().optional().describe("Connector ID"),
  conversationId: z.number().optional().describe("Conversation ID"),
  day: z.string().optional().describe("Day"),
  helpCenterId: z.number().optional().describe("Help center ID"),
  conversationsSlidingWindow: z
    .number()
    .optional()
    .describe("Conversations sliding window"),
  teamId: z.number().optional().describe("Team ID"),
  closedAfter: z.number().optional().describe("Closed after timestamp"),
  state: z
    .union([z.literal("open"), z.literal("closed")])
    .optional()
    .describe("Conversation state (open | closed)"),
  cursor: z.string().optional().describe("Pagination cursor"),
  forceDeleteExisting: z
    .literal("true")
    .optional()
    .describe('Force delete existing ("true")'),
});

const SUBCOMMANDS = [
  "check-conversation",
  "check-missing-conversations",
  "check-teams",
  "fetch-articles",
  "fetch-conversation",
  "force-resync-all-conversations",
  "force-resync-articles",
  "get-conversations-sliding-window",
  "restart-schedules",
  "search-conversations",
  "set-conversations-sliding-window",
] as const;

export const intercomCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["intercom", subcommand],
    description: `Intercom ${subcommand}`,
    groupDescription: "Intercom connector management",
    schema: argsSchema,
    async run(args) {
      const { intercom } = await import(
        "@connectors/connectors/intercom/lib/cli"
      );
      return intercom({
        majorCommand: "intercom",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
