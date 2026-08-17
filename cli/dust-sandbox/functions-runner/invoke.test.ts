import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { invoke } from "./invoke.ts";
import type { RequestInput } from "./protocol.ts";

const fx = (n: string) => join(import.meta.dir, "fixtures", n);
const req = (o: Partial<RequestInput> = {}): RequestInput => ({
  method: "GET",
  url: "http://localhost/",
  headers: {},
  encoding: "utf8",
  ...o,
});

describe("invoke", () => {
  test("runs a handler and returns its parsed output", async () => {
    const out = await invoke(
      fx("hello.ts"),
      req({ url: "http://localhost/?name=bun" })
    );
    expect(out.ok).toBe(true);
    if (!out.ok) {
      return;
    }
    expect(out.output).toEqual({ hello: "bun" });
  });

  test("returns http_error for a non-2xx response", async () => {
    const out = await invoke(fx("notfound.ts"), req());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error).toMatchObject({ code: "http_error", status: 404 });
    }
  });

  test("passes the request body through", async () => {
    const out = await invoke(
      fx("echo.ts"),
      req({ method: "POST", body: "payload" })
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.output).toBe("echo:POST:payload");
    }
  });

  test("returns invalid_output for a non-JSON response", async () => {
    const out = await invoke(fx("binary.ts"), req());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("invalid_output");
    }
  });

  test("thrown handler → ok:false threw", async () => {
    const out = await invoke(fx("throws.ts"), req());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("threw");
    }
  });

  test("missing file → import_failed", async () => {
    const out = await invoke(fx("nope.ts"), req());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("import_failed");
    }
  });

  test("no fetch export → import_failed", async () => {
    const out = await invoke(fx("no-fetch.ts"), req());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("import_failed");
    }
  });

  test("non-Response return → bad_return", async () => {
    const out = await invoke(fx("bad-return.ts"), req());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("bad_return");
    }
  });

  test("returns schema.output with defaults applied", async () => {
    const out = await invoke(fx("default-output.ts"), req());
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.output).toEqual({
        greeting: "Hi",
        tone: "friendly",
      });
    }
  });

  test("returns invalid_input for a missing required field", async () => {
    const out = await invoke(
      fx("greet.ts"),
      req({ method: "POST", body: "{}" })
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("invalid_input");
    }
  });

  test("returns invalid_input for a non-JSON body", async () => {
    const out = await invoke(
      fx("greet.ts"),
      req({ method: "POST", body: "not json" })
    );
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("invalid_input");
    }
  });

  test("returns invalid_output when the response fails schema.output", async () => {
    const out = await invoke(fx("invalid-output.ts"), req());
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.error.code).toBe("invalid_output");
    }
  });

  test("non-Zod schema.input is skipped (handler runs)", async () => {
    const out = await invoke(
      fx("bad-schema.ts"),
      req({ method: "POST", body: "{}" })
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.output).toBe("ok");
    }
  });
});

describe("invoke with invocationEnv", () => {
  const outputOf = async (
    input: RequestInput,
    env?: Readonly<Record<string, string>>
  ): Promise<Record<string, unknown>> => {
    const out = await invoke(fx("context-probe.ts"), input, env);
    expect(out.ok).toBe(true);
    if (!out.ok) {
      throw new Error("probe invocation failed");
    }
    expect(typeof out.output).toBe("object");
    return Object(out.output);
  };

  test("the handler reads the invocation env, not process.env", async () => {
    process.env.WARM_TEST_MARKER = "from-process";
    try {
      const output = await outputOf(req(), {
        WARM_TEST_MARKER: "from-context",
        DUST_POD_USER_IDENTITY: "ctx-identity",
      });
      expect(output.before).toBe("from-context");
      expect(output.identity).toBe("ctx-identity");
    } finally {
      delete process.env.WARM_TEST_MARKER;
    }
  });

  test("a key absent from the invocation env stays absent", async () => {
    process.env.WARM_TEST_MARKER = "from-process";
    try {
      const output = await outputOf(req(), {});
      expect(output.before).toBeNull();
    } finally {
      delete process.env.WARM_TEST_MARKER;
    }
  });

  test("without an invocation env the handler falls back to process.env", async () => {
    process.env.WARM_TEST_MARKER = "from-process";
    try {
      const output = await outputOf(req());
      expect(output.before).toBe("from-process");
    } finally {
      delete process.env.WARM_TEST_MARKER;
    }
  });

  test("concurrent invocations with different envs never observe each other", async () => {
    const probe = (marker: string, delayMs: number) =>
      outputOf(req({ url: `http://localhost/?delayMs=${delayMs}` }), {
        WARM_TEST_MARKER: marker,
      });
    // Staggered delays force the invocations to interleave across awaits.
    const [a, b, c] = await Promise.all([
      probe("alpha", 60),
      probe("beta", 20),
      probe("gamma", 40),
    ]);
    expect(a).toMatchObject({ before: "alpha", after: "alpha" });
    expect(b).toMatchObject({ before: "beta", after: "beta" });
    expect(c).toMatchObject({ before: "gamma", after: "gamma" });
  });
});
