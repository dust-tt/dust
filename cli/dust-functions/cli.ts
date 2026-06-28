#!/usr/bin/env bun
// dust-functions — run Web-standard HTTP handlers as isolated, serverless-style
// invocations (no server), and discover their I/O contracts for model tool-use.
//
//   dust-functions run <handler.ts> < request.json   invoke one handler
//   dust-functions discover <folder>                  catalog handler contracts
//   dust-functions --help                             this message

import { discoverCli } from "./discover.ts";
import { runCli } from "./run_request.ts";

const USAGE = `dust-functions — serverless-style handler runner

Usage:
  dust-functions run <handler.ts> < request.json   Invoke one handler; request
                                                   JSON on stdin, response JSON
                                                   on stdout.
  dust-functions discover <folder>                 Catalog the I/O contracts of
                                                   the handlers in <folder>.
  dust-functions --help                            Show this message.
`;

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "run":
      return runCli(rest);
    case "discover":
      return discoverCli(rest);
    case "--help":
    case "-h":
      process.stdout.write(USAGE);
      return 0;
    case undefined:
      process.stderr.write(USAGE);
      return 2;
    default:
      process.stderr.write(`dust-functions: unknown command "${command}"\n\n`);
      process.stderr.write(USAGE);
      return 2;
  }
}

process.exit(await main());
