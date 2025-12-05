import { datadogLogs } from "@datadog/browser-logs";

import localLogger from "@app/logger/logger";

// Keep the exported Logger type for compatibility with existing imports.
export type { Logger } from "pino";

// Pino-like levels we expose
type Level = "trace" | "debug" | "info" | "warn" | "error";

const IS_DEV = process.env.NODE_ENV === "development";

// Type guard to check if value is a plain object (not null, not array)
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

// Normalize arguments to match how pino is used in the codebase:
// - pino style: logger.info({ ctx }, "message")
// - also seen:  logger.info("message", { ctx })
// - minimal:    logger.info("message")
function toMessageAndContext(
  arg1?: LogArg,
  arg2?: LogArg
): { message?: LogMessage; context?: LogContext } {
  if (typeof arg1 === "string") {
    // Handle: logger.error("message", error) or logger.error("message", context)
    const message = arg1;
    const context = isPlainObject(arg2) ? arg2 : undefined;
    return { message, context };
  }
  const context = isPlainObject(arg1) ? arg1 : undefined;
  const message = typeof arg2 === "string" ? arg2 : undefined;
  return { message, context };
}

type LogContext = Record<string, unknown>;
type LogMessage = string;
type LogArg = LogContext | LogMessage;

function makeLogger(baseBindings?: LogContext) {
  const call = (level: Level, arg1?: LogArg, arg2?: LogArg) => {
    const { message, context } = toMessageAndContext(arg1, arg2);

    // Merge child bindings with per-call context
    const mergedContext = {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      ...(baseBindings || {}),
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      ...(context || {}),
    };

    try {
      if (IS_DEV) {
        // In dev, use the local pino logger so logs appear locally and pretty-printed.
        const hasCtx = Object.keys(mergedContext).length > 0;
        // Pino signature: logger[level](obj?, msg?)
        if (hasCtx && message !== undefined) {
          // Prefer structured + message
          localLogger[level](mergedContext, message);
        } else if (hasCtx) {
          localLogger[level](mergedContext);
        } else if (message !== undefined) {
          localLogger[level](message);
        } else {
          localLogger[level]("");
        }
        return;
      }
      // In non-dev, forward to Datadog. Datadog supports: debug, info, warn, error. Map trace->debug.
      const ddLevel = level === "trace" ? "debug" : level;
      datadogLogs.logger[ddLevel](
        message ?? "",
        Object.keys(mergedContext).length ? mergedContext : undefined
      );
    } catch {
      // Fail-safe: avoid throwing if the logging backend is not ready.
    }
  };

  return {
    trace: (a?: LogArg, b?: LogArg) => call("trace", a, b),
    debug: (a?: LogArg, b?: LogArg) => call("debug", a, b),
    info: (a?: LogArg, b?: LogArg) => call("info", a, b),
    warn: (a?: LogArg, b?: LogArg) => call("warn", a, b),
    error: (a?: LogArg, b?: LogArg) => call("error", a, b),

    // Pino-like child logger to bind persistent context
    child: (bindings?: LogContext) =>
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      makeLogger({ ...(baseBindings || {}), ...(bindings || {}) }),
  };
}

const datadogLogger = makeLogger();
export default datadogLogger;
