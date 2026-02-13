import type { Span as DDSpan, Tracer as DDTracer } from "dd-trace";

import { isDevelopment } from "@app/types/shared/env";

/**
 * Minimal tracer interface matching the dd-trace API surface we actually use.
 * In development, a noop implementation is used to skip loading dd-trace.
 */
interface TracerLike {
  scope(): { active(): SpanLike | null };
  trace<T>(name: string, fn: (span?: SpanLike) => T): T;
  trace<T>(
    name: string,
    options: Record<string, unknown>,
    fn: (span?: SpanLike | null) => T
  ): T;
  setUser(user: Record<string, string | undefined>): void;
}

interface SpanLike {
  setTag(key: string, value: unknown): SpanLike;
  setOperationName(name: string): SpanLike;
}

const noopSpan: SpanLike = {
  setTag() {
    return noopSpan;
  },
  setOperationName() {
    return noopSpan;
  },
};

const noopTracer: TracerLike = {
  scope() {
    return {
      active(): SpanLike | null {
        return null;
      },
    };
  },
  trace<T>(
    _name: string,
    fnOrOpts: ((span?: SpanLike) => T) | Record<string, unknown>,
    maybeFn?: (span?: SpanLike | null) => T
  ): T {
    const fn = typeof fnOrOpts === "function" ? fnOrOpts : maybeFn!;
    return fn(null as unknown as SpanLike);
  },
  setUser() {},
};

let tracer: TracerLike;

if (isDevelopment()) {
  tracer = noopTracer;
} else {
  // Side-effect import ensures dd-trace/init is available at runtime.
  // See: https://github.com/DataDog/dd-trace-js/issues/4003
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dd-trace");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  tracer = require("dd-trace").default as TracerLike;
}

export { tracer };
export type { DDSpan as Span, SpanLike, DDTracer as Tracer };
export default tracer;
