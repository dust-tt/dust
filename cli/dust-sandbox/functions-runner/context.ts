// Enter side of the per-invocation context contract shared with @dust/pod
// (pod/context.ts — see the module doc there for the full story).
//
// The runner and @dust/pod are distinct module graphs (the runner is a
// pre-bundled artifact, @dust/pod resolves through NODE_PATH), so the
// AsyncLocalStorage instance is shared through the process-wide `Symbol.for`
// registry rather than an import both sides would duplicate. This file
// mirrors pod/context.ts's get-or-create; the registry key is the contract
// and must match exactly.

import { AsyncLocalStorage } from "node:async_hooks";

export interface InvocationContext {
  readonly env: Readonly<Record<string, string>>;
}

/** Must match pod/context.ts. Versioned: a breaking change to the store
 * shape must change the key so mismatched runner/SDK builds ignore each
 * other instead of misreading the store. */
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

/** Run `fn` inside an invocation context whose environment is `env`. */
export function runWithInvocationEnv<T>(
  env: Readonly<Record<string, string>>,
  fn: () => T
): T {
  return contextStorage().run(
    Object.freeze({ env: Object.freeze({ ...env }) }),
    fn
  );
}
