import type { LightWorkspaceType } from "@dust-tt/client";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

const logger = console;

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes.
const RECONNECT_DELAY_MS = 5 * 1000; // 5 seconds.

/**
 * Custom transport implementation for MCP
 * - Uses EventSource (SSE) to receive requests from Dust
 * - Uses fetch (HTTP POST) to send results back to Dust
 * - Supports workspace-scoped MCP registration only
 */
export class CoEditionTransport implements Transport {
  private eventSource: EventSource | null = null;
  private requestIdMap = new Map<number, string>();
  private lastEventId: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  // Required by Transport interface.
  public onmessage?: (message: any) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public sessionId?: string;

  constructor(
    private readonly owner: LightWorkspaceType,
    private readonly serverId: string = this.generateUUID()
  ) {}

  /**
   * Generate a UUID v4 for use as a server ID
   */
  private generateUUID(): string {
    // Simple UUID v4 generation.
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0,
          v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );
  }

  /**
   * Register the MCP server with the Dust backend
   */
  private async registerServer(): Promise<boolean> {
    const response = await fetch(`/api/w/${this.owner.sId}/mcp/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        serverId: this.serverId,
      }),
    });

    if (!response.ok) {
      logger.error(`Failed to register MCP server: ${response.statusText}`);
      return false;
    }

    // Setup heartbeat to keep the server registration alive.
    this.setupHeartbeat();

    return true;
  }

  /**
   * Send periodic heartbeats to keep the server registration alive.
   */
  private setupHeartbeat(): void {
    // Clear any existing heartbeat timer.
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    // Set up a new heartbeat timer (every HEARTBEAT_INTERVAL_MS).
    this.heartbeatTimer = setInterval(async () => {
      const response = await fetch(`/api/w/${this.owner.sId}/mcp/heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serverId: this.serverId,
        }),
      });

      if (!response.ok) {
        logger.error(`Failed to heartbeat MCP server: ${response.statusText}`);
        await this.registerServer();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Start the transport and connect to the SSE endpoint
   * This method is required by the Transport interface
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

      logger.log("MCP transport started successfully");
    } catch (error) {
      logger.error("Failed to start MCP transport:", error);
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Connect to the SSE stream for the workspace
   */
  private async connectToRequestsStream(): Promise<void> {
    // Close any existing connection
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    const params = new URLSearchParams();
    params.set("serverId", this.serverId);
    params.set("lastEventId", this.lastEventId || "");

    this.eventSource = new EventSource(
      `/api/w/${this.owner.sId}/mcp/requests?${params.toString()}`
    );

    this.eventSource.onmessage = (event) => {
      try {
        const eventData = JSON.parse(event.data);

        // Save the eventId for reconnection purposes
        if (eventData.eventId) {
          this.lastEventId = eventData.eventId;
        }

        // The actual request is in the data property.
        const { request, requestId } = eventData.data;
        if (!request) {
          logger.error("No data field found in the event");
          return;
        }

        // Store the requestId mapped to the request id.
        if (typeof request.id === "number" && requestId) {
          this.requestIdMap.set(request.id, requestId);
        }

        // Forward the message to the handler.
        if (this.onmessage) {
          this.onmessage(request);
        } else {
          logger.error(
            "ERROR: onmessage handler not set - MCP response won't be sent"
          );
        }
      } catch (error) {
        logger.error("Failed to parse MCP request:", error);
        this.onerror?.(new Error(`Failed to parse MCP request: ${error}`));
      }
    };

    this.eventSource.onerror = (error) => {
      logger.error("Error in MCP EventSource connection:", error);
      this.onerror?.(new Error(`SSE connection error: ${error}`));

      // Attempt to reconnect after a delay.
      setTimeout(() => {
        if (this.eventSource) {
          logger.log("Attempting to reconnect to SSE...");
          void this.connectToRequestsStream().catch((reconnectError) => {
            logger.error("Failed to reconnect:", reconnectError);
          });
        }
      }, RECONNECT_DELAY_MS); // Wait before reconnecting.
    };

    this.eventSource.onopen = () => {
      logger.log("MCP SSE connection established");
    };

    this.eventSource.addEventListener("close", () => {
      logger.log("MCP SSE connection closed");
      this.onclose?.();
    });
  }

  /**
   * Send a message to the server
   * This method is required by the Transport interface
   */
  async send(message: any): Promise<void> {
    // Get the requestId using the message.id.
    const requestId = this.requestIdMap.get(message.id);
    if (!requestId) {
      logger.error(`No requestId found for message ID: ${message.id}`);
      this.onerror?.(
        new Error(`Missing requestId for message ID: ${message.id}`)
      );
      return;
    }

    // Clean up the map entry.
    if (typeof message.id === "number") {
      this.requestIdMap.delete(message.id);
    }

    // Send tool results back to Dust via HTTP POST.
    const params = new URLSearchParams();
    params.set("serverId", this.serverId);

    const response = await fetch(
      `/api/w/${this.owner.sId}/mcp/results?${params.toString()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId,
          result: message,
        }),
      }
    );

    if (!response.ok) {
      logger.error("Failed to send MCP result:", response.statusText);
      this.onerror?.(
        new Error(`Failed to send MCP result: ${response.statusText}`)
      );
    }
  }

  /**
   * Close the transport and disconnect from the SSE endpoint
   * This method is required by the Transport interface
   */
  async close(): Promise<void> {
    // Clear heartbeat timer.
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close SSE connection.
    if (this.eventSource) {
      logger.log("Closing MCP SSE connection");
      this.eventSource.close();
      this.eventSource = null;
    }

    // Trigger onclose callback.
    this.onclose?.();
  }

  /**
   * Get the current server ID
   */
  getServerId(): string {
    return this.serverId;
  }
}
