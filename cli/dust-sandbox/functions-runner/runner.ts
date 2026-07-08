#!/usr/bin/env bun
// Embedded runner for `dsbx function`. Subcommands:
//   runner run <path>                            stdin request envelope -> stdout Output JSON
//   runner get <path>                            -> stdout FunctionSchema JSON (or {error})
//   runner build <src> <outBundle> <outSchema>   bundle + extract schema to files

import { build } from "./build.ts";
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

async function buildHandler(args: string[]): Promise<number> {
  const [srcPath, outBundlePath, outSchemaPath] = args;
  if (!srcPath || !outBundlePath || !outSchemaPath) {
    process.stdout.write(
      `${JSON.stringify({
        ok: false,
        error: {
          kind: "bad_args",
          message: "usage: runner build <src> <outBundle> <outSchema>",
        },
      })}\n`
    );
    return 2;
  }
  const result = await build(srcPath, outBundlePath, outSchemaPath);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result.ok ? 0 : 1;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "build") {
    return buildHandler(rest);
  }

  const [handlerPath] = rest;
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
