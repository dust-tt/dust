import type { Server } from "node:http";
import { createServer } from "node:http";

export const WORKER_HEALTH_PORT = 3001;

export function createWorkerHealthServer(): Server {
  return createServer((request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("ok");
      return;
    }

    response.writeHead(404);
    response.end();
  });
}
