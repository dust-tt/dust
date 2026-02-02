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
const MAX_PENDING_BYTES = 16 * 1024 * 1024; // 16MB max buffer
const CONNECT_TIMEOUT_MS = 4000;

interface ConnectionData {
  peer: Socket<ConnectionData> | null;
  closed: boolean;
  peerClosed: boolean; // Peer has closed, close this socket after drain
  writeQueue: Uint8Array[]; // Data waiting to be written (backpressure)
  writeQueueBytes: number;
}

// Write data to socket with backpressure handling
function writeToSocket(socket: Socket<ConnectionData>, data: Uint8Array | Buffer): boolean {
  // If already closed, drop the data
  if (socket.data.closed) {
    return false;
  }

  // If there's already queued data, add to queue
  if (socket.data.writeQueueBytes > 0) {
    const chunk = new Uint8Array(data);
    socket.data.writeQueue.push(chunk);
    socket.data.writeQueueBytes += chunk.byteLength;
    return socket.data.writeQueueBytes < MAX_PENDING_BYTES;
  }

  // Try to write directly
  const written = socket.write(data);

  if (written === data.byteLength) {
    // All data written
    return true;
  }

  if (written === 0) {
    // Backpressure - queue all data
    const chunk = new Uint8Array(data);
    socket.data.writeQueue.push(chunk);
    socket.data.writeQueueBytes += chunk.byteLength;
  } else if (written > 0 && written < data.byteLength) {
    // Partial write - queue remaining data
    const remaining = new Uint8Array(data.slice(written));
    socket.data.writeQueue.push(remaining);
    socket.data.writeQueueBytes += remaining.byteLength;
  }

  return socket.data.writeQueueBytes < MAX_PENDING_BYTES;
}

// Flush queued data on drain
function flushQueue(socket: Socket<ConnectionData>): void {
  while (socket.data.writeQueue.length > 0 && !socket.data.closed) {
    const chunk = socket.data.writeQueue[0];
    if (!chunk) break;

    const written = socket.write(chunk);

    if (written === 0) {
      // Still backpressure, wait for next drain
      return;
    }

    if (written === chunk.byteLength) {
      // Chunk fully written
      socket.data.writeQueue.shift();
      socket.data.writeQueueBytes -= chunk.byteLength;
    } else if (written > 0) {
      // Partial write - update the chunk in place
      socket.data.writeQueue[0] = chunk.slice(written);
      socket.data.writeQueueBytes -= written;
      return; // Wait for next drain
    }
  }

  // Queue is empty - check if we should close
  if (socket.data.peerClosed && !socket.data.closed) {
    socket.end();
  }
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
          peer: null,
          closed: false,
          peerClosed: false,
          writeQueue: [],
          writeQueueBytes: 0,
        };

        // Set up connection timeout - cleared on success or failure
        const timeoutId = setTimeout(() => {
          if (!client.data.closed) {
            console.error(`[${name}] Upstream connection timed out`);
            client.end();
          }
        }, CONNECT_TIMEOUT_MS);

        // Connect to upstream
        Bun.connect<ConnectionData>({
          hostname: TARGET_HOST,
          port: targetPort,
          socket: {
            open(upstream) {
              clearTimeout(timeoutId);
              // Link sockets together
              client.data.peer = upstream;
              upstream.data = {
                peer: client,
                closed: false,
                peerClosed: false,
                writeQueue: [],
                writeQueueBytes: 0,
              };
              // Flush any data buffered before upstream connected
              for (const chunk of client.data.writeQueue) {
                writeToSocket(upstream, chunk);
              }
              client.data.writeQueue = [];
              client.data.writeQueueBytes = 0;
            },
            data(upstream, data) {
              const client = upstream.data.peer;
              if (client && !client.data.closed) {
                const ok = writeToSocket(client, data);
                if (!ok) {
                  console.error(`[${name}] Client write buffer exceeded max`);
                  client.end();
                }
              }
            },
            drain(upstream) {
              flushQueue(upstream);
            },
            close(upstream) {
              const client = upstream.data.peer;
              if (client && !client.data.closed) {
                client.data.peerClosed = true;
                if (client.data.writeQueueBytes === 0) {
                  // No pending data, close immediately
                  client.end();
                }
                // Otherwise, drain will close after queue is empty
              }
            },
            error(upstream, error) {
              console.error(`[${name}] Upstream error: ${error.message}`);
              const client = upstream.data.peer;
              if (client && !client.data.closed) {
                client.end();
              }
            },
            connectError(_upstream, error) {
              clearTimeout(timeoutId);
              console.error(`[${name}] Failed to connect to upstream: ${error.message}`);
              if (!client.data.closed) {
                client.end();
              }
            },
          },
          data: {
            peer: null,
            closed: false,
            peerClosed: false,
            writeQueue: [],
            writeQueueBytes: 0,
          },
        }).catch((error) => {
          clearTimeout(timeoutId);
          console.error(`[${name}] Connection error: ${error.message}`);
          if (!client.data.closed) {
            client.end();
          }
        });
      },
      data(client, data) {
        const upstream = client.data.peer;
        if (upstream && !upstream.data.closed) {
          const ok = writeToSocket(upstream, data);
          if (!ok) {
            console.error(`[${name}] Upstream write buffer exceeded max`);
            upstream.end();
          }
        } else if (!upstream) {
          // Buffer data until upstream connects
          const chunk = new Uint8Array(data);
          client.data.writeQueue.push(chunk);
          client.data.writeQueueBytes += chunk.byteLength;
          if (client.data.writeQueueBytes > MAX_PENDING_BYTES) {
            console.error(`[${name}] Pre-connect buffer exceeded max`);
            client.end();
          }
        }
      },
      drain(client) {
        flushQueue(client);
      },
      close(client) {
        client.data.closed = true;
        const upstream = client.data.peer;
        if (upstream && !upstream.data.closed) {
          upstream.data.peerClosed = true;
          if (upstream.data.writeQueueBytes === 0) {
            upstream.end();
          }
        }
      },
      error(client, error) {
        console.error(`[${name}] Client error: ${error.message}`);
        client.data.closed = true;
        const upstream = client.data.peer;
        if (upstream && !upstream.data.closed) {
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
