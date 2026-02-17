import { clientFetch, getApiBaseUrl } from "@app/lib/egress/client";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes.
const RECONNECT_DELAY_MS = 5_000; // 5 seconds.

/**
 * Browser-specific MCP transport implementation.
 * Uses private API with session authentication (credentials: 'include').
 *
 * - Uses native EventSource for SSE (receives requests from Dust)
 * - Uses fetch with credentials for HTTP POST (sends results back to Dust)
 */
export class BrowserMCPTransport implements Transport {
  private eventSource: EventSource | null = null;
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

  constructor(
    private readonly workspaceId: string,
    private readonly serverName: string,
    private readonly onServerIdReceived: (serverId: string) => void
  ) {}

  /**
   * Register the MCP server.
   */
  private async registerServer(): Promise<boolean> {
    try {
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
          console.error("[BrowserMCPTransport] Failed to heartbeat MCP server");
          await this.registerServer();
          return;
        }

        const data = (await response.json()) as { success: boolean };
        if (!data.success) {
          console.error(
            "[BrowserMCPTransport] Server not registered, re-registering"
          );
          await this.registerServer();
        }
      } catch (error) {
        console.error(
          "[BrowserMCPTransport] Failed to heartbeat MCP server:",
          error
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

    // Build URL with query parameters.
    const base = getApiBaseUrl() || window.location.origin;
    const url = new URL(`/api/w/${this.workspaceId}/mcp/requests`, base);
    url.searchParams.set("serverId", this.serverId);
    if (this.lastEventId) {
      url.searchParams.set("lastEventId", this.lastEventId);
    }

    // Create native EventSource (uses session cookies automatically).
    this.eventSource = new EventSource(url.toString(), {
      withCredentials: true,
    });

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
        // Actual connection error. Propagate and reconnect after a delay.
        console.error(
          "[BrowserMCPTransport] Error in MCP EventSource connection"
        );
        this.onerror?.(new Error("SSE connection error"));

        setTimeout(() => {
          if (!this.isClosing && this.serverId) {
            void this.connectToRequestsStream().catch((reconnectError) => {
              console.error(
                "[BrowserMCPTransport] Failed to reconnect:",
                reconnectError
              );
            });
          }
        }, RECONNECT_DELAY_MS);
      }
    };

    this.eventSource.onopen = () => {
      console.log("[BrowserMCPTransport] MCP SSE connection established");
    };
  }

  /**
   * Send a message to the server.
   * This method is required by the Transport interface.
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.serverId) {
      console.error("[BrowserMCPTransport] Server ID is not set");
      return;
    }

    try {
      // Send tool results back to Dust via HTTP POST.
      const response = await clientFetch(
        `/api/w/${this.workspaceId}/mcp/results`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            serverId: this.serverId,
            result: message,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error(
          "[BrowserMCPTransport] Failed to send MCP result:",
          errorData
        );
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
