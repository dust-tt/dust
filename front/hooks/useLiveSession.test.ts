import { useLiveSession } from "@app/hooks/useLiveSession";
import { Server } from "@hocuspocus/server";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DOCUMENT_NAME = "w_1:notes.md";
const USER = { id: "u_1", name: "Daph", color: "#0ea5e9" };
// Stable across renders, as the file panel's is: a new one would start a new connection.
const getTicket = async () => "ticket";

// Hocuspocus reads a port of 0 as none and falls back to 80, so the free port goes through the
// configuration. No signal handlers in tests.
const newServer = () =>
  new Server({ quiet: true, port: 0, stopOnSignals: false });

describe("useLiveSession", () => {
  let server: Server;

  beforeEach(async () => {
    server = newServer();
    await server.listen();
  });

  afterEach(async () => {
    await server.destroy();
  });

  function renderSession(tickets: () => Promise<string> = getTicket) {
    return renderHook(() =>
      useLiveSession({
        url: `ws://127.0.0.1:${server.address.port}`,
        documentName: DOCUMENT_NAME,
        getTicket: tickets,
        user: USER,
      })
    );
  }

  it("takes a fresh connection, with a fresh ticket, when the server closes the document", async () => {
    const tickets = vi.fn(async () => "ticket");
    const { result, unmount } = renderSession(tickets);
    await waitFor(() => expect(result.current.status).toBe("live"));
    const first = result.current.connection;

    server.hocuspocus.closeConnections(DOCUMENT_NAME);

    await waitFor(() => expect(result.current.status).toBe("offline"));
    await waitFor(
      () => {
        expect(result.current.status).toBe("live");
        expect(result.current.connection?.id).not.toBe(first?.id);
      },
      { timeout: 3_000 }
    );
    expect(tickets).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("retries when no ticket can be fetched", async () => {
    const tickets = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("Service unavailable."))
      .mockResolvedValue("ticket");
    const { result, unmount } = renderSession(tickets);

    await waitFor(() => expect(result.current.status).toBe("refused"));
    await waitFor(() => expect(result.current.status).toBe("live"), {
      timeout: 3_000,
    });
    unmount();
  });

  it("waits longer between attempts while the server stays down", async () => {
    const { port } = server.address;
    await server.destroy();
    const RealWebSocket = globalThis.WebSocket;
    let opened = 0;
    globalThis.WebSocket = class extends RealWebSocket {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        opened++;
      }
    };
    server = newServer();
    try {
      const { unmount } = renderHook(() =>
        useLiveSession({
          url: `ws://127.0.0.1:${port}`,
          documentName: DOCUMENT_NAME,
          getTicket,
          user: USER,
        })
      );
      await new Promise((resolve) => setTimeout(resolve, 4_500));
      unmount();
    } finally {
      globalThis.WebSocket = RealWebSocket;
    }

    // Attempts at 0, 1 s and 3 s; a fixed delay would make five.
    expect(opened).toBe(3);
  }, 10_000);
});
