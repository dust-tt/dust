import { afterEach, describe, expect, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";

import {
  INVOCATION_CONTEXT_KEY,
  podEnv,
  runWithInvocationEnv,
} from "@dust/pod";

const MARKER = "POD_CONTEXT_TEST_MARKER";

afterEach(() => {
  delete process.env[MARKER];
});

describe("podEnv", () => {
  test("reads process.env outside any invocation context", () => {
    process.env[MARKER] = "from-process";
    expect(podEnv(MARKER)).toBe("from-process");
  });

  test("reads only the context env inside an invocation context", () => {
    process.env[MARKER] = "from-process";
    const seen = runWithInvocationEnv({ [MARKER]: "from-context" }, () =>
      podEnv(MARKER)
    );
    expect(seen).toBe("from-context");
  });

  test("a key absent from the context env stays absent", () => {
    process.env[MARKER] = "from-process";
    const seen = runWithInvocationEnv({}, () => podEnv(MARKER));
    expect(seen).toBeUndefined();
  });

  test("the context survives awaits and does not leak across concurrent flows", async () => {
    const flow = async (value: string, delayMs: number) =>
      runWithInvocationEnv({ [MARKER]: value }, async () => {
        const before = podEnv(MARKER);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        const after = podEnv(MARKER);
        return { before, after };
      });
    const [a, b] = await Promise.all([flow("alpha", 40), flow("beta", 10)]);
    expect(a).toEqual({ before: "alpha", after: "alpha" });
    expect(b).toEqual({ before: "beta", after: "beta" });
  });

  test("the context env is a frozen copy taken at entry", () => {
    const source: Record<string, string> = { [MARKER]: "original" };
    runWithInvocationEnv(source, () => {
      source[MARKER] = "mutated-after-entry";
      expect(podEnv(MARKER)).toBe("original");
    });
  });

  test("the storage is published in the Symbol.for registry", () => {
    // Force the get-or-create, then look the storage up the way the runner's
    // own copy of the context module does.
    runWithInvocationEnv({}, () => undefined);
    const shared: unknown = Reflect.get(
      globalThis,
      Symbol.for(INVOCATION_CONTEXT_KEY)
    );
    expect(shared instanceof AsyncLocalStorage).toBe(true);
  });
});
