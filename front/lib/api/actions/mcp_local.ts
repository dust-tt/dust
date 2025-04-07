import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

import type { LocalMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";

// ------------------------------
// Request ID Utilities
// ------------------------------

/**
 * Generate a unique MCP request ID for a conversation and message
 */
export function makeLocalMCPRequestIdForMessageAndConversation({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}): string {
  // Format: mcp_req_{conversationId}_{messageId}_{timestamp}.
  // The timestamp ensures uniqueness even for the same message.
  return `mcp_req_${conversationId}_${messageId}_${Date.now()}`;
}

/**
 * Parse a local MCP request ID to extract the conversation ID and message ID
 * @param requestId The request ID to parse
 * @returns An object containing the conversation ID and message ID, or null if the format is invalid
 */
export function parseLocalMCPRequestId(
  requestId: string
): { conversationId: string; messageId: string } | null {
  // Check if the request ID follows our format.
  const match = requestId.match(/^mcp_req_([^_]+)_([^_]+)_\d+$/);

  if (!match) {
    return null;
  }

  return {
    conversationId: match[1],
    messageId: match[2],
  };
}

// ------------------------------
// MCP Server Channel/ID Utilities
// ------------------------------

/**
 * Generate a Redis channel ID for an MCP server
 */
export function getMCPServerChannelId(
  auth: Authenticator,
  { mcpServerId }: { mcpServerId: string }
): string {
  return `w:${auth.getNonNullableWorkspace().sId}:mcp:${mcpServerId}`;
}

/**
 * Generate a Redis channel ID for MCP server results
 */
export function getMCPServerResultsChannelId(
  auth: Authenticator,
  { mcpServerId }: { mcpServerId: string }
): string {
  return `${getMCPServerChannelId(auth, {
    mcpServerId,
  })}:results`;
}

// ------------------------------
// MCP Server Configuration Utils
// ------------------------------

/**
 * Creates MCP server configurations from local MCP server IDs.
 *
 * This function takes an array of local MCP server IDs and converts them
 * into MCP server configuration objects that can be used by the agent.
 *
 * @param localMCPServerIds - Array of local MCP server IDs from user message context
 * @returns Array of LocalMCPServerConfigurationType objects
 */
export function createLocalMCPServerConfigurations(
  localMCPServerIds?: string[]
): LocalMCPServerConfigurationType[] {
  if (!localMCPServerIds || localMCPServerIds.length === 0) {
    return [];
  }

  return localMCPServerIds.map((serverId) => ({
    // TODO:
    id: -2, // Default ID for local MCP servers.
    sId: serverId,
    name: `MCP Server ${serverId}`,
    description: `Use the MCP Server ${serverId} to interact with the local MCP server.`,
    type: "mcp_server_configuration",
  }));
}

// ------------------------------
// Redis Transport Implementation
// ------------------------------

/**
 * Custom Transport implementation for MCP using Redis Pub/Sub
 * This allows communication between the client and local MCP servers
 */
export class RedisMCPTransport implements Transport {
  private unsubscribe?: () => void;
  private lastEventId: string | null = null;

  private readonly conversationId: string;
  private readonly messageId: string;
  private readonly mcpServerId: string;

  // Required by Transport interface
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage: ((message: JSONRPCMessage) => void) | undefined;

  constructor(
    private readonly auth: Authenticator,
    {
      conversationId,
      messageId,
      mcpServerId,
    }: {
      conversationId: string;
      messageId: string;
      mcpServerId: string;
    }
  ) {
    this.conversationId = conversationId;
    this.messageId = messageId;
    this.mcpServerId = mcpServerId;
  }

  /**
   * Start the transport and connect to Redis.
   * This method is required by the Transport interface.
   */
  async start(): Promise<void> {
    const resultsChannelId = getMCPServerResultsChannelId(this.auth, {
      mcpServerId: this.mcpServerId,
    });

    // Subscribe to the response channel.
    const subscription = await getRedisHybridManager().subscribe(
      resultsChannelId,
      this.handleRedisEvent.bind(this),
      this.lastEventId,
      "mcp_local_transport"
    );

    this.unsubscribe = subscription.unsubscribe;
    return Promise.resolve();
  }

  /**
   * Close the transport and clean up resources.
   * This method is required by the Transport interface.
   */
  async close(): Promise<void> {
    // Clean up subscription.
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = undefined;
    }

    return Promise.resolve();
  }

  /**
   * Send a message to the server.
   * This method is required by the Transport interface.
   */
  async send(message: JSONRPCMessage): Promise<void> {
    const channelId = getMCPServerChannelId(this.auth, {
      mcpServerId: this.mcpServerId,
    });

    const requestId = makeLocalMCPRequestIdForMessageAndConversation({
      conversationId: this.conversationId,
      messageId: this.messageId,
    });

    // Publish MCP requests to Redis
    await getRedisHybridManager().publish(
      channelId,
      JSON.stringify({
        requestId,
        request: message,
      }),
      "mcp_local_request"
    );
  }

  /**
   * Handle events received from Redis
   */
  private handleRedisEvent(event: any): void {
    if (event === "close") {
      if (this.onclose) {
        this.onclose();
      }
      return;
    }

    try {
      const payload = JSON.parse(event.message.payload);

      // Store the last event ID to resume from this point if needed.
      this.lastEventId = event.id;

      // Only handle messages for this specific messageId.
      if (payload.messageId === this.messageId) {
        if (payload.type === "mcp_local_results" && this.onmessage) {
          this.handleMCPResponse(payload);
        }
      }
    } catch (error) {
      this.handleError(`Failed to parse MCP response: ${error}`);
    }
  }

  /**
   * Process MCP response data.
   */
  private handleMCPResponse(payload: any): void {
    if (typeof payload.result === "object" && payload.result !== null) {
      this.onmessage?.(payload.result);
    } else {
      this.handleError(
        `Invalid MCP response format: result is not a JSONRPCMessage object`
      );
    }
  }

  /**
   * Handle transport errors.
   */
  private handleError(message: string): void {
    if (this.onerror) {
      this.onerror(new Error(message));
    }
  }
}
