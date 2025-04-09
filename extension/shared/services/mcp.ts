import type { DustAPI } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Abstract base class for MCP services
 */
export abstract class McpService {
  /**
   * Create and connect to a server for a workspace
   * Primary method for workspace-scoped MCP implementation
   */
  abstract getOrCreateServer(
    dustAPI: DustAPI
  ): Promise<{ server: McpServer | null; serverId: string | undefined }>;

  /**
   * Connect the MCP server to a transport
   * This should be called after creating the server
   */
  abstract connectServer(server: McpServer, dustAPI: DustAPI): Promise<void>;

  /**
   * Get the current server ID
   * This is useful for including in message payloads
   */
  abstract getServerId(): string | undefined;

  /**
   * Disconnect and clean up the current server connection
   */
  abstract disconnect(): Promise<void>;
}
