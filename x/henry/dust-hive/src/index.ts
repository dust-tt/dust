#!/usr/bin/env bun

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
  spawn   Create a new environment
  open    Open environment's zellij session
  warm    Start docker and all services
  cool    Stop services, keep SDK watch
  start   Resume stopped environment
  stop    Full stop of all services
  destroy Remove environment
  list    Show all environments
  status  Show service health
  doctor  Check prerequisites

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

  // TODO: Implement commands
  logger.info(`Command '${command}' not yet implemented`);
}

main().catch((err: unknown) => {
  logger.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
