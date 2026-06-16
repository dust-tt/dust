import { datadogLogs } from "@datadog/browser-logs";

// Keep the exported Logger type for compatibility with existing imports.
export type { Logger } from "pino";

// Benign error messages that should not be forwarded to Datadog.
export const IGNORED_LOG_MESSAGES = [
  "ResizeObserver loop completed with undelivered notifications",
  "ResizeObserver loop limit exceeded",
  "No activity within",
];

interface InitDatadogLogsOptions {
  clientToken: string;
  service: string;
  env?: string;
  version?: string;
  forwardConsoleLogs?: ("error" | "warn" | "info" | "debug" | "log")[];
}

export function initDatadogLogs({
  clientToken,
  service,
  env,
  version,
  forwardConsoleLogs,
}: InitDatadogLogsOptions) {
  datadogLogs.init({
    clientToken,
    site: "datadoghq.eu",
    service,
    env,
    version,
    forwardErrorsToLogs: true,
    sessionSampleRate: 100,
    forwardConsoleLogs,
    beforeSend: (log) => {
      if (
        typeof log.message === "string" &&
        IGNORED_LOG_MESSAGES.some((m) => log.message.includes(m))
      ) {
        return false;
      }
      return true;
    },
  });
}

type Level = "trace" | "debug" | "info" | "warn" | "error";

const IS_DEV = process.env.NODE_ENV === "development";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

function toMessageAndContext(
  arg1?: LogArg,
  arg2?: LogArg
): { message?: LogMessage; context?: LogContext } {
  if (typeof arg1 === "string") {
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

    const mergedContext = {
      ...(baseBindings ?? {}),
      ...(context ?? {}),
    };

    try {
      if (IS_DEV) {
        const consoleLevel =
          level === "trace" || level === "debug" ? "debug" : level;
        const hasCtx = Object.keys(mergedContext).length > 0;
        if (hasCtx && message !== undefined) {
          console[consoleLevel](message, mergedContext);
        } else if (hasCtx) {
          console[consoleLevel](mergedContext);
        } else if (message !== undefined) {
          console[consoleLevel](message);
        }
        return;
      }
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

    child: (bindings?: LogContext) =>
      makeLogger({ ...(baseBindings ?? {}), ...(bindings ?? {}) }),
  };
}

const datadogLogger = makeLogger();
export default datadogLogger;
