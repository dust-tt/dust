import { eventSourceManager } from "@app/lib/client/event_source_manager";
import { clientFetch } from "@app/lib/egress/client";
import datadogLogger from "@app/logger/datadogLogger";
import type { LongPollActivation } from "@app/types/event_source";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { JSONRPCMessageSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1_000;
const RECONNECT_DELAY_MS = 5_000;
const RegistrationResponseSchema = z.object({ serverId: z.string() });
const HeartbeatResponseSchema = z.object({ success: z.boolean() });
const RequestEventSchema = z.object({
  eventId: z.string(),
  data: z.unknown(),
});

/**
 * @cc [owner:id13,label:concurrency;architecture] browser-mcp-managed-lifecycle
 * Each browser MCP registration MUST use one managed stream with polling fallback. Closing during
 * registration MUST deregister a late result without opening a stream. Recovery MUST preserve the
 * cursor within a registration and reset it when the registration changes. Closing from the registration
 * callback MUST NOT leave heartbeat timers running.
 */
export class BrowserMCPTransport implements Transport {
  private unsubscribeStream: (() => void) | null = null;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private registrationPromise: Promise<boolean> | null = null;
  private recoveryPromise: Promise<void> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private serverId: string | null = null;
  private lastEventId: string | null = null;
  private isClosing = false;
  private closePromise: Promise<void> | null = null;

  public onmessage?: (message: JSONRPCMessage) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public sessionId?: string;

  private readonly handleBeforeUnload = () => {
    this.isClosing = true;

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
    private readonly onServerIdReceived: (serverId: string) => void,
    private readonly longPollActivation: LongPollActivation = "fallback"
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
        datadogLogger.warn(
          { error: response.status },
          "[BrowserMCPTransport] Failed to deregister MCP server:"
        );
      }
    } catch (error) {
      datadogLogger.warn(
        { err: normalizeError(error) },
        "[BrowserMCPTransport] Failed to deregister MCP server:"
      );
    }
  }

  private registerServer(): Promise<boolean> {
    this.registrationPromise ??= this.performRegistration().finally(() => {
      this.registrationPromise = null;
    });
    return this.registrationPromise;
  }

  private async performRegistration(): Promise<boolean> {
    try {
      if (this.isClosing) {
        return false;
      }
      this.unsubscribeStream?.();
      this.unsubscribeStream = null;
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
        datadogLogger.error(
          { error: errorData },
          "[BrowserMCPTransport] Failed to register MCP server:"
        );
        return false;
      }

      const data = RegistrationResponseSchema.parse(await response.json());
      if (this.isClosing) {
        await this.deregisterServer(data.serverId);
        return false;
      }
      this.serverId = data.serverId;
      this.lastEventId = null;

      this.onServerIdReceived(data.serverId);
      if (this.isClosing) {
        return false;
      }

      this.setupHeartbeat(data.serverId);

      this.connectToRequestsStream();

      return true;
    } catch (error) {
      datadogLogger.error(
        { err: normalizeError(error) },
        "[BrowserMCPTransport] Failed to register MCP server:"
      );
      return false;
    }
  }

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

      const data = HeartbeatResponseSchema.parse(await response.json());
      return data.success;
    } catch (error) {
      datadogLogger.error(
        { err: normalizeError(error) },
        "[BrowserMCPTransport] Failed to heartbeat MCP server:"
      );
      return false;
    }
  }

  private setupHeartbeat(serverId: string): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(async () => {
      if (this.isClosing) {
        return;
      }

      const alive = await this.sendHeartbeat(serverId);
      if (!alive && !this.isClosing) {
        datadogLogger.error(
          "[BrowserMCPTransport] Server not registered, re-registering"
        );
        await this.recoverStream();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  async start(): Promise<void> {
    const registered = await this.registerServer();
    if (!registered) {
      const error = new Error("Failed to register MCP server");
      this.onerror?.(error);
      throw error;
    }
  }

  private connectToRequestsStream(): void {
    if (!this.serverId) {
      datadogLogger.error("[BrowserMCPTransport] Server ID is not set");
      return;
    }

    if (this.isClosing) {
      return;
    }

    this.unsubscribeStream?.();
    const serverId = this.serverId;
    const streamId = `mcp-${this.workspaceId}-${serverId}`;
    const buildURL = (transport: "sse" | "poll") => {
      const params = new URLSearchParams({ serverId, transport });
      if (this.lastEventId) {
        params.set("lastEventId", this.lastEventId);
      }
      return `/api/sse/w/${this.workspaceId}/mcp/requests?${params.toString()}`;
    };
    this.unsubscribeStream = eventSourceManager.subscribe({
      streamId,
      config: {
        workspaceId: this.workspaceId,
        buildURL: () => buildURL("sse"),
        buildLongPollURL: () => buildURL("poll"),
        longPollActivation: this.longPollActivation,
        restartKey: streamId,
        replayBufferedEventsOnSubscribe: false,
        telemetryContext: { sseKind: "browser_mcp", serverId },
      },
      subscriber: {
        onEvent: (event) => {
          if (this.isClosing || this.serverId !== serverId) {
            return;
          }
          try {
            const eventData = RequestEventSchema.parse(JSON.parse(event));
            this.lastEventId = eventData.eventId;
            this.onmessage?.(JSONRPCMessageSchema.parse(eventData.data));
          } catch (error) {
            this.onerror?.(normalizeError(error));
          }
        },
        onStateChange: () => undefined,
        onTerminalError: (error) => {
          this.scheduleStreamRecovery();
          this.onerror?.(error);
        },
      },
      keepAliveWithoutSubscribers: false,
    });
  }

  private scheduleStreamRecovery(): void {
    if (this.isClosing || this.recoveryTimer) {
      return;
    }
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      void this.recoverStream();
    }, RECONNECT_DELAY_MS);
  }

  private recoverStream(): Promise<void> {
    this.recoveryPromise ??= this.performRecovery().finally(() => {
      this.recoveryPromise = null;
    });
    return this.recoveryPromise;
  }

  private async performRecovery(): Promise<void> {
    if (this.isClosing) {
      return;
    }

    try {
      const alive = this.serverId
        ? await this.sendHeartbeat(this.serverId)
        : false;
      if (this.isClosing) {
        return;
      }

      if (alive) {
        this.connectToRequestsStream();
        return;
      }

      const registered = await this.registerServer();
      if (!registered) {
        this.scheduleStreamRecovery();
      }
    } catch (error) {
      datadogLogger.error(
        { err: normalizeError(error) },
        "[BrowserMCPTransport] Failed to recover MCP SSE connection:"
      );
      this.scheduleStreamRecovery();
    }
  }

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
      datadogLogger.error("[BrowserMCPTransport] Server ID is not set");
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
        datadogLogger.error(
          { error: errorData },
          "[BrowserMCPTransport] Failed to send MCP result:"
        );

        if (response.status === 413 && "id" in message && message.id) {
          datadogLogger.warn(
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
            datadogLogger.error(
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
      datadogLogger.error(
        { err: normalizeError(error) },
        "[BrowserMCPTransport] Failed to send MCP result:"
      );
      this.onerror?.(new Error(`Failed to send MCP result: ${error}`));
    }
  }

  close(): Promise<void> {
    this.closePromise ??= this.performClose();
    return this.closePromise;
  }

  private async performClose(): Promise<void> {
    this.isClosing = true;

    window.removeEventListener("beforeunload", this.handleBeforeUnload);

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
    this.unsubscribeStream?.();
    this.unsubscribeStream = null;

    if (this.serverId) {
      const serverId = this.serverId;
      this.serverId = null;
      await this.deregisterServer(serverId);
    }

    this.onclose?.();
  }

  getServerId(): string | undefined {
    return this.serverId ?? undefined;
  }
}
