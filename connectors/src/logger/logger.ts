import { Context } from "@temporalio/activity";
import axios from "axios";
import type { LoggerOptions } from "pino";
import pino from "pino";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ConnectorModel } from "@connectors/resources/storage/models/connector_model";

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

const logger = pino(pinoOptions);

export default logger;
export type { Logger } from "pino";

export const getActivityLogger = (
  connector: ConnectorResource | ConnectorModel,
  loggerArgs?: Record<string, string | number | null>
) => {
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
      activityName: ctx.info.activityType,
      workflowName: ctx.info.workflowType,
      workflowId: ctx.info.workflowExecution.workflowId,
      workflowRunId: ctx.info.workflowExecution.runId,
      activityId: ctx.info.activityId,
    });
  } catch (e) {
    // Cannot read context, ignore
  }

  return logger.child(effectiveArgs);
};
