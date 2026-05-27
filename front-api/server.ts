import "./lib/tracer-config";

import { Server } from "node:http";
import { performance } from "node:perf_hooks";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import { serve } from "@hono/node-server";
import { honoApp } from "./app";

const KEEP_ALIVE_TIMEOUT_MS = 5000;

const dev = isDevelopment();
const port = parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "localhost";

const server = serve({ fetch: honoApp.fetch, port, hostname }, () => {
  // performance.nodeTiming is measured from process start, so we can split
  // total boot into Node's own bootstrap vs our app code (bundle parse +
  // module-level init + serve()).
  const totalMs = performance.now();
  const nodeBootstrapMs = performance.nodeTiming.bootstrapComplete;
  logger.info(
    {
      port,
      hostname,
      dev,
      bootMs: {
        nodeBootstrap: Math.round(nodeBootstrapMs),
        appBoot: Math.round(totalMs - nodeBootstrapMs),
        total: Math.round(totalMs),
      },
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
