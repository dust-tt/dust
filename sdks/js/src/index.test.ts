import type { Socket } from "node:net";
import { createServer } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DustAPI } from "./index";
import type { LoggerInterface } from "./types";

const RETRY_LOG_MESSAGE =
  "DustAPI retrying fetch after connection closed before response";

let closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  const toClose = closers;
  closers = [];
  await Promise.all(toClose.map((close) => close()));
});

// Raw TCP server so each connection can misbehave at the exact protocol stage
// the retry logic discriminates on (before vs after response bytes).
async function listen(
  onConnection: (socket: Socket, connectionIndex: number) => void
): Promise<{
  port: number;
  connectionCount: () => number;
  close: () => Promise<void>;
}> {
  const sockets = new Set<Socket>();
  let connections = 0;
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    const index = connections;
    connections += 1;
    onConnection(socket, index);
  });
  // Destroy straggler sockets first: server.close() alone waits for open
  // connections and would hang the suite.
  const close = () =>
    new Promise<void>((resolve) => {
      for (const socket of sockets) {
        socket.destroy();
      }
      server.close(() => resolve());
    });
  closers.push(close);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected the test server to be bound to a TCP port");
  }
  return {
    port: address.port,
    connectionCount: () => connections,
    close,
  };
}

// Reads the full request (headers + content-length body) then serves a JSON 200.
function respondWithJson(socket: Socket, payload: unknown) {
  let buffered = "";
  socket.on("data", (chunk) => {
    buffered += chunk.toString();
    const headerEnd = buffered.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      return;
    }
    const contentLengthMatch = buffered
      .slice(0, headerEnd)
      .match(/content-length: (\d+)/i);
    const contentLength = contentLengthMatch
      ? parseInt(contentLengthMatch[1], 10)
      : 0;
    if (buffered.length < headerEnd + 4 + contentLength) {
      return;
    }
    const body = JSON.stringify(payload);
    socket.end(
      `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`
    );
  });
}

function makeLogger(): LoggerInterface {
  return {
    error: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
  };
}

function makeAPI(port: number, logger: LoggerInterface) {
  return new DustAPI(
    { url: `http://127.0.0.1:${port}` },
    { apiKey: "test-api-key", workspaceId: "test-workspace" },
    logger
  );
}

describe("DustAPI fetch retry on connection closed before response", () => {
  it("retries once and succeeds when the server closes the connection before responding", async () => {
    const server = await listen((socket, index) => {
      if (index === 0) {
        // Incident shape: the server FINs the connection upon receiving the
        // request, before writing any response bytes (stale keep-alive close).
        socket.once("data", () => socket.end());
      } else {
        respondWithJson(socket, { tokens: [] });
      }
    });
    const logger = makeLogger();

    const res = await makeAPI(server.port, logger).tokenize("hello", "ds-1");

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value).toEqual([]);
    }
    expect(server.connectionCount()).toBe(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ method: "POST" }),
      RETRY_LOG_MESSAGE
    );
  });

  it("does not retry when the caller aborted the request", async () => {
    const server = await listen((socket) =>
      respondWithJson(socket, { tokens: [] })
    );
    const logger = makeLogger();
    const controller = new AbortController();
    controller.abort();

    const res = await makeAPI(server.port, logger).tokenize("hello", "ds-1", {
      signal: controller.signal,
    });

    expect(res.isErr()).toBe(true);
    expect(server.connectionCount()).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not retry when the connection is refused", async () => {
    // Bind a port then release it so the subsequent connect is refused.
    const server = await listen(() => {});
    const { port } = server;
    await server.close();
    const logger = makeLogger();

    const res = await makeAPI(port, logger).tokenize("hello", "ds-1");

    expect(res.isErr()).toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not retry when the connection dies after the response started", async () => {
    const server = await listen((socket) => {
      socket.once("data", () => {
        // Advertise a 100-byte body but cut the connection mid-body: the
        // failure surfaces from the body read, not fetch(), and must NOT be
        // retried (the server may have processed the request).
        socket.write(
          'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"tokens":',
          () => socket.destroy()
        );
      });
    });
    const logger = makeLogger();

    const res = await makeAPI(server.port, logger).tokenize("hello", "ds-1");

    expect(res.isErr()).toBe(true);
    expect(server.connectionCount()).toBe(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
