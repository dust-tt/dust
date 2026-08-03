import { Argument, Command } from "@commander-js/extra-typings";
import { AdminCommandSchema } from "@connectors/types";
import { fromError } from "zod-validation-error";

process.env.INTERACTIVE_CLI = process.env.INTERACTIVE_CLI || "1";

async function dispatch(
  majorCommand: string,
  subcommand: string,
  opts: Record<string, unknown>
): Promise<void> {
  const validation = AdminCommandSchema.safeParse({
    majorCommand,
    command: subcommand,
    args: opts,
  });
  if (!validation.success) {
    console.error(
      `\x1b[31mError: ${fromError(validation.error).toString()}\x1b[0m`
    );
    process.exit(1);
  }

  // Dynamic import: defers loading all connector code until a command is dispatched.
  // A static import loads every connector on every invocation, including --help.
  const { runCommand } = await import("@connectors/lib/cli");
  const result = await runCommand(validation.data);
  console.log(JSON.stringify(result, null, 2));
  console.error("\x1b[32mDone\x1b[0m");
}

const program = new Command();
program
  .name("cli")
  .description("Admin CLI for connectors")
  .addHelpCommand(false);

program
  .command("batch")
  .description("Batch operations across all connectors of a given provider")
  .addArgument(
    new Argument("<subcommand>").choices([
      "full-resync",
      "restart-all",
      "stop-all",
      "resume-all",
    ])
  )
  .option("--provider <provider>", "Connector provider type")
  .option("--fromTs <timestamp>", "Sync from this Unix timestamp (ms)")
  .action(async (subcommand: string, opts) => {
    await dispatch("batch", subcommand, opts);
  });

program
  .command("confluence")
  .description("Confluence connector management")
  .addArgument(
    new Argument("<subcommand>").choices([
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
    ])
  )
  .option("--connectorId <id>", "Connector ID", parseInt)
  .option("--pageId <id>", "Page ID", parseInt)
  .option("--spaceId <id>", "Space ID", parseInt)
  .option("--file <path>", "File path")
  .option("--keyInFile <key>", "Key in file")
  .option("--url <url>", "URL")
  .option("--forceUpsert <bool>", 'Force upsert ("true")')
  .option("--skipReason <reason>", "Skip reason")
  .option("--skipFetch <bool>", 'Skip fetch ("true")')
  .action(async (subcommand: string, opts) => {
    await dispatch("confluence", subcommand, opts);
  });

program
  .command("connectors")
  .description("Generic connector lifecycle operations")
  .addArgument(
    new Argument("<subcommand>").choices([
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
    ])
  )
  .option("--wId <workspaceId>", "Workspace ID")
  .option("--dsId <dataSourceId>", "Data source ID")
  .option("--connectorId <id>", "Connector ID")
  .option("--fromTs <timestamp>", "Sync from this Unix timestamp (ms)")
  .option("--error <errorType>", "Error type to set")
  .option("--permissionKey <key>", "Permission key (for set-permission)")
  .option("--permissionValue <value>", "Permission value (for set-permission)")
  .option(
    "--permissionsFile <path>",
    "Path to permissions JSON file (for set-permission)"
  )
  .action(async (subcommand: string, opts) => {
    await dispatch("connectors", subcommand, opts);
  });

program
  .command("github")
  .description("GitHub connector management")
  .addArgument(
    new Argument("<subcommand>").choices([
      "clear-installation-id",
      "code-sync",
      "force-daily-code-sync",
      "list-skipped-repos",
      "resync-repo",
      "resync-repo-code",
      "skip-code-file",
      "skip-issue",
      "skip-repo",
      "sync-issue",
      "unskip-code-file",
      "unskip-repo",
    ])
  )
  .option("--wId <workspaceId>", "Workspace ID")
  .option("--dsId <dataSourceId>", "Data source ID")
  .option("--connectorId <id>", "Connector ID")
  .option("--owner <owner>", "Repository owner")
  .option("--repo <repo>", "Repository name")
  .option("--repoId <id>", "Repository ID")
  .option("--repoLogin <login>", "Repository login (for sync-issue)")
  .option("--repoName <name>", "Repository name (for sync-issue)")
  .option("--issueNumber <number>", "Issue number")
  .option("--enable <bool>", 'Enable code sync ("true" or "false")')
  .option("--skipReason <reason>", "Skip reason")
  .option("--documentId <id>", "Document ID (for skip-code-file)")
  .action(async (subcommand: string, opts) => {
    await dispatch("github", subcommand, opts);
  });

program
  .command("gong")
  .description("Gong connector management")
  .addArgument(
    new Argument("<subcommand>").choices(["delete-transcript", "force-resync"])
  )
  .option("--connectorId <id>", "Connector ID", parseInt)
  .option("--fromTs <timestamp>", "From timestamp", parseInt)
  .option("--callId <id>", "Call ID")
  .action(async (subcommand: string, opts) => {
    await dispatch("gong", subcommand, opts);
  });

program
  .command("google_drive")
  .description("Google Drive connector management")
  .addArgument(
    new Argument("<subcommand>").choices([
      "check-file",
      "clean-invalid-parents",
      "export-folder-structure",
      "garbage-collect-all",
      "get-file-metadata",
      "get-google-parents",
      "list-labels",
      "register-all-webhooks",
      "register-webhook",
      "restart-all-incremental-sync-workflows",
      "restart-google-webhooks",
      "skip-file",
      "start-full-sync",
      "start-incremental-sync",
      "update-core-parents",
      "upsert-file",
    ])
  )
  .option("--wId <workspaceId>", "Workspace ID")
  .option("--dsId <dataSourceId>", "Data source ID")
  .option("--connectorId <id>", "Connector ID")
  .option("--fileId <id>", "File ID")
  .option("--fileType <type>", "File type for export (document | presentation)")
  .option("--folderId <id>", "Folder ID")
  .option("--rootFolderId <id>", "Root folder ID")
  .option("--reason <reason>", "Reason")
  .option("--fix <bool>", "Fix (true/false)")
  .option("--execute <bool>", "Execute (true/false)")
  .action(async (subcommand: string, opts) => {
    await dispatch("google_drive", subcommand, opts);
  });

program
  .command("intercom")
  .description("Intercom connector management")
  .addArgument(
    new Argument("<subcommand>").choices([
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
    ])
  )
  .option("--force <bool>", 'Force ("true")')
  .option("--connectorId <id>", "Connector ID", parseInt)
  .option("--conversationId <id>", "Conversation ID", parseInt)
  .option("--day <day>", "Day")
  .option("--helpCenterId <id>", "Help center ID", parseInt)
  .option(
    "--conversationsSlidingWindow <window>",
    "Conversations sliding window",
    parseInt
  )
  .option("--teamId <id>", "Team ID", parseInt)
  .option("--closedAfter <timestamp>", "Closed after timestamp", parseInt)
  .option("--state <state>", "Conversation state (open | closed)")
  .option("--cursor <cursor>", "Pagination cursor")
  .option("--forceDeleteExisting <bool>", 'Force delete existing ("true")')
  .action(async (subcommand: string, opts) => {
    await dispatch("intercom", subcommand, opts);
  });

program
  .command("microsoft")
  .description("Microsoft connector management")
  .addArgument(
    new Argument("<subcommand>").choices([
      "check-file",
      "garbage-collect-all",
      "get-parents",
      "restart-all-incremental-sync-workflows",
      "skip-file",
      "start-full-sync",
      "start-incremental-sync",
      "sync-node",
      "update-core-parents",
      "update-parent-in-node-table",
    ])
  )
  .option("--wId <workspaceId>", "Workspace ID")
  .option("--dsId <dataSourceId>", "Data source ID")
  .option("--connectorId <id>", "Connector ID")
  .option("--folderId <id>", "Folder ID")
  .option("--internalId <id>", "Internal node ID")
  .option("--idsFile <path>", "Path to JSON file containing array of IDs")
  .option("--reason <reason>", "Reason")
  .action(async (subcommand: string, opts) => {
    await dispatch("microsoft", subcommand, opts);
  });

program
  .command("notion")
  .description("Notion connector management")
  .addArgument(
    new Argument("<subcommand>").choices([
      "api-request",
      "check-url",
      "clear-parents-last-updated-at",
      "delete-url",
      "find-url",
      "me",
      "search-pages",
      "skip-database",
      "skip-page",
      "stop-all-garbage-collectors",
      "update-core-parents",
      "update-orphaned-resources-parents",
      "update-parents-fields",
      "upsert-database",
      "upsert-page",
    ])
  )
  .option("--wId <workspaceId>", "Workspace ID")
  .option("--dsId <dataSourceId>", "Data source ID")
  .option("--connectorId <id>", "Connector ID")
  .option("--pageId <id>", "Page ID")
  .option("--databaseId <id>", "Database ID")
  .option("--query <query>", "Search query")
  .option("--url <url>", "URL")
  .option("--method <method>", "HTTP method (GET | POST)")
  .option("--body <json>", "Request body (JSON string)")
  .option("--remove <bool>", "Remove skip reason (true/false)")
  .option("--reason <reason>", "Skip reason")
  .option("--all <bool>", "Apply to all connectors/resources (true/false)")
  .option("--resetToDate <date>", "Reset parentsLastUpdatedAt to this date")
  .option("--forceResync <bool>", "Force resync (true/false)")
  .action(async (subcommand: string, opts) => {
    await dispatch("notion", subcommand, opts);
  });

program
  .command("salesforce")
  .description("Salesforce connector management")
  .addArgument(
    new Argument("<subcommand>").choices([
      "check-connection",
      "run-soql",
      "setup-synced-query",
      "sync-query",
    ])
  )
  .option("--wId <workspaceId>", "Workspace ID")
  .option("--dsId <dataSourceId>", "Data source ID")
  .option("--soql <query>", "SOQL query")
  .option("--limit <number>", "Result limit", parseInt)
  .option(
    "--lastModifiedDateOrder <order>",
    "Last modified date order (ASC | DESC)"
  )
  .option("--offset <number>", "Result offset", parseInt)
  .option("--rootNodeName <name>", "Root node name")
  .option("--titleTemplate <template>", "Title template")
  .option("--contentTemplate <template>", "Content template")
  .option("--tagsTemplate <template>", "Tags template")
  .option("--execute", "Execute the query")
  .option("--queryId <id>", "Query ID", parseInt)
  .option("--full", "Full sync")
  .action(async (subcommand: string, opts) => {
    await dispatch("salesforce", subcommand, opts);
  });

program
  .command("slack")
  .description("Slack connector management")
  .addArgument(
    new Argument("<subcommand>").choices([
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
    ])
  )
  .option("--wId <workspaceId>", "Workspace ID")
  .option("--channelId <id>", "Channel ID")
  .option("--threadId <id>", "Thread ID")
  .option("--threadTs <ts>", "Thread timestamp")
  .option("--skipReason <reason>", "Skip reason")
  .option(
    "--whitelistedDomains <domains>",
    "Comma-separated domains (e.g. example.com:group1,example2.com:group2)"
  )
  .option("--botName <name>", "Bot name (for whitelist-bot)")
  .option("--groupId <id>", "Group ID (for whitelist-bot, comma-separated)")
  .option(
    "--whitelistType <type>",
    "Whitelist type (summon_agent | index_messages)"
  )
  .option("--providerType <type>", "Provider type (slack | slack_bot)")
  .option("--force <bool>", "Force (true/false)")
  .action(async (subcommand: string, opts) => {
    await dispatch("slack", subcommand, opts);
  });

program
  .command("snowflake")
  .description("Snowflake connector management")
  .addArgument(
    new Argument("<subcommand>").choices([
      "fetch-databases",
      "fetch-schemas",
      "fetch-tables",
    ])
  )
  .option("--connectorId <id>", "Connector ID", parseInt)
  .option("--database <name>", "Database name")
  .option("--schema <name>", "Schema name")
  .action(async (subcommand: string, opts) => {
    await dispatch("snowflake", subcommand, opts);
  });

program
  .command("temporal")
  .description("Temporal workflow inspection")
  .addArgument(
    new Argument("<subcommand>").choices([
      "check-queue",
      "find-unprocessed-workflows",
      "stop-workflow",
    ])
  )
  .option("--queue <name>", "Task queue name")
  .option("--workflowId <workflowId>", "ID of the workflow")
  .action(async (subcommand: string, opts) => {
    await dispatch("temporal", subcommand, opts);
  });

program
  .command("webcrawler")
  .description("Web crawler connector management")
  .addArgument(
    new Argument("<subcommand>").choices([
      "set-actions",
      "start-scheduler",
      "update-frequency",
    ])
  )
  .option("--connectorId <id>", "Connector ID")
  .option("--crawlFrequency <frequency>", "Crawl frequency")
  .option("--actions <actions>", "Actions")
  .action(async (subcommand: string, opts) => {
    await dispatch("webcrawler", subcommand, opts);
  });

program
  .command("zendesk")
  .description("Zendesk connector management")
  .addArgument(
    new Argument("<subcommand>").choices([
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
    ])
  )
  .option("--wId <workspaceId>", "Workspace ID")
  .option("--dsId <dataSourceId>", "Data source ID")
  .option("--connectorId <id>", "Connector ID", parseInt)
  .option("--brandId <id>", "Brand ID", parseInt)
  .option("--query <query>", "Query")
  .option("--forceResync <bool>", 'Force resync ("true")')
  .option("--ticketId <id>", "Ticket ID", parseInt)
  .option("--ticketUrl <url>", "Ticket URL")
  .option("--retentionPeriodDays <days>", "Retention period in days", parseInt)
  .option("--rateLimitTps <tps>", "Rate limit TPS", parseInt)
  .option("--tag <tag>", "Tag")
  .option("--include <bool>", 'Include ("true")')
  .option("--exclude <bool>", 'Exclude ("true")')
  .action(async (subcommand: string, opts) => {
    await dispatch("zendesk", subcommand, opts);
  });

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
  process.exit(1);
});
