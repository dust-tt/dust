// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import "./lib/tracer-config";

import { createServer } from "node:http";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import { getRequestListener } from "@hono/node-server";
import { honoApp } from "./app";

const KEEP_ALIVE_TIMEOUT_MS = 5000;

const dev = isDevelopment();
const port = parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "localhost";

const honoListener = getRequestListener(honoApp.fetch);

async function main() {
  const server = createServer((req, res) => {
    logger.info(`Handling ${req.method} ${req.url} with Hono`);
    void honoListener(req, res);
  });

  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;

  server.on("error", (err) => {
    logger.error({ err }, "Server error");
    process.exit(1);
  });

  server.listen(port, hostname, () => {
    logger.info(
      { port, hostname, dev },
      "Custom server listening (Hono strangler enabled)"
    );
  });
}

void main().catch((err) => {
  logger.error({ err }, "Failed to start custom server");
  process.exit(1);
});
