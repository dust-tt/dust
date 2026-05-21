// biome-ignore-all lint/plugin/noNextImports: Next.js-specific file
import { createServer } from "node:http";
import path from "node:path";
import { parse } from "node:url";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import { getRequestListener } from "@hono/node-server";
import next from "next";
import { honoApp, isHonoRoute } from "./app";

const KEEP_ALIVE_TIMEOUT_MS = 5000;

const dev = isDevelopment();
const port = parseInt(process.env.PORT ?? "3000", 10);
const hostname = process.env.HOSTNAME ?? "localhost";

// Next's project root (where pages/ lives) is the sibling `front` directory.
// npm runs the script from this package's directory, so cwd is front-api/.
const nextProjectDir = path.resolve(process.cwd(), "../front");

const nextApp = next({ dev, hostname, port, dir: nextProjectDir });
const nextHandler = nextApp.getRequestHandler();

const honoListener = getRequestListener(honoApp.fetch);

async function main() {
  await nextApp.prepare();

  const server = createServer((req, res) => {
    if (isHonoRoute(req.method, req.url)) {
      logger.info(`Handling ${req.method} ${req.url} \x1b[32mwith Hono\x1b[0m`);
      void honoListener(req, res);
      return;
    }

    logger.info(
      `Handling ${req.method} ${req.url} \x1b[33mwith Next.js\x1b[0m`
    );
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
