#!/usr/bin/env bun

import { doctorCommand } from "./commands/doctor";
import { listCommand } from "./commands/list";
import { statusCommand } from "./commands/status";
import { ensureDirectories } from "./lib/config";
import { logger } from "./lib/logger";

const COMMANDS = [
  "spawn",
  "open",
  "warm",
  "cool",
  "start",
  "stop",
  "destroy",
  "list",
  "status",
  "doctor",
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
  warm NAME                                         Start docker and all services
  cool NAME                                         Stop services, keep SDK watch
  start NAME                                        Resume stopped environment
  stop NAME                                         Full stop of all services
  destroy NAME [--force]                            Remove environment
  list                                              Show all environments
  status NAME                                       Show service health
  doctor                                            Check prerequisites

Options:
  --help  Show this help message
`);
}

function isCommand(cmd: string): cmd is Command {
  return COMMANDS.includes(cmd as Command);
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
      await listCommand();
      break;

    case "status": {
      const name = args[1];
      if (!name) {
        logger.error("Usage: dust-hive status NAME");
        process.exit(1);
      }
      await statusCommand(name);
      break;
    }

    case "doctor":
      await doctorCommand();
      break;

    // Commands not yet implemented
    case "spawn":
    case "open":
    case "warm":
    case "cool":
    case "start":
    case "stop":
    case "destroy":
      logger.info(`Command '${command}' not yet implemented`);
      break;
  }
}

main().catch((err: unknown) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
