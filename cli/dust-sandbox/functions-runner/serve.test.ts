import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applyRequestEnv,
  clearAppliedEnv,
  parseWarmRequest,
  WARM_PROTOCOL_VERSION,
} from "./serve.ts";

const runner = join(import.meta.dir, "runner.ts");
const fx = (n: string) => join(import.meta.dir, "fixtures", n);

// Each test gets its own scratch dir holding the socket.
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
  outcome?: { ok: boolean; output?: unknown; error?: { code: string } };
  busy?: boolean;
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

  test("applies per-request env and clears it between requests", async () => {
    // env-probe.ts echoes process.env.WARM_TEST_MARKER, so the reply proves
    // which env the invocation ran under.
    const { proc, socketPath } = await startServer(fx("env-probe.ts"));
    try {
      const first = await request(
        socketPath,
        warmRequest(
          { WARM_TEST_MARKER: "alpha", DUST_SANDBOX_TOKEN: "tok-alpha" },
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
        warmRequest({}, { url: "http://localhost/" })
      );
      expect(second.outcome?.output).toEqual({
        marker: "unset",
        token: "unset",
      });
    } finally {
      proc.kill();
    }
  });

  test("rejects a protocol version it does not speak and exits", async () => {
    const { proc, socketPath } = await startServer(fx("hello.ts"));
    try {
      const reply = await request(socketPath, {
        v: 999,
        env: {},
        input: "{}",
      });
      expect(reply.error).toBe("bad warm request");
      expect(await proc.exited).toBe(0);
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

  test("replies busy instead of queueing behind a running invocation", async () => {
    const { proc, socketPath } = await startServer(fx("slow.ts"));
    try {
      const slow = request(
        socketPath,
        warmRequest({}, { url: "http://localhost/" })
      );
      // Give the slow request time to reach the server and start executing.
      await new Promise((resolve) => setTimeout(resolve, 150));

      const overlapped = await request(
        socketPath,
        warmRequest({}, { url: "http://localhost/" })
      );
      // Queueing would run this request for a client whose front-side
      // timeout may already have fired; busy sends it cold immediately.
      expect(overlapped.busy).toBe(true);
      expect(overlapped.outcome).toBeUndefined();

      const first = await slow;
      expect(first.outcome?.output).toEqual({ done: true });

      // The server survives and serves again once free.
      const after = await request(
        socketPath,
        warmRequest({}, { url: "http://localhost/" })
      );
      expect(after.outcome?.output).toEqual({ done: true });
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

describe("applyRequestEnv", () => {
  test("applies for the invocation and clears afterwards", () => {
    const original = process.env.SERVE_TEST_KEY;
    try {
      const applied = applyRequestEnv({ SERVE_TEST_KEY: "one" });
      expect(process.env.SERVE_TEST_KEY).toBe("one");

      // Cleared after the invocation: per-request secrets (the sandbox
      // token travels in env) must not sit in the idle server's environment.
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
