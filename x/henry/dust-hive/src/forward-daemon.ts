#!/usr/bin/env bun
// TCP forwarder daemon - forwards port 3000 to a target port
// Usage: bun run forward-daemon.ts <target-port>

import type { Socket } from "bun";

const targetPortArg = process.argv[2];
if (!targetPortArg) {
  console.error("Usage: forward-daemon.ts <target-port>");
  process.exit(1);
}

const targetPort = Number.parseInt(targetPortArg, 10);

if (Number.isNaN(targetPort)) {
  console.error("Usage: forward-daemon.ts <target-port>");
  process.exit(1);
}

const LISTEN_PORT = 3000;
const LISTEN_HOST = "127.0.0.1";
const TARGET_HOST = "127.0.0.1";

interface ConnectionData {
  upstream: Socket<ConnectionData> | null;
  clientClosed: boolean;
}

console.log(`Starting TCP forwarder: ${LISTEN_HOST}:${LISTEN_PORT} → ${TARGET_HOST}:${targetPort}`);

const server = Bun.listen<ConnectionData>({
  hostname: LISTEN_HOST,
  port: LISTEN_PORT,
  socket: {
    open(client) {
      client.data = { upstream: null, clientClosed: false };

      // Connect to upstream
      Bun.connect<ConnectionData>({
        hostname: TARGET_HOST,
        port: targetPort,
        socket: {
          open(upstream) {
            // Link upstream to client
            client.data.upstream = upstream;
            upstream.data = { upstream: client, clientClosed: false };
          },
          data(upstream, data) {
            // Forward data from upstream to client
            const clientSocket = upstream.data.upstream;
            if (clientSocket && !upstream.data.clientClosed) {
              clientSocket.write(data);
            }
          },
          close(upstream) {
            // Upstream closed, close client
            const clientSocket = upstream.data.upstream;
            if (clientSocket && !upstream.data.clientClosed) {
              clientSocket.end();
            }
          },
          error(upstream, error) {
            console.error(`Upstream error: ${error.message}`);
            const clientSocket = upstream.data.upstream;
            if (clientSocket && !upstream.data.clientClosed) {
              clientSocket.end();
            }
          },
          connectError(_upstream, error) {
            console.error(`Failed to connect to upstream: ${error.message}`);
            // Find and close the client that initiated this connection
            // The client.data.upstream will still be null since connection failed
          },
        },
        data: { upstream: null, clientClosed: false },
      }).catch((error) => {
        console.error(`Connection error: ${error.message}`);
        client.end();
      });
    },
    data(client, data) {
      // Forward data from client to upstream
      const upstream = client.data.upstream;
      if (upstream) {
        upstream.write(data);
      }
    },
    close(client) {
      // Client closed, close upstream
      client.data.clientClosed = true;
      const upstream = client.data.upstream;
      if (upstream) {
        upstream.data.clientClosed = true;
        upstream.end();
      }
    },
    error(client, error) {
      console.error(`Client error: ${error.message}`);
      client.data.clientClosed = true;
      const upstream = client.data.upstream;
      if (upstream) {
        upstream.data.clientClosed = true;
        upstream.end();
      }
    },
  },
});

console.log(`Forwarder listening on ${server.hostname}:${server.port}`);

// Handle shutdown signals
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  server.stop();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  server.stop();
  process.exit(0);
});
