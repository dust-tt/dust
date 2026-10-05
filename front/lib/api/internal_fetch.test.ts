import { internalFetch } from "@app/lib/api/internal_fetch";
// @vitest-environment node
import http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";

// vite.setup.ts replaces `internalFetch` with a mock; this file tests the real one.
vi.unmock("@app/lib/api/internal_fetch");

// Destroys the first `failFirst` connections, then serves `statusCode`.
function startServer({
  failFirst,
  statusCode = 200,
}: {
  failFirst: number;
  statusCode?: number;
}) {
  let connections = 0;
  let requests = 0;
  const server = http.createServer((_req, res) => {
    requests++;
    res.statusCode = statusCode;
    res.end("ok");
  });
  server.on("connection", (socket) => {
    connections++;
    if (connections <= failFirst) {
      socket.destroy();
    }
  });
  return new Promise<{
    url: string;
    close: () => void;
    counts: () => { connections: number; requests: number };
  }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected a TCP address");
      }
      const { port } = address;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        close: () => {
          server.closeAllConnections();
          server.close();
        },
        counts: () => ({ connections, requests }),
      });
    });
  });
}

describe("internalFetch", () => {
  const closers: Array<() => void> = [];
  afterEach(() => {
    for (const close of closers.splice(0)) {
      close();
    }
  });

  it("retries a GET whose connection is reset", async () => {
    const server = await startServer({ failFirst: 2 });
    closers.push(server.close);

    const res = await internalFetch(server.url);

    expect(res.status).toBe(200);
    expect(server.counts()).toEqual({ connections: 3, requests: 1 });
  });

  it("does not retry a POST", async () => {
    const server = await startServer({ failFirst: 1 });
    closers.push(server.close);

    await expect(
      internalFetch(server.url, { method: "POST", body: "{}" })
    ).rejects.toThrow("fetch failed");
    expect(server.counts()).toEqual({ connections: 1, requests: 0 });
  });

  it("does not retry on an HTTP error status", async () => {
    const server = await startServer({ failFirst: 0, statusCode: 500 });
    closers.push(server.close);

    const res = await internalFetch(server.url);

    expect(res.status).toBe(500);
    expect(server.counts().requests).toBe(1);
  });
});
