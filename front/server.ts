import { createServer } from "node:http";
import { parse } from "node:url";
import logger from "@app/logger/logger";
import { getRequestListener } from "@hono/node-server";
import next from "next";
import { honoApp, isHonoRoute } from "../front-api/app";

const KEEP_ALIVE_TIMEOUT_MS = 5000;

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "localhost";

const nextApp = next({ dev, hostname, port });
const nextHandler = nextApp.getRequestHandler();

const honoListener = getRequestListener(honoApp.fetch);

async function main() {
  await nextApp.prepare();

  const server = createServer((req, res) => {
    if (isHonoRoute(req.method, req.url)) {
      void honoListener(req, res);
      return;
    }

    const parsedUrl = parse(req.url ?? "/", true);
    void nextHandler(req, res, parsedUrl);
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
