// @vitest-environment node

import { createServer } from "node:http";
import { ManagedEventSourceTransport } from "@app/lib/client/event_source_transport";
import { EventSourcePolyfill } from "event-source-polyfill";
import { expect, it, vi } from "vitest";

it("settles reader cancellation without finishing an aborted stream", async () => {
  const body = new ReadableStream<Uint8Array>({
    cancel: () => Promise.reject(new Error("Cancellation failed.")),
  });
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(body, { status: 200 }));
  const onFinish = vi.fn();
  let onStart!: () => void;
  const started = new Promise<void>((resolve) => {
    onStart = resolve;
  });

  try {
    const connection = new ManagedEventSourceTransport().open(
      undefined,
      onStart,
      vi.fn(),
      onFinish,
      "http://localhost/events",
      false,
      {}
    );
    await started;
    connection.abort();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(onFinish).not.toHaveBeenCalled();
  } finally {
    fetch.mockRestore();
  }
});

it("closes a failed SSE fetch without an unhandled cancellation rejection", async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write("event: dust-handshake\ndata: {}\n\n");
    setTimeout(() => response.destroy(), 20);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Expected a TCP server address.");
  }
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  const source = new EventSourcePolyfill(
    `http://127.0.0.1:${address.port}/events`,
    { Transport: ManagedEventSourceTransport }
  );

  try {
    await new Promise<void>((resolve) => {
      source.onerror = () => {
        source.close();
        resolve();
      };
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(source.readyState).toBe(EventSourcePolyfill.CLOSED);
  } finally {
    source.close();
    consoleError.mockRestore();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
