import { useLiveSession } from "@app/hooks/useLiveSession";
import type { DfmComment } from "@app/lib/markdown/dfm";
import type { Configuration } from "@hocuspocus/server";
import { Server } from "@hocuspocus/server";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DOCUMENT_NAME = "w_1:notes.md";
const USER = { id: "u_1", name: "Daph", color: "#0ea5e9" };
// Stable across renders, as the file panel's is: a new one would start a new connection.
const getTicket = async () => "ticket";

// Hocuspocus reads a port of 0 as none and falls back to 80, so the free port goes through the
// configuration. No signal handlers in tests.
const newServer = (configuration: Partial<Configuration> = {}) =>
  new Server({ quiet: true, port: 0, stopOnSignals: false, ...configuration });

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

  it("reports local changes as syncing until the server has them", async () => {
    await server.destroy();
    let hold = false;
    let release = () => undefined as unknown;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    server = newServer({
      beforeHandleMessage: async () => {
        if (hold) {
          await held;
        }
      },
    });
    await server.listen();
    const { result, unmount } = renderSession();
    await waitFor(() => expect(result.current.status).toBe("live"));
    expect(result.current.syncing).toBe(false);

    hold = true;
    act(() => {
      result.current.connection?.document.getText("body").insert(0, "Hi");
    });

    await waitFor(() => expect(result.current.syncing).toBe(true));
    release();
    await waitFor(() => expect(result.current.syncing).toBe(false));
    unmount();
  });

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

  it("starts a fresh connection from the threads the old one last received", async () => {
    const threads: DfmComment[] = [
      {
        id: "c1",
        status: "open",
        messages: [
          {
            author: { kind: "user", id: "usr_daph", name: "Daph" },
            createdAt: "2026-01-01T00:00:00.000Z",
            body: "Why Friday?",
          },
        ],
      },
    ];
    await server.destroy();
    let asked = 0;
    // Answers the first connection only: the fresh one never hears from the server.
    server = newServer({
      async onStateless({ connection }) {
        if (asked++ === 0) {
          connection.sendStateless(
            JSON.stringify({ type: "threads", comments: threads })
          );
        }
      },
    });
    await server.listen();
    const { result, unmount } = renderSession();
    await waitFor(() =>
      expect(result.current.connection?.comments.getThreads()).toEqual(threads)
    );
    const first = result.current.connection;

    server.hocuspocus.closeConnections(DOCUMENT_NAME);

    // Closed as soon as the connection is lost, before a fresh one replaces it: a closed channel
    // reports no threads.
    await waitFor(() => expect(result.current.status).toBe("offline"));
    expect(result.current.connection).toBe(first);
    expect(first?.comments.getThreads()).toBeNull();
    await waitFor(
      () => expect(result.current.connection?.id).not.toBe(first?.id),
      { timeout: 3_000 }
    );
    await waitFor(() => expect(asked).toBe(2));
    const second = result.current.connection;
    expect(second?.comments.getThreads()).toEqual(threads);

    unmount();
    expect(second?.comments.getThreads()).toBeNull();
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
