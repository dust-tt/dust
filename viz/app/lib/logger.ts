import type { LoggerOptions } from "pino";
import pino from "pino";

const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";

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

const logger = pino(defaultPinoOptions);

export default logger;
export type { Logger } from "pino";
