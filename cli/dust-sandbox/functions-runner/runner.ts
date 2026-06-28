#!/usr/bin/env bun
// Embedded runner for `dsbx function`. Two subcommands:
//   runner run <path>   stdin request envelope -> stdout Output JSON
//   runner get <path>   -> stdout FunctionSchema JSON (or {error})

import { invoke } from "./invoke.ts";
import { BadInputError, parseInput, type RequestInput } from "./protocol.ts";
import { getFunctionSchema } from "./schema.ts";

async function runHandler(handlerPath: string): Promise<number> {
  const raw = await Bun.stdin.text();
  let input: RequestInput;
  try {
    input = parseInput(raw);
  } catch (e) {
    const message = e instanceof BadInputError ? e.message : String(e);
    process.stdout.write(
      `${JSON.stringify({ ok: false, error: { kind: "bad_input", message } })}\n`
    );
    return 2;
  }
  const out = await invoke(handlerPath, input);
  process.stdout.write(`${JSON.stringify(out)}\n`);
  return out.ok ? 0 : 1;
}

async function getHandler(handlerPath: string): Promise<number> {
  try {
    const schema = await getFunctionSchema(handlerPath);
    process.stdout.write(`${JSON.stringify(schema)}\n`);
    return 0;
  } catch (e) {
    process.stdout.write(
      `${JSON.stringify({ error: e instanceof Error ? e.message : String(e) })}\n`
    );
    return 1;
  }
}

async function main(): Promise<number> {
  const [command, handlerPath] = process.argv.slice(2);
  if (!handlerPath) {
    process.stderr.write("usage: runner <run|get> <handler-path>\n");
    return 2;
  }
  switch (command) {
    case "run":
      return runHandler(handlerPath);
    case "get":
      return getHandler(handlerPath);
    default:
      process.stderr.write(`runner: unknown command "${command}"\n`);
      return 2;
  }
}

process.exit(await main());
