import { LoggerInterface } from "../logger";

let once = false;

export function setupGlobalErrorHandler(logger: LoggerInterface) {
  if (once) {
    logger.info({}, "Global error handler already setup");
    return;
  }
  once = true;
  process.on("unhandledRejection", (reason, promise) => {
    logger.error({ promise, reason, panic: true }, "Unhandled Rejection");
  });

  process.on("uncaughtException", (error) => {
    logger.error({ error, panic: true }, "Uncaught Exception");
  });
}
