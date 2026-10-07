import { useLiveSession } from "@app/hooks/useLiveSession";
import { Server } from "@hocuspocus/server";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const DOCUMENT_NAME = "w_1:notes.md";

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

  function renderSession() {
    return renderHook(() =>
      useLiveSession({
        url: `ws://127.0.0.1:${server.address.port}`,
        documentName: DOCUMENT_NAME,
        token: "u_1",
        user: { name: "Daph", color: "#0ea5e9" },
      })
    );
  }

  it("takes a fresh connection when the server closes the document", async () => {
    const { result, unmount } = renderSession();
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
          token: "u_1",
          user: { name: "Daph", color: "#0ea5e9" },
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
