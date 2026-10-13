import { BrowserMCPTransport } from "@app/lib/client/BrowserMCPTransport";
import logger from "@app/logger/logger";
import type { WorkspaceType } from "@app/types/user";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Base class for MCP services.
 * Handles the workspace-scoped server lifecycle. Platforms only build the server.
 */
export abstract class McpService {
  private server: McpServer | null = null;
  private transport: BrowserMCPTransport | null = null;
  private serverId: string | undefined = undefined;

  constructor(private readonly clientName: string) {}

  /**
   * Create the platform MCP server with its tools registered.
   */
  protected abstract createServer(): McpServer;

  /**
   * Get or create the MCP server for the workspace and connect it to a transport.
   */
  async getOrCreateServer(
    owner: WorkspaceType,
    onServerIdReceived: (serverId: string) => void
  ): Promise<{ server: McpServer | null; serverId: string | undefined }> {
    try {
      if (this.server && this.transport) {
        return { server: this.server, serverId: this.serverId };
      }

      await this.connectServer(this.createServer(), owner, onServerIdReceived);
      return { server: this.server, serverId: this.serverId };
    } catch (error) {
      logger.error({ err: error }, "Error getting or creating MCP server.");
      return { server: null, serverId: undefined };
    }
  }

  private async connectServer(
    server: McpServer,
    owner: WorkspaceType,
    onServerIdReceived: (serverId: string) => void
  ): Promise<void> {
    if (this.transport) {
      return;
    }

    const transport = new BrowserMCPTransport(
      owner.sId,
      this.clientName,
      (serverId) => {
        this.serverId = serverId;
        onServerIdReceived(serverId);
      }
    );

    // Claim the slot synchronously, before the async `server.connect` round-trip,
    // so a concurrent getOrCreateServer/connectServer call short-circuits on the
    // guard above instead of creating a second transport. A leaked transport keeps
    // a heartbeat timer alive forever; many such timers firing on the same tick
    // produce bursts of register/heartbeat calls.
    this.server = server;
    this.transport = transport;

    try {
      await server.connect(transport);
    } catch (error) {
      // Roll back the claim and tear down the half-open transport so a later
      // attempt can retry cleanly.
      this.server = null;
      this.transport = null;
      await transport.close();
      logger.error({ err: error }, "Failed to connect MCP server.");
      throw error;
    }
  }

  /**
   * Get the current server ID
   * This is useful for including in message payloads
   */
  getServerId(): string | undefined {
    return this.serverId;
  }

  /**
   * Disconnect and clean up the current server connection
   */
  async disconnect(): Promise<void> {
    const transport = this.transport;
    this.transport = null;
    this.server = null;
    this.serverId = undefined;
    if (transport) {
      await transport.close();
    }
  }
}
