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

function main() {
  const server = createServer((req, res) => {
    void honoListener(req, res);
  });

  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;

  server.on("error", (err) => {
    logger.error({ err }, "Server error");
    process.exit(1);
  });

  server.listen(port, hostname, () => {
    logger.info({ port, hostname, dev }, "Hono-only server listening");
  });
}

main();
