import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MAX_CONCURRENT_INVOCATIONS,
  parseWarmRequest,
  WARM_PROTOCOL_VERSION,
} from "./serve.ts";

const runner = join(import.meta.dir, "runner.ts");
const fx = (n: string) => join(import.meta.dir, "fixtures", n);

// Each test gets its own scratch dir holding the socket and a private copy of
// the fixture (staleness tests rewrite it).
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

async function startServer(handlerPath: string): Promise<ServerHandle> {
  const socketPath = join(scratch(), "fn.sock");
  const proc = Bun.spawn(["bun", runner, "serve", handlerPath, socketPath], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "inherit",
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
  throw new Error("warm server did not come up");
}

interface WarmReply {
  v: number;
  ack?: boolean;
  outcome?: {
    ok: boolean;
    output?: unknown;
    error?: { code: string };
  };
  stale?: boolean;
  error?: string;
}

// Collects every newline-delimited frame until the server closes the
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
    throw new Error("server closed without any frame");
  }
  return frames[frames.length - 1]!;
}

function warmRequest(env: Record<string, string>, input: unknown) {
  return {
    v: WARM_PROTOCOL_VERSION,
    env,
    input: JSON.stringify(input),
  };
}

const sleepyRequest = (delayMs: number) =>
  warmRequest({}, { url: `http://localhost/?delayMs=${delayMs}` });

describe("runner serve", () => {
  test("serves an invocation over the socket", async () => {
    const { proc, socketPath } = await startServer(fx("hello.ts"));
    try {
      const reply = await request(
        socketPath,
        warmRequest({}, { url: "http://localhost/?name=warm" })
      );
      expect(reply.v).toBe(WARM_PROTOCOL_VERSION);
      expect(reply.outcome?.ok).toBe(true);
      expect(reply.outcome?.output).toEqual({ hello: "warm" });
    } finally {
      proc.kill();
    }
  });

  test("serves repeat invocations from the same process", async () => {
    const { proc, socketPath } = await startServer(fx("hello.ts"));
    try {
      for (const name of ["one", "two", "three"]) {
        const reply = await request(
          socketPath,
          warmRequest({}, { url: `http://localhost/?name=${name}` })
        );
        expect(reply.outcome?.output).toEqual({ hello: name });
      }
    } finally {
      proc.kill();
    }
  });

  test("serves overlapping invocations concurrently", async () => {
    const { proc, socketPath } = await startServer(fx("sleepy.ts"));
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
    const { proc, socketPath } = await startServer(fx("context-probe.ts"));
    try {
      const probe = (marker: string, delayMs: number) =>
        request(
          socketPath,
          warmRequest(
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
        warmRequest({}, { url: "http://localhost/" })
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
    const { proc, socketPath } = await startServer(fx("sleepy.ts"));
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
    const { proc, socketPath } = await startServer(fx("sleepy.ts"));
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

  test("reports a rewritten bundle as stale and drains", async () => {
    const dir = scratch();
    const bundle = join(dir, "hello.ts");
    copyFileSync(fx("hello.ts"), bundle);
    const { proc, socketPath } = await startServer(bundle);
    try {
      // Same content, different mtime — a republish rewrites the object, and
      // mtime/size is the staleness signal.
      const later = new Date(Date.now() + 5_000);
      utimesSync(bundle, later, later);

      const reply = await request(
        socketPath,
        warmRequest({}, { url: "http://localhost/" })
      );
      expect(reply.stale).toBe(true);
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill();
    }
  });

  test("a stale-triggered drain lets in-flight invocations finish", async () => {
    const dir = scratch();
    const bundle = join(dir, "sleepy.ts");
    copyFileSync(fx("sleepy.ts"), bundle);
    const { proc, socketPath } = await startServer(bundle);
    try {
      const inFlight = request(socketPath, sleepyRequest(600));
      await new Promise((resolve) => setTimeout(resolve, 150));

      const later = new Date(Date.now() + 5_000);
      utimesSync(bundle, later, later);
      const refused = await request(
        socketPath,
        warmRequest({}, { url: "http://localhost/" })
      );
      expect(refused.stale).toBe(true);

      // The invocation that was already executing still delivers its
      // outcome; only then does the drained server exit.
      const served = await inFlight;
      expect(served.outcome?.ok).toBe(true);
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill();
    }
  });

  test("serves a request stamped with the matching bundle hash", async () => {
    const { proc, socketPath } = await startServer(fx("hello.ts"));
    try {
      const bytes = await Bun.file(fx("hello.ts")).arrayBuffer();
      const bundleSha256 = new Bun.CryptoHasher("sha256")
        .update(new Uint8Array(bytes))
        .digest("hex");
      const reply = await request(
        socketPath,
        warmRequest({}, { url: "http://localhost/?name=stamped", bundleSha256 })
      );
      expect(reply.outcome?.ok).toBe(true);
      expect(reply.outcome?.output).toEqual({ hello: "stamped" });
    } finally {
      proc.kill();
    }
  });

  test("refuses a mismatched bundle hash as stale and drains", async () => {
    // The stat cannot see the rewrite here (the file is untouched), which is
    // exactly the gcsfuse-cached-metadata case: the request's hash is the
    // only signal, and it must win.
    const { proc, socketPath } = await startServer(fx("hello.ts"));
    try {
      const reply = await request(
        socketPath,
        warmRequest(
          {},
          { url: "http://localhost/", bundleSha256: "0".repeat(64) }
        )
      );
      expect(reply.stale).toBe(true);
      expect(reply.outcome).toBeUndefined();
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill();
    }
  });

  test("serves an unstamped request from an older front", async () => {
    const { proc, socketPath } = await startServer(fx("hello.ts"));
    try {
      const reply = await request(
        socketPath,
        warmRequest({}, { url: "http://localhost/?name=unstamped" })
      );
      expect(reply.outcome?.output).toEqual({ hello: "unstamped" });
    } finally {
      proc.kill();
    }
  });

  test("rejects a protocol version it does not speak without dying", async () => {
    const { proc, socketPath } = await startServer(fx("hello.ts"));
    try {
      const reply = await request(socketPath, {
        v: 999,
        env: {},
        input: "{}",
      });
      expect(reply.error).toBe("bad warm request");

      // Version-suffixed socket names make a mismatched client a bug, not a
      // rolling-upgrade case; the server must not abandon concurrent work
      // over one bad request.
      const after = await request(
        socketPath,
        warmRequest({}, { url: "http://localhost/?name=alive" })
      );
      expect(after.outcome?.output).toEqual({ hello: "alive" });
    } finally {
      proc.kill();
    }
  });

  test("acks before the outcome so the client can pin execution start", async () => {
    const { proc, socketPath } = await startServer(fx("hello.ts"));
    try {
      const frames = await requestFrames(
        socketPath,
        warmRequest({}, { url: "http://localhost/?name=frames" })
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
    const proc = Bun.spawn(
      ["bun", runner, "serve", fx("env-probe.ts"), socketPath],
      {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "inherit",
        env: {
          ...process.env,
          WARM_TEST_MARKER: "from-spawn",
          DUST_SANDBOX_TOKEN: "spawn-invocation-token",
        },
      }
    );
    try {
      const deadline = Date.now() + 10_000;
      let reply: WarmReply | null = null;
      while (Date.now() < deadline && reply === null) {
        try {
          reply = await request(
            socketPath,
            warmRequest({}, { url: "http://localhost/" })
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

  test("reports runner errors as structured outcomes", async () => {
    const { proc, socketPath } = await startServer(fx("throws.ts"));
    try {
      const reply = await request(
        socketPath,
        warmRequest({}, { url: "http://localhost/" })
      );
      expect(reply.outcome?.ok).toBe(false);
      expect(reply.outcome?.error?.code).toBe("threw");
    } finally {
      proc.kill();
    }
  });

  test("reports malformed envelopes as bad_input without dying", async () => {
    const { proc, socketPath } = await startServer(fx("hello.ts"));
    try {
      const bad = await request(socketPath, {
        v: WARM_PROTOCOL_VERSION,
        env: {},
        input: "not json",
      });
      expect(bad.outcome?.ok).toBe(false);
      expect(bad.outcome?.error?.code).toBe("bad_input");

      // The server survives a bad envelope: the next request still works.
      const good = await request(
        socketPath,
        warmRequest({}, { url: "http://localhost/?name=alive" })
      );
      expect(good.outcome?.output).toEqual({ hello: "alive" });
    } finally {
      proc.kill();
    }
  });
});

describe("parseWarmRequest", () => {
  test("parses a request and keeps only string env values", () => {
    const parsed = parseWarmRequest(
      JSON.stringify({
        v: WARM_PROTOCOL_VERSION,
        env: { KEEP: "yes", DROP_NUMBER: 3, DROP_NULL: null },
        input: "{}",
      })
    );
    expect(parsed).toEqual({
      v: WARM_PROTOCOL_VERSION,
      env: { KEEP: "yes" },
      input: "{}",
    });
  });

  test("returns null for every malformed request", () => {
    expect(parseWarmRequest("not json")).toBeNull();
    expect(parseWarmRequest('"a string"')).toBeNull();
    expect(
      parseWarmRequest(JSON.stringify({ v: 999, env: {}, input: "{}" }))
    ).toBeNull();
    expect(
      parseWarmRequest(
        JSON.stringify({ v: WARM_PROTOCOL_VERSION, input: "{}" })
      )
    ).toBeNull();
    expect(
      parseWarmRequest(
        JSON.stringify({ v: WARM_PROTOCOL_VERSION, env: null, input: "{}" })
      )
    ).toBeNull();
    expect(
      parseWarmRequest(
        JSON.stringify({ v: WARM_PROTOCOL_VERSION, env: {}, input: 7 })
      )
    ).toBeNull();
  });
});
