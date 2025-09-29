import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  JSONRPCMessage,
  JSONRPCRequest,
} from "@modelcontextprotocol/sdk/types.js";

import type { ClientSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getMCPServersMetadata } from "@app/lib/api/actions/mcp/client_side_registry";
import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";

type ClientSideMCPPayload = JSONRPCMessage | JSONRPCRequest;

// ------------------------------
// Request ID Utilities
// ------------------------------

interface ClientSideMCPRequestId {
  conversationId: string;
  messageId: string;
  originalRequestId: string;
}

/**
 * Generate a unique MCP request ID for a conversation and message
 */
function makeClientSideMCPRequestIdForMessageAndConversation({
  conversationId,
  messageId,
  originalRequestId,
}: ClientSideMCPRequestId): string {
  // Format: mcp_req_{conversationId}_{messageId}_{timestamp}_{originalRequestId}.
  // The timestamp ensures uniqueness even for the same message.
  return `mcp_req_${conversationId}_${messageId}_${Date.now()}_${originalRequestId}`;
}

/**
 * Parse a client-side MCP request ID to extract the conversation ID and message ID
 * @param requestId The request ID to parse
 * @returns An object containing the conversation ID and message ID, or null if the format is invalid
 */
function parseClientSideMCPRequestId(
  requestId: string
): ClientSideMCPRequestId | null {
  // Check if the request ID follows our format.
  const match = requestId.match(/^mcp_req_([^_]+)_([^_]+)_\d+_(\d+)$/);

  if (!match) {
    return null;
  }

  return {
    conversationId: match[1],
    messageId: match[2],
    originalRequestId: match[3],
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
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const userId = auth.getNonNullableUser().sId;

  return `w:${workspaceId}:u:${userId}:mcp:${mcpServerId}`;
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
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      metadata.find((m) => m?.serverId === serverId)?.serverName ||
      `MCP Server ${serverId}`,
    mcpServerName:
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      metadata.find((m) => m?.serverId === serverId)?.serverName || null,
    sId: serverId,
    type: "mcp_server_configuration",
  }));
}

// ------------------------------
// Typeguards
// ------------------------------

type JSONRPCMessageWithId = JSONRPCMessage & { id: string };

function isJSONRPCMessageWithId(
  message: JSONRPCMessage
): message is JSONRPCMessageWithId {
  return (
    "id" in message &&
    (typeof message.id === "number" || typeof message.id === "string")
  );
}

/**
 * Represents a result from an MCP event that has been processed.
 * This type is specifically for events that have completed processing and have a result,
 * as opposed to notifications which are intermediate updates without a final result.
 *
 * A result must have an ID to be tracked and matched with its corresponding request.
 * Additional properties may be present depending on the specific type of result.
 */
interface MCPEventResult {
  id: string;
  [key: string]: unknown;
}

/**
 * Type guard to check if a value is an MCP event result.
 * This helps distinguish between results (which have an ID) and notifications
 * (which are intermediate updates without an ID).
 */
export function isMCPEventResult(value: unknown): value is MCPEventResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as MCPEventResult).id === "string"
  );
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
   * Transforms an original request ID into a unique MCP request ID
   * that includes conversation and message context.
   *
   * This transformation is necessary because:
   * 1. Each MCPClient instance starts with request IDs reset to 0
   * 2. We share one global Redis channel per server connection
   * 3. When multiple actions run on the same server in one loop, we create multiple MCPClient instances
   * 4. Without this transformation, different MCPClient instances would have the same request IDs
   * 5. This could cause responses to be routed to the wrong client
   *
   * By augmenting the ID with conversation and message context, we ensure:
   * - Each request has a unique ID even across different MCPClient instances
   * - Responses are correctly routed back to their originating client
   * - Multiple concurrent actions on the same server can be handled safely
   */
  private transformRequestId(originalId: string | number): string {
    return makeClientSideMCPRequestIdForMessageAndConversation({
      conversationId: this.conversationId,
      messageId: this.messageId,
      originalRequestId: String(originalId),
    });
  }

  /**
   * Restores the original request ID from a transformed MCP request ID
   * and extracts the associated message ID.
   *
   * This is the reverse operation of transformRequestId, used when:
   * 1. Receiving responses from the MCP server
   * 2. We need to extract the original request ID to match with the client's request
   * 3. We need to verify the message ID to ensure the response belongs to this conversation
   */
  private restoreRequestId(
    transformedId: string
  ): { originalId: string; messageId: string } | null {
    const parsed = parseClientSideMCPRequestId(transformedId);
    if (!parsed) {
      return null;
    }

    return {
      originalId: parsed.originalRequestId,
      messageId: parsed.messageId,
    };
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
   *
   * Before sending, we transform the request ID to include conversation and message context.
   * This ensures that even if multiple MCPClient instances are created for the same server
   * (which happens when running multiple actions in one loop), each request will have a
   * unique ID and responses will be correctly routed back to their originating client.
   */
  async send(message: JSONRPCMessage): Promise<void> {
    const channelId = getMCPServerChannelId(this.auth, {
      mcpServerId: this.mcpServerId,
    });

    const payload: ClientSideMCPPayload = { ...message };

    // Transform the request ID to include conversation and message context
    if (isJSONRPCMessageWithId(payload)) {
      const transformedId = this.transformRequestId(payload.id);
      payload.id = transformedId;
    }

    // Publish MCP requests to Redis
    await getRedisHybridManager().publish(
      channelId,
      JSON.stringify(payload),
      "mcp_client_side_request"
    );
  }

  /**
   * Handle events received from Redis
   */
  private handleRedisEvent(event: EventPayload | "close"): void {
    if (event === "close") {
      if (this.onclose) {
        this.onclose();
      }
      return;
    }

    try {
      const payload = JSON.parse(event.message.payload);
      this.lastEventId = event.id;

      // Handle ID transformation for responses
      if (isMCPEventResult(payload.result)) {
        const { id: requestId } = payload.result;
        const restored = this.restoreRequestId(requestId);

        if (restored) {
          payload.result.id = restored.originalId;
          this.handleMCPResponse(payload);
        } else {
          this.handleError("Invalid MCP response format: invalid id");
        }
      } else {
        // Notifications don't have an id, so we just pass the payload as is.
        this.handleMCPResponse(payload);
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
        "Invalid MCP response format: result is not a JSONRPCMessage object"
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
