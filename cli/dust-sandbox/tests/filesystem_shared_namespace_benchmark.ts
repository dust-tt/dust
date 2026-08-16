#!/usr/bin/env bun

import { open, readFile, readdir, rename, unlink } from "node:fs/promises";
import { constants } from "node:fs";

function argument(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) {
    throw new Error(`Missing --${name}`);
  }
  return value;
}

function optionalArgument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error
    ? String(error.code)
    : "UNKNOWN";
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeAndSync(
  path: string,
  content: string,
  create: boolean
): Promise<void> {
  const flags = create
    ? constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    : constants.O_WRONLY | constants.O_TRUNC;
  const handle = await open(path, flags, 0o644);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function poll(
  matches: () => Promise<boolean>,
  timeoutMs: number
): Promise<{ detectedAtMs: number; attempts: number }> {
  const deadline = Date.now() + timeoutMs;
  let attempts = 0;
  while (Date.now() <= deadline) {
    attempts += 1;
    if (await matches()) {
      return { detectedAtMs: Date.now(), attempts };
    }
    await sleep(10);
  }
  throw new Error(`Condition was not visible after ${timeoutMs} ms`);
}

async function main(): Promise<void> {
  const operation = argument("operation");
  const path = argument("path");

  if (operation === "warm") {
    await readText(path);
    await readdir(path.slice(0, path.lastIndexOf("/")));
    process.stdout.write(
      `${JSON.stringify({ ok: true, completedAtMs: Date.now() })}\n`
    );
    return;
  }

  if (operation === "overwrite" || operation === "create") {
    await writeAndSync(path, argument("content"), operation === "create");
    process.stdout.write(
      `${JSON.stringify({ ok: true, completedAtMs: Date.now() })}\n`
    );
    return;
  }

  if (operation === "poll-content") {
    const expected = argument("content");
    const result = await poll(
      async () => (await readText(path)) === expected,
      Number(optionalArgument("timeout-ms") ?? 15_000)
    );
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
    return;
  }

  if (operation === "poll-exists") {
    const expected = argument("expected") === "true";
    const result = await poll(
      async () => ((await readText(path)) !== null) === expected,
      Number(optionalArgument("timeout-ms") ?? 15_000)
    );
    process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
    return;
  }

  if (operation === "rename") {
    await rename(path, argument("destination"));
    process.stdout.write(
      `${JSON.stringify({ ok: true, completedAtMs: Date.now() })}\n`
    );
    return;
  }

  if (operation === "unlink") {
    await unlink(path);
    process.stdout.write(
      `${JSON.stringify({ ok: true, completedAtMs: Date.now() })}\n`
    );
    return;
  }

  if (operation === "race") {
    const handle = await open(path, constants.O_WRONLY | constants.O_TRUNC);
    try {
      await handle.writeFile(argument("content"));
      const startAtMs = Number(argument("start-at-ms"));
      await sleep(Math.max(0, startAtMs - Date.now()));
      await handle.sync();
      await handle.close();
      process.stdout.write(
        `${JSON.stringify({ ok: true, completedAtMs: Date.now() })}\n`
      );
    } catch (error) {
      try {
        await handle.close();
      } catch {
        // The failed flush may already have closed the kernel handle.
      }
      // A failed final commit must discard this sandbox's staged bytes. Reading
      // the path again should fetch the winner accepted by Front, not the loser.
      const visibleContent = await readText(path);
      const code = errorCode(error);
      if (
        code === "ESTALE" &&
        (visibleContent === null || visibleContent === argument("content"))
      ) {
        throw new Error("A losing writer kept serving its unpublished bytes");
      }
      process.stdout.write(
        `${JSON.stringify({ ok: false, code, visibleContent, completedAtMs: Date.now() })}\n`
      );
    }
    return;
  }

  throw new Error(`Unknown operation: ${operation}`);
}

await main();
