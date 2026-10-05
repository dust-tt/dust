// @vitest-environment node

import { createServer } from "node:http";
import { ManagedEventSourceTransport } from "@app/lib/client/event_source_transport";
import { MANAGED_SSE_HANDSHAKE_EVENT } from "@app/types/sse";
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
    response.write(":connect\n\n");
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
  const handshakeReceived = new Promise<void>((resolve) => {
    source.addEventListener(MANAGED_SSE_HANDSHAKE_EVENT, () => resolve());
  });

  try {
    await handshakeReceived;
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

it("exposes the connect comment as the managed handshake event", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(":con"));
      controller.enqueue(encoder.encode("nect\n\ndata: payload\n\n"));
      controller.close();
    },
  });
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(body, { status: 200 }));
  const progress: string[] = [];

  try {
    await new Promise<void>((resolve, reject) => {
      new ManagedEventSourceTransport().open(
        undefined,
        vi.fn(),
        (chunk) => progress.push(chunk),
        (error) => (error ? reject(error) : resolve()),
        "http://localhost/events",
        false,
        {}
      );
    });
    expect(progress.join("")).toBe(
      `event: ${MANAGED_SSE_HANDSHAKE_EVENT}\ndata: {}\n\ndata: payload\n\n`
    );
  } finally {
    fetch.mockRestore();
  }
});
