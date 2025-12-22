import type { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types";
import { EventSourcePolyfill } from "event-source-polyfill";

import type { DustAPI } from ".";

const logger = console;

const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes.
const RECONNECT_DELAY_MS = 5 * 1000; // 5 seconds.

/**
 * Custom transport implementation for MCP
 * - Uses EventSource (SSE) to receive requests from Dust
 * - Uses fetch (HTTP POST) to send results back to Dust
 * - Supports workspace-scoped MCP registration only
 */
export class DustMcpServerTransport implements Transport {
  private eventSource: EventSourcePolyfill | null = null;
  private lastEventId: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private serverId: string | null = null;

  // Required by Transport interface.
  public onmessage?: (message: JSONRPCMessage) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public sessionId?: string;

  constructor(
    private readonly dustAPI: DustAPI,
    private readonly onServerIdReceived: (serverId: string) => void,
    private readonly serverName: string = "Dust Extension",
    private readonly verbose: boolean = false,
    private readonly eventSourceHeartbeat = 45000
  ) {}

  /**
   * Register the MCP server with the Dust backend
   */
  private async registerServer(): Promise<boolean> {
    const registerRes = await this.dustAPI.registerMCPServer({
      serverName: this.serverName,
    });
    if (registerRes.isErr()) {
      this.logError(`Failed to register MCP server: ${registerRes.error}`);
      return false;
    }

    const { serverId } = registerRes.value;
    this.serverId = serverId;
    // Notify the parent that the serverId has been updated.
    this.onServerIdReceived(serverId);

    // Setup heartbeat to keep the server registration alive.
    this.setupHeartbeat(serverId);

    return true;
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
      const heartbeatRes = await this.dustAPI.heartbeatMCPServer({
        serverId,
      });

      if (heartbeatRes.isErr() || heartbeatRes.value.success === false) {
        const error = heartbeatRes.isErr()
          ? heartbeatRes.error
          : new Error("Server not registered");

        this.logError(`Failed to heartbeat MCP server: ${error}`);
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

      this.logInfo("MCP transport started successfully");
    } catch (error) {
      this.logError("Failed to start MCP transport:", error);
      this.onerror?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Connect to the SSE stream for the workspace
   */
  private async connectToRequestsStream(): Promise<void> {
    if (!this.serverId) {
      this.logError("Server ID is not set");
      return;
    }

    // Close any existing connection.
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    const connectionResult = await this.dustAPI.getMCPRequestsConnectionDetails(
      {
        serverId: this.serverId,
        lastEventId: this.lastEventId,
      }
    );

    if (connectionResult.isErr()) {
      throw new Error(
        `Failed to get connection details: ${connectionResult.error.message}`
      );
    }

    const { url, headers } = connectionResult.value;

    this.eventSource = new EventSourcePolyfill(url, {
      headers,
      heartbeatTimeout: this.eventSourceHeartbeat,
    });

    this.eventSource.onmessage = (event) => {
      try {
        if (event.data === "done") {
          // Ignore this event.
          return;
        }

        const eventData = JSON.parse(event.data);

        // Save the eventId for reconnection purposes.
        if (eventData.eventId) {
          this.lastEventId = eventData.eventId;
        }

        // The actual request is in the data property.
        const { data } = eventData;
        if (!data) {
          this.logError("No data field found in the event");
          return;
        }

        // Forward the message to the handler.
        if (this.onmessage) {
          this.onmessage(data);
        } else {
          this.logError(
            "ERROR: onmessage handler not set - MCP response won't be sent"
          );
        }
      } catch (error) {
        this.logError("Failed to parse MCP request:", error);
        this.onerror?.(new Error(`Failed to parse MCP request: ${error}`));
      }
    };

    this.eventSource.onerror = (error) => {
      // Close the existing connection to prevent automatic reconnects from polyfill.
      // Automatic reconnection in the polyfill creates error logging noise that can't be suppressed.
      this.eventSource?.close();

      this.logError("Error in MCP EventSource connection:", error);
      this.onerror?.(new Error(`SSE connection error: ${error}`));

      // Attempt to reconnect after a delay.
      setTimeout(() => {
        if (this.eventSource) {
          this.logInfo("Attempting to reconnect to SSE...");
          void this.connectToRequestsStream().catch((reconnectError) => {
            this.logError("Failed to reconnect:", reconnectError);
          });
        }
      }, RECONNECT_DELAY_MS); // Wait before reconnecting.
    };

    this.eventSource.onopen = () => {
      this.logInfo("MCP SSE connection established");
    };

    this.eventSource.addEventListener("close", () => {
      this.logInfo("MCP SSE connection closed");
      this.onclose?.();
    });
  }

  /**
   * Send a message to the server
   * This method is required by the Transport interface
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.serverId) {
      this.logError("Server ID is not set");
      return;
    }

    // Send tool results back to Dust via HTTP POST.
    const postResultsRes = await this.dustAPI.postMCPResults({
      serverId: this.serverId,
      result: message,
    });

    if (postResultsRes.isErr()) {
      this.logError("Failed to send MCP result:", postResultsRes.error);
      this.onerror?.(
        new Error(`Failed to send MCP result: ${postResultsRes.error}`)
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
      this.logInfo("Closing MCP SSE connection");
      this.eventSource.close();
      this.eventSource = null;
    }

    // Trigger onclose callback.
    this.onclose?.();
  }

  logError(...args: unknown[]): void {
    if (this.verbose) {
      logger.error(...args);
    }
  }

  logInfo(...args: unknown[]): void {
    if (this.verbose) {
      logger.log(...args);
    }
  }

  /**
   * Get the current server ID
   */
  getServerId(): string | undefined {
    return this.serverId ?? undefined;
  }
}
