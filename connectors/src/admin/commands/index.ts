import type { CliCommand } from "@connectors/admin/cli_registry";
import { batchCommands } from "@connectors/admin/commands/batch";
import { confluenceCommands } from "@connectors/admin/commands/confluence";
import { connectorsCommands } from "@connectors/admin/commands/connectors";
import { githubCommands } from "@connectors/admin/commands/github";
import { gongCommands } from "@connectors/admin/commands/gong";
import { googleDriveCommands } from "@connectors/admin/commands/google_drive";
import { intercomCommands } from "@connectors/admin/commands/intercom";
import { microsoftCommands } from "@connectors/admin/commands/microsoft";
import { notionCommands } from "@connectors/admin/commands/notion";
import { salesforceCommands } from "@connectors/admin/commands/salesforce";
import { slackCommands } from "@connectors/admin/commands/slack";
import { snowflakeCommands } from "@connectors/admin/commands/snowflake";
import { temporalCommands } from "@connectors/admin/commands/temporal";
import { webcrawlerCommands } from "@connectors/admin/commands/webcrawler";
import { zendeskCommands } from "@connectors/admin/commands/zendesk";

export const allCommands: CliCommand[] = [
  ...batchCommands,
  ...confluenceCommands,
  ...connectorsCommands,
  ...githubCommands,
  ...gongCommands,
  ...googleDriveCommands,
  ...intercomCommands,
  ...microsoftCommands,
  ...notionCommands,
  ...salesforceCommands,
  ...slackCommands,
  ...snowflakeCommands,
  ...temporalCommands,
  ...webcrawlerCommands,
  ...zendeskCommands,
];
