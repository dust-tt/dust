import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  wId: z.string().optional().describe("Workspace ID"),
  dsId: z.string().optional().describe("Data source ID"),
  connectorId: z.number().optional().describe("Connector ID"),
  brandId: z.number().nullable().optional().describe("Brand ID"),
  query: z.string().optional().describe("Query"),
  forceResync: z.literal("true").optional().describe('Force resync ("true")'),
  ticketId: z.number().optional().describe("Ticket ID"),
  ticketUrl: z.string().optional().describe("Ticket URL"),
  retentionPeriodDays: z
    .number()
    .optional()
    .describe("Retention period in days"),
  rateLimitTps: z.number().optional().describe("Rate limit TPS"),
  tag: z.string().optional().describe("Tag"),
  include: z.literal("true").optional().describe('Include ("true")'),
  exclude: z.literal("true").optional().describe('Exclude ("true")'),
});

const SUBCOMMANDS = [
  "add-organization-tag",
  "add-ticket-tag",
  "check-is-admin",
  "count-tickets",
  "fetch-brand",
  "fetch-ticket",
  "get-retention-period",
  "remove-organization-tag",
  "remove-ticket-tag",
  "resync-brand-metadata",
  "resync-help-centers",
  "resync-tickets",
  "set-rate-limit",
  "set-retention-period",
  "sync-ticket",
] as const;

export const zendeskCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["zendesk", subcommand],
    description: `Zendesk ${subcommand}`,
    groupDescription: "Zendesk connector management",
    schema: argsSchema,
    async run(args) {
      const { zendesk } = await import(
        "@connectors/connectors/zendesk/lib/cli"
      );
      return zendesk({
        majorCommand: "zendesk",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
