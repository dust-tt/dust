import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

import type { ClientSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getMCPServersMetadata } from "@app/lib/api/actions/mcp/client_side_registry";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";

// ------------------------------
// Request ID Utilities
// ------------------------------

/**
 * Generate a unique MCP request ID for a conversation and message
 */
export function makeClientSideMCPRequestIdForMessageAndConversation({
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
 * Parse a client-side MCP request ID to extract the conversation ID and message ID
 * @param requestId The request ID to parse
 * @returns An object containing the conversation ID and message ID, or null if the format is invalid
 */
export function parseClientSideMCPRequestId(
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
 * Creates MCP server configurations from client-side MCP server IDs.
 *
 * This function takes an array of client-side MCP server IDs and converts them
 * into MCP server configuration objects that can be used by the agent.
 *
 * @param clientSideMCPServerIds - Array of client-side MCP server IDs from user message context
 * @returns Array of ClientSideMCPServerConfigurationType objects
 */
export async function createClientSideMCPServerConfigurations(
  auth: Authenticator,
  clientSideMCPServerIds?: string[]
): Promise<ClientSideMCPServerConfigurationType[]> {
  if (!clientSideMCPServerIds || clientSideMCPServerIds.length === 0) {
    return [];
  }

  const metadata = await getMCPServersMetadata(auth, {
    serverIds: clientSideMCPServerIds,
  });

  return clientSideMCPServerIds.map((serverId) => ({
    description: `Use the MCP Server ${serverId} to interact with the client-side MCP server.`,
    id: -1, // Default ID for client-side MCP servers.
    clientSideMcpServerId: serverId,
    name:
      metadata.find((m) => m?.serverId === serverId)?.serverName ||
      `MCP Server ${serverId}`,
    sId: serverId,
    type: "mcp_server_configuration",
  }));
}

// ------------------------------
// Redis Transport Implementation
// ------------------------------

/**
 * Custom Transport implementation for MCP using Redis Pub/Sub
 * This allows communication between the client and client-side MCP servers
 */
export class ClientSideRedisMCPTransport implements Transport {
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
      "mcp_client_side_transport"
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

    const requestId = makeClientSideMCPRequestIdForMessageAndConversation({
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
      "mcp_client_side_request"
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
        if (payload.type === "mcp_client_side_results" && this.onmessage) {
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
