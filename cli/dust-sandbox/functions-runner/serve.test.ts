import { afterEach, describe, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyRequestEnv,
  clearAppliedEnv,
  parseWarmRequest,
  resolveBundle,
  WARM_PROTOCOL_VERSION,
} from "./serve.ts";

const runner = join(import.meta.dir, "runner.ts");
const fx = (n: string) => join(import.meta.dir, "fixtures", n);
const fixturesDir = join(import.meta.dir, "fixtures");

const DEFAULT_IDLE_MS = 60_000;

// Each test gets its own scratch dir holding the socket and, for staleness
// tests, a private functions dir whose bundles it rewrites.
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
  {
    idleTimeoutMs = DEFAULT_IDLE_MS,
    env = {},
  }: { idleTimeoutMs?: number; env?: Record<string, string> } = {}
): Promise<ServerHandle> {
  const socketPath = join(scratch(), "w.sock");
  const proc = Bun.spawn(
    ["bun", runner, "serve", socketPath, String(idleTimeoutMs)],
    {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "inherit",
      env: { ...process.env, DUST_FUNCTIONS_DIR: functionsDir, ...env },
    }
  );
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
  outcome?: { ok: boolean; output?: unknown; error?: { code: string } };
  importKind?: "cached" | "fresh";
  stale?: boolean;
  busy?: boolean;
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
  env: Record<string, string>,
  name: string,
  input: unknown
) {
  return {
    v: WARM_PROTOCOL_VERSION,
    env,
    input: JSON.stringify(input),
    name,
  };
}

describe("runner serve", () => {
  test("serves an invocation, importing the bundle on first use", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const reply = await request(
        socketPath,
        warmRequest({}, "hello", { url: "http://localhost/?name=warm" })
      );
      expect(reply.v).toBe(WARM_PROTOCOL_VERSION);
      expect(reply.outcome?.ok).toBe(true);
      expect(reply.outcome?.output).toEqual({ hello: "warm" });
      expect(reply.importKind).toBe("fresh");
    } finally {
      proc.kill();
    }
  });

  test("serves repeat invocations from the module cache", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const first = await request(
        socketPath,
        warmRequest({}, "hello", { url: "http://localhost/?name=one" })
      );
      expect(first.importKind).toBe("fresh");
      for (const name of ["two", "three"]) {
        const reply = await request(
          socketPath,
          warmRequest({}, "hello", { url: `http://localhost/?name=${name}` })
        );
        expect(reply.outcome?.output).toEqual({ hello: name });
        expect(reply.importKind).toBe("cached");
      }
    } finally {
      proc.kill();
    }
  });

  test("serves several functions from one worker", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const hello = await request(
        socketPath,
        warmRequest({}, "hello", { url: "http://localhost/?name=multi" })
      );
      expect(hello.outcome?.output).toEqual({ hello: "multi" });

      const threw = await request(
        socketPath,
        warmRequest({}, "throws", { url: "http://localhost/" })
      );
      expect(threw.outcome?.ok).toBe(false);
      expect(threw.outcome?.error?.code).toBe("threw");

      // The first function's import survives serving the second.
      const again = await request(
        socketPath,
        warmRequest({}, "hello", { url: "http://localhost/?name=back" })
      );
      expect(again.outcome?.output).toEqual({ hello: "back" });
      expect(again.importKind).toBe("cached");
    } finally {
      proc.kill();
    }
  });

  test("applies per-request env and clears it between requests", async () => {
    // env-probe.ts echoes process.env.WARM_TEST_MARKER, so the reply proves
    // which env the invocation ran under.
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const first = await request(
        socketPath,
        warmRequest(
          { WARM_TEST_MARKER: "alpha", DUST_SANDBOX_TOKEN: "tok-alpha" },
          "env-probe",
          { url: "http://localhost/" }
        )
      );
      expect(first.outcome?.output).toEqual({
        marker: "alpha",
        token: "tok-alpha",
      });

      // The second request carries neither: nothing may leak over from the
      // first invocation — in particular not its sandbox token.
      const second = await request(
        socketPath,
        warmRequest({}, "env-probe", { url: "http://localhost/" })
      );
      expect(second.outcome?.output).toEqual({
        marker: "unset",
        token: "unset",
      });
    } finally {
      proc.kill();
    }
  });

  test("reports a rewritten bundle as stale and recycles", async () => {
    const dir = scratch();
    copyFileSync(fx("hello.ts"), join(dir, "hello.ts"));
    const { proc, socketPath } = await startWorker(dir);
    try {
      const first = await request(
        socketPath,
        warmRequest({}, "hello", { url: "http://localhost/" })
      );
      expect(first.outcome?.ok).toBe(true);

      // Same content, different mtime — a republish rewrites the object, and
      // mtime/size is the staleness signal. The stale import can never be
      // evicted, so the worker drains and exits.
      const later = new Date(Date.now() + 5_000);
      utimesSync(join(dir, "hello.ts"), later, later);

      const reply = await request(
        socketPath,
        warmRequest({}, "hello", { url: "http://localhost/" })
      );
      expect(reply.stale).toBe(true);
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill();
    }
  });

  test("refuses a mismatched bundle hash as stale without importing", async () => {
    // The stat cannot see a rewrite here (the file is untouched), which is
    // exactly the gcsfuse-cached-metadata case: the request's hash is the
    // only signal, and it must win.
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const reply = await request(
        socketPath,
        warmRequest({}, "hello", {
          url: "http://localhost/",
          bundleSha256: "0".repeat(64),
        })
      );
      expect(reply.stale).toBe(true);
      expect(reply.outcome).toBeUndefined();

      // The refusal happened before the import, so the worker is not
      // poisoned: a correctly-stamped request still gets served.
      const bytes = await Bun.file(fx("hello.ts")).arrayBuffer();
      const bundleSha256 = new Bun.CryptoHasher("sha256")
        .update(new Uint8Array(bytes))
        .digest("hex");
      const served = await request(
        socketPath,
        warmRequest({}, "hello", {
          url: "http://localhost/?name=stamped",
          bundleSha256,
        })
      );
      expect(served.outcome?.output).toEqual({ hello: "stamped" });
      expect(served.importKind).toBe("fresh");
    } finally {
      proc.kill();
    }
  });

  test("refuses a cached bundle when the stamped hash stops matching", async () => {
    const dir = scratch();
    copyFileSync(fx("hello.ts"), join(dir, "hello.ts"));
    const { proc, socketPath } = await startWorker(dir);
    try {
      const first = await request(
        socketPath,
        warmRequest({}, "hello", { url: "http://localhost/" })
      );
      expect(first.outcome?.ok).toBe(true);

      const reply = await request(
        socketPath,
        warmRequest({}, "hello", {
          url: "http://localhost/",
          bundleSha256: "0".repeat(64),
        })
      );
      expect(reply.stale).toBe(true);
      // The cached import can never serve the stamped version: recycle.
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill();
    }
  });

  test("reports an unknown function as stale, keeping the cold path's error", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const reply = await request(
        socketPath,
        warmRequest({}, "no-such-function", { url: "http://localhost/" })
      );
      expect(reply.stale).toBe(true);

      // The worker survives: an unknown name poisons nothing.
      const served = await request(
        socketPath,
        warmRequest({}, "hello", { url: "http://localhost/?name=alive" })
      );
      expect(served.outcome?.output).toEqual({ hello: "alive" });
    } finally {
      proc.kill();
    }
  });

  test("exits on idle", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir, {
      idleTimeoutMs: 300,
    });
    try {
      const reply = await request(
        socketPath,
        warmRequest({}, "hello", { url: "http://localhost/" })
      );
      expect(reply.outcome?.ok).toBe(true);
      // Burst workers are configured with short idles exactly so they drain
      // once load drops; nothing else references this process again.
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill();
    }
  });

  test("rejects a protocol version it does not speak and exits", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const reply = await request(socketPath, {
        v: 999,
        env: {},
        input: "{}",
        name: "hello",
      });
      expect(reply.error).toBe("bad warm request");
      expect(await proc.exited).toBe(0);
    } finally {
      proc.kill();
    }
  });

  test("acks before the outcome so the client can pin execution start", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const frames = await requestFrames(
        socketPath,
        warmRequest({}, "hello", { url: "http://localhost/?name=frames" })
      );
      expect(frames.length).toBe(2);
      expect(frames[0]?.ack).toBe(true);
      expect(frames[1]?.outcome?.output).toEqual({ hello: "frames" });
    } finally {
      proc.kill();
    }
  });

  test("replies busy instead of queueing behind a running invocation", async () => {
    const { proc, socketPath } = await startWorker(fixturesDir);
    try {
      const slow = request(
        socketPath,
        warmRequest({}, "slow", { url: "http://localhost/" })
      );
      // Give the slow request time to reach the worker and start executing.
      await new Promise((resolve) => setTimeout(resolve, 150));

      const overlapped = await request(
        socketPath,
        warmRequest({}, "hello", { url: "http://localhost/" })
      );
      // Queueing would run this request for a client whose front-side
      // timeout may already have fired; busy sends it to the next slot (or
      // cold) immediately.
      expect(overlapped.busy).toBe(true);
      expect(overlapped.outcome).toBeUndefined();

      const first = await slow;
      expect(first.outcome?.output).toEqual({ done: true });

      // The worker survives and serves again once free.
      const after = await request(
        socketPath,
        warmRequest({}, "slow", { url: "http://localhost/" })
      );
      expect(after.outcome?.output).toEqual({ done: true });
    } finally {
      proc.kill();
    }
  });

  test("scrubs the spawn-time invocation secrets from its own environment", async () => {
    // Spawned the way dsbx spawns it: with the cold invocation's token in
    // env. The worker must not serve requests under that inherited value.
    const { proc, socketPath } = await startWorker(fixturesDir, {
      env: {
        WARM_TEST_MARKER: "from-spawn",
        DUST_SANDBOX_TOKEN: "spawn-invocation-token",
      },
    });
    try {
      const reply = await request(
        socketPath,
        warmRequest({}, "env-probe", { url: "http://localhost/" })
      );
      // WARM_TEST_MARKER is not in the scrub list, so it survives spawn env
      // inheritance like any other var; the spawn-time DUST_SANDBOX_TOKEN
      // must have been scrubbed at startup.
      expect(reply.outcome?.output).toEqual({
        marker: "from-spawn",
        token: "unset",
      });
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
        warmRequest({}, "hello", { url: "http://localhost/?name=alive" })
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
    const base = { v: WARM_PROTOCOL_VERSION, env: {}, input: "{}" };
    expect(
      parseWarmRequest(JSON.stringify({ ...base, v: 999, name: "greet" }))
    ).toBeNull();
    expect(parseWarmRequest(JSON.stringify(base))).toBeNull();
    expect(
      parseWarmRequest(JSON.stringify({ ...base, name: "bad name!" }))
    ).toBeNull();
    expect(
      parseWarmRequest(JSON.stringify({ ...base, env: null, name: "greet" }))
    ).toBeNull();
    expect(
      parseWarmRequest(JSON.stringify({ ...base, input: 7, name: "greet" }))
    ).toBeNull();
  });
});

describe("resolveBundle", () => {
  test("resolves a name to its single bundle, extension-agnostically", () => {
    const resolved = resolveBundle(fixturesDir, "hello");
    expect(resolved).toBe(join(fixturesDir, "hello.ts"));
  });

  test("returns null for missing or ambiguous names", () => {
    expect(resolveBundle(fixturesDir, "no-such-function")).toBeNull();
    const dir = scratch();
    copyFileSync(fx("hello.ts"), join(dir, "greet.ts"));
    copyFileSync(fx("hello.ts"), join(dir, "greet.js"));
    expect(resolveBundle(dir, "greet")).toBeNull();
    expect(resolveBundle(join(dir, "does-not-exist"), "greet")).toBeNull();
  });
});

describe("applyRequestEnv", () => {
  test("applies for the invocation and clears afterwards", () => {
    const original = process.env.SERVE_TEST_KEY;
    try {
      const applied = applyRequestEnv({ SERVE_TEST_KEY: "one" });
      expect(process.env.SERVE_TEST_KEY).toBe("one");

      // Cleared after the invocation: per-request secrets (the sandbox
      // token travels in env) must not sit in the idle worker's environment.
      clearAppliedEnv(applied);
      expect(process.env.SERVE_TEST_KEY).toBeUndefined();
    } finally {
      if (original === undefined) {
        delete process.env.SERVE_TEST_KEY;
      } else {
        process.env.SERVE_TEST_KEY = original;
      }
    }
  });
});
