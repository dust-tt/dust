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
import { FORWARDER_MAPPINGS } from "./lib/forwarderConfig";

const basePortArg = process.argv[2];
if (!basePortArg) {
  console.error("Usage: forward-daemon.ts <base-port>");
  process.exit(1);
}

const basePort = Number.parseInt(basePortArg, 10);

if (Number.isNaN(basePort) || basePort < 1 || basePort > 65535) {
  console.error("Usage: forward-daemon.ts <base-port>");
  process.exit(1);
}

const LISTEN_HOST = process.env["DUST_HIVE_FORWARD_LISTEN_HOST"] ?? "127.0.0.1";
const TARGET_HOST = "127.0.0.1";
const MAX_PENDING_BYTES = 256 * 1024;
const CONNECT_TIMEOUT_MS = 4000;

interface ConnectionData {
  upstream: Socket<ConnectionData> | null;
  clientClosed: boolean;
  pendingData: Uint8Array[]; // Buffer data until upstream connects
  pendingBytes: number;
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
        client.data = {
          upstream: null,
          clientClosed: false,
          pendingData: [],
          pendingBytes: 0,
        };

        // Connect to upstream
        Bun.connect<ConnectionData>({
          hostname: TARGET_HOST,
          port: targetPort,
          socket: {
            open(upstream) {
              client.data.upstream = upstream;
              upstream.data = {
                upstream: client,
                clientClosed: false,
                pendingData: [],
                pendingBytes: 0,
              };
              // Flush any buffered data
              for (const chunk of client.data.pendingData) {
                upstream.write(chunk);
              }
              client.data.pendingData = [];
              client.data.pendingBytes = 0;
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
              if (!client.data.clientClosed) {
                client.end();
              }
            },
          },
          data: { upstream: null, clientClosed: false, pendingData: [], pendingBytes: 0 },
        }).catch((error) => {
          console.error(`[${name}] Connection error: ${error.message}`);
          client.end();
        });

        setTimeout(() => {
          if (!client.data.upstream && !client.data.clientClosed) {
            console.error(`[${name}] Upstream connection timed out`);
            client.end();
          }
        }, CONNECT_TIMEOUT_MS);
      },
      data(client, data) {
        const upstream = client.data.upstream;
        if (upstream) {
          upstream.write(data);
        } else {
          // Buffer data until upstream connects
          const chunk = new Uint8Array(data);
          client.data.pendingBytes += chunk.byteLength;
          if (client.data.pendingBytes > MAX_PENDING_BYTES) {
            console.error(`[${name}] Pending buffer exceeded ${MAX_PENDING_BYTES} bytes`);
            client.end();
            return;
          }
          client.data.pendingData.push(chunk);
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
const failedPorts: number[] = [];

for (const mapping of FORWARDER_MAPPINGS) {
  const targetPort = basePort + mapping.targetOffset;
  try {
    const server = createForwarder(mapping.listenPort, targetPort, mapping.name);
    servers.push(server);
    console.log(`Listening on ${server.hostname}:${server.port}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Failed to start forwarder on port ${mapping.listenPort}: ${msg}`);
    failedPorts.push(mapping.listenPort);
  }
}

if (failedPorts.length > 0) {
  console.error(`Forwarder failed to bind ports: ${failedPorts.join(", ")}`);
  for (const server of servers) {
    server.stop();
  }
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
