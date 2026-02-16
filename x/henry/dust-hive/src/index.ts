#!/usr/bin/env bun

import { cac } from "cac";
import { cacheCommand } from "./commands/cache";
import { coolCommand } from "./commands/cool";
import { destroyCommand } from "./commands/destroy";
import { doctorCommand, setupCommand } from "./commands/doctor";
import { downCommand } from "./commands/down";
import { feedCommand } from "./commands/feed";
import { forwardCommand, forwardStatusCommand, forwardStopCommand } from "./commands/forward";
import { listCommand } from "./commands/list";
import { logsCommand } from "./commands/logs";
import { openCommand } from "./commands/open";
import { refreshCommand } from "./commands/refresh";
import { reloadCommand } from "./commands/reload";
import { restartCommand } from "./commands/restart";
import { seedConfigCommand } from "./commands/seed-config";
import { spawnCommand } from "./commands/spawn";
import { startCommand } from "./commands/start";
import { statusCommand } from "./commands/status";
import { stopCommand } from "./commands/stop";
import { syncCommand } from "./commands/sync";
import { temporalCommand } from "./commands/temporal";
import { upCommand } from "./commands/up";
import { urlCommand } from "./commands/url";
import { warmCommand } from "./commands/warm";
import { ensureDirectories } from "./lib/config";
import { logger } from "./lib/logger";
import type { Result } from "./lib/result";

async function runCommand(resultPromise: Promise<Result<void>>): Promise<void> {
  const result = await resultPromise;
  if (!result.ok) {
    logger.error(result.error.message);
    process.exit(1);
  }
  // Exit explicitly to avoid hanging on unconsumed Bun.spawn pipe handles
  process.exit(0);
}

async function prepareAndRun(resultPromise: Promise<Result<void>>): Promise<void> {
  await ensureDirectories();
  await runCommand(resultPromise);
}

const cli = cac("dust-hive");

cli
  .command("spawn [name]", "Create a new environment")
  .alias("s")
  .option("-n, --name <name>", "Environment name")
  .option("-b, --branch-name <branch>", "Git branch name (default: [prefix]<name>)")
  .option(
    "-r, --reuse-existing-branch",
    "Reuse an existing local branch instead of creating a new one"
  )
  .option("-O, --no-open", "Do not open terminal session after spawn")
  .option("-A, --no-attach", "Create terminal session but don't attach to it")
  .option("-w, --warm", "Open with a warm tab running dust-hive warm")
  .option(
    "-W, --wait",
    "Wait for SDK to build before opening session (cannot be used with --no-open)"
  )
  .option("-c, --command <cmd>", "Run command in shell tab after opening (drops to shell on exit)")
  .option("-C, --compact", "Use compact layout (no tab bar)")
  .option("-u, --unified-logs", "Use single unified logs tab instead of per-service tabs")
  .action(
    async (
      name: string | undefined,
      options: {
        name?: string;
        branchName?: string;
        reuseExistingBranch?: boolean;
        open?: boolean;
        attach?: boolean;
        warm?: boolean;
        wait?: boolean;
        command?: string;
        compact?: boolean;
        unifiedLogs?: boolean;
      }
    ) => {
      // Validate --wait cannot be used with --no-open
      if (options.wait && options.open === false) {
        logger.error("--wait cannot be used with --no-open (--no-open always waits)");
        process.exit(1);
      }

      const resolvedName = name ?? options.name;
      const spawnOptions: {
        name?: string;
        branchName?: string;
        reuseExistingBranch?: boolean;
        noOpen?: boolean;
        noAttach?: boolean;
        warm?: boolean;
        wait?: boolean;
        command?: string;
        compact?: boolean;
        unifiedLogs?: boolean;
      } = {};
      if (resolvedName !== undefined) {
        spawnOptions.name = resolvedName;
      }
      if (options.branchName) {
        spawnOptions.branchName = options.branchName;
      }
      if (options.reuseExistingBranch) {
        spawnOptions.reuseExistingBranch = true;
      }
      if (options.open === false) {
        spawnOptions.noOpen = true;
      }
      if (options.attach === false) {
        spawnOptions.noAttach = true;
      }
      if (options.warm) {
        spawnOptions.warm = true;
      }
      if (options.wait) {
        spawnOptions.wait = true;
      }
      if (options.command) {
        spawnOptions.command = options.command;
      }
      if (options.compact) {
        spawnOptions.compact = true;
      }
      if (options.unifiedLogs) {
        spawnOptions.unifiedLogs = true;
      }
      await prepareAndRun(spawnCommand(spawnOptions));
    }
  );

cli
  .command("open [name]", "Open environment's terminal session")
  .alias("o")
  .option("-C, --compact", "Use compact layout (no tab bar)")
  .option("-u, --unified-logs", "Use single unified logs tab instead of per-service tabs")
  .action(
    async (name: string | undefined, options: { compact?: boolean; unifiedLogs?: boolean }) => {
      await prepareAndRun(
        openCommand(name, { compact: options.compact, unifiedLogs: options.unifiedLogs })
      );
    }
  );

cli
  .command("reload [name]", "Kill and reopen terminal session")
  .option("-u, --unified-logs", "Use single unified logs tab instead of per-service tabs")
  .action(async (name: string | undefined, options: { unifiedLogs?: boolean }) => {
    await prepareAndRun(reloadCommand(name, { unifiedLogs: options.unifiedLogs }));
  });

cli
  .command("restart [name] [service]", "Restart a single service")
  .action(async (name: string | undefined, service: string | undefined) => {
    await prepareAndRun(restartCommand(name, service));
  });

cli
  .command("warm [name]", "Start docker and all services")
  .alias("w")
  .option("-F, --no-forward", "Disable OAuth port forwarding")
  .option("-p, --force-ports", "Kill processes blocking service ports")
  .action(
    async (name: string | undefined, options: { forward?: boolean; forcePorts?: boolean }) => {
      await prepareAndRun(
        warmCommand(name, {
          noForward: options.forward === false,
          forcePorts: Boolean(options.forcePorts),
        })
      );
    }
  );

cli
  .command("cool [name]", "Stop services, keep SDK watch")
  .alias("c")
  .action(async (name: string | undefined) => {
    await prepareAndRun(coolCommand(name));
  });

cli
  .command("start [name]", "Resume stopped environment (start SDK watch)")
  .action(async (name: string | undefined) => {
    await prepareAndRun(startCommand(name));
  });

cli
  .command("stop [name] [service]", "Stop all services (or a single service) in environment")
  .alias("x")
  .action(async (name: string | undefined, service: string | undefined) => {
    await prepareAndRun(stopCommand(name, service));
  });

cli
  .command("up", "Start managed services (temporal + test postgres + test redis + main session)")
  .option("-a, --attach", "Attach to main terminal session")
  .option("-f, --force", "Force rebuild even if no changes detected")
  .option("-C, --compact", "Use compact layout (bar at bottom)")
  .action(async (options: { attach?: boolean; force?: boolean; compact?: boolean }) => {
    await prepareAndRun(
      upCommand({
        attach: Boolean(options.attach),
        force: Boolean(options.force),
        compact: Boolean(options.compact),
      })
    );
  });

cli
  .command("down", "Stop all envs, temporal, test postgres, test redis, and sessions")
  .option("-f, --force", "Skip confirmation prompt")
  .action(async (options: { force?: boolean }) => {
    await prepareAndRun(downCommand({ force: Boolean(options.force) }));
  });

cli
  .command("destroy [name]", "Remove environment")
  .alias("rm")
  .option("-f, --force", "Force destroy even with uncommitted changes")
  .option("-k, --keep-branch", "Delete worktree but keep the git branch")
  .action(async (name: string | undefined, options: { force?: boolean; keepBranch?: boolean }) => {
    await prepareAndRun(
      destroyCommand(name, {
        force: Boolean(options.force),
        keepBranch: Boolean(options.keepBranch),
      })
    );
  });

cli
  .command("list", "Show all environments")
  .alias("ls")
  .alias("l")
  .action(async () => {
    await prepareAndRun(listCommand());
  });

cli
  .command("status [name]", "Show service health")
  .alias("st")
  .action(async (name: string | undefined) => {
    await prepareAndRun(statusCommand(name));
  });

cli
  .command("logs [name] [service]", "Show service logs")
  .alias("log")
  .option("-f, --follow", "Follow log output")
  .option("-i, --interactive", "Interactive TUI with service switching")
  .action(
    async (
      name: string | undefined,
      service: string | undefined,
      options: { follow?: boolean; interactive?: boolean }
    ) => {
      await prepareAndRun(
        logsCommand(name, service, {
          follow: Boolean(options.follow),
          interactive: Boolean(options.interactive),
        })
      );
    }
  );

cli.command("url [name]", "Print front URL").action(async (name: string | undefined) => {
  await prepareAndRun(urlCommand(name));
});

cli
  .command("setup", "Check prerequisites and guide initial setup (run this first!)")
  .option("-y, --non-interactive", "Run without prompts (CI-friendly)")
  .action(async (options: { nonInteractive?: boolean }) => {
    await prepareAndRun(setupCommand({ nonInteractive: Boolean(options.nonInteractive) }));
  });

cli.command("doctor", "Check prerequisites (non-interactive)").action(async () => {
  await prepareAndRun(doctorCommand());
});

cli.command("cache", "Show binary cache status").action(async () => {
  await prepareAndRun(cacheCommand());
});

cli
  .command("refresh [name]", "Restore node_modules links in worktree")
  .action(async (name: string | undefined) => {
    await prepareAndRun(refreshCommand(name));
  });

cli.command("forward status", "Show current forwarding status").action(async () => {
  await prepareAndRun(forwardStatusCommand());
});

cli.command("forward stop", "Stop the port forwarder").action(async () => {
  await prepareAndRun(forwardStopCommand());
});

cli
  .command("forward [name]", "Forward OAuth ports to environment")
  .example("dust-hive forward          # Forward to last warmed env")
  .example("dust-hive forward my-env   # Forward to specific env")
  .example("dust-hive forward status   # Show forwarding status")
  .example("dust-hive forward stop     # Stop port forwarding")
  .action(async (name: string | undefined) => {
    await prepareAndRun(forwardCommand(name));
  });

cli
  .command("sync", "Pull latest main, rebuild binaries, refresh deps")
  .option("-f, --force", "Force rebuild even if no changes detected")
  .action(async (options: { force?: boolean }) => {
    await prepareAndRun(syncCommand({ force: Boolean(options.force) }));
  });

// Temporal subcommands
cli
  .command("temporal [subcommand]", "Manage Temporal server (start|stop|restart|status|logs)")
  .action(async (subcommand: string | undefined) => {
    await prepareAndRun(temporalCommand(subcommand));
  });

cli
  .command(
    "seed-config <postgres-uri>",
    "Extract user data from existing DB for seeding new environments"
  )
  .action(async (postgresUri: string) => {
    await prepareAndRun(seedConfigCommand(postgresUri));
  });

cli
  .command("feed [name] [scenario]", "Run seed script for a scenario")
  .action(async (name: string | undefined, scenario: string | undefined) => {
    await prepareAndRun(feedCommand(name, scenario));
  });

cli.help();

cli.on("command:*", () => {
  const command = cli.args[0];
  logger.error(`Unknown command: ${command}`);
  cli.outputHelp();
  process.exit(1);
});

if (process.argv.length <= 2) {
  cli.outputHelp();
  process.exit(0);
}

cli.parse();
