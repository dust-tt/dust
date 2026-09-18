// Enter side of the tool-timings collector (see pod/tool_timings.ts).

import { AsyncLocalStorage } from "node:async_hooks";

export type ToolCallTimingMs = {
  server: string;
  tool: string;
  post: number;
  poll: number;
  offload?: number;
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

/** Must match pod/tool_timings.ts. */
export const TOOL_TIMINGS_CONTEXT_KEY = "dust.pod.tool-timings.v1";

/** Must match pod/tool_timings.ts. */
export const TOOL_TIMINGS_STACK_KEY = "dust.pod.tool-timings.stack.v1";

function isToolTimingsAls(
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
  if (isToolTimingsAls(existing)) {
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

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Promise<unknown>).then === "function"
  );
}

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
      if (isThenable(result)) {
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
