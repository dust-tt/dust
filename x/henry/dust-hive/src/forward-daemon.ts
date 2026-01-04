#!/usr/bin/env bun
// TCP forwarder daemon - forwards standard local dev ports to dust-hive env ports
// Usage: bun run forward-daemon.ts <base-port>
//
// Port mappings (standard → env):
//   3000 → base + 0 (front)
//   3001 → base + 1 (core)
//   3002 → base + 2 (connectors)
//   3006 → base + 6 (oauth)

import type { Socket } from "bun";

const basePortArg = process.argv[2];
if (!basePortArg) {
  console.error("Usage: forward-daemon.ts <base-port>");
  process.exit(1);
}

const basePort = Number.parseInt(basePortArg, 10);

if (Number.isNaN(basePort)) {
  console.error("Usage: forward-daemon.ts <base-port>");
  process.exit(1);
}

// Use 0.0.0.0 to accept connections from both IPv4 and mapped IPv6
const LISTEN_HOST = "0.0.0.0";
const TARGET_HOST = "127.0.0.1";

// Port mappings: [listenPort, targetOffset]
const PORT_MAPPINGS: Array<[number, number, string]> = [
  [3000, 0, "front"],
  [3001, 1, "core"],
  [3002, 2, "connectors"],
  [3006, 6, "oauth"],
];

interface ConnectionData {
  upstream: Socket<ConnectionData> | null;
  clientClosed: boolean;
  pendingData: Uint8Array[]; // Buffer data until upstream connects
}

function createForwarder(listenPort: number, targetPort: number, name: string) {
  console.log(
    `Starting forwarder: ${LISTEN_HOST}:${listenPort} → ${TARGET_HOST}:${targetPort} (${name})`
  );

  return Bun.listen<ConnectionData>({
    hostname: LISTEN_HOST,
    port: listenPort,
    socket: {
      open(client) {
        client.data = { upstream: null, clientClosed: false, pendingData: [] };

        // Connect to upstream
        Bun.connect<ConnectionData>({
          hostname: TARGET_HOST,
          port: targetPort,
          socket: {
            open(upstream) {
              client.data.upstream = upstream;
              upstream.data = { upstream: client, clientClosed: false, pendingData: [] };
              // Flush any buffered data
              for (const chunk of client.data.pendingData) {
                upstream.write(chunk);
              }
              client.data.pendingData = [];
            },
            data(upstream, data) {
              const clientSocket = upstream.data.upstream;
              if (clientSocket && !upstream.data.clientClosed) {
                clientSocket.write(data);
              }
            },
            close(upstream) {
              const clientSocket = upstream.data.upstream;
              if (clientSocket && !upstream.data.clientClosed) {
                clientSocket.end();
              }
            },
            error(upstream, error) {
              console.error(`[${name}] Upstream error: ${error.message}`);
              const clientSocket = upstream.data.upstream;
              if (clientSocket && !upstream.data.clientClosed) {
                clientSocket.end();
              }
            },
            connectError(_upstream, error) {
              console.error(`[${name}] Failed to connect to upstream: ${error.message}`);
            },
          },
          data: { upstream: null, clientClosed: false, pendingData: [] },
        }).catch((error) => {
          console.error(`[${name}] Connection error: ${error.message}`);
          client.end();
        });
      },
      data(client, data) {
        const upstream = client.data.upstream;
        if (upstream) {
          upstream.write(data);
        } else {
          // Buffer data until upstream connects
          client.data.pendingData.push(new Uint8Array(data));
        }
      },
      close(client) {
        client.data.clientClosed = true;
        const upstream = client.data.upstream;
        if (upstream) {
          upstream.data.clientClosed = true;
          upstream.end();
        }
      },
      error(client, error) {
        console.error(`[${name}] Client error: ${error.message}`);
        client.data.clientClosed = true;
        const upstream = client.data.upstream;
        if (upstream) {
          upstream.data.clientClosed = true;
          upstream.end();
        }
      },
    },
  });
}

// Start all forwarders
interface ServerHandle {
  hostname: string;
  port: number;
  stop(): void;
}
const servers: ServerHandle[] = [];

for (const [listenPort, offset, name] of PORT_MAPPINGS) {
  const targetPort = basePort + offset;
  try {
    const server = createForwarder(listenPort, targetPort, name);
    servers.push(server);
    console.log(`Listening on ${server.hostname}:${server.port}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to start forwarder on port ${listenPort}: ${msg}`);
    // Continue with other ports - some might work
  }
}

if (servers.length === 0) {
  console.error("No forwarders started, exiting");
  process.exit(1);
}

console.log(`Forwarder daemon started with ${servers.length} port mappings`);

// Handle shutdown signals
const shutdown = () => {
  console.log("Shutting down...");
  for (const server of servers) {
    server.stop();
  }
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
