import { clientEventSource, clientFetch } from "@app/lib/egress/client";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { EventSourcePolyfill } from "event-source-polyfill";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes.
const RECONNECT_DELAY_MS = 5_000; // 5 seconds.

/**
 * Browser-specific MCP transport implementation.
 * Uses private API with session authentication (credentials: 'include').
 *
 * - Uses native EventSource for SSE (receives requests from Dust)
 * - Uses fetch with credentials for HTTP POST (sends results back to Dust)
 */
export class BrowserMCPTransport implements Transport {
  private eventSource: EventSourcePolyfill | null = null;
  private lastEventId: string | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private serverId: string | null = null;
  private isClosing = false;

  // Set to true when we receive the "done" event from the server, indicating a normal stream close
  // (timeout) rather than an actual error.
  private isServerClosing = false;

  // Required by Transport interface.
  public onmessage?: (message: JSONRPCMessage) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public sessionId?: string;

  private readonly handleBeforeUnload = () => {
    this.isClosing = true;
    // Use sendBeacon for reliable delivery during page unload — fetch is not
    // guaranteed to complete when the document is being torn down.
    if (this.serverId) {
      navigator.sendBeacon(
        `/api/w/${this.workspaceId}/mcp/deregister`,
        new Blob([JSON.stringify({ serverId: this.serverId })], {
          type: "application/json",
        })
      );
    }
  };

  constructor(
    private readonly workspaceId: string,
    private readonly serverName: string,
    private readonly onServerIdReceived: (serverId: string) => void
  ) {
    window.addEventListener("beforeunload", this.handleBeforeUnload);
  }

  private async deregisterServer(serverId: string): Promise<void> {
    try {
      const response = await clientFetch(
        `/api/w/${this.workspaceId}/mcp/deregister`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ serverId }),
        }
      );
      if (!response.ok) {
        console.warn(
          "[BrowserMCPTransport] Failed to deregister MCP server:",
          response.status
        );
      }
    } catch (error) {
      console.warn(
        "[BrowserMCPTransport] Failed to deregister MCP server:",
        error
      );
    }
  }

  /**
   * Register the MCP server.
   */
  private async registerServer(): Promise<boolean> {
    try {
      // If we already hold a registration (e.g. re-registering after a failed
      // heartbeat), release it first. serverIds are random and never recycled,
      // so the new registration always gets a fresh id — deregistering here just
      // frees the old id's Redis key immediately instead of waiting for its TTL
      // to expire, and detaches us from the old request channel before we
      // subscribe to the new one.
      if (this.serverId) {
        const previousServerId = this.serverId;
        this.serverId = null;
        await this.deregisterServer(previousServerId);
      }

      const response = await clientFetch(
        `/api/w/${this.workspaceId}/mcp/register`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ serverName: this.serverName }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error(
          "[BrowserMCPTransport] Failed to register MCP server:",
          errorData
        );
        return false;
      }

      const data = (await response.json()) as {
        serverId: string;
        expiresAt: string;
      };
      this.serverId = data.serverId;

      // Notify the parent that the serverId has been updated.
      this.onServerIdReceived(data.serverId);

      // Setup heartbeat to keep the server registration alive.
      this.setupHeartbeat(data.serverId);

      // If an SSE stream was already opened (re-registration after a lost
      // registration), it is still attached to the previous serverId's channel
      // and would keep receiving requests that no longer
      // belong to this transport. Reconnect to the new serverId's channel. The
      // lastEventId belongs to the old channel's stream, so drop it.
      if (this.eventSource) {
        this.lastEventId = null;
        await this.connectToRequestsStream();
      }

      return true;
    } catch (error) {
      console.error(
        "[BrowserMCPTransport] Failed to register MCP server:",
        error
      );
      return false;
    }
  }

  /**
   * Send a single heartbeat for the given serverId.
   * Returns true if the registration is still alive, false if it is gone or
   * the request failed.
   */
  private async sendHeartbeat(serverId: string): Promise<boolean> {
    try {
      const response = await clientFetch(
        `/api/w/${this.workspaceId}/mcp/heartbeat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ serverId }),
        }
      );

      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as { success: boolean };
      return data.success;
    } catch (error) {
      console.error(
        "[BrowserMCPTransport] Failed to heartbeat MCP server:",
        error
      );
      return false;
    }
  }

  /**
   * Send periodic heartbeats to keep the server registration alive.
   */
  private setupHeartbeat(serverId: string): void {
    // Clear any existing heartbeat timer.
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Set up a new heartbeat timer (every HEARTBEAT_INTERVAL_MS).
    this.heartbeatTimer = setInterval(async () => {
      if (this.isClosing) {
        return;
      }

      const alive = await this.sendHeartbeat(serverId);
      if (!alive && !this.isClosing) {
        console.error(
          "[BrowserMCPTransport] Server not registered, re-registering"
        );
        await this.registerServer();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Start the transport and connect to the SSE endpoint.
   * This method is required by the Transport interface.
   */
  async start(): Promise<void> {
    try {
      // First, register the server (or ensure it's registered).
      const registered = await this.registerServer();
      if (!registered) {
        throw new Error("Failed to register MCP server");
      }

      // Connect to the workspace-scoped requests endpoint.
      await this.connectToRequestsStream();

      console.log("[BrowserMCPTransport] MCP transport started successfully");
    } catch (error) {
      console.error(
        "[BrowserMCPTransport] Failed to start MCP transport:",
        error
      );
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Connect to the SSE stream for the workspace.
   */
  private async connectToRequestsStream(): Promise<void> {
    if (!this.serverId) {
      console.error("[BrowserMCPTransport] Server ID is not set");
      return;
    }

    if (this.isClosing) {
      return;
    }

    // Close any existing connection.
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    // Build relative URL with query parameters.
    const params = new URLSearchParams();
    params.set("serverId", this.serverId);
    if (this.lastEventId) {
      params.set("lastEventId", this.lastEventId);
    }

    this.eventSource = await clientEventSource(
      `/api/sse/w/${this.workspaceId}/mcp/requests?${params.toString()}`,
      // The MCP SSE connection is idle most of the time (waiting for requests
      // from Dust). Disable the polyfill's heartbeat timeout so it doesn't
      // treat silence as a dead connection (default is 45s).
      { heartbeatTimeout: HEARTBEAT_INTERVAL_MS * 2 }
    );

    this.eventSource.onmessage = (event) => {
      try {
        if (event.data === "done") {
          // Server is closing the stream normally (timeout). Flag it so the onerror handler can
          // reconnect immediately without treating it as a real error.
          this.isServerClosing = true;

          return;
        }

        const eventData = JSON.parse(event.data) as {
          eventId?: string;
          data?: JSONRPCMessage;
        };

        // Save the eventId for reconnection purposes.
        if (eventData.eventId) {
          this.lastEventId = eventData.eventId;
        }

        // The actual request is in the data property.
        const { data } = eventData;
        if (!data) {
          console.error(
            "[BrowserMCPTransport] No data field found in the event"
          );
          return;
        }

        // Forward the message to the handler.
        if (this.onmessage) {
          this.onmessage(data);
        } else {
          console.error(
            "[BrowserMCPTransport] onmessage handler not set - MCP response won't be sent"
          );
        }
      } catch (error) {
        console.error(
          "[BrowserMCPTransport] Failed to parse MCP request:",
          error
        );
        this.onerror?.(new Error(`Failed to parse MCP request: ${error}`));
      }
    };

    this.eventSource.onerror = () => {
      if (this.isClosing) {
        return;
      }

      // Close the existing connection to prevent automatic reconnects.
      this.eventSource?.close();

      const isNormalClose = this.isServerClosing;
      this.isServerClosing = false;

      if (isNormalClose) {
        // Server closed the stream after its idle timeout. This is expected.
        // Reconnect immediately, no error to propagate.
        void this.connectToRequestsStream().catch((reconnectError) => {
          console.error(
            "[BrowserMCPTransport] Failed to reconnect:",
            reconnectError
          );
        });
      } else {
        // Actual connection error. Propagate and recover after a delay.
        console.error(
          "[BrowserMCPTransport] Error in MCP EventSource connection"
        );
        this.onerror?.(new Error("SSE connection error"));

        this.scheduleStreamRecovery();
      }
    };

    this.eventSource.onopen = () => {
      console.log("[BrowserMCPTransport] MCP SSE connection established");
    };
  }

  private scheduleStreamRecovery(): void {
    setTimeout(() => {
      void this.recoverStream();
    }, RECONNECT_DELAY_MS);
  }

  /**
   * Recover from an SSE stream error.
   *
   * The error may be caused by an expired registration (e.g. the tab was
   * frozen or the machine slept past the registration TTL), in which case
   * reconnecting with the current serverId would keep failing. Verify the
   * registration first: if it is still alive, reconnect the stream; otherwise
   * re-register. If recovery fails entirely (e.g. network down), retry after a
   * delay.
   */
  private async recoverStream(): Promise<void> {
    if (this.isClosing) {
      return;
    }

    try {
      // serverId can be null if a previous re-registration attempt failed
      // mid-way; in that case skip the liveness check and re-register.
      const alive = this.serverId
        ? await this.sendHeartbeat(this.serverId)
        : false;
      if (this.isClosing) {
        return;
      }

      if (alive) {
        await this.connectToRequestsStream();
        return;
      }

      const registered = await this.registerServer();
      if (!registered) {
        this.scheduleStreamRecovery();
      }
    } catch (error) {
      console.error(
        "[BrowserMCPTransport] Failed to recover MCP SSE connection:",
        error
      );
      this.scheduleStreamRecovery();
    }
  }

  /**
   * Send a message to the server.
   * This method is required by the Transport interface.
   */
  private async postResult(body: string): Promise<Response> {
    return clientFetch(`/api/w/${this.workspaceId}/mcp/results`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body,
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.serverId) {
      console.error("[BrowserMCPTransport] Server ID is not set");
      return;
    }

    try {
      const body = JSON.stringify({
        serverId: this.serverId,
        result: message,
      });

      const response = await this.postResult(body);

      if (!response.ok) {
        let errorData: unknown;
        try {
          const text = await response.text();
          try {
            errorData = JSON.parse(text);
          } catch {
            errorData = text;
          }
        } catch {
          errorData = `HTTP ${response.status}`;
        }
        console.error(
          "[BrowserMCPTransport] Failed to send MCP result:",
          errorData
        );

        // If the payload was too large and this was a response (has an id),
        // re-send as an error response so the server doesn't hang.
        if (response.status === 413 && "id" in message && message.id) {
          console.warn(
            "[BrowserMCPTransport] Payload too large, sending error response instead"
          );
          const errorBody = JSON.stringify({
            serverId: this.serverId,
            result: {
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32000,
                message:
                  "Tool result too large to send. Try capturing fewer screenshots or smaller content.",
              },
            },
          });
          const errorResponse = await this.postResult(errorBody);
          if (!errorResponse.ok) {
            console.error(
              "[BrowserMCPTransport] Failed to send error response"
            );
          }
          return;
        }

        this.onerror?.(
          new Error(`Failed to send MCP result: ${response.status}`)
        );
      }
    } catch (error) {
      console.error("[BrowserMCPTransport] Failed to send MCP result:", error);
      this.onerror?.(new Error(`Failed to send MCP result: ${error}`));
    }
  }

  /**
   * Close the transport and disconnect from the SSE endpoint.
   * This method is required by the Transport interface.
   */
  async close(): Promise<void> {
    this.isClosing = true;

    window.removeEventListener("beforeunload", this.handleBeforeUnload);

    // Clear heartbeat timer.
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close SSE connection.
    if (this.eventSource) {
      console.log("[BrowserMCPTransport] Closing MCP SSE connection");
      this.eventSource.close();
      this.eventSource = null;
    }

    // Deregister the server to clean up Redis.
    if (this.serverId) {
      await this.deregisterServer(this.serverId);
      this.serverId = null;
    }

    // Trigger onclose callback.
    this.onclose?.();
  }

  /**
   * Get the current server ID.
   */
  getServerId(): string | undefined {
    return this.serverId ?? undefined;
  }
}
