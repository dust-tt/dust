#!/usr/bin/env bun
// Embedded runner for `dsbx function` and `dsbx db`. Subcommands:
//   runner run <path>                            stdin request envelope -> stdout Output JSON
//   runner serve <functionsDir> <socketPath>     warm worker: serve invocations of any function
//                                                in <functionsDir> over a unix socket until idle
//   runner get <path>                            -> stdout FunctionSchema JSON (or {error})
//   runner build <src> <outBundle> <outSchema>   bundle + extract schema to files
//   runner db-reconcile <dbPath> <schemaFile>    additive-only DDL reconcile -> stdout envelope
//   runner db-schema <dbPath> <outSchemaTs>      regenerate drizzle schema file -> file + envelope
//   runner db-query <dbPath> [spillDir]          stdin SQL -> stdout rows envelope (SELECT/DML,
//                                                DDL refused; a large result spills to a file
//                                                under spillDir that the envelope names)

import { build } from "./build.ts";
import { errorEnvelope, sandboxDatabaseMaxSizeBytes } from "./db/common.ts";
import { runQuery } from "./db/query.ts";
import { reconcile } from "./db/reconcile.ts";
import { generateSchemaFileText } from "./db/schema.ts";
import { applyResultSpillPolicy, emitEnvelopeLine } from "./emit.ts";
import { invoke } from "./invoke.ts";
import { BadInputError, parseInput, type RequestInput } from "./protocol.ts";
import { getFunctionSchema } from "./schema.ts";
import { serve } from "./serve.ts";

// Everything this process creates — including files the function body creates
// itself — must stay group-writable. The shared sandbox directories are setgid
// with a `g::rwx` default ACL (`/pod-state/databases`, `/files`), but a default
// ACL only masks the mode a process asks for; it cannot add bits the umask
// stripped. With the inherited 022/027 umask, a SQLite database a function
// opens directly lands at 0644/0640 owned by `agent-proxied:agent`, and
// litestream (user `dust-state`, group `agent`) can then read but never write
// it — every replication sync fails with SQLITE_READONLY, forever. `dsbx db
// reconcile` already chmods 0660 for exactly this reason; the umask extends the
// same guarantee to files it did not create. 007 keeps `other` empty: group
// `agent` is the sandbox's own trust boundary, everyone else stays out.
process.umask(0o007);

async function runHandler(handlerPath: string): Promise<number> {
  const raw = await Bun.stdin.text();
  let input: RequestInput;
  try {
    input = parseInput(raw);
  } catch (e) {
    const message = e instanceof BadInputError ? e.message : String(e);
    emitEnvelopeLine({ ok: false, error: { code: "bad_input", message } });
    return 2;
  }
  const out = await invoke(handlerPath, input);
  // An oversized result is spilled to a scratch file and replaced by a
  // pointer envelope; over the hard cap it becomes an output_too_large error.
  const delivered = applyResultSpillPolicy(out);
  emitEnvelopeLine(delivered);
  return delivered.ok ? 0 : 1;
}

async function getHandler(handlerPath: string): Promise<number> {
  try {
    const schema = await getFunctionSchema(handlerPath);
    emitEnvelopeLine(schema);
    return 0;
  } catch (e) {
    emitEnvelopeLine({ error: e instanceof Error ? e.message : String(e) });
    return 1;
  }
}

async function buildHandler(args: string[]): Promise<number> {
  const [srcPath, outBundlePath, outSchemaPath] = args;
  if (!srcPath || !outBundlePath || !outSchemaPath) {
    emitEnvelopeLine({
      ok: false,
      error: {
        kind: "bad_args",
        message: "usage: runner build <src> <outBundle> <outSchema>",
      },
    });
    return 2;
  }
  const result = await build(srcPath, outBundlePath, outSchemaPath);
  emitEnvelopeLine(result);
  return result.ok ? 0 : 1;
}

function emitDbBadArgs(usage: string): number {
  emitEnvelopeLine({
    ok: false,
    error: { kind: "bad_args", message: usage },
  });
  return 2;
}

// The db helpers return Result; expected refusals are the Err branch. Unexpected throws are
// bugs — we don't catch our own errors (ERR1); they surface as an internal error at the
// front boundary (a runner that emits no envelope).
async function dbReconcileHandler(args: string[]): Promise<number> {
  const [dbPath, schemaFile] = args;
  if (!dbPath || !schemaFile) {
    return emitDbBadArgs("usage: runner db-reconcile <dbPath> <schemaFile>");
  }
  const result = await reconcile(dbPath, schemaFile);
  if (result.isErr()) {
    emitEnvelopeLine(errorEnvelope(result.error));
    return 1;
  }
  emitEnvelopeLine({ ok: true, ...result.value });
  return 0;
}

async function dbSchemaHandler(args: string[]): Promise<number> {
  const [dbPath, outSchemaTs] = args;
  if (!dbPath || !outSchemaTs) {
    return emitDbBadArgs("usage: runner db-schema <dbPath> <outSchemaTs>");
  }
  const result = generateSchemaFileText(dbPath);
  if (result.isErr()) {
    emitEnvelopeLine(errorEnvelope(result.error));
    return 1;
  }
  await Bun.write(outSchemaTs, result.value);
  emitEnvelopeLine({ ok: true });
  return 0;
}

async function dbQueryHandler(args: string[]): Promise<number> {
  // spillDir is where an oversized result is written as a pod file; Rust passes the pod-files
  // dir. Absent (a bare dbPath), runQuery falls back to a temp dir.
  const [dbPath, spillDir] = args;
  if (!dbPath) {
    return emitDbBadArgs(
      "usage: runner db-query <dbPath> [spillDir] (SQL on stdin)"
    );
  }
  const maxSizeBytes = sandboxDatabaseMaxSizeBytes();
  if (maxSizeBytes.isErr()) {
    emitEnvelopeLine(errorEnvelope(maxSizeBytes.error));
    return 1;
  }
  const sql = await Bun.stdin.text();
  const result = runQuery(dbPath, sql, maxSizeBytes.value, spillDir);
  if (result.isErr()) {
    emitEnvelopeLine(errorEnvelope(result.error));
    return 1;
  }
  emitEnvelopeLine({ ok: true, ...result.value });
  return 0;
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
    process.stderr.write("usage: runner <run|get|serve> <handler-path>\n");
    return 2;
  }
  switch (command) {
    case "run":
      return runHandler(handlerPath);
    case "get":
      return getHandler(handlerPath);
    case "serve": {
      const [functionsDir, socketPath] = rest;
      if (!functionsDir || !socketPath) {
        process.stderr.write(
          "usage: runner serve <functions-dir> <socket-path>\n"
        );
        return 2;
      }
      // Never returns: the worker exits itself (idle, lifetime, staleness).
      return serve(functionsDir, socketPath);
    }
    default:
      process.stderr.write(`runner: unknown command "${command}"\n`);
      return 2;
  }
}

process.exit(await main());
