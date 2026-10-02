import { BrowserMCPTransport } from "@app/lib/client/BrowserMCPTransport";
import { eventSourceManager } from "@app/lib/client/event_source_manager";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { clientFetch, clientEventSource } = vi.hoisted(() => ({
  clientFetch: vi.fn(),
  clientEventSource: vi.fn(),
}));
vi.mock("@app/lib/egress/client", () => ({ clientFetch, clientEventSource }));
vi.mock("@app/logger/datadogLogger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

beforeEach(() => {
  clientFetch.mockReset();
  clientEventSource.mockReset();
});
afterEach(() => {
  eventSourceManager.releaseWorkspace("w_mcp");
});

describe("browser MCP stream lifecycle", () => {
  it("uses managed polling, delivers requests, and aborts on close", async () => {
    let pollSignal: AbortSignal | undefined;
    let polls = 0;
    clientFetch.mockImplementation(
      async (url: string, options: RequestInit) => {
        if (url.includes("/register")) {
          return Response.json({ serverId: "srv_test" });
        }
        if (url.includes("transport=poll")) {
          pollSignal = options.signal ?? undefined;
          if (polls++ === 0) {
            return Response.json({
              events: [
                JSON.stringify({
                  eventId: "1-0",
                  data: { jsonrpc: "2.0", id: "request", method: "tools/list" },
                }),
              ],
            });
          }
          return new Promise<Response>(() => undefined);
        }
        return Response.json({ success: true });
      }
    );
    const transport = new BrowserMCPTransport(
      "w_mcp",
      "test",
      vi.fn(),
      "immediate"
    );
    const onmessage = vi.fn();
    const onclose = vi.fn();
    transport.onmessage = onmessage;
    transport.onclose = onclose;
    await transport.start();
    await vi.waitFor(() =>
      expect(onmessage).toHaveBeenCalledWith({
        jsonrpc: "2.0",
        id: "request",
        method: "tools/list",
      })
    );
    await vi.waitFor(() => expect(polls).toBe(2));
    expect(clientEventSource).not.toHaveBeenCalled();
    expect(
      clientFetch.mock.calls.filter(([url]) =>
        url.includes("transport=poll")
      )[1][0]
    ).toContain("lastEventId=1-0");
    await Promise.all([transport.close(), transport.close()]);
    expect(onclose).toHaveBeenCalledTimes(1);
    expect(
      clientFetch.mock.calls.filter(([url]) => url.includes("/deregister"))
    ).toHaveLength(1);
    expect(pollSignal?.aborted).toBe(true);
    expect(
      eventSourceManager.getConnectionState("mcp-w_mcp-srv_test").kind
    ).toBe("idle");
  });

  it("deregisters a late registration without opening a stream after close", async () => {
    const pending = Promise.withResolvers<Response>();
    clientFetch.mockImplementation((url: string) =>
      url.includes("/register")
        ? pending.promise
        : Promise.resolve(Response.json({ success: true }))
    );
    const onRegistered = vi.fn();
    const transport = new BrowserMCPTransport(
      "w_mcp",
      "test",
      onRegistered,
      "immediate"
    );
    const started = transport.start().catch((error: unknown) => error);
    await transport.close();
    pending.resolve(Response.json({ serverId: "srv_late" }));
    await started;
    expect(onRegistered).not.toHaveBeenCalled();
    expect(clientEventSource).not.toHaveBeenCalled();
    expect(clientFetch.mock.calls.map(([url]) => url)).toEqual([
      "/api/w/w_mcp/mcp/register",
      "/api/w/w_mcp/mcp/deregister",
    ]);
  });
  it("does not start a heartbeat when registration synchronously closes the transport", async () => {
    vi.useFakeTimers();
    clientFetch.mockImplementation(async (url: string) =>
      Response.json(
        url.includes("/register")
          ? { serverId: "srv_closed" }
          : { success: true }
      )
    );
    let closed: Promise<void> | undefined;
    const transport = new BrowserMCPTransport(
      "w_mcp",
      "test",
      () => {
        closed = transport.close();
      },
      "immediate"
    );
    try {
      await expect(transport.start()).rejects.toThrow(
        "Failed to register MCP server"
      );
      await closed;
      expect(vi.getTimerCount()).toBe(0);
      expect(clientFetch.mock.calls.map(([url]) => url)).toEqual([
        "/api/w/w_mcp/mcp/register",
        "/api/w/w_mcp/mcp/deregister",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
