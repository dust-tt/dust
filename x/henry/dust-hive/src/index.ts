#!/usr/bin/env bun

import { cacheCommand } from "./commands/cache";
import { coolCommand } from "./commands/cool";
import { destroyCommand } from "./commands/destroy";
import { doctorCommand } from "./commands/doctor";
import { forwardCommand } from "./commands/forward";
import { listCommand } from "./commands/list";
import { logsCommand } from "./commands/logs";
import { openCommand } from "./commands/open";
import { reloadCommand } from "./commands/reload";
import { spawnCommand } from "./commands/spawn";
import { startCommand } from "./commands/start";
import { statusCommand } from "./commands/status";
import { stopCommand } from "./commands/stop";
import { urlCommand } from "./commands/url";
import { warmCommand } from "./commands/warm";
import { ensureDirectories } from "./lib/config";
import { logger } from "./lib/logger";
import type { Result } from "./lib/result";

const COMMANDS = [
  "spawn",
  "open",
  "reload",
  "warm",
  "cool",
  "start",
  "stop",
  "destroy",
  "list",
  "status",
  "logs",
  "url",
  "doctor",
  "cache",
  "forward",
] as const;

type Command = (typeof COMMANDS)[number];

function printUsage(): void {
  console.log(`
dust-hive - Isolated Dust development environments

Usage:
  dust-hive <command> [options]

Commands:
  spawn [--name NAME] [--base BRANCH] [--no-open]  Create a new environment
  open NAME                                         Open environment's zellij session
  reload NAME                                       Kill and reopen zellij session
  warm NAME [--no-forward]                          Start docker and all services
  cool NAME                                         Stop services, keep SDK watch
  start NAME                                        Resume stopped environment
  stop NAME                                         Full stop of all services
  destroy NAME [--force]                            Remove environment
  list                                              Show all environments
  status NAME                                       Show service health
  logs NAME [SERVICE] [-f]                          Show service logs
  url NAME                                          Print front URL
  doctor                                            Check prerequisites
  cache [--rebuild]                                 Show or rebuild binary cache
  forward [NAME|status|stop]                        Manage OAuth port forwarding

Options:
  --help  Show this help message
`);
}

function isCommand(cmd: string): cmd is Command {
  return COMMANDS.includes(cmd as Command);
}

// Helper to run a command and handle its Result
async function runCommand(resultPromise: Promise<Result<void>>): Promise<void> {
  const result = await resultPromise;
  if (!result.ok) {
    logger.error(result.error.message);
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    process.exit(0);
  }

  const command = args[0];

  if (!(command && isCommand(command))) {
    logger.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
  }

  // Ensure directories exist
  await ensureDirectories();

  // Route to command handlers
  switch (command) {
    case "list":
      await runCommand(listCommand());
      break;

    case "status":
      await runCommand(statusCommand(args[1] ?? ""));
      break;

    case "doctor":
      await runCommand(doctorCommand());
      break;

    case "spawn":
      await runCommand(spawnCommand(args.slice(1)));
      break;

    case "warm":
      await runCommand(warmCommand(args.slice(1)));
      break;

    case "cool":
      await runCommand(coolCommand(args.slice(1)));
      break;

    case "start":
      await runCommand(startCommand(args.slice(1)));
      break;

    case "stop":
      await runCommand(stopCommand(args.slice(1)));
      break;

    case "destroy":
      await runCommand(destroyCommand(args.slice(1)));
      break;

    case "open":
      await runCommand(openCommand(args.slice(1)));
      break;

    case "reload":
      await runCommand(reloadCommand(args.slice(1)));
      break;

    case "url":
      await runCommand(urlCommand(args.slice(1)));
      break;

    case "logs":
      await runCommand(logsCommand(args.slice(1)));
      break;

    case "cache":
      await runCommand(cacheCommand(args.slice(1)));
      break;

    case "forward":
      await runCommand(forwardCommand(args.slice(1)));
      break;
  }
}

main().catch((err: unknown) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
