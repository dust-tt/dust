import { AdminCommandSchema } from "@connectors/types";
import { Argument, Command } from "commander";
import minimist from "minimist";
import { fromError } from "zod-validation-error";

process.env.INTERACTIVE_CLI = process.env.INTERACTIVE_CLI || "1";

/**
 * Parses the key=value options that follow the subcommand.
 *
 * process.argv layout: [node, script, majorCommand, subcommand, ...options]
 *                       0      1        2             3           4+
 */
function parseCommandArgs() {
  const raw = minimist(process.argv.slice(4), {
    // Force string for args that may exceed Number.MAX_SAFE_INTEGER (e.g. Gong call IDs).
    string: ["wId", "callId"],
  });
  return { ...raw, _: undefined, "--": undefined };
}

async function dispatch(
  majorCommand: string,
  subcommand: string
): Promise<void> {
  const args = parseCommandArgs();
  const validation = AdminCommandSchema.safeParse({
    majorCommand,
    command: subcommand,
    args,
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
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("batch", subcommand);
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
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("confluence", subcommand);
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
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("connectors", subcommand);
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
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("github", subcommand);
  });

program
  .command("gong")
  .description("Gong connector management")
  .addArgument(
    new Argument("<subcommand>").choices(["delete-transcript", "force-resync"])
  )
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("gong", subcommand);
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
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("google_drive", subcommand);
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
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("intercom", subcommand);
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
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("microsoft", subcommand);
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
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("notion", subcommand);
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
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("salesforce", subcommand);
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
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("slack", subcommand);
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
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("snowflake", subcommand);
  });

program
  .command("temporal")
  .description("Temporal workflow inspection")
  .addArgument(
    new Argument("<subcommand>").choices([
      "check-queue",
      "find-unprocessed-workflows",
    ])
  )
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("temporal", subcommand);
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
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("webcrawler", subcommand);
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
  .allowUnknownOption(true)
  .action(async (subcommand: string) => {
    await dispatch("zendesk", subcommand);
  });

program.parseAsync(process.argv).catch((err: Error) => {
  console.error(`\x1b[31mError: ${err.message}\x1b[0m`);
  process.exit(1);
});
