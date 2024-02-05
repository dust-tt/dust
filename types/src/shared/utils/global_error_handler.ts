import { LoggerInterface } from "../logger";

let once = false;

export function setupGlobalErrorHandler(logger: LoggerInterface) {
  if (once) {
    logger.info({}, "Global error handler already setup");
    return;
  }
  once = true;
  process.on("unhandledRejection", (reason, promise) => {
    if (
      (
        reason as {
          __dust_skip_global_error_handler?: boolean;
        }
      ).__dust_skip_global_error_handler
    ) {
      return;
    }
    logger.error({ promise, reason, panic: true }, "Unhandled Rejection");
  });

  process.on("uncaughtException", (error) => {
    logger.error({ error, panic: true }, "Uncaught Exception");
  });
}

// This is meant for cases when we don't await a promise right away, but will
// await it later. If we don't wrap the promise in this function and it rejects
// before the await the global error handler will catch the error and log it even
// though it will also be handled by the caller.
export function awaitLaterWrapper<T, A extends unknown[]>(
  fn: (...args: A) => Promise<T>
): (...args: A) => Promise<T> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw skipGlobalErrorHandler(error);
    }
  };
}

type SkipGlobalErrorHandlerException<T> = T & {
  __dust_skip_global_error_handler: true;
};

function skipGlobalErrorHandler<T>(
  error: T
): SkipGlobalErrorHandlerException<T> {
  return { ...error, __dust_skip_global_error_handler: true };
}
