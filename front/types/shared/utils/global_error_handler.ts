import { v4 as uuidv4 } from "uuid";

import type { LoggerInterface } from "../logger";

const TEENY_REQUEST_STREAM_PIPE_ERROR_CODE = "ERR_STREAM_UNABLE_TO_PIPE";
const TEENY_REQUEST_STREAM_PIPE_ERROR_MESSAGE =
  "Cannot pipe to a closed or destroyed stream";
const TEENY_REQUEST_STACK_FRAME = "node_modules/teeny-request/";

type ErrorWithCode = Error & { code?: string };

let once = false;

export function isTeenyRequestUnableToPipeError(
  reason: unknown
): reason is ErrorWithCode {
  if (!(reason instanceof Error)) {
    return false;
  }
  if (!("code" in reason)) {
    return false;
  }

  return (
    reason.code === TEENY_REQUEST_STREAM_PIPE_ERROR_CODE &&
    reason.message === TEENY_REQUEST_STREAM_PIPE_ERROR_MESSAGE &&
    typeof reason.stack === "string" &&
    reason.stack.includes(TEENY_REQUEST_STACK_FRAME)
  );
}

export function setupGlobalErrorHandler(logger: LoggerInterface) {
  if (once) {
    logger.info({}, "Global error handler already setup");
    return;
  }
  once = true;
  process.on("unhandledRejection", (reason, promise) => {
    if (isTeenyRequestUnableToPipeError(reason)) {
      promise.catch(() => undefined);
      logger.warn(
        { error: reason, panic: false },
        "Ignoring teeny-request stream pipe rejection"
      );
      return;
    }

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
    logger.error({ error, panic: true }, "Uncaught Exception");
  });
}
