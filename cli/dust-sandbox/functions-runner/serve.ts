// Warm function worker: a generic bun process that keeps imported function
// bundles resident and serves invocations over a unix socket, so repeat
// invocations skip process spawn, bundle resolution, and the import of the
// bundle and its dependencies (the dominant sandbox-side costs of a cold run).
//
// Workers are pod-scoped, not function-scoped: the request names the function
// and the worker resolves and imports its bundle on first use (the module
// cache keeps it). One invocation at a time per worker — the per-invocation
// environment (sandbox token, user identity) travels in the request and is
// applied to process.env for the duration of the invocation, then cleared.
// Concurrency would race those swaps and break the serial-execution semantics
// every published bundle was written under, so a request arriving while one
// is running gets an immediate `busy` reply and the client tries another
// worker or runs cold instead of queueing behind work of unknown duration.
//
// Duplicate executions are the failure mode this protocol is shaped around:
// pod functions are arbitrary side-effectful code, and front assumes a failed
// start means nothing ran. The worker acks before executing; the client only
// falls back to the cold path on failures that precede the ack. After the
// ack, a lost outcome is reported as a failed invocation, never re-run.
//
// The worker is disposable. It exits on idle (the timeout is the spawner's
// choice: burst workers get seconds, base workers minutes), at a hard
// lifetime cap (drained, never mid-invocation), on any malformed request,
// when an invocation outlives its deadline (without replying: the client's
// front-side timeout killed it long before), and it self-recycles — drain,
// then exit — when a bundle it imported goes stale (ES modules cannot be
// evicted, so rebirth is the only pruning) or when its RSS crosses the cap.

import { createHash } from "node:crypto";
import { readdirSync, unlinkSync } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { invoke } from "./invoke.ts";
import type { RequestInput } from "./protocol.ts";
import { BadInputError, parseInput } from "./protocol.ts";

export const WARM_PROTOCOL_VERSION = 2;

// Lifetime: hard cap that recycles the worker, bounding both bundle
// accumulation (imports are permanent for the life of the process) and
// staleness that gcsfuse metadata caching could hide from unstamped
// envelopes. Deadline: an invocation that runs this long lost its client to
// front's much shorter exec timeout ages ago; exit and free the socket.
// RSS cap: recycles a worker whose imported working set outgrew its share
// of the sandbox's memory. Sized so a full pool of 8 stays bounded at
// ~1.6GB inside the 2GB sandbox, alongside its mounts and daemons.
const MAX_LIFETIME_MS = 600_000;
const INVOCATION_DEADLINE_MS = 120_000;
const MAX_RSS_BYTES = 200 * 1024 * 1024;

// Per-invocation env vars inherited from the cold run that spawned this
// worker. Scrubbed at startup: they belong to that invocation, and every
// request carries its own.
const SPAWN_ENV_SCRUB_KEYS = ["DUST_SANDBOX_TOKEN", "DUST_POD_USER_IDENTITY"];

// Mirrors dsbx's function-name validation: the name feeds a directory scan.
const VALID_NAME = /^[A-Za-z0-9_-]+$/;

const WarmRequestSchema = z.object({
  v: z.literal(WARM_PROTOCOL_VERSION),
  // Non-string values are dropped rather than refused: only strings can be
  // applied to process.env, and the request must not die for an ignorable
  // field.
  env: z.record(z.string(), z.unknown()).transform((env) => {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === "string") {
        out[key] = value;
      }
    }
    return out;
  }),
  input: z.string(),
  // The function to serve. Workers are generic: the bundle is resolved from
  // the functions directory and imported on first use.
  name: z.string().regex(VALID_NAME),
});

type WarmRequest = z.infer<typeof WarmRequestSchema>;

export function parseWarmRequest(line: string): WarmRequest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  const result = WarmRequestSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

interface BundleStamp {
  mtimeMs: number;
  size: number;
}

/** A bundle this worker has imported; the module cache pins it until exit. */
interface ImportedBundle {
  handlerPath: string;
  stamp: BundleStamp;
  sha256: string;
}

async function statBundle(handlerPath: string): Promise<BundleStamp | null> {
  try {
    const s = await stat(handlerPath);
    return { mtimeMs: s.mtimeMs, size: s.size };
  } catch {
    return null;
  }
}

function sameStamp(a: BundleStamp | null, b: BundleStamp | null): boolean {
  return (
    a !== null && b !== null && a.mtimeMs === b.mtimeMs && a.size === b.size
  );
}

async function sha256OfFile(path: string): Promise<string | null> {
  try {
    const bytes = await Bun.file(path).arrayBuffer();
    return createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Resolve a function name to its bundle file, extension-agnostically —
 * the same contract as dsbx's resolve_existing: exactly one file in the
 * functions directory whose stem is the name.
 */
export function resolveBundle(
  functionsDir: string,
  name: string
): string | null {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(functionsDir, { withFileTypes: true });
  } catch {
    return null;
  }
  const matches = entries.filter((entry) => {
    if (!entry.isFile()) {
      return false;
    }
    const dot = entry.name.lastIndexOf(".");
    return (dot <= 0 ? entry.name : entry.name.slice(0, dot)) === name;
  });
  if (matches.length !== 1) {
    return null;
  }
  return join(functionsDir, matches[0]!.name);
}

/**
 * Applies a request's environment on top of process.env and returns the keys
 * it set, so the caller can clear them once the invocation completes. The
 * request carries the client's full environment, so the invocation sees
 * exactly what a cold run's child would have inherited; clearing afterwards
 * keeps per-invocation secrets out of the idle worker's environment.
 */
export function applyRequestEnv(env: Record<string, string>): Set<string> {
  const applied = new Set<string>();
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
    applied.add(key);
  }
  return applied;
}

export function clearAppliedEnv(applied: Set<string>): void {
  for (const key of applied) {
    delete process.env[key];
  }
}

// Minimal surface of Bun's unix socket needed here, typed so the write path
// can honor partial writes.
interface WarmSocket {
  write(data: string | Uint8Array): number;
  end(): void;
}

/**
 * Backpressure-aware write: Bun's socket.write returns how many bytes it
 * accepted, and a large outcome can exceed the kernel buffer. The remainder
 * is retried from the drain callback via the pending map; end() only happens
 * once everything is flushed, so the client never sees a truncated JSON line.
 */
const pendingWrites = new Map<object, Uint8Array>();

function writeThenEnd(socket: WarmSocket, payload: string): void {
  const bytes = new TextEncoder().encode(payload);
  const written = socket.write(bytes);
  if (written >= bytes.length) {
    socket.end();
    return;
  }
  pendingWrites.set(socket, bytes.subarray(Math.max(written, 0)));
}

function drainPending(socket: WarmSocket): void {
  const remaining = pendingWrites.get(socket);
  if (!remaining) {
    return;
  }
  const written = socket.write(remaining);
  if (written >= remaining.length) {
    pendingWrites.delete(socket);
    socket.end();
    return;
  }
  pendingWrites.set(socket, remaining.subarray(Math.max(written, 0)));
}

export async function serve(
  socketPath: string,
  idleTimeoutMs: number
): Promise<never> {
  for (const key of SPAWN_ENV_SCRUB_KEYS) {
    delete process.env[key];
  }

  const functionsDir = process.env.DUST_FUNCTIONS_DIR;
  if (!functionsDir) {
    process.exit(1);
  }

  // name -> imported bundle. Both the resolution and the module are cached
  // for the life of the worker: a cached resolution that goes bad (bundle
  // deleted, extension changed) fails its per-request stat and takes the
  // stale path below, which recycles the worker.
  const imported = new Map<string, ImportedBundle>();

  let boundSocket = false;
  const exit = (code: number): never => {
    // Remove the socket first so no client connects to a dying worker — but
    // only if this worker owns it: a duplicate that lost the bind race must
    // not delete the winner's socket on its way out.
    if (boundSocket) {
      try {
        unlinkSync(socketPath);
      } catch {
        // Best effort.
      }
    }
    process.exit(code);
  };

  let busy = false;
  // Set when the worker must not serve further requests (lifetime cap
  // reached, a bundle went stale, RSS over cap): the in-flight invocation
  // finishes and replies, then the worker exits. Imports are permanent, so
  // rebirth is the only way to shed a stale or bloated working set.
  let draining = false;
  // The busy guard matters: burst workers run a 15s idle, far under the
  // invocation deadline, and an idle exit mid-invocation would sever a
  // legitimately running function post-ack. A timer that fires while busy is
  // simply dropped; the invocation's release re-arms it.
  const idleExit = () => {
    if (!busy) {
      exit(0);
    }
  };
  let idleTimer = setTimeout(idleExit, idleTimeoutMs);
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(idleExit, idleTimeoutMs);
  };
  setTimeout(() => {
    if (busy) {
      draining = true;
    } else {
      exit(0);
    }
  }, MAX_LIFETIME_MS);

  const socketBuffers = new Map<object, string>();
  // Sockets whose exit must wait for their reply to flush: a draining
  // worker's final outcome can exceed the kernel buffer, and exiting on the
  // next tick would truncate it — reporting a completed invocation as lost.
  const exitWhenDrained = new Set<object>();

  function reply(
    socket: WarmSocket,
    response: Record<string, unknown>,
    { exitAfter = false }: { exitAfter?: boolean } = {}
  ): void {
    writeThenEnd(socket, `${JSON.stringify(response)}\n`);
    if (exitAfter) {
      if (pendingWrites.has(socket)) {
        exitWhenDrained.add(socket);
      } else {
        // Fully flushed; exit on the next tick so the write callbacks run.
        setTimeout(() => exit(0), 0);
      }
    }
  }

  /**
   * Ensure the request's bundle is imported and current. Returns the bundle
   * and whether this request paid the import, or null after a pre-ack `stale`
   * reply was sent (the client re-runs cold, which reads the bundle fresh and
   * respawns workers as needed).
   */
  async function ensureBundle(
    socket: WarmSocket,
    request: WarmRequest,
    expectedSha256: string | undefined
  ): Promise<{
    bundle: ImportedBundle;
    importKind: "cached" | "fresh";
  } | null> {
    const staleReply = ({ recycle = false }: { recycle?: boolean } = {}) => {
      // A recycle exits right after the reply flushes: this request holds
      // the busy claim (no invocation is in flight), and the worker holds an
      // import it can never serve again. Draining gates the tick before the
      // exit lands.
      if (recycle) {
        draining = true;
      }
      reply(
        socket,
        { v: WARM_PROTOCOL_VERSION, stale: true },
        {
          exitAfter: recycle,
        }
      );
      return null;
    };

    const existing = imported.get(request.name);
    if (existing) {
      // A republished bundle must never be served from the old import. One
      // metadata call per request; any difference (or a vanished file), or a
      // request stamped with a hash this import does not match, sends the
      // client down the cold path — and recycles this worker, since the old
      // module can never be evicted.
      const current = await statBundle(existing.handlerPath);
      if (
        !sameStamp(existing.stamp, current) ||
        (expectedSha256 !== undefined && expectedSha256 !== existing.sha256)
      ) {
        return staleReply({ recycle: true });
      }
      return { bundle: existing, importKind: "cached" };
    }

    const handlerPath = resolveBundle(functionsDir!, request.name);
    if (handlerPath === null) {
      // Missing or ambiguous bundle: the cold path owes the caller the
      // structured error, not this worker.
      return staleReply();
    }
    const stamp = await statBundle(handlerPath);
    if (stamp === null) {
      return staleReply();
    }
    // Hash before importing so the hash describes the bytes the import
    // reads; a write landing between the two is caught by the next
    // request's stat.
    const sha256 = await sha256OfFile(handlerPath);
    if (sha256 === null) {
      return staleReply();
    }
    if (expectedSha256 !== undefined && expectedSha256 !== sha256) {
      // The on-disk bundle does not match what the publisher stamped
      // (gcsfuse lag): refuse WITHOUT importing, so this worker is not
      // poisoned with a module it would have to recycle over.
      return staleReply();
    }
    try {
      // A static import is impossible here: the bundle to serve is resolved
      // at request time, a different published function per request.
      await import(handlerPath);
    } catch {
      // A bundle that fails to import still gets served: invoke() reports
      // the import error as a structured outcome, exactly like a cold run.
    }
    const bundle: ImportedBundle = { handlerPath, stamp, sha256 };
    imported.set(request.name, bundle);
    return { bundle, importKind: "fresh" };
  }

  // Runs under the busy claim taken synchronously in handleLine; releases it
  // (and re-arms the idle exit) on every path that does not exit the worker.
  async function runInvocation(
    socket: WarmSocket,
    request: WarmRequest
  ): Promise<void> {
    try {
      let input: RequestInput;
      try {
        input = parseInput(request.input);
      } catch (e) {
        // Pre-ack: a malformed envelope never executed anything, and the
        // cold runner would classify it the same way.
        const message = e instanceof BadInputError ? e.message : String(e);
        reply(socket, {
          v: WARM_PROTOCOL_VERSION,
          outcome: { ok: false, error: { code: "bad_input", message } },
        });
        return;
      }

      const ensured = await ensureBundle(socket, request, input.bundleSha256);
      if (ensured === null) {
        return;
      }
      const { bundle, importKind } = ensured;

      // The ack is the point of no return: from here the client must never
      // fall back to the cold path, because the function may have side
      // effects in flight. A lost outcome after this frame is a failed
      // invocation, not a retried one.
      const ackWritten = socket.write(
        `${JSON.stringify({ v: WARM_PROTOCOL_VERSION, ack: true })}\n`
      );
      if (ackWritten <= 0) {
        // The client is already gone; do not execute for a dead client.
        socket.end();
        return;
      }

      // An invocation that outlives this deadline lost its client to
      // front's exec timeout long ago. Exit without replying and free the
      // socket; the hung function was never going to produce an outcome
      // anyway.
      const deadline = setTimeout(() => exit(1), INVOCATION_DEADLINE_MS);

      const applied = applyRequestEnv(request.env);
      try {
        const outcome = await invoke(bundle.handlerPath, input);
        if (process.memoryUsage.rss() > MAX_RSS_BYTES) {
          draining = true;
        }
        reply(
          socket,
          { v: WARM_PROTOCOL_VERSION, outcome, importKind },
          { exitAfter: draining }
        );
      } finally {
        clearTimeout(deadline);
        clearAppliedEnv(applied);
      }
    } finally {
      busy = false;
      armIdle();
    }
  }

  function handleLine(socket: WarmSocket, line: string): void {
    if (busy || draining) {
      // Never queue: the caller's timeout is shorter than any queue wait
      // guarantee this worker could make, and a queued request would execute
      // for a client that already gave up. An immediate busy reply sends the
      // client to the next worker (or the cold path) before anything ran.
      reply(socket, { v: WARM_PROTOCOL_VERSION, busy: true });
      return;
    }
    const request = parseWarmRequest(line);
    if (request === null) {
      // A client this worker does not understand; dying lets the cold path
      // respawn a matching one.
      reply(
        socket,
        { v: WARM_PROTOCOL_VERSION, error: "bad warm request" },
        { exitAfter: true }
      );
      return;
    }
    // Claim the worker synchronously, before runInvocation's first await:
    // ensureBundle suspends on stat/read/import, and a second request
    // arriving during that suspension must see busy — two invocations in
    // flight would race the process-global env swap and hand one caller's
    // identity to another's function.
    busy = true;
    void runInvocation(socket, request);
  }

  const bind = () =>
    Bun.listen({
      unix: socketPath,
      socket: {
        open() {
          // Probe connections (the client checks for a listener before
          // spawning a duplicate worker) send no data; the idle timer keeps
          // running so they cannot pin the worker alive.
        },
        data(socket, chunk) {
          const buffered = (socketBuffers.get(socket) ?? "") + chunk.toString();
          const newline = buffered.indexOf("\n");
          if (newline === -1) {
            socketBuffers.set(socket, buffered);
            return;
          }
          socketBuffers.delete(socket);
          handleLine(socket, buffered.slice(0, newline));
        },
        drain(socket) {
          drainPending(socket);
          if (!pendingWrites.has(socket) && exitWhenDrained.has(socket)) {
            setTimeout(() => exit(0), 0);
          }
        },
        close(socket) {
          socketBuffers.delete(socket);
          pendingWrites.delete(socket);
          if (exitWhenDrained.has(socket)) {
            // The client died before the flush completed; nothing left to
            // deliver, and the exit must not be lost with it.
            setTimeout(() => exit(0), 0);
          }
        },
        error(socket) {
          socketBuffers.delete(socket);
          pendingWrites.delete(socket);
          if (exitWhenDrained.has(socket)) {
            setTimeout(() => exit(0), 0);
          }
        },
      },
    });

  try {
    bind();
    boundSocket = true;
  } catch {
    // The socket path exists. Either a live worker owns it — this process is
    // a lost spawn race and must exit without touching the winner's socket —
    // or it is a stale leftover from a dead worker, which is safe to replace.
    const listening = await new Promise<boolean>((resolve) => {
      Bun.connect({
        unix: socketPath,
        socket: {
          open(probe) {
            resolve(true);
            probe.end();
          },
          data() {},
          error() {
            resolve(false);
          },
          connectError() {
            resolve(false);
          },
        },
      }).catch(() => resolve(false));
    });
    if (listening) {
      process.exit(0);
    }
    await unlink(socketPath).catch(() => {});
    bind();
    boundSocket = true;
  }

  // The process stays alive on the event loop; exits go through exit() above.
  return new Promise<never>(() => {});
}
