import { afterEach, describe, expect, test } from "bun:test";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import {
  MAX_CONCURRENT_INVOCATIONS,
  parseWarmRequest,
  resolveBundle,
  WARM_PROTOCOL_VERSION,
} from "./serve.ts";

const runner = join(import.meta.dir, "runner.ts");
const fixturesDir = join(import.meta.dir, "fixtures");

// Each test gets its own scratch dir holding the socket (and, for staleness
// tests, a private functions dir whose bundles it rewrites).
let scratchDirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "dsbx-serve-test-"));
  scratchDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of scratchDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  scratchDirs = [];
});

interface ServerHandle {
  proc: ReturnType<typeof Bun.spawn>;
  socketPath: string;
}

async function startWorker(
  functionsDir: string,
  env?: Record<string, string>
): Promise<ServerHandle> {
  const socketPath = join(scratch(), "fn.sock");
  const proc = Bun.spawn(["bun", runner, "serve", functionsDir, socketPath], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "inherit",
    ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
  });
  // Wait for the socket to accept connections.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const probe = await Bun.connect({
        unix: socketPath,
        socket: { data() {} },
      });
      probe.end();
      return { proc, socketPath };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  throw new Error("warm worker did not come up");
}

interface WarmReply {
  v: number;
  ack?: boolean;
  outcome?: {
    ok: boolean;
    output?: unknown;
    error?: { code: string };
    // Present when the result was spilled to a scratch file (see emit.ts).
    resultFile?: string;
    resultBytes?: number;
  };
  importKind?: string;
  stale?: boolean;
  error?: string;
}

// Collects every newline-delimited frame until the worker closes the
// connection: a served invocation is [ack, outcome], every refusal is a
// single frame.
async function requestFrames(
  socketPath: string,
  payload: unknown
): Promise<WarmReply[]> {
  let buffered = "";
  const frames: WarmReply[] = [];
  let resolveDone: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const socket = await Bun.connect({
    unix: socketPath,
    socket: {
      data(_socket, chunk) {
        buffered += chunk.toString();
        let newline = buffered.indexOf("\n");
        while (newline !== -1) {
          frames.push(JSON.parse(buffered.slice(0, newline)) as WarmReply);
          buffered = buffered.slice(newline + 1);
          newline = buffered.indexOf("\n");
        }
      },
      close() {
        resolveDone();
      },
      error() {
        resolveDone();
      },
    },
  });
  socket.write(`${JSON.stringify(payload)}\n`);
  await done;
  return frames;
}

// The last frame carries the request's terminal answer (outcome or refusal).
async function request(
  socketPath: string,
  payload: unknown
): Promise<WarmReply> {
  const frames = await requestFrames(socketPath, payload);
  if (frames.length === 0) {
    throw new Error("worker closed without any frame");
  }
  return frames[frames.length - 1]!;
}

function warmRequest(
  name: string,
  env: Record<string, string>,
  input: unknown
) {
  return {
    v: WARM_PROTOCOL_VERSION,
    env,
    input: JSON.stringify(input),
    name,
  };
}

const sleepyRequest = (delayMs: number) =>
  warmRequest("sleepy", {}, { url: `http://localhost/?delayMs=${delayMs}` });

async function sha256Of(path: string): Promise<string> {
  const bytes = await Bun.file(path).arrayBuffer();
  return new Bun.CryptoHasher("sha256")
    .update(new Uint8Array(bytes))
    .digest("hex");
}

describe("runner serve", () => {
  test("serves an invocation over the socket", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const reply = await request(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/?name=warm" })
      );
      expect(reply.v).toBe(WARM_PROTOCOL_VERSION);
      expect(reply.outcome?.ok).toBe(true);
      expect(reply.outcome?.output).toEqual({ hello: "warm" });
    } finally {
      proc.kill();
    }
  });

  test("spills an oversized warm result and replies with a pointer", async () => {
    // Same size policy as the cold runner: a result over the inline cap is
    // written to the scratch dir and the reply frame carries the pointer.
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const reply = await request(
        socketPath,
        warmRequest("big-output", {}, { url: "http://localhost/" })
      );
      expect(reply.outcome?.ok).toBe(true);
      const resultFile = reply.outcome?.resultFile;
      expect(resultFile).toStartWith("/tmp/dust-fn-results/");
      if (resultFile === undefined) {
        throw new Error("expected a spill pointer");
      }
      const spilled = readFileSync(resultFile, "utf8");
      rmSync(resultFile, { force: true });
      expect(reply.outcome?.resultBytes).toBe(
        Buffer.byteLength(spilled, "utf8")
      );
      const envelope = z
        .object({ ok: z.literal(true), output: z.object({ big: z.string() }) })
        .parse(JSON.parse(spilled));
      expect(envelope.output.big.length).toBe(2 * 1024 * 1024);
    } finally {
      proc.kill();
    }
  });

  test("serves multiple functions from one process, reporting import kinds", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const first = await requestFrames(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/?name=one" })
      );
      expect(first[1]?.importKind).toBe("fresh");

      const again = await requestFrames(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/?name=two" })
      );
      expect(again[1]?.outcome?.output).toEqual({ hello: "two" });
      expect(again[1]?.importKind).toBe("cached");

      // A different function on the same worker: its own lazy import, its
      // own module, no interference.
      const other = await requestFrames(
        socketPath,
        warmRequest("throws", {}, { url: "http://localhost/" })
      );
      expect(other[1]?.outcome?.ok).toBe(false);
      expect(other[1]?.outcome?.error?.code).toBe("threw");
      expect(other[1]?.importKind).toBe("fresh");
    } finally {
      proc.kill();
    }
  });

  test("an unknown function name is refused without dying", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const missing = await request(
        socketPath,
        warmRequest("no-such-function", {}, { url: "http://localhost/" })
      );
      expect(missing.stale).toBe(true);

      const alive = await request(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/?name=alive" })
      );
      expect(alive.outcome?.output).toEqual({ hello: "alive" });
    } finally {
      proc.kill();
    }
  });

  test("serves overlapping invocations concurrently", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      // Three 400ms invocations completing in well under 3 x 400ms proves
      // they shared the event loop instead of serializing.
      const startedAtMs = Date.now();
      const replies = await Promise.all([
        request(socketPath, sleepyRequest(400)),
        request(socketPath, sleepyRequest(400)),
        request(socketPath, sleepyRequest(400)),
      ]);
      const elapsedMs = Date.now() - startedAtMs;
      for (const reply of replies) {
        expect(reply.outcome?.ok).toBe(true);
      }
      expect(elapsedMs).toBeLessThan(1_000);
    } finally {
      proc.kill();
    }
  });

  test("per-invocation env is scoped to its invocation, concurrently", async () => {
    // context-probe.ts reads the invocation context (as @dust/pod does)
    // before and after an await: concurrent invocations with different
    // environments must each observe exactly their own, at both ends.
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const probe = (marker: string, delayMs: number) =>
        request(
          socketPath,
          warmRequest(
            "context-probe",
            { WARM_TEST_MARKER: marker, DUST_SANDBOX_TOKEN: `tok-${marker}` },
            { url: `http://localhost/?delayMs=${delayMs}` }
          )
        );
      const [a, b] = await Promise.all([
        probe("alpha", 120),
        probe("beta", 30),
      ]);
      expect(a.outcome?.output).toMatchObject({
        before: "alpha",
        after: "alpha",
      });
      expect(b.outcome?.output).toMatchObject({
        before: "beta",
        after: "beta",
      });

      // A request carrying no env observes nothing from earlier invocations
      // — in particular not their sandbox tokens.
      const clean = await request(
        socketPath,
        warmRequest("context-probe", {}, { url: "http://localhost/" })
      );
      expect(clean.outcome?.output).toMatchObject({
        before: null,
        after: null,
        identity: null,
      });
    } finally {
      proc.kill();
    }
  });

  test("queues past the concurrency cap and serves once a slot frees", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      // Fill every slot with 300ms invocations, then send one more: it must
      // wait in the queue (no slot is free) and still be served.
      const filling = Array.from({ length: MAX_CONCURRENT_INVOCATIONS }, () =>
        request(socketPath, sleepyRequest(300))
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      const queued = await request(socketPath, sleepyRequest(10));
      expect(queued.outcome?.ok).toBe(true);

      const replies = await Promise.all(filling);
      for (const reply of replies) {
        expect(reply.outcome?.ok).toBe(true);
      }
    } finally {
      proc.kill();
    }
  });

  test("a queued request that outwaits the queue deadline is refused as overloaded", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      // Occupy every slot for longer than the queue deadline (2s), then
      // queue one more: it must be refused with a structured overloaded
      // outcome rather than executed late or sent cold.
      const filling = Array.from({ length: MAX_CONCURRENT_INVOCATIONS }, () =>
        request(socketPath, sleepyRequest(2_800))
      );
      await new Promise((resolve) => setTimeout(resolve, 200));
      const startedAtMs = Date.now();
      const refused = await request(socketPath, sleepyRequest(10));
      const waitedMs = Date.now() - startedAtMs;
      expect(refused.outcome?.ok).toBe(false);
      expect(refused.outcome?.error?.code).toBe("overloaded");
      expect(refused.ack).toBeUndefined();
      // Refused at the queue deadline, not at the caller's leisure.
      expect(waitedMs).toBeGreaterThanOrEqual(1_500);
      expect(waitedMs).toBeLessThan(2_800);

      const replies = await Promise.all(filling);
      for (const reply of replies) {
        expect(reply.outcome?.ok).toBe(true);
      }
    } finally {
      proc.kill();
    }
  }, 15_000);

  test("a rewritten imported bundle is refused as stale and drains the worker", async () => {
    const dir = scratch();
    const bundle = join(dir, "hello.ts");
    copyFileSync(join(fixturesDir, "hello.ts"), bundle);
    const { proc, socketPath } = await startWorker(dir);
    try {
      // Import it first: staleness of an already-imported bundle is what
      // forces the recycle (the module cannot be evicted).
      const served = await request(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/?name=first" })
      );
      expect(served.outcome?.ok).toBe(true);

      // Same content, different mtime — a republish rewrites the object, and
      // mtime/size is the staleness signal.
      const later = new Date(Date.now() + 5_000);
      utimesSync(bundle, later, later);

      const reply = await request(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/" })
      );
      expect(reply.stale).toBe(true);
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill();
    }
  });

  test("a stale-triggered drain lets in-flight invocations finish", async () => {
    const dir = scratch();
    copyFileSync(join(fixturesDir, "sleepy.ts"), join(dir, "sleepy.ts"));
    const bundle = join(dir, "hello.ts");
    copyFileSync(join(fixturesDir, "hello.ts"), bundle);
    const { proc, socketPath } = await startWorker(dir);
    try {
      // Import hello so its rewrite below recycles the worker.
      await request(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/" })
      );
      const inFlight = request(socketPath, sleepyRequest(600));
      await new Promise((resolve) => setTimeout(resolve, 150));

      const later = new Date(Date.now() + 5_000);
      utimesSync(bundle, later, later);
      const refused = await request(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/" })
      );
      expect(refused.stale).toBe(true);

      // The invocation that was already executing still delivers its
      // outcome; only then does the drained worker exit.
      const served = await inFlight;
      expect(served.outcome?.ok).toBe(true);
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill();
    }
  });

  test("serves a request stamped with the matching bundle hash", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const bundleSha256 = await sha256Of(join(fixturesDir, "hello.ts"));
      const reply = await request(
        socketPath,
        warmRequest(
          "hello",
          {},
          { url: "http://localhost/?name=stamped", bundleSha256 }
        )
      );
      expect(reply.outcome?.ok).toBe(true);
      expect(reply.outcome?.output).toEqual({ hello: "stamped" });
    } finally {
      proc.kill();
    }
  });

  test("a mismatched hash on a first request refuses without poisoning the worker", async () => {
    // The stat cannot see a rewrite (gcsfuse lag): the stamped hash is the
    // only signal. On a bundle the worker has NOT imported yet, it must
    // refuse before importing, so a later correctly-stamped request is
    // still served by the same worker.
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const refused = await request(
        socketPath,
        warmRequest(
          "hello",
          {},
          { url: "http://localhost/", bundleSha256: "0".repeat(64) }
        )
      );
      expect(refused.stale).toBe(true);
      expect(refused.outcome).toBeUndefined();

      const bundleSha256 = await sha256Of(join(fixturesDir, "hello.ts"));
      const served = await request(
        socketPath,
        warmRequest(
          "hello",
          {},
          { url: "http://localhost/?name=alive", bundleSha256 }
        )
      );
      expect(served.outcome?.output).toEqual({ hello: "alive" });
    } finally {
      proc.kill();
    }
  });

  test("a mismatched hash on an imported bundle refuses without draining when uncached", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const served = await request(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/?name=warm" })
      );
      expect(served.outcome?.ok).toBe(true);

      // Republished but not yet in the cache: the client goes cold (which
      // populates the cache), and the worker keeps serving everything else.
      const reply = await request(
        socketPath,
        warmRequest(
          "hello",
          {},
          { url: "http://localhost/", bundleSha256: "0".repeat(64) }
        )
      );
      expect(reply.stale).toBe(true);

      const alive = await request(
        socketPath,
        warmRequest("sleepy", {}, { url: "http://localhost/?delayMs=10" })
      );
      expect(alive.outcome?.ok).toBe(true);
    } finally {
      proc.kill();
    }
  });

  test("a stamped republish is served from the bundle cache without recycling", async () => {
    // The worker gets its own HOME so the test controls the cache dir.
    const home = scratch();
    const dir = scratch();
    copyFileSync(join(fixturesDir, "hello.ts"), join(dir, "hello.ts"));
    copyFileSync(join(fixturesDir, "sleepy.ts"), join(dir, "sleepy.ts"));
    const { proc, socketPath } = await startWorker(dir, { HOME: home });
    try {
      // Warm both functions on the old versions.
      const before = await request(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/?name=v1" })
      );
      expect(before.outcome?.output).toEqual({ hello: "v1" });
      await request(socketPath, sleepyRequest(10));

      // "Republish" hello: a cold run would read the new bytes and populate
      // the content-addressed cache. Simulate exactly that.
      const republished =
        "export default { async fetch() { return Response.json({ hello: 'republished' }); } };\n";
      const newSha = new Bun.CryptoHasher("sha256")
        .update(new TextEncoder().encode(republished))
        .digest("hex");
      const cacheDir = join(home, ".dust-fn", "bundles");
      await Bun.write(join(cacheDir, `${newSha}.js`), republished);

      // The stamped request is served from the cache: new version, fresh
      // import, and nothing recycles.
      const frames = await requestFrames(
        socketPath,
        warmRequest(
          "hello",
          {},
          { url: "http://localhost/", bundleSha256: newSha }
        )
      );
      expect(frames[1]?.outcome?.output).toEqual({ hello: "republished" });
      expect(frames[1]?.importKind).toBe("fresh");

      // Served from the module cache from now on.
      const again = await requestFrames(
        socketPath,
        warmRequest(
          "hello",
          {},
          { url: "http://localhost/", bundleSha256: newSha }
        )
      );
      expect(again[1]?.importKind).toBe("cached");

      // The sibling function never lost its warmth.
      const sibling = await requestFrames(socketPath, sleepyRequest(10));
      expect(sibling[1]?.outcome?.ok).toBe(true);
      expect(sibling[1]?.importKind).toBe("cached");
    } finally {
      proc.kill();
    }
  });

  test("serves an unstamped request from an older front", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const reply = await request(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/?name=unstamped" })
      );
      expect(reply.outcome?.output).toEqual({ hello: "unstamped" });
    } finally {
      proc.kill();
    }
  });

  test("rejects a protocol version it does not speak without dying", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const reply = await request(socketPath, {
        v: 999,
        env: {},
        input: "{}",
        name: "hello",
      });
      expect(reply.error).toBe("bad warm request");

      // Version-suffixed socket names make a mismatched client a bug, not a
      // rolling-upgrade case; the worker must not abandon concurrent work
      // over one bad request.
      const after = await request(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/?name=alive" })
      );
      expect(after.outcome?.output).toEqual({ hello: "alive" });
    } finally {
      proc.kill();
    }
  });

  test("acks before the outcome so the client can pin execution start", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const frames = await requestFrames(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/?name=frames" })
      );
      expect(frames.length).toBe(2);
      expect(frames[0]?.ack).toBe(true);
      expect(frames[1]?.outcome?.output).toEqual({ hello: "frames" });
    } finally {
      proc.kill();
    }
  });

  test("scrubs the spawn-time invocation secrets from its own environment", async () => {
    const dir = scratch();
    const socketPath = join(dir, "fn.sock");
    // Spawned the way dsbx spawns it: with the cold invocation's token in
    // env. Even a bundle reading process.env directly must not observe it.
    const proc = Bun.spawn(["bun", runner, "serve", fixturesDir, socketPath], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "inherit",
      env: {
        ...process.env,
        WARM_TEST_MARKER: "from-spawn",
        DUST_SANDBOX_TOKEN: "spawn-invocation-token",
      },
    });
    try {
      const deadline = Date.now() + 10_000;
      let reply: WarmReply | null = null;
      while (Date.now() < deadline && reply === null) {
        try {
          reply = await request(
            socketPath,
            warmRequest("env-probe", {}, { url: "http://localhost/" })
          );
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
      // WARM_TEST_MARKER is not in the scrub list, so it survives spawn env
      // inheritance like any other var; the spawn-time DUST_SANDBOX_TOKEN
      // must have been scrubbed at startup.
      expect(reply?.outcome?.output).toEqual({
        marker: "from-spawn",
        token: "unset",
      });
    } finally {
      proc.kill();
    }
  });

  test("a bundle rewritten during its import poisons and recycles the worker", async () => {
    // The hash is taken before the import; if the bytes change in between,
    // the module registry holds bytes the hash does not describe. The
    // single-flight import re-stats after importing and must recycle
    // instead of recording the wrong hash.
    const dir = scratch();
    const bundle = join(dir, "slow-import.ts");
    copyFileSync(join(fixturesDir, "slow-import.ts"), bundle);
    const { proc, socketPath } = await startWorker(dir);
    try {
      const first = request(
        socketPath,
        warmRequest("slow-import", {}, { url: "http://localhost/" })
      );
      // The fixture's import takes ~400ms; rewrite the file mid-import.
      await new Promise((resolve) => setTimeout(resolve, 150));
      await Bun.write(
        bundle,
        `${await Bun.file(bundle).text()}// republished\n`
      );

      const reply = await first;
      expect(reply.stale).toBe(true);
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill();
    }
  });

  test("reports malformed envelopes as bad_input without dying", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const bad = await request(socketPath, {
        v: WARM_PROTOCOL_VERSION,
        env: {},
        input: "not json",
        name: "hello",
      });
      expect(bad.outcome?.ok).toBe(false);
      expect(bad.outcome?.error?.code).toBe("bad_input");

      // The worker survives a bad envelope: the next request still works.
      const good = await request(
        socketPath,
        warmRequest("hello", {}, { url: "http://localhost/?name=alive" })
      );
      expect(good.outcome?.output).toEqual({ hello: "alive" });
    } finally {
      proc.kill();
    }
  });
});

describe("sibling prefetch", () => {
  const appDir = () => {
    const dir = scratch();
    for (const stem of [
      "myapp__alpha",
      "myapp__beta",
      "myapp__gamma",
      "solo",
    ]) {
      copyFileSync(join(fixturesDir, "hello.ts"), join(dir, `${stem}.ts`));
    }
    return dir;
  };

  // The fixtures import in milliseconds and the prefetch loop re-checks
  // quiet every 100ms, so this settle window makes the background imports
  // deterministic: after it, a sibling's FIRST request must already be
  // cached — polling would be vacuous, since the poll itself imports.
  const PREFETCH_SETTLE_MS = 2_000;

  test("the first import of an app warms its siblings in the background", async () => {
    const dir = appDir();
    const { proc, socketPath } = await startWorker(dir);
    try {
      const first = await requestFrames(
        socketPath,
        warmRequest("myapp__alpha", {}, { url: "http://localhost/?name=a" })
      );
      expect(first[1]?.importKind).toBe("fresh");

      await new Promise((resolve) => setTimeout(resolve, PREFETCH_SETTLE_MS));

      // The very first request for each sibling is served from the module
      // cache: the prefetch paid the import, not this request.
      const beta = await requestFrames(
        socketPath,
        warmRequest("myapp__beta", {}, { url: "http://localhost/" })
      );
      expect(beta[1]?.importKind).toBe("cached");
      const gamma = await requestFrames(
        socketPath,
        warmRequest("myapp__gamma", {}, { url: "http://localhost/" })
      );
      expect(gamma[1]?.importKind).toBe("cached");

      // The root-level function shares the worker but not the app: it is
      // not prefetched and pays its own import on first request.
      const solo = await requestFrames(
        socketPath,
        warmRequest("solo", {}, { url: "http://localhost/" })
      );
      expect(solo[1]?.importKind).toBe("fresh");
    } finally {
      proc.kill();
    }
  }, 15_000);

  test("an eager-name spawn imports the function and its app before any request", async () => {
    const dir = appDir();
    const socketPath = join(scratch(), "fn.sock");
    const proc = Bun.spawn(
      ["bun", runner, "serve", dir, socketPath, "myapp__alpha"],
      { stdin: "ignore", stdout: "ignore", stderr: "inherit" }
    );
    try {
      const deadline = Date.now() + 10_000;
      let up = false;
      while (Date.now() < deadline && !up) {
        try {
          const probe = await Bun.connect({
            unix: socketPath,
            socket: { data() {} },
          });
          probe.end();
          up = true;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
      expect(up).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, PREFETCH_SETTLE_MS));

      // No request has been made yet: the eager import covered the named
      // function and the prefetch covered its sibling.
      const alpha = await requestFrames(
        socketPath,
        warmRequest("myapp__alpha", {}, { url: "http://localhost/" })
      );
      expect(alpha[1]?.importKind).toBe("cached");
      const beta = await requestFrames(
        socketPath,
        warmRequest("myapp__beta", {}, { url: "http://localhost/" })
      );
      expect(beta[1]?.importKind).toBe("cached");
    } finally {
      proc.kill();
    }
  }, 15_000);
});

describe("resolveBundle", () => {
  test("resolves a name to its single matching file", () => {
    expect(resolveBundle(fixturesDir, "hello")).toBe(
      join(fixturesDir, "hello.ts")
    );
    expect(resolveBundle(fixturesDir, "no-such-function")).toBeNull();
    // Directories never match, even with a matching stem.
    expect(resolveBundle(fixturesDir, "databases")).toBeNull();
  });
});

describe("parseWarmRequest", () => {
  test("parses a request and keeps only string env values", () => {
    const parsed = parseWarmRequest(
      JSON.stringify({
        v: WARM_PROTOCOL_VERSION,
        env: { KEEP: "yes", DROP_NUMBER: 3, DROP_NULL: null },
        input: "{}",
        name: "greet",
      })
    );
    expect(parsed).toEqual({
      v: WARM_PROTOCOL_VERSION,
      env: { KEEP: "yes" },
      input: "{}",
      name: "greet",
    });
  });

  test("returns null for every malformed request", () => {
    expect(parseWarmRequest("not json")).toBeNull();
    expect(parseWarmRequest('"a string"')).toBeNull();
    expect(
      parseWarmRequest(
        JSON.stringify({ v: 999, env: {}, input: "{}", name: "x" })
      )
    ).toBeNull();
    expect(
      parseWarmRequest(
        JSON.stringify({ v: WARM_PROTOCOL_VERSION, input: "{}", name: "x" })
      )
    ).toBeNull();
    expect(
      parseWarmRequest(
        JSON.stringify({ v: WARM_PROTOCOL_VERSION, env: {}, input: "{}" })
      )
    ).toBeNull();
    expect(
      parseWarmRequest(
        JSON.stringify({
          v: WARM_PROTOCOL_VERSION,
          env: {},
          input: "{}",
          name: "../escape",
        })
      )
    ).toBeNull();
  });
});
