import type { LoggerInterface } from "@dust-tt/client";
import { v4 as uuidv4 } from "uuid";

let once = false;

export function setupGlobalErrorHandler(logger: LoggerInterface) {
  if (once) {
    logger.info({}, "Global error handler already setup");
    return;
  }
  once = true;
  process.on("unhandledRejection", (reason, promise) => {
    // uuid here serves as a correlation id for the console.error and the logger.error.
    const uuid = uuidv4();
    // console.log here is important because the promise.catch() below could fail.
    console.error("unhandledRejection", promise, reason, uuid);

    promise.catch((error) => {
      // We'll get the call stack from error only if the promise was rejected with an error object.
      // Example: new Promise((_, reject) => reject(new Error("Some error")))
      logger.error({ error, panic: true, uuid, reason }, "Unhandled Rejection");
    });
  });

  process.on("uncaughtException", (error) => {
    if (
      error instanceof Error &&
      (error.message.includes("terminated") ||
        error.message.includes("ECONNRESET"))
    ) {
      logger.warn({ error }, "Undici connection cleanup error (ignored)");
      return;
    }

    logger.error(
      { error, message: error.message, panic: true },
      "Uncaught Exception"
    );
  });
}
