#!/usr/bin/env bun

import { cac } from "cac";
import { cacheCommand } from "./commands/cache";
import { coolCommand } from "./commands/cool";
import { destroyCommand } from "./commands/destroy";
import { doctorCommand, setupCommand } from "./commands/doctor";
import { forwardCommand } from "./commands/forward";
import { listCommand } from "./commands/list";
import { logsCommand } from "./commands/logs";
import { openCommand } from "./commands/open";
import { reloadCommand } from "./commands/reload";
import { restartCommand } from "./commands/restart";
import { seedConfigCommand } from "./commands/seed-config";
import { spawnCommand } from "./commands/spawn";
import { startCommand } from "./commands/start";
import { statusCommand } from "./commands/status";
import { stopCommand } from "./commands/stop";
import { syncCommand } from "./commands/sync";
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
}

async function prepareAndRun(resultPromise: Promise<Result<void>>): Promise<void> {
  await ensureDirectories();
  await runCommand(resultPromise);
}

const cli = cac("dust-hive");

cli
  .command("spawn [name]", "Create a new environment")
  .option("--name <name>", "Environment name")
  .option("--base <branch>", "Base branch")
  .option("--no-open", "Do not open zellij session after spawn")
  .option("--warm", "Open zellij with a warm tab running dust-hive warm")
  .action(
    async (
      name: string | undefined,
      options: { name?: string; base?: string; open?: boolean; warm?: boolean }
    ) => {
      const resolvedName = name ?? options.name;
      const spawnOptions: { name?: string; base?: string; noOpen?: boolean; warm?: boolean } = {};
      if (resolvedName !== undefined) {
        spawnOptions.name = resolvedName;
      }
      if (options.base !== undefined) {
        spawnOptions.base = options.base;
      }
      if (options.open === false) {
        spawnOptions.noOpen = true;
      }
      if (options.warm) {
        spawnOptions.warm = true;
      }
      await prepareAndRun(spawnCommand(spawnOptions));
    }
  );

cli
  .command("open [name]", "Open environment's zellij session")
  .action(async (name: string | undefined) => {
    await prepareAndRun(openCommand(name));
  });

cli
  .command("reload [name]", "Kill and reopen zellij session")
  .action(async (name: string | undefined) => {
    await prepareAndRun(reloadCommand(name));
  });

cli
  .command("restart [name] <service>", "Restart a single service")
  .action(async (name: string | undefined, service: string) => {
    await prepareAndRun(restartCommand(name, service));
  });

cli
  .command("warm [name]", "Start docker and all services")
  .option("--no-forward", "Disable OAuth port forwarding")
  .option("--force-ports", "Kill processes blocking service ports")
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
  .action(async (name: string | undefined) => {
    await prepareAndRun(coolCommand(name));
  });

cli
  .command("start [name]", "Resume stopped environment")
  .action(async (name: string | undefined) => {
    await prepareAndRun(startCommand(name));
  });

cli.command("stop [name]", "Full stop of all services").action(async (name: string | undefined) => {
  await prepareAndRun(stopCommand(name));
});

cli
  .command("destroy <name>", "Remove environment")
  .option("-f, --force", "Force destroy even with uncommitted changes")
  .action(async (name: string, options: { force?: boolean }) => {
    await prepareAndRun(destroyCommand(name, { force: Boolean(options.force) }));
  });

cli.command("list", "Show all environments").action(async () => {
  await prepareAndRun(listCommand());
});

cli.command("status [name]", "Show service health").action(async (name: string | undefined) => {
  await prepareAndRun(statusCommand(name));
});

cli
  .command("logs [name] [service]", "Show service logs")
  .option("-f, --follow", "Follow log output")
  .action(
    async (
      name: string | undefined,
      service: string | undefined,
      options: { follow?: boolean }
    ) => {
      await prepareAndRun(logsCommand(name, service, { follow: Boolean(options.follow) }));
    }
  );

cli.command("url [name]", "Print front URL").action(async (name: string | undefined) => {
  await prepareAndRun(urlCommand(name));
});

cli
  .command("setup", "Interactive setup wizard for prerequisites")
  .option("-y, --non-interactive", "Run in non-interactive mode (same as doctor)")
  .action(async (options: { nonInteractive?: boolean }) => {
    await prepareAndRun(setupCommand({ nonInteractive: Boolean(options.nonInteractive) }));
  });

cli.command("doctor", "Check prerequisites (alias for setup)").action(async () => {
  await prepareAndRun(doctorCommand());
});

cli
  .command("cache [action]", "Show or rebuild binary cache")
  .option("--rebuild", "Rebuild cache")
  .option("--status", "Show cache status")
  .action(async (action: string | undefined, options: { rebuild?: boolean; status?: boolean }) => {
    const resolved = {
      rebuild: options.rebuild ?? false,
      status: options.status ?? false,
    };

    if (action === "rebuild") {
      resolved.rebuild = true;
    } else if (action === "status") {
      resolved.status = true;
    } else if (action !== undefined) {
      logger.error(`Unknown cache action: ${action}`);
      process.exit(1);
    }

    await prepareAndRun(cacheCommand(resolved));
  });

cli
  .command("forward [target]", "Manage OAuth port forwarding")
  .action(async (target: string | undefined) => {
    await prepareAndRun(forwardCommand(target));
  });

cli
  .command("sync [branch]", "Rebase on branch (default: main), rebuild binaries, refresh deps")
  .action(async (branch: string | undefined) => {
    await prepareAndRun(syncCommand(branch));
  });

cli
  .command(
    "seed-config <postgres-uri>",
    "Extract user data from existing DB for seeding new environments"
  )
  .action(async (postgresUri: string) => {
    await prepareAndRun(seedConfigCommand(postgresUri));
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
