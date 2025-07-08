import type { DustAPI } from "@dust-tt/client";
import { DustMcpServerTransport } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpService } from "./mcpService.js";

/**
 * Filesystem MCP service implementation
 * Provides file system tools through MCP protocol
 */
export class FileSystemMcpService extends McpService {
  private server: McpServer | null = null;
  private transport: DustMcpServerTransport | null = null;
  private serverId: string | undefined = undefined;

  /**
   * Create an MCP server for filesystem operations
   */
  createServerForWorkspace(): McpServer | null {
    try {
      const server = new McpServer({
        name: "fs-cli",
        version: process.env.npm_package_version || "0.1.0",
      });

      // TODO: Register filesystem tools with the server
      // registerFileSystemTools(server);

      this.server = server;
      return server;
    } catch (error) {
      console.error("Error creating filesystem MCP server:", error);
      return null;
    }
  }

  /**
   * Connect the MCP server to a transport
   */
  async connectServer(
    server: McpServer,
    dustAPI: DustAPI,
    onServerIdReceived: (serverId: string) => void
  ): Promise<void> {
    if (!server) {
      throw new Error("Cannot connect null server");
    }

    try {
      // If we already have a transport, reuse it
      if (this.transport) {
        return;
      }

      // Create transport
      const transport = new DustMcpServerTransport(dustAPI, (serverId) => {
        this.serverId = serverId;
        onServerIdReceived(serverId);
      });

      // Connect the server to the transport
      await server.connect(transport);

      // Store the transport for future reuse
      this.transport = transport;
    } catch (error) {
      console.error("Failed to connect filesystem MCP server:", error);
      throw error;
    }
  }

  /**
   * Get or create an MCP server for filesystem operations
   */
  async getOrCreateServer(
    dustAPI: DustAPI,
    onServerIdReceived: (serverId: string) => void
  ): Promise<{ server: McpServer | null; serverId: string | undefined }> {
    try {
      // Reuse existing server if we have one
      if (this.server) {
        // Connect if not already connected
        await this.connectServer(this.server, dustAPI, onServerIdReceived);
        return {
          server: this.server,
          serverId: this.serverId,
        };
      }

      // Create a new server if we don't have one
      const server = this.createServerForWorkspace();
      if (!server) {
        return {
          server: null,
          serverId: undefined,
        };
      }

      // Connect the server
      await this.connectServer(server, dustAPI, onServerIdReceived);

      return {
        server: server,
        serverId: this.serverId,
      };
    } catch (error) {
      console.error("Error getting or creating filesystem MCP server:", error);
      return {
        server: null,
        serverId: undefined,
      };
    }
  }

  /**
   * Get the current server ID
   */
  getServerId(): string | undefined {
    return this.serverId;
  }

  /**
   * Disconnect and clean up the current server connection
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    // Keep serverId for potential reconnection
  }
}
