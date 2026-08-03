import { performance } from "node:perf_hooks";

import logger from "@app/logger/logger";

// Emitted as early as possible in the process lifecycle. This module is
// intentionally imported first in server.ts — before the OpenTelemetry
// instrumentation setup and the (heavy) app module graph — and only depends on
// pino, so it runs even when a later boot step hangs or crashes. Startup probe
// failures on front / front-sse otherwise leave no log at all to work from
// (the previous earliest log fired only once the server was already listening).
//
// `performance.now()` is measured from process start, so it captures how long
// Node's own bootstrap plus the dd-trace/init preload took to reach this line.
logger.info(
  { elapsedMs: Math.round(performance.now()) },
  "front-api process starting up"
);
