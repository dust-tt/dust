import pino from "pino";

const NODE_ENV = process.env.NODE_ENV;

const pinoOtions =
  NODE_ENV === "development"
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            errorLikeObjectKeys: ["err", "error", "error_stack", "stack"],
          },
        },
      }
    : {};
const logger = pino(pinoOtions);

export default logger;
export type { Logger } from "pino";
