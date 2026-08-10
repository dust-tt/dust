// Warm function server (protocol v2): keeps one imported function bundle
// resident in a bun process and serves invocations over a unix socket, so
// repeat invocations skip process spawn, bundle resolution, and the import of
// the bundle and its dependencies (the dominant sandbox-side costs of a cold
// run).
//
// One server serves exactly one handler path — concurrently. Invocations are
// IO-bound in the common case (SQL, API calls), so the event loop interleaves
// many of them at once exactly like a web server would; per-invocation state
// (user identity, sandbox token) travels in the request and is scoped through
// the invocation context (see functions-runner/context.ts and @dust/pod),
// never applied to process.env. Beyond MAX_CONCURRENT_INVOCATIONS requests
// wait in a FIFO queue; a full or too-slow queue gets a structured
// `overloaded` outcome instead of sending the client to a cold run —
// unbounded cold fallback under saturation is exactly the memory blow-up this
// server exists to prevent.
//
// Duplicate executions are the failure mode this protocol is shaped around:
// pod functions are arbitrary side-effectful code, and front assumes a failed
// start means nothing ran. The server acks before executing — a synchronous
// socket write whose failure proves the client is gone — and the client only
// falls back to the cold path on failures that precede the ack. After the
// ack, a lost outcome is reported as a failed invocation, never re-run. (The
// synchronous-ack guarantee is why this stays a raw line protocol instead of
// sitting behind an HTTP server: response streaming cannot prove the ack
// reached the client's buffer before execution starts.)
//
// The server is disposable. It exits on idle, and it drains (stops
// listening, refuses its queue, lets in-flight invocations finish, then
// exits) at the lifetime cap, when the bundle on disk changes, when its RSS
// crosses the recycle threshold, or when an invocation outlives its deadline
// (whose client was killed by front's much shorter exec timeout long ago).

import { createHash } from "node:crypto";
import { unlinkSync } from "node:fs";
import { stat, unlink } from "node:fs/promises";

import { z } from "zod";

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

// Idle: how long the server waits with nothing running and nothing queued
// before exiting. Lifetime: hard cap bounding how long a republished bundle
// can keep being served when the envelope carries no bundle hash and gcsfuse
// metadata caching hides the change from the per-request stat. Deadline: an
// invocation that runs this long lost its client to front's much shorter
// exec timeout ages ago, and its slot is wedged for good (a promise cannot
// be killed), so the server recycles. Rss: a bloated server trades a one-off
// import cost for freed memory. Drain flush: how long a drained server waits
// for its last reply bytes before force-exiting on a client that stopped
// reading.
const IDLE_TIMEOUT_MS = 120_000;
// A request older than this must not be acked: the client abandons the wait
// at 4s (see warm.rs) and falls back cold, and acking into that window is
// the one race that could double-execute. Refusing pre-ack is always safe,
// so past this age the server sends `stale` instead of starting work, and
// the ack-vs-abandon race shrinks to clock slop.
const PRE_ACK_DEADLINE_MS = 3_000;
const MAX_LIFETIME_MS = 600_000;
const INVOCATION_DEADLINE_MS = 120_000;
const MAX_RSS_BYTES = 300 * 1024 * 1024;
const DRAIN_FLUSH_TIMEOUT_MS = 5_000;

// Per-invocation env vars inherited from the cold run that spawned this
// server. Scrubbed at startup: they belong to that invocation, and every
// request carries its own environment in the request itself.
const SPAWN_ENV_SCRUB_KEYS = ["DUST_SANDBOX_TOKEN", "DUST_POD_USER_IDENTITY"];

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
  receivedAtMs: number;
  // Settled entries (reply already sent, or client gone) stay in the array
  // and are skipped at dequeue time: O(1) removal without scanning the queue
  // on every socket close.
  settled: boolean;
  expireTimer: ReturnType<typeof setTimeout>;
}

function overloadedFrame(): Record<string, unknown> {
  return {
    v: WARM_PROTOCOL_VERSION,
    outcome: {
      ok: false,
      error: {
        code: "overloaded",
        message:
          "The function is running at its concurrency limit and the wait " +
          "queue is saturated; the invocation was not started.",
      },
    },
  };
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
  // staleness checks); `hung` counts the subset that blew their deadline and
  // will never release their slot. The server is fully drained once every
  // running invocation is hung.
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

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const clearIdle = () => {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };
  const armIdle = () => {
    clearIdle();
    idleTimer = setTimeout(() => {
      // Guarded: the timer is cleared on every start, but never trust a
      // timer alone with killing a process that might be serving.
      if (running === 0 && queuedLive === 0 && !draining) {
        exit(0);
      }
    }, IDLE_TIMEOUT_MS);
  };

  function settleQueueEntry(entry: QueueEntry): boolean {
    if (entry.settled) {
      return false;
    }
    entry.settled = true;
    queuedLive -= 1;
    clearTimeout(entry.expireTimer);
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
    // binds a fresh server there while this one finishes its in-flight work.
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
    // clients re-run cold against the successor server. (On a stale-triggered
    // drain, serving them from the old import would be wrong anyway.)
    for (const entry of [...queue]) {
      if (settleQueueEntry(entry)) {
        reply(entry.socket, { v: WARM_PROTOCOL_VERSION, stale: true });
      }
    }
    queue = [];
    exitIfDrained();
  }

  setTimeout(() => startDrain(0), MAX_LIFETIME_MS);

  const socketBuffers = new Map<object, string>();

  function reply(socket: WarmSocket, response: Record<string, unknown>): void {
    writeThenEnd(socket, `${JSON.stringify(response)}\n`);
  }

  async function runInvocation(
    socket: WarmSocket,
    request: WarmRequest,
    receivedAtMs: number
  ): Promise<void> {
    // A republished bundle must never be served from the old import. One
    // metadata call per invocation start; any difference (or a vanished
    // file) sends the client down the cold path, which respawns a fresh
    // server while this one drains.
    const current = await statBundle(handlerPath);
    if (!sameStamp(importedStamp, current)) {
      reply(socket, { v: WARM_PROTOCOL_VERSION, stale: true });
      startDrain(0);
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
      reply(socket, { v: WARM_PROTOCOL_VERSION, stale: true });
      startDrain(0);
      return;
    }

    // The ack is the point of no return: from here the client must never
    // fall back to the cold path, because the function may have side effects
    // in flight. A lost outcome after this frame is a failed invocation, not
    // a retried one. The write is synchronous into the kernel buffer: its
    // failure proves the client is gone, so nothing executes for a client
    // that already gave up (e.g. one that timed out while queued).
    if (Date.now() - receivedAtMs > PRE_ACK_DEADLINE_MS) {
      // The pre-ack work (queue wait, gcsfuse metadata) outlived the
      // client's patience budget; it is walking away or about to.
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
    // cannot be killed. Recycle: drain and let the next cold run spawn a
    // fresh server. Other in-flight invocations finish normally.
    let deadlineFired = false;
    const deadlineTimer = setTimeout(() => {
      deadlineFired = true;
      hung += 1;
      startDrain(1);
      exitIfDrained();
    }, INVOCATION_DEADLINE_MS);

    try {
      const outcome = await invoke(handlerPath, input, request.env);
      if (deadlineFired) {
        // The client is long gone; nothing useful to write.
        socket.end();
      } else {
        reply(socket, { v: WARM_PROTOCOL_VERSION, outcome });
      }
    } finally {
      clearTimeout(deadlineTimer);
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
      // A client this server does not understand. Version-suffixed socket
      // names make this a bug rather than a rolling-upgrade case; refusing
      // the request (the client runs cold) beats killing a server with
      // concurrent invocations in flight.
      reply(socket, { v: WARM_PROTOCOL_VERSION, error: "bad warm request" });
      return;
    }
    if (draining) {
      // Send the client cold; its run respawns a fresh server.
      reply(socket, { v: WARM_PROTOCOL_VERSION, stale: true });
      return;
    }
    const receivedAtMs = Date.now();
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
      expireTimer: setTimeout(() => {
        // Waited too long: refuse rather than executing for a caller whose
        // own timeout budget is nearly spent. Pre-ack, so nothing ran.
        if (settleQueueEntry(entry)) {
          reply(socket, overloadedFrame());
        }
      }, QUEUE_WAIT_DEADLINE_MS),
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

  try {
    const listener = bind();
    listenerStop = () => listener.stop();
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
    const listener = bind();
    listenerStop = () => listener.stop();
    boundSocket = true;
  }

  armIdle();

  // The process stays alive on the event loop; exits go through exit() above.
  return new Promise<never>(() => {});
}
