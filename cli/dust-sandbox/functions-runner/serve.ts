// Warm function server: keeps one imported function bundle resident in a bun
// process and serves invocations over a unix socket, so repeat invocations skip
// process spawn, bundle resolution, and the import of the bundle and its
// dependencies (the dominant sandbox-side costs of a cold run).
//
// One server serves exactly one handler path, one invocation at a time. The
// per-invocation environment (sandbox token, user identity) travels in the
// request and is applied to process.env for the duration of the invocation,
// then cleared — concurrency would race those swaps, so a request arriving
// while one is running gets an immediate `busy` reply and the client runs
// cold instead of queueing behind work of unknown duration.
//
// Duplicate executions are the failure mode this protocol is shaped around:
// pod functions are arbitrary side-effectful code, and front assumes a failed
// start means nothing ran. The server acks before executing; the client only
// falls back to the cold path on failures that precede the ack. After the
// ack, a lost outcome is reported as a failed invocation, never re-run.
//
// The server is disposable. It exits on idle, at a hard lifetime cap (drained,
// never mid-invocation), when the bundle on disk changes, on any malformed
// request, or when an invocation outlives its deadline (without replying: the
// client's front-side timeout killed it long before).

import { createHash } from "node:crypto";
import { unlinkSync } from "node:fs";
import { stat, unlink } from "node:fs/promises";

import { z } from "zod";

import { invoke } from "./invoke.ts";
import type { RequestInput } from "./protocol.ts";
import { BadInputError, parseInput } from "./protocol.ts";

export const WARM_PROTOCOL_VERSION = 1;

// Idle: how long the server waits for another invocation before exiting.
// Lifetime: hard cap bounding how long a republished bundle can keep being
// served when the envelope carries no bundle hash and gcsfuse metadata
// caching hides the change from the per-request stat. Deadline: an
// invocation that runs this long lost its client to front's much shorter
// exec timeout ages ago; exit and free the socket.
const IDLE_TIMEOUT_MS = 120_000;
const MAX_LIFETIME_MS = 600_000;
const INVOCATION_DEADLINE_MS = 120_000;

// Per-invocation env vars inherited from the cold run that spawned this
// server. Scrubbed at startup: they belong to that invocation, and every
// request carries its own.
const SPAWN_ENV_SCRUB_KEYS = ["DUST_SANDBOX_TOKEN", "DUST_POD_USER_IDENTITY"];

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
});

type WarmRequest = z.infer<typeof WarmRequestSchema>;

interface BundleStamp {
  mtimeMs: number;
  size: number;
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

/**
 * Applies a request's environment on top of process.env and returns the keys
 * it set, so the caller can clear them once the invocation completes. The
 * request carries the client's full environment, so the invocation sees
 * exactly what a cold run's child would have inherited; clearing afterwards
 * keeps per-invocation secrets out of the idle server's environment.
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
  handlerPath: string,
  socketPath: string
): Promise<never> {
  for (const key of SPAWN_ENV_SCRUB_KEYS) {
    delete process.env[key];
  }

  // Import eagerly: the server is spawned right after a cold run, so warming
  // now (rather than on first request) makes the very next invocation fast.
  // The module cache keyed by path is the whole point of this process. A
  // static import is impossible here: the bundle to serve is a runtime
  // argument, a different published function per server.
  const importedStamp = await statBundle(handlerPath);
  if (importedStamp === null) {
    process.exit(1);
  }
  // Hash before importing so the hash describes the bytes the import reads;
  // a write landing between the two is caught by the per-request stat.
  const importedSha256 = await sha256OfFile(handlerPath);
  if (importedSha256 === null) {
    process.exit(1);
  }
  try {
    await import(handlerPath);
  } catch {
    // A bundle that fails to import still gets served: invoke() reports the
    // import error as a structured outcome, exactly like a cold run would.
  }

  let boundSocket = false;
  const exit = (code: number): never => {
    // Remove the socket first so no client connects to a dying server — but
    // only if this server owns it: a duplicate that lost the bind race must
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
  let draining = false;
  let idleTimer = setTimeout(() => exit(0), IDLE_TIMEOUT_MS);
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => exit(0), IDLE_TIMEOUT_MS);
  };
  setTimeout(() => {
    // Never exit mid-invocation: the in-flight request finishes and replies,
    // then the drained server exits. New requests get `busy` meanwhile.
    if (busy) {
      draining = true;
    } else {
      exit(0);
    }
  }, MAX_LIFETIME_MS);

  const socketBuffers = new Map<object, string>();

  function reply(
    socket: WarmSocket,
    response: Record<string, unknown>,
    { exitAfter = false }: { exitAfter?: boolean } = {}
  ): void {
    writeThenEnd(socket, `${JSON.stringify(response)}\n`);
    if (exitAfter) {
      // The flush of a tiny control frame cannot realistically backpressure;
      // exit on the next tick so the write callbacks run.
      setTimeout(() => exit(0), 0);
    }
  }

  async function runInvocation(
    socket: WarmSocket,
    request: WarmRequest
  ): Promise<void> {
    // A republished bundle must never be served from the old import. One
    // metadata call per request; any difference (or a vanished file) sends
    // the client down the cold path, which respawns a fresh server.
    const current = await statBundle(handlerPath);
    if (!sameStamp(importedStamp, current)) {
      reply(
        socket,
        { v: WARM_PROTOCOL_VERSION, stale: true },
        { exitAfter: true }
      );
      return;
    }

    let input: RequestInput;
    try {
      input = parseInput(request.input);
    } catch (e) {
      // Pre-ack: a malformed envelope never executed anything, and the cold
      // runner would classify it the same way.
      const message = e instanceof BadInputError ? e.message : String(e);
      reply(socket, {
        v: WARM_PROTOCOL_VERSION,
        outcome: { ok: false, error: { code: "bad_input", message } },
      });
      return;
    }

    // Deterministic republish detection: front stamps each invocation with
    // the sha256 of the bundle it published, so a server that imported older
    // bytes is refused even while gcsfuse metadata caching still hides the
    // rewrite from the stat above. Pre-ack, like every refusal: the client
    // re-runs cold, which reads the bundle fresh and respawns a matching
    // server. Unstamped envelopes (older front) keep the stat and lifetime
    // backstops only.
    if (
      input.bundleSha256 !== undefined &&
      input.bundleSha256 !== importedSha256
    ) {
      reply(
        socket,
        { v: WARM_PROTOCOL_VERSION, stale: true },
        { exitAfter: true }
      );
      return;
    }

    // The ack is the point of no return: from here the client must never
    // fall back to the cold path, because the function may have side effects
    // in flight. A lost outcome after this frame is a failed invocation, not
    // a retried one.
    busy = true;
    const ackWritten = socket.write(
      `${JSON.stringify({ v: WARM_PROTOCOL_VERSION, ack: true })}\n`
    );
    if (ackWritten <= 0) {
      // The client is already gone; do not execute for a dead client.
      busy = false;
      socket.end();
      return;
    }

    // An invocation that outlives this deadline lost its client to front's
    // exec timeout long ago. Exit without replying and free the socket; the
    // hung function was never going to produce an outcome anyway.
    const deadline = setTimeout(() => exit(1), INVOCATION_DEADLINE_MS);

    const applied = applyRequestEnv(request.env);
    try {
      const outcome = await invoke(handlerPath, input);
      reply(
        socket,
        { v: WARM_PROTOCOL_VERSION, outcome },
        { exitAfter: draining }
      );
    } finally {
      clearTimeout(deadline);
      clearAppliedEnv(applied);
      busy = false;
      armIdle();
    }
  }

  function handleLine(socket: WarmSocket, line: string): void {
    if (busy || draining) {
      // Never queue: the caller's timeout is shorter than any queue wait
      // guarantee this server could make, and a queued request would execute
      // for a client that already gave up. An immediate busy reply sends the
      // client down the cold path before anything ran.
      reply(socket, { v: WARM_PROTOCOL_VERSION, busy: true });
      return;
    }
    const request = parseWarmRequest(line);
    if (request === null) {
      // A client this server does not understand; dying lets the cold path
      // respawn a matching one.
      reply(
        socket,
        { v: WARM_PROTOCOL_VERSION, error: "bad warm request" },
        { exitAfter: true }
      );
      return;
    }
    void runInvocation(socket, request);
  }

  const bind = () =>
    Bun.listen({
      unix: socketPath,
      socket: {
        open() {
          // Probe connections (the client checks for a listener before
          // spawning a duplicate server) send no data; the idle timer keeps
          // running so they cannot pin the server alive.
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
        },
        close(socket) {
          socketBuffers.delete(socket);
          pendingWrites.delete(socket);
        },
        error(socket) {
          socketBuffers.delete(socket);
          pendingWrites.delete(socket);
        },
      },
    });

  try {
    bind();
    boundSocket = true;
  } catch {
    // The socket path exists. Either a live server owns it — this process is
    // a lost spawn race and must exit without touching the winner's socket —
    // or it is a stale leftover from a dead server, which is safe to replace.
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
