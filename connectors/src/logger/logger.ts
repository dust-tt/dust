import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import { Context } from "@temporalio/activity";
import axios from "axios";
import type { LoggerOptions } from "pino";
import pino from "pino";

function sanitizeError(error: Error) {
  // Override default pino error serializer to handle Axios errors.
  if (axios.isAxiosError(error)) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data
        ? JSON.stringify(error.response.data)
        : undefined,
      url: error.config?.url,
      method: error.config?.method,
      stack: error.stack,
    };
  }

  return pino.stdSerializers.err(error);
}

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

interface CheckedLogFn {
  (msg: string, ...args: unknown[]): void;
  (obj: Error, msg?: string, ...args: unknown[]): void;
  (
    obj: { status?: DatadogLogStatus } & Record<string, unknown>,
    msg?: string,
    ...args: unknown[]
  ): void;
}

// pino's own log methods accept any `status`; ours reject the values Datadog would misread.
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

const NODE_ENV = process.env.NODE_ENV;
const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const defaultPinoOptions: LoggerOptions = {
  serializers: {
    error: sanitizeError,
    err: sanitizeError,
  },
  formatters: {
    level(level) {
      return { level };
    },
  },
  level: LOG_LEVEL,
  redact: [
    // Redact Axios config.
    "*.*.config.headers.Authorization",
    "*.config.headers.Authorization",
    "*.*.response.config.headers.Authorization",
    "*.response.config.headers.Authorization",
    // Redact Undici config.
    "headers.authorization",
  ],
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

export function getLoggerArgs(
  connector: ConnectorResource,
  loggerArgs?: Record<string, string | number | null>
) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  const effectiveArgs: Record<string, string | number | null> = {
    workspaceId: dataSourceConfig.workspaceId,
    connectorId: connector.id,
    provider: connector.type,
    dataSourceId: dataSourceConfig.dataSourceId,
    ...loggerArgs,
  };

  try {
    const ctx = Context.current();
    Object.assign(effectiveArgs, {
      activityType: ctx.info.activityType,
      workflowType: ctx.info.workflowType,
      workflowId: ctx.info.workflowExecution.workflowId,
      workflowRunId: ctx.info.workflowExecution.runId,
      activityId: ctx.info.activityId,
    });
  } catch (_e) {
    // Cannot read context, ignore
  }
  return effectiveArgs;
}

export function getActivityLogger(
  connector: ConnectorResource,
  loggerArgs?: Record<string, string | number | null>
) {
  return logger.child(getLoggerArgs(connector, loggerArgs));
}
