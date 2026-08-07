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
// The server is disposable: it exits on idle and on any malformed request.
// The staleness, secret-scrubbing, backpressure, lifetime, and deadline
// hardening lands separately on top of this core.

import { unlinkSync } from "node:fs";
import { unlink } from "node:fs/promises";

import { z } from "zod";

import { invoke } from "./invoke.ts";
import type { RequestInput } from "./protocol.ts";
import { BadInputError, parseInput } from "./protocol.ts";

export const WARM_PROTOCOL_VERSION = 1;

// How long the server waits for another invocation before exiting.
const IDLE_TIMEOUT_MS = 120_000;

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

// Minimal surface of Bun's unix socket needed here.
interface WarmSocket {
  write(data: string | Uint8Array): number;
  end(): void;
}

export async function serve(
  handlerPath: string,
  socketPath: string
): Promise<never> {
  // Import eagerly: the server is spawned right after a cold run, so warming
  // now (rather than on first request) makes the very next invocation fast.
  // The module cache keyed by path is the whole point of this process. A
  // static import is impossible here: the bundle to serve is a runtime
  // argument, a different published function per server.
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
  let idleTimer = setTimeout(() => exit(0), IDLE_TIMEOUT_MS);
  const armIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => exit(0), IDLE_TIMEOUT_MS);
  };

  const socketBuffers = new Map<object, string>();

  function reply(
    socket: WarmSocket,
    response: Record<string, unknown>,
    { exitAfter = false }: { exitAfter?: boolean } = {}
  ): void {
    socket.write(`${JSON.stringify(response)}\n`);
    socket.end();
    if (exitAfter) {
      // Exit on the next tick so the write callbacks run.
      setTimeout(() => exit(0), 0);
    }
  }

  async function runInvocation(
    socket: WarmSocket,
    request: WarmRequest
  ): Promise<void> {
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

    const applied = applyRequestEnv(request.env);
    try {
      const outcome = await invoke(handlerPath, input);
      reply(socket, { v: WARM_PROTOCOL_VERSION, outcome });
    } finally {
      clearAppliedEnv(applied);
      busy = false;
      armIdle();
    }
  }

  function handleLine(socket: WarmSocket, line: string): void {
    if (busy) {
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
        close(socket) {
          socketBuffers.delete(socket);
        },
        error(socket) {
          socketBuffers.delete(socket);
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
