// Warm function worker (protocol v2): a generic bun process that keeps
// imported function bundles resident and serves invocations over a unix
// socket, so repeat invocations skip process spawn, bundle resolution, and
// the import of the bundle and its dependencies (the dominant sandbox-side
// costs of a cold run).
//
// Workers are pod-scoped, not function-scoped: the request names the
// function, and the worker resolves and imports its bundle on first use (the
// module cache keeps it). Memory is bounded by the pool size (POOL_SLOTS in
// warm.rs, times the RSS cap below), not by the number of functions on the
// pod. The client routes a function to its home worker by hashing the app
// prefix of its slug, so all of one app's functions accumulate in one
// worker's module cache and an app pays one process spawn, ever.
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
// pod functions are arbitrary side-effectful code, and front assumes a failed
// start means nothing ran. The worker acks before executing — a synchronous
// socket write whose failure proves the client is gone — and the client only
// falls back to the cold path on failures that precede the ack. After the
// ack, a lost outcome is reported as a failed invocation, never re-run. (The
// synchronous-ack guarantee is why this stays a raw line protocol instead of
// sitting behind an HTTP server: response streaming cannot prove the ack
// reached the client's buffer before execution starts.)
//
// The worker is disposable. It exits on idle, and it drains (stops
// listening, refuses its queue, lets in-flight invocations finish, then
// exits) at the lifetime cap, when an unstamped request finds a bundle it
// imported rewritten on disk (ES modules cannot be evicted, so rebirth is
// the pruning mechanism there; stamped republishes instead import the new
// version from the content-addressed cache, recycling nothing), when its
// RSS crosses the recycle threshold, or when an invocation outlives its
// deadline (whose client was killed by front's much shorter exec timeout
// long ago).

import { createHash } from "node:crypto";
import { readdirSync, statSync, unlinkSync } from "node:fs";
import { stat, unlink } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

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

// Idle: how long the worker waits with nothing running and nothing queued
// before exiting; scale-down to zero is each worker's own idle exit.
// Lifetime: hard cap bounding both bundle accumulation (imports are
// permanent for the life of the process) and staleness that gcsfuse metadata
// caching could hide from unstamped envelopes. Deadline: an invocation that
// runs this long lost its client to front's much shorter exec timeout ages
// ago, and its slot is wedged for good (a promise cannot be killed), so the
// worker recycles. Rss: recycles a worker whose imported working set
// outgrew its share of the sandbox's memory — sized so a full pool stays
// bounded well inside the 2GB sandbox. Drain flush: how long a drained
// worker waits for its last reply bytes before force-exiting on a client
// that stopped reading.
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
  // The function to serve. Workers are generic: the bundle is resolved from
  // the functions directory and imported on first use.
  name: z.string().regex(VALID_NAME),
});

type WarmRequest = z.infer<typeof WarmRequestSchema>;

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

// Publish-time bundle hashes are lowercase hex sha256; anything else must
// not touch the filesystem.
const BUNDLE_SHA256_REGEX = /^[0-9a-f]{64}$/;

/**
 * Path of the locally cached copy of a bundle in the content-addressed cache
 * shared with dsbx (`~/.dust-fn/bundles/<sha256>.js`, populated by cold runs
 * from verified bytes — see warm.rs), when one exists. Same trust model as
 * the socket this worker serves: the warm dir is 0700 and owned by this uid.
 */
export function cachedBundlePath(sha256: string): string | null {
  if (!BUNDLE_SHA256_REGEX.test(sha256)) {
    return null;
  }
  const home = process.env.HOME;
  if (!home) {
    return null;
  }
  const path = join(home, ".dust-fn", "bundles", `${sha256}.js`);
  try {
    if (!statSync(path).isFile()) {
      return null;
    }
  } catch {
    return null;
  }
  return path;
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
          "The function's worker is running at its concurrency limit and " +
          "the wait queue is saturated; the invocation was not started.",
      },
    },
  };
}

export async function serve(
  functionsDir: string,
  socketPath: string,
  eagerName?: string
): Promise<never> {
  for (const key of SPAWN_ENV_SCRUB_KEYS) {
    delete process.env[key];
  }

  // name -> imported bundle. Both the resolution and the module are cached
  // for the life of the worker: a cached resolution that goes bad (bundle
  // deleted, extension changed, republished) fails its per-request checks
  // and drains the worker — the module cache cannot be evicted, so rebirth
  // is the only pruning.
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

  setTimeout(() => startDrain(0), MAX_LIFETIME_MS);

  const socketBuffers = new Map<object, string>();

  function reply(socket: WarmSocket, response: Record<string, unknown>): void {
    writeThenEnd(socket, `${JSON.stringify(response)}\n`);
  }

  /** Result of the single-flight fuse import of one function's bundle. */
  type FuseImportResult =
    | { kind: "ok"; bundle: ImportedBundle }
    | { kind: "unresolved" }
    | { kind: "poisoned" };

  // One resolve/stat/hash/import pipeline per name at a time, joined by
  // concurrent requests. Without it, two overlapping first requests during a
  // republish window can each hash a different version while import() hands
  // both the same module — recording one version's hash against the other's
  // bytes and serving stale code under a fresh stamp from then on.
  const importsInFlight = new Map<string, Promise<FuseImportResult>>();

  // Poison is sticky: once a name's import was caught racing a rewrite, the
  // module registry permanently holds bytes whose hash is unknown, and NO
  // later fuse run can fix that — import() would return the already-evaluated
  // module while the pipeline hashes the new on-disk bytes, silently pairing
  // a fresh hash with stale code. A background (prefetch) import that
  // discovers poison ignores the result, so the set is what guarantees the
  // next real request still takes the stale-and-recycle path.
  const poisonedNames = new Set<string>();

  function importFromFunctionsDir(name: string): Promise<FuseImportResult> {
    const inFlight = importsInFlight.get(name);
    if (inFlight !== undefined) {
      return inFlight;
    }
    if (poisonedNames.has(name)) {
      return Promise.resolve({ kind: "poisoned" });
    }
    const flight = (async (): Promise<FuseImportResult> => {
      const handlerPath = resolveBundle(functionsDir, name);
      if (handlerPath === null) {
        return { kind: "unresolved" };
      }
      const stamp = await statBundle(handlerPath);
      if (stamp === null) {
        return { kind: "unresolved" };
      }
      // Hash before importing so the hash describes the bytes the import
      // reads; the re-stat below catches a write landing in between.
      const sha256 = await sha256OfFile(handlerPath);
      if (sha256 === null) {
        return { kind: "unresolved" };
      }
      try {
        // GEN10 exemption: a static import (and a literal specifier) is
        // structurally impossible here — the module to load is a published
        // function bundle resolved from the functions directory at request
        // time. Dynamic import IS this worker's purpose; the path is
        // produced by resolveBundle from a validated name, never from raw
        // request input.
        await import(handlerPath);
      } catch {
        // A bundle that fails to import still gets served: invoke() reports
        // the import error as a structured outcome, exactly like a cold run.
      }
      // The module registry now permanently holds whatever bytes import()
      // read. If the file changed between the hash and the import, the hash
      // cannot be trusted to describe the module: the worker is poisoned
      // for this path and must recycle.
      const after = await statBundle(handlerPath);
      if (!sameStamp(stamp, after)) {
        poisonedNames.add(name);
        return { kind: "poisoned" };
      }
      const bundle: ImportedBundle = { handlerPath, stamp, sha256 };
      // An entry appearing mid-flight came from a stamped cache import and
      // is at least as current as the fuse's read (gcsfuse can lag); never
      // clobber it. Request callers only run this pipeline when the entry
      // was absent.
      if (!imported.has(name)) {
        imported.set(name, bundle);
      }
      return { kind: "ok", bundle };
    })();
    // Registered synchronously (before any await runs) and cleared on
    // settlement so a failed resolution can be retried by a later request.
    const tracked = flight.finally(() => {
      importsInFlight.delete(name);
    });
    importsInFlight.set(name, tracked);
    return tracked;
  }

  // Sibling prefetch: the first import of an app's function warms the rest
  // of the app in the background, restoring what per-function servers used
  // to get by importing in parallel processes — without it, an app opening
  // through a Frame pays its bundles' imports serially, each first request
  // stalling behind the previous function's import. Best-effort and polite:
  // one bundle at a time, only while nothing is running or queued (module
  // evaluation is synchronous and would stall live requests), stopping at a
  // soft RSS ceiling, and one attempt per app per worker lifetime.
  const PREFETCH_MAX_SIBLINGS = 16;
  const PREFETCH_RSS_CEILING_BYTES = Math.floor(MAX_RSS_BYTES * 0.8);
  const PREFETCH_QUIET_RECHECK_MS = 100;
  const prefetchedApps = new Set<string>();

  /** The app-folder prefix of a slug (`myapp__list-notes` -> `myapp`), or
   * null for root-level functions, which have no app to prefetch. Mirrors
   * the affinity key in warm.rs. */
  function appPrefix(name: string): string | null {
    const separator = name.indexOf("__");
    return separator > 0 ? name.slice(0, separator) : null;
  }

  function listUnimportedAppSiblings(prefix: string): string[] {
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(functionsDir, { withFileTypes: true });
    } catch {
      return [];
    }
    const siblings: string[] = [];
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }
      const dot = entry.name.lastIndexOf(".");
      const stem = dot <= 0 ? entry.name : entry.name.slice(0, dot);
      if (
        stem.startsWith(`${prefix}__`) &&
        VALID_NAME.test(stem) &&
        !imported.has(stem)
      ) {
        siblings.push(stem);
      }
    }
    return siblings;
  }

  function schedulePrefetch(name: string): void {
    const prefix = appPrefix(name);
    if (prefix === null || prefetchedApps.has(prefix)) {
      return;
    }
    prefetchedApps.add(prefix);
    // The chain is written to never reject; the catch keeps a runner bug in
    // background work from becoming an unhandled rejection that kills a
    // serving worker.
    prefetchApp(prefix).catch(() => {});
  }

  async function prefetchApp(prefix: string): Promise<void> {
    const siblings = listUnimportedAppSiblings(prefix).slice(
      0,
      PREFETCH_MAX_SIBLINGS
    );
    for (const sibling of siblings) {
      // Yield to live traffic: a prefetch import runs only on a fully quiet
      // worker, so at most one background import ever stands in front of a
      // request.
      while (running > 0 || queuedLive > 0) {
        if (draining) {
          return;
        }
        await new Promise((resolve) =>
          setTimeout(resolve, PREFETCH_QUIET_RECHECK_MS)
        );
      }
      if (draining) {
        return;
      }
      if (process.memoryUsage.rss() > PREFETCH_RSS_CEILING_BYTES) {
        return;
      }
      if (imported.has(sibling)) {
        continue;
      }
      // Failures (unresolved, poisoned) are ignored: prefetch is an
      // optimization, and the request path re-runs the pipeline with full
      // handling when the function is actually called.
      await importFromFunctionsDir(sibling);
    }
  }

  /**
   * Ensure the request's bundle is imported and current. Returns the bundle
   * and whether this request paid (or joined) the import, or null after a
   * pre-ack `stale` reply was sent (the client re-runs cold, which reads the
   * bundle fresh and respawns a worker as needed).
   *
   * Stamped requests are served by content hash: the module cache is keyed
   * by path, so importing a republished bundle from its content-addressed
   * cache path (`bundles/<sha256>.js`, populated by cold runs) loads the new
   * version alongside the old one — no recycle, and the worker's other
   * bundles keep their warmth. The abandoned module lingers as unreachable
   * memory until the routine RSS recycle, which is fine for dev-time-rate
   * republishes. Only unstamped (legacy) staleness still drains the worker:
   * same path, new bytes, and the old module cannot be evicted.
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
      reply(socket, { v: WARM_PROTOCOL_VERSION, stale: true });
      if (recycle) {
        // The worker holds an import it can never serve again; drain so a
        // fresh worker replaces it. In-flight invocations finish normally.
        startDrain(0);
      }
      return null;
    };

    /** Import the stamped bytes from the content-addressed cache, if the
     * cold path has populated them. Immutable content: no stat, no
     * staleness — the path IS the version. */
    const importFromCache = async (
      sha256: string
    ): Promise<{ bundle: ImportedBundle; importKind: "fresh" } | null> => {
      const cachePath = cachedBundlePath(sha256);
      if (cachePath === null) {
        return null;
      }
      const stamp = await statBundle(cachePath);
      if (stamp === null) {
        return null;
      }
      try {
        // GEN10 exemption: like the fuse import below, the module to load
        // is resolved at request time (here from a validated content hash);
        // a literal specifier is structurally impossible.
        await import(cachePath);
      } catch {
        // A bundle that fails to import still gets served: invoke() reports
        // the import error as a structured outcome, exactly like a cold run.
      }
      const bundle: ImportedBundle = { handlerPath: cachePath, stamp, sha256 };
      imported.set(request.name, bundle);
      schedulePrefetch(request.name);
      return { bundle, importKind: "fresh" };
    };

    const existing = imported.get(request.name);

    if (expectedSha256 !== undefined) {
      // Stamped: the hash is authoritative, and content-addressing makes
      // every check exact. Matching import -> serve it, no stat needed (the
      // stamp says the caller wants exactly the bytes this import holds).
      if (existing && existing.sha256 === expectedSha256) {
        return { bundle: existing, importKind: "cached" };
      }
      // Republish (or first sight of this function): import the stamped
      // version from the cache, next to whatever old import may exist.
      const fromCache = await importFromCache(expectedSha256);
      if (fromCache !== null) {
        return fromCache;
      }
      if (existing) {
        // Republished but not yet in the cache: refuse; the cold run reads
        // the fuse fresh and populates the cache, and the next warm request
        // imports it here. The old import stays valid for nothing, but
        // draining over it would cost every other bundle's warmth.
        return staleReply();
      }
      // Never imported and not cached: fall through to the fuse below.
    } else if (existing) {
      // Unstamped (legacy front): mtime/size against the path we imported
      // is the only signal, and a mismatch can only be cured by rebirth.
      // When the import came from the immutable cache path this stat can
      // never fire; a mixed-front-version window during a rolling deploy
      // could then serve an unstamped caller a superseded version, bounded
      // by the lifetime cap. Accepted: fronts stamp everything post-deploy.
      const current = await statBundle(existing.handlerPath);
      if (!sameStamp(existing.stamp, current)) {
        return staleReply({ recycle: true });
      }
      return { bundle: existing, importKind: "cached" };
    }

    const result = await importFromFunctionsDir(request.name);
    switch (result.kind) {
      case "unresolved":
        // Missing or ambiguous bundle: the cold path owes the caller the
        // structured error, not this worker.
        return staleReply();
      case "poisoned":
        return staleReply({ recycle: true });
      case "ok":
        if (
          expectedSha256 !== undefined &&
          expectedSha256 !== result.bundle.sha256
        ) {
          // The on-disk bundle does not match what the publisher stamped
          // (gcsfuse lag). The import stays valid for callers of the version
          // it actually holds; this caller re-runs cold, and the eventual
          // disk change recycles the worker through the stat check above.
          return staleReply();
        }
        schedulePrefetch(request.name);
        return { bundle: result.bundle, importKind: "fresh" };
    }
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

    const ensured = await ensureBundle(socket, request, input.bundleSha256);
    if (ensured === null) {
      return;
    }
    const { bundle, importKind } = ensured;

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
    // fresh worker. Other in-flight invocations finish normally.
    let deadlineFired = false;
    const deadlineTimer = setTimeout(() => {
      deadlineFired = true;
      hung += 1;
      startDrain(1);
      exitIfDrained();
    }, INVOCATION_DEADLINE_MS);

    try {
      const outcome = await invoke(bundle.handlerPath, input, request.env);
      // Same size policy as the cold runner: one set of numbers everywhere.
      const delivered = applyResultSpillPolicy(outcome);
      if (deadlineFired) {
        // The client is long gone; nothing useful to write.
        socket.end();
      } else {
        reply(socket, {
          v: WARM_PROTOCOL_VERSION,
          outcome: delivered,
          importKind,
        });
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

  armIdle();

  // Eager warm-up: the worker is spawned right after a cold run of one
  // function, so importing that bundle now (and prefetching its app) makes
  // the very next invocation fast instead of paying the import on its first
  // request. Best-effort; a request arriving mid-import joins the
  // single-flight pipeline.
  if (eagerName !== undefined && VALID_NAME.test(eagerName)) {
    // The catch mirrors prefetchApp's: background work must never become an
    // unhandled rejection.
    importFromFunctionsDir(eagerName)
      .then(() => {
        schedulePrefetch(eagerName);
      })
      .catch(() => {});
  }

  // The process stays alive on the event loop; exits go through exit() above.
  return new Promise<never>(() => {});
}
