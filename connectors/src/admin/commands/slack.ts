import type { CliCommand } from "@connectors/admin/cli_registry";
import { z } from "zod";

const argsSchema = z.object({
  wId: z.string().optional().describe("Workspace ID"),
  channelId: z.string().optional().describe("Channel ID"),
  threadId: z.string().optional().describe("Thread ID"),
  threadTs: z.string().optional().describe("Thread timestamp"),
  skipReason: z.string().optional().describe("Skip reason"),
  whitelistedDomains: z.string().optional().describe("Comma-separated domains"),
  botName: z.string().optional().describe("Bot name"),
  groupId: z.string().optional().describe("Group ID (comma-separated)"),
  whitelistType: z
    .string()
    .optional()
    .describe("Whitelist type (summon_agent | index_messages)"),
  providerType: z
    .string()
    .optional()
    .describe("Provider type (slack | slack_bot)"),
  force: z.string().optional().describe("Force (true/false)"),
});

const SUBCOMMANDS = [
  "add-channel-to-sync",
  "check-channel",
  "cutover-legacy-bot",
  "delete-conversation",
  "enable-bot",
  "remove-channel-from-sync",
  "run-auto-join",
  "skip-channel",
  "skip-thread",
  "sync-channel",
  "sync-channel-metadata",
  "sync-thread",
  "uninstall-for-unknown-team-ids",
  "unskip-channel",
  "whitelist-bot",
  "whitelist-domains",
] as const;

export const slackCommands: CliCommand[] = SUBCOMMANDS.map(
  (subcommand): CliCommand => ({
    path: ["slack", subcommand],
    description: `Slack ${subcommand}`,
    groupDescription: "Slack connector management",
    schema: argsSchema,
    async run(args) {
      const { slack } = await import("@connectors/connectors/slack/lib/cli");
      return slack({
        majorCommand: "slack",
        command: subcommand,
        args: args as any,
      });
    },
  })
);
