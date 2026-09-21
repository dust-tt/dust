// Collects nested `dsbx tools` phase timings for the active function
// invocation so the runner can stamp them on `_dustTimingsMs.tools`.
//
// Shared with the functions-runner through `Symbol.for` for the same reason
// as pod/context.ts: distinct module graphs (bundled runner vs NODE_PATH
// @dust/pod) must see one store. The enter/take helpers are duplicated in
// functions-runner/tool_timings.ts on purpose — importing this file from the
// runner would bind a second module graph and silently drop recordings.
// Duck-type the AsyncLocalStorage slot (not `instanceof`) so a second copy of
// `async_hooks` cannot overwrite the runner's instance. A sync stack is the
// cold-path fallback when AsyncLocalStorage context is lost across `await`.

import { AsyncLocalStorage } from "node:async_hooks";

export type ToolCallServerTimingsMs = {
  fetchView: number;
  resolveTool: number;
  fetchFunction: number;
  fetchInvocation: number;
  stakeStatus: number;
  createAction: number;
  runOrLaunch: number;
  run?: {
    auth: number;
    fetchAction: number;
    fetchInvocation: number;
    resolvePod: number;
    streaming: number;
    mcpConnect?: number;
    mcpCall?: number;
    total: number;
  };
  earlyWait?: number;
  total: number;
};

export type ToolCallTimingMs = {
  server: string;
  tool: string;
  post: number;
  poll: number;
  offload?: number;
  /** Front create/run breakdown when present on the POST. */
  dust?: ToolCallServerTimingsMs;
  total: number;
};

export type ToolsTimingsMs = {
  total: number;
  count: number;
  calls: ToolCallTimingMs[];
};

type ToolTimingsStore = {
  calls: ToolCallTimingMs[];
};

/** Must match functions-runner/tool_timings.ts. */
export const TOOL_TIMINGS_CONTEXT_KEY = "dust.pod.tool-timings.v1";

/** Sync stack key; must match functions-runner/tool_timings.ts. */
export const TOOL_TIMINGS_STACK_KEY = "dust.pod.tool-timings.stack.v1";

function isAsyncLocalStorageToolTimingsStore(
  value: unknown
): value is AsyncLocalStorage<ToolTimingsStore> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AsyncLocalStorage<ToolTimingsStore>).run === "function" &&
    typeof (value as AsyncLocalStorage<ToolTimingsStore>).getStore ===
      "function"
  );
}

function toolTimingsStorage(): AsyncLocalStorage<ToolTimingsStore> {
  const key = Symbol.for(TOOL_TIMINGS_CONTEXT_KEY);
  const existing: unknown = Reflect.get(globalThis, key);
  if (isAsyncLocalStorageToolTimingsStore(existing)) {
    return existing;
  }
  const storage = new AsyncLocalStorage<ToolTimingsStore>();
  Reflect.set(globalThis, key, storage);
  return storage;
}

function syncStack(): ToolTimingsStore[] {
  const key = Symbol.for(TOOL_TIMINGS_STACK_KEY);
  const existing: unknown = Reflect.get(globalThis, key);
  if (Array.isArray(existing)) {
    return existing as ToolTimingsStore[];
  }
  const stack: ToolTimingsStore[] = [];
  Reflect.set(globalThis, key, stack);
  return stack;
}

function activeStore(): ToolTimingsStore | undefined {
  return toolTimingsStorage().getStore() ?? syncStack().at(-1);
}

/** True when `fn()` returned a Promise (thenable) so we can `finally` pop the stack. */
function isPromiseLike(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Promise<unknown>).then === "function"
  );
}

/** Enter a collector around one function invocation (runner only). */
export function runWithToolTimingsCollector<T>(fn: () => T): T {
  const store: ToolTimingsStore = { calls: [] };
  syncStack().push(store);
  const pop = (): void => {
    const stack = syncStack();
    if (stack[stack.length - 1] === store) {
      stack.pop();
    }
  };
  return toolTimingsStorage().run(store, () => {
    try {
      const result = fn();
      if (isPromiseLike(result)) {
        // Keep the collector alive across the async work; pop when it settles.
        return result.finally(pop) as T;
      }
      pop();
      return result;
    } catch (error) {
      pop();
      throw error;
    }
  });
}

/** Record one completed tools.call timing when a collector is active. */
export function recordToolTiming(timing: ToolCallTimingMs): void {
  const store = activeStore();
  if (store === undefined) {
    return;
  }
  store.calls.push(timing);
}

/** Snapshot collected timings for the runner sidecar (empty when none). */
export function takeToolTimings(): ToolsTimingsMs | undefined {
  const store = activeStore();
  if (store === undefined || store.calls.length === 0) {
    return undefined;
  }
  const total = store.calls.reduce((sum, call) => sum + call.total, 0);
  return {
    total,
    count: store.calls.length,
    calls: store.calls.slice(),
  };
}
