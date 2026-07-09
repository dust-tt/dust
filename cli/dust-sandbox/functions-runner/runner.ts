#!/usr/bin/env bun
// Embedded runner for `dsbx function` and `dsbx db`. Subcommands:
//   runner run <path>                            stdin request envelope -> stdout Output JSON
//   runner get <path>                            -> stdout FunctionSchema JSON (or {error})
//   runner build <src> <outBundle> <outSchema>   bundle + extract schema to files
//   runner db-reconcile <dbPath> <schemaFile>    additive-only DDL reconcile -> stdout envelope
//   runner db-schema <dbPath> <outSchemaTs>      regenerate drizzle schema file -> file + envelope
//   runner db-query <dbPath>                     stdin SQL -> stdout rows envelope (read-only;
//                                                large results spill to a file the envelope names)

import { build } from "./build.ts";
import { errorEnvelope } from "./db_common.ts";
import { queryReadonly } from "./db_query.ts";
import { reconcile } from "./db_reconcile.ts";
import { generateSchemaFileText } from "./db_schema.ts";
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

function emitDbBadArgs(usage: string): number {
  process.stdout.write(
    `${JSON.stringify({
      ok: false,
      error: { kind: "bad_args", message: usage },
    })}\n`
  );
  return 2;
}

// Expected refusals come back as Err values from the db helpers; the catch blocks are the
// process boundary for unexpected throws only (errorEnvelope maps those to kind "internal").
async function dbReconcileHandler(args: string[]): Promise<number> {
  const [dbPath, schemaFile] = args;
  if (!dbPath || !schemaFile) {
    return emitDbBadArgs("usage: runner db-reconcile <dbPath> <schemaFile>");
  }
  try {
    const result = await reconcile(dbPath, schemaFile);
    if (result.isErr()) {
      process.stdout.write(`${JSON.stringify(errorEnvelope(result.error))}\n`);
      return 1;
    }
    process.stdout.write(`${JSON.stringify({ ok: true, ...result.value })}\n`);
    return 0;
  } catch (e) {
    process.stdout.write(`${JSON.stringify(errorEnvelope(e))}\n`);
    return 1;
  }
}

async function dbSchemaHandler(args: string[]): Promise<number> {
  const [dbPath, outSchemaTs] = args;
  if (!dbPath || !outSchemaTs) {
    return emitDbBadArgs("usage: runner db-schema <dbPath> <outSchemaTs>");
  }
  try {
    const result = generateSchemaFileText(dbPath);
    if (result.isErr()) {
      process.stdout.write(`${JSON.stringify(errorEnvelope(result.error))}\n`);
      return 1;
    }
    await Bun.write(outSchemaTs, result.value);
    process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
    return 0;
  } catch (e) {
    process.stdout.write(`${JSON.stringify(errorEnvelope(e))}\n`);
    return 1;
  }
}

async function dbQueryHandler(args: string[]): Promise<number> {
  const [dbPath] = args;
  if (!dbPath) {
    return emitDbBadArgs("usage: runner db-query <dbPath> (SQL on stdin)");
  }
  try {
    const sql = await Bun.stdin.text();
    const result = queryReadonly(dbPath, sql);
    if (result.isErr()) {
      process.stdout.write(`${JSON.stringify(errorEnvelope(result.error))}\n`);
      return 1;
    }
    process.stdout.write(`${JSON.stringify({ ok: true, ...result.value })}\n`);
    return 0;
  } catch (e) {
    process.stdout.write(`${JSON.stringify(errorEnvelope(e))}\n`);
    return 1;
  }
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "build") {
    return buildHandler(rest);
  }
  if (command === "db-reconcile") {
    return dbReconcileHandler(rest);
  }
  if (command === "db-schema") {
    return dbSchemaHandler(rest);
  }
  if (command === "db-query") {
    return dbQueryHandler(rest);
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
