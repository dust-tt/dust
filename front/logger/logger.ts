import pino, { LoggerOptions } from "pino";

const NODE_ENV = process.env.NODE_ENV;
const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const defaultPinoOptions: LoggerOptions = {
  serializers: {
    error: pino.stdSerializers.err,
  },
  formatters: {
    level(level) {
      return { level };
    },
  },
  level: LOG_LEVEL,
};

const devOptions = {
  transport: {
    target: "pino-pretty",
    options: {
      errorLikeObjectKeys: ["err", "error", "error_stack", "stack"],
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
