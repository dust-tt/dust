// Per-invocation context.
//
// The function runner executes every invocation inside an AsyncLocalStorage
// context carrying that invocation's environment (user identity, sandbox
// token, pod paths), so one process can serve concurrent invocations without
// mutating process.env. Runtime code reads the environment through podEnv():
// the active context's env inside an invocation, process.env otherwise (cold
// runs and local use, where the process environment IS the invocation's).
//
// The storage instance is shared with the runner through the process-wide
// `Symbol.for` registry rather than a module-level singleton: the runner is a
// pre-bundled artifact and @dust/pod resolves through NODE_PATH, so the two
// are distinct module graphs that would each get their own module state. The
// runner's enter side of this contract lives in
// functions-runner/context.ts and must use the same key.

import { AsyncLocalStorage } from "node:async_hooks";

export interface InvocationContext {
  readonly env: Readonly<Record<string, string>>;
}

/** Registry key of the shared storage. Versioned: a breaking change to the
 * store shape must change the key so mismatched runner/SDK builds ignore
 * each other instead of misreading the store. */
export const INVOCATION_CONTEXT_KEY = "dust.pod.invocation-context.v1";

function contextStorage(): AsyncLocalStorage<InvocationContext> {
  const key = Symbol.for(INVOCATION_CONTEXT_KEY);
  const existing: unknown = Reflect.get(globalThis, key);
  if (existing instanceof AsyncLocalStorage) {
    return existing;
  }
  const storage = new AsyncLocalStorage<InvocationContext>();
  Reflect.set(globalThis, key, storage);
  return storage;
}

/**
 * Run `fn` inside an invocation context whose environment is `env`.
 * Called by the runner around each invocation; user code never calls this.
 */
export function runWithInvocationEnv<T>(
  env: Readonly<Record<string, string>>,
  fn: () => T
): T {
  return contextStorage().run(
    Object.freeze({ env: Object.freeze({ ...env }) }),
    fn
  );
}

/**
 * Read an environment variable as seen by the current invocation.
 *
 * Inside an invocation context, only the context's env is consulted — a key
 * absent there stays absent even when process.env has a value, so one
 * invocation's environment can never leak into another. Outside any context
 * (cold runs, local use), this is plain process.env.
 */
export function podEnv(name: string): string | undefined {
  const context = contextStorage().getStore();
  if (context !== undefined) {
    return context.env[name];
  }
  return process.env[name];
}
