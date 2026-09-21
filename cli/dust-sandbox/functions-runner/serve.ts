// Warm function worker (protocol v2): a Bun process that keeps a publication's
// function bundles resident and serves invocations over a unix socket.
//
// One worker per publication. At start it imports every slug under
// `functionsDir`, then writes an optional ready marker so dsbx can wait for
// a fully-warmed worker. Later invocations are a socket round trip — no
// process spawn, no fuse resolve, no fresh import.
//
// Invocations run concurrently. They are IO-bound in the common case (SQL,
// API calls), so the event loop interleaves many of them at once exactly
// like a web server would; per-invocation state (user identity, sandbox
// token) travels in the request and is scoped through the invocation context
// (see functions-runner/context.ts and @dust/pod), never applied to
// process.env. Beyond MAX_CONCURRENT_INVOCATIONS requests wait in a FIFO
// queue; a full or too-slow queue gets a structured `overloaded` outcome
// instead of sending the client to a cold run — unbounded cold fallback
// under saturation is exactly the memory blow-up this worker exists to
// prevent.
//
// Duplicate executions are the failure mode this protocol is shaped around:
// frame functions are arbitrary side-effectful code, and front assumes a failed
// start means nothing ran. The worker acks before executing — a synchronous
// socket write whose failure proves the client is gone — and the client only
// falls back to the cold path on failures that precede the ack. After the
// ack, a lost outcome is reported as a failed invocation, never re-run. (The
// synchronous-ack guarantee is why this stays a raw line protocol instead of
// sitting behind an HTTP server: response streaming cannot prove the ack
// reached the client's buffer before execution starts.)
//
// The worker is disposable. It exits on idle, drains at the lifetime cap,
// when its RSS crosses the recycle threshold, or when an invocation
// outlives its deadline (whose client was killed by front's much shorter
// exec timeout long ago). Idle, lifetime, and those deadlines are awake
// time: a sandbox pause must not expire them (see awake_clock.ts).
// Publications are immutable, so there is no mid-life bundle-rewrite /
// stale-stamp recycle path.

import { readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { AwakeClock } from "./awake_clock.ts";
import { applyResultSpillPolicy } from "./emit.ts";
import { invoke } from "./invoke.ts";
import type { RequestInput } from "./protocol.ts";
import { BadInputError, parseInput } from "./protocol.ts";

export const WARM_PROTOCOL_VERSION = 2;

// Concurrency: in-flight invocations share the event loop, so the cap bounds
// per-invocation memory and downstream pressure (sqlite, egress), not CPU —
// CPU-bound work serializes on the single JS thread regardless. The queue
// deadline stays comfortably under front's 10s inline exec timeout so a
// queued invocation either starts or is refused while its caller still
// listens; the client's own pre-ack timeout must exceed it (see warm.rs).
export const MAX_CONCURRENT_INVOCATIONS = 32;
export const MAX_QUEUED_INVOCATIONS = 128;
export const QUEUE_WAIT_DEADLINE_MS = 2_000;

// Idle: awake time with nothing running and nothing queued before exiting;
// scale-down to zero is each worker's own idle exit. Lifetime: awake-time
// cap bounding imported working-set growth. Both are measured by AwakeClock,
// so a pause/resume clock jump does not consume them. Deadline: an invocation
// that runs this long of awake time lost its client to front's much shorter
// exec timeout ages ago, and its slot is wedged for good (a promise cannot
// be killed), so the worker recycles. Rss: recycles a worker whose imported
// working set outgrew its share of the sandbox's memory. Drain flush: how
// long a drained worker waits for its last reply bytes before force-exiting
// on a client that stopped reading.
const IDLE_TIMEOUT_MS = 60 * 60 * 1_000;
const MAX_LIFETIME_MS = 2 * 60 * 60 * 1_000;
// A request older than this must not be acked: the client abandons the wait
// at 4s (see warm.rs) and falls back cold, and acking into that window is
// the one race that could double-execute. Refusing pre-ack is always safe,
// so past this age the server sends `stale` instead of starting work, and
// the ack-vs-abandon race shrinks to clock slop.
const PRE_ACK_DEADLINE_MS = 3_000;
const INVOCATION_DEADLINE_MS = 120_000;
const MAX_RSS_BYTES = 300 * 1024 * 1024;
const DRAIN_FLUSH_TIMEOUT_MS = 5_000;

// Per-invocation env vars inherited from the cold run that spawned this
// worker. Scrubbed at startup: they belong to that invocation, and every
// request carries its own environment in the request itself.
const SPAWN_ENV_SCRUB_KEYS = ["DUST_SANDBOX_TOKEN", "DUST_POD_USER_IDENTITY"];

// Mirrors dsbx's function-name validation: the name feeds a directory scan.
const VALID_NAME = /^[A-Za-z0-9_-]+$/;

const WarmRequestSchema = z.object({
  v: z.literal(WARM_PROTOCOL_VERSION),
  // Non-string values are dropped rather than refused: only strings are
  // meaningful environment values, and the request must not die for an
  // ignorable field.
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
  // The function to serve. Bundles are preloaded at worker start from the
  // (immutable) publication functions directory.
  name: z.string().regex(VALID_NAME),
});

type WarmRequest = z.infer<typeof WarmRequestSchema>;

/** A bundle this worker preloaded; the module cache pins it until exit. */
interface ImportedBundle {
  handlerPath: string;
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

/** Stems of every uniquely-named function file under `functionsDir`. */
export function listFunctionNames(functionsDir: string): string[] {
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(functionsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) {
      continue;
    }
    const dot = entry.name.lastIndexOf(".");
    const stem = dot <= 0 ? entry.name : entry.name.slice(0, dot);
    // Same charset as dsbx `is_valid_name`.
    if (!/^[A-Za-z0-9_-]+$/.test(stem)) {
      continue;
    }
    counts.set(stem, (counts.get(stem) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n === 1).map(([name]) => name);
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

// Minimal surface of Bun's unix socket needed here, typed so the write path
// can honor partial writes.
interface WarmSocket {
  write(data: string | Uint8Array): number;
  end(): void;
}

/** A request waiting for a free invocation slot, in FIFO order. */
interface QueueEntry {
  socket: WarmSocket;
  request: WarmRequest;
  // Awake-clock timestamp from when the line was accepted.
  receivedAtMs: number;
  // Settled entries (reply already sent, or client gone) stay in the array
  // and are skipped at dequeue time: O(1) removal without scanning the queue
  // on every socket close.
  settled: boolean;
  cancelExpire: () => void;
}

function overloadedFrame(): Record<string, unknown> {
  return {
    v: WARM_PROTOCOL_VERSION,
    outcome: {
      ok: false,
      error: {
        code: "overloaded",
        message:
          "The function's worker is running at its concurrency limit and " +
          "the wait queue is saturated; the invocation was not started.",
      },
    },
  };
}

export async function serve(
  functionsDir: string,
  socketPath: string,
  readyPath?: string
): Promise<never> {
  for (const key of SPAWN_ENV_SCRUB_KEYS) {
    delete process.env[key];
  }

  // name -> preloaded bundle. Publications are immutable; the map is filled
  // once at start and served until idle / lifetime / RSS recycle.
  const imported = new Map<string, ImportedBundle>();

  let boundSocket = false;
  let wroteReady = false;
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
    if (wroteReady && readyPath) {
      try {
        unlinkSync(readyPath);
      } catch {
        // Best effort.
      }
    }
    process.exit(code);
  };

  /**
   * Backpressure-aware write: Bun's socket.write returns how many bytes it
   * accepted, and a large outcome can exceed the kernel buffer. The
   * remainder is retried from the drain callback via the pending map; end()
   * only happens once everything is flushed, so the client never sees a
   * truncated JSON line.
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

  // `running` counts invocations past admission (including their pre-ack
  // resolve/import phase); `hung` counts the subset that blew their deadline
  // and will never release their slot. The worker is fully drained once
  // every running invocation is hung.
  let running = 0;
  let hung = 0;
  let draining = false;
  let drainExitCode = 0;
  let drainFlushTimer: ReturnType<typeof setTimeout> | null = null;
  // Settled entries linger in the array until dequeued or compacted;
  // queuedLive is the number of live ones and the number that matters for
  // admission, idling and drain.
  let queue: QueueEntry[] = [];
  let queuedLive = 0;
  const queuedBySocket = new Map<object, QueueEntry>();

  const clock = new AwakeClock();
  let cancelIdle: (() => void) | null = null;
  const clearIdle = () => {
    if (cancelIdle !== null) {
      cancelIdle();
      cancelIdle = null;
    }
  };
  const armIdle = () => {
    clearIdle();
    cancelIdle = clock.delay(IDLE_TIMEOUT_MS, () => {
      cancelIdle = null;
      // Guarded: idle is cancelled on every start, but never trust a timer
      // alone with killing a process that might be serving.
      if (running === 0 && queuedLive === 0 && !draining) {
        exit(0);
      }
    });
  };

  function settleQueueEntry(entry: QueueEntry): boolean {
    if (entry.settled) {
      return false;
    }
    entry.settled = true;
    queuedLive -= 1;
    entry.cancelExpire();
    queuedBySocket.delete(entry.socket);
    // pump() only reclaims settled entries as they reach the front, which
    // never happens while every slot stays busy with long invocations; the
    // occasional compaction keeps the array proportional to the live count
    // under that kind of churn.
    if (
      queue.length > MAX_QUEUED_INVOCATIONS &&
      queuedLive < queue.length / 2
    ) {
      queue = queue.filter((queued) => !queued.settled);
    }
    return true;
  }

  function exitIfDrained(): void {
    if (!draining || queuedLive > 0 || running !== hung) {
      return;
    }
    if (pendingWrites.size === 0) {
      exit(drainExitCode);
    }
    // Some reply bytes are still buffered toward a slow reader; give the
    // flush a bounded window, then exit anyway — the reader had its chance.
    if (drainFlushTimer === null) {
      drainFlushTimer = setTimeout(
        () => exit(drainExitCode),
        DRAIN_FLUSH_TIMEOUT_MS
      );
    }
  }

  let listenerStop: (() => void) | null = null;

  function startDrain(code: number): void {
    if (draining) {
      return;
    }
    draining = true;
    drainExitCode = code;
    clearIdle();
    // Stop accepting and free the socket path immediately: the next cold run
    // binds a fresh worker there while this one finishes its in-flight work.
    if (listenerStop !== null) {
      listenerStop();
    }
    if (boundSocket) {
      try {
        unlinkSync(socketPath);
      } catch {
        // Best effort.
      }
      boundSocket = false;
    }
    // Queued requests never started executing: refuse them as stale so their
    // clients re-run cold against the successor worker. (On a stale-triggered
    // drain, serving them from the old import would be wrong anyway.)
    for (const entry of [...queue]) {
      if (settleQueueEntry(entry)) {
        reply(entry.socket, { v: WARM_PROTOCOL_VERSION, stale: true });
      }
    }
    queue = [];
    exitIfDrained();
  }

  clock.delay(MAX_LIFETIME_MS, () => startDrain(0));

  const socketBuffers = new Map<object, string>();

  function reply(socket: WarmSocket, response: Record<string, unknown>): void {
    writeThenEnd(socket, `${JSON.stringify(response)}\n`);
  }

  /** Preload one slug into the resident map. Best-effort: a failed import
   * still records the path so invoke() can surface the error like cold. */
  async function preloadFunction(name: string): Promise<void> {
    const handlerPath = resolveBundle(functionsDir, name);
    if (handlerPath === null) {
      return;
    }
    try {
      // prefer-static-imports exemption: the module is a published function
      // bundle resolved from the functions directory at worker start.
      await import(handlerPath);
    } catch {
      // invoke() reports the import error as a structured outcome.
    }
    imported.set(name, { handlerPath });
  }

  async function runInvocation(
    socket: WarmSocket,
    request: WarmRequest,
    receivedAtMs: number
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

    const bundle = imported.get(request.name);
    if (bundle === undefined) {
      reply(socket, {
        v: WARM_PROTOCOL_VERSION,
        outcome: {
          ok: false,
          error: {
            code: "bad_input",
            message: `Unknown function "${request.name}"`,
          },
        },
      });
      return;
    }

    // The ack is the point of no return: from here the client must never
    // fall back to the cold path, because the function may have side effects
    // in flight. A lost outcome after this frame is a failed invocation, not
    // a retried one. The write is synchronous into the kernel buffer: its
    // failure proves the client is gone, so nothing executes for a client
    // that already gave up (e.g. one that timed out while queued).
    if (clock.now() - receivedAtMs > PRE_ACK_DEADLINE_MS) {
      // The pre-ack work (queue wait) outlived the client's patience budget.
      reply(socket, { v: WARM_PROTOCOL_VERSION, stale: true });
      return;
    }
    const ackBytes = new TextEncoder().encode(
      `${JSON.stringify({ v: WARM_PROTOCOL_VERSION, ack: true })}\n`
    );
    const ackWritten = socket.write(ackBytes);
    if (ackWritten < ackBytes.length) {
      // Failed or partial: the client is gone, or would read a truncated
      // frame and treat the connection as dead pre-ack. Either way nothing
      // has executed, so not executing is the only safe continuation.
      socket.end();
      return;
    }

    // An invocation that outlives this deadline lost its client to front's
    // exec timeout long ago, and its slot is wedged for good — a promise
    // cannot be killed. Recycle: drain and let the next ensure spawn a
    // fresh worker. Other in-flight invocations finish normally.
    let deadlineFired = false;
    const cancelDeadline = clock.delay(INVOCATION_DEADLINE_MS, () => {
      deadlineFired = true;
      hung += 1;
      startDrain(1);
      exitIfDrained();
    });

    try {
      const { output, timingsMs } = await invoke(
        bundle.handlerPath,
        input,
        request.env
      );
      const delivered = applyResultSpillPolicy(output);
      if (deadlineFired) {
        socket.end();
      } else {
        reply(socket, {
          v: WARM_PROTOCOL_VERSION,
          outcome: delivered,
          timingsMs: {
            handler: timingsMs.handler,
            ...(timingsMs.tools === undefined
              ? {}
              : { tools: timingsMs.tools }),
          },
        });
      }
    } finally {
      cancelDeadline();
      if (deadlineFired) {
        hung -= 1;
      }
    }
  }

  function start(
    socket: WarmSocket,
    request: WarmRequest,
    receivedAtMs: number
  ): void {
    running += 1;
    clearIdle();
    void runInvocation(socket, request, receivedAtMs)
      .catch(() => {
        // runInvocation reports failures as structured outcomes; a throw
        // here is a runner bug, and the client's timeout classifies it.
        // Never let it take down concurrent invocations.
      })
      .finally(() => {
        running -= 1;
        if (!draining && process.memoryUsage.rss() > MAX_RSS_BYTES) {
          // Trade a one-off re-import for freed memory. Checked between
          // invocation completions only, so a single greedy invocation can
          // briefly overshoot.
          startDrain(0);
        }
        pump();
        if (running === 0 && queuedLive === 0 && !draining) {
          armIdle();
        }
        exitIfDrained();
      });
  }

  function pump(): void {
    while (!draining && running < MAX_CONCURRENT_INVOCATIONS) {
      const entry = queue.shift();
      if (entry === undefined) {
        return;
      }
      if (!settleQueueEntry(entry)) {
        continue;
      }
      start(entry.socket, entry.request, entry.receivedAtMs);
    }
  }

  function handleLine(socket: WarmSocket, line: string): void {
    const request = parseWarmRequest(line);
    if (request === null) {
      // A client this worker does not understand. Version-suffixed socket
      // names make this a bug rather than a rolling-upgrade case; refusing
      // the request (the client runs cold) beats killing a worker with
      // concurrent invocations in flight.
      reply(socket, { v: WARM_PROTOCOL_VERSION, error: "bad warm request" });
      return;
    }
    if (draining) {
      // Send the client cold; its run respawns a fresh worker.
      reply(socket, { v: WARM_PROTOCOL_VERSION, stale: true });
      return;
    }
    const receivedAtMs = clock.now();
    if (running < MAX_CONCURRENT_INVOCATIONS) {
      start(socket, request, receivedAtMs);
      return;
    }
    if (queuedLive >= MAX_QUEUED_INVOCATIONS) {
      reply(socket, overloadedFrame());
      return;
    }
    const entry: QueueEntry = {
      socket,
      request,
      receivedAtMs,
      settled: false,
      cancelExpire: clock.delay(QUEUE_WAIT_DEADLINE_MS, () => {
        // Waited too long: refuse rather than executing for a caller whose
        // own timeout budget is nearly spent. Pre-ack, so nothing ran.
        if (settleQueueEntry(entry)) {
          reply(socket, overloadedFrame());
        }
      }),
    };
    queue.push(entry);
    queuedLive += 1;
    queuedBySocket.set(socket, entry);
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
          exitIfDrained();
        },
        close(socket) {
          socketBuffers.delete(socket);
          pendingWrites.delete(socket);
          // A queued client that hung up is settled here so its slot is
          // never handed an execution; the ack-write failure would catch it
          // anyway, but settling keeps the queue honest.
          const entry = queuedBySocket.get(socket);
          if (entry !== undefined) {
            settleQueueEntry(entry);
          }
          exitIfDrained();
        },
        error(socket) {
          socketBuffers.delete(socket);
          pendingWrites.delete(socket);
          const entry = queuedBySocket.get(socket);
          if (entry !== undefined) {
            settleQueueEntry(entry);
          }
          exitIfDrained();
        },
      },
    });

  // Import every slug before accepting connections so the ready marker
  // means "fully warm" — invokes pay no resolve/import.
  for (const name of listFunctionNames(functionsDir)) {
    await preloadFunction(name);
  }

  try {
    const listener = bind();
    listenerStop = () => listener.stop();
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
    const listener = bind();
    listenerStop = () => listener.stop();
    boundSocket = true;
  }

  if (readyPath) {
    try {
      writeFileSync(readyPath, "");
      wroteReady = true;
    } catch {
      // Without a ready marker, waiters time out and fail open.
    }
  }

  armIdle();

  // The process stays alive on the event loop; exits go through exit() above.
  return new Promise<never>(() => {});
}
