import type { UserType } from "@app/types/user";
import type { LoggerOptions } from "pino";
import pino from "pino";

const NODE_ENV = process.env.NODE_ENV;
const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

// Datadog reads a top-level `status` as the log severity, prefix-matched on its value, so
// `status: "completed"` reads as critical and `status: "succeeded"` as ok. Only real
// severities may be logged as `status`; use another key for anything else.
export const DATADOG_LOG_STATUSES = [
  "emergency",
  "alert",
  "critical",
  "error",
  "warning",
  "notice",
  "info",
  "debug",
  "ok",
] as const;

export type DatadogLogStatus = (typeof DATADOG_LOG_STATUSES)[number];

// Datadog reserves `elapsed` and may replace its value. Use an explicit unit such as
// `elapsedMs` instead.
export type DatadogLogContext = {
  status?: DatadogLogStatus;
  elapsed?: never;
} & Record<string, unknown>;

interface CheckedLogFn {
  (msg: string, ...args: unknown[]): void;
  (obj: Error, msg?: string, ...args: unknown[]): void;
  (obj: DatadogLogContext, msg?: string, ...args: unknown[]): void;
}

// Pino's own log methods accept Datadog-reserved fields with any value. Ours constrain them.
export type Logger = Omit<
  pino.Logger,
  "trace" | "debug" | "info" | "warn" | "error" | "fatal" | "child"
> & {
  trace: CheckedLogFn;
  debug: CheckedLogFn;
  info: CheckedLogFn;
  warn: CheckedLogFn;
  error: CheckedLogFn;
  fatal: CheckedLogFn;
  child: (bindings: pino.Bindings, options?: pino.ChildLoggerOptions) => Logger;
};

const defaultPinoOptions: LoggerOptions = {
  serializers: {
    error: pino.stdSerializers.err,
  },
  formatters: {
    level(level) {
      return { level };
    },
  },
  redact: [
    // Redact Axios config.
    "*.*.config.headers.Authorization",
    "*.config.headers.Authorization",
    "*.*.response.config.headers.Authorization",
    "*.response.config.headers.Authorization",
    // Redact Undici config.
    "headers.authorization",
  ],
  level: LOG_LEVEL,
};

const devOptions = {
  transport: {
    target: "pino-pretty",
    options: {
      errorLikeObjectKeys: [
        "err",
        "error",
        "error_stack",
        "stack",
        "apiErrorHandlerCallStack",
      ],
      singleLine: true,
      colorize: true,
    },
  },
};
let pinoOptions = defaultPinoOptions;
if (NODE_ENV === "development") {
  pinoOptions = { ...defaultPinoOptions, ...devOptions };
}

const logger: Logger = pino(pinoOptions);

export default logger;

export function auditLog(
  data: { author: UserType | "no-author" } & Record<string, unknown>,
  message: string,
  auditLogger = logger
) {
  auditLogger.info({ ...data, audit: true }, message);
}
