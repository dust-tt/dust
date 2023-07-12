import pino, { LoggerOptions } from "pino";

const NODE_ENV = process.env.NODE_ENV;
const defaultPinoOptions: LoggerOptions = {
  serializers: {
    err: pino.stdSerializers.err,
    error: (error) => {
      if (error instanceof Error) {
        return pino.stdSerializers.err(error);
      }
      return error;
    },
  },
  formatters: {
    level(level) {
      return { level };
    },
  },
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
