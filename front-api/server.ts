// Imported first: installs the boot profiler's module hook before anything
// else loads, then logs a "sign of life" before instrumentation and the app
// module graph, so startup probe failures leave a trace in the logs.
import { getBootProfile } from "./lib/boot-profile";
import "./lib/startup-log";
import "./lib/tracer-config";
import "./lib/instrumentation-config";

import { Server } from "node:http";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import { setupGlobalErrorHandler } from "@app/types/shared/utils/global_error_handler";
import { serve } from "@hono/node-server";
import { honoApp } from "./app";

const KEEP_ALIVE_TIMEOUT_MS = 5000;

setupGlobalErrorHandler(logger);

const dev = isDevelopment();
const port = parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "localhost";

// The app module graph is fully imported by this point; log before binding the
// socket so a hang between here and "listening" isolates the bind step.
logger.info({ port, hostname, dev }, "front-api starting HTTP server");

const server = serve({ fetch: honoApp.fetch, port, hostname }, () => {
  // performance.nodeTiming is measured from process start, so we can split
  // total boot into Node's own bootstrap vs our app code (bundle parse +
  // module-level init + serve()). `boot` adds what that time was spent on:
  // `offCpuMs` is waiting rather than computing, which on a streamed image
  // layer is the cost of fetching every module file the boot touches.
  const profile = getBootProfile();
  logger.info(
    {
      port,
      hostname,
      dev,
      bootMs: {
        nodeBootstrap: profile.nodeBootstrapMs,
        appBoot: profile.wallMs - profile.nodeBootstrapMs,
        total: profile.wallMs,
      },
      boot: profile,
    },
    "front-api server listening"
  );
});

// `serve()` returns Server | Http2Server | Http2SecureServer; we pass no
// http2/https options so the runtime type is the plain http.Server.
if (server instanceof Server) {
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
}

server.on("error", (err) => {
  logger.error({ err }, "Server error");
  process.exit(1);
});
