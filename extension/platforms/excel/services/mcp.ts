import { BrowserMCPTransport } from "@app/lib/client/BrowserMCPTransport";
import logger from "@app/logger/logger";
import type { WorkspaceType } from "@app/types/user";
import { registerAllTools } from "@extension/platforms/excel/tools";
import { McpService } from "@extension/shared/services/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Excel-specific implementation of the MCP service
 * This implementation is entirely workspace-scoped
 */
export class ExcelMcpService extends McpService {
  private server: McpServer | null = null;
  private transport: BrowserMCPTransport | null = null;
  private serverId: string | undefined = undefined;

  constructor() {
    super();
  }

  /**
   * Create an MCP server for a workspace
   * This is the core implementation that creates the workspace-scoped server
   */
  private createServerForWorkspace(): McpServer | null {
    try {
      const server = new McpServer(
        {
          name: "excel-mcp-server",
          version: "1.0.0",
        },
        {
          instructions:
            "You are running inside a Dust task pane embedded in Microsoft Excel. " +
            "The user is working on a spreadsheet, and you can read from and write to it directly. " +
            "When the user's message implicitly or explicitly refers to 'this', 'the selection', 'these cells', or 'my data' without further specification, " +
            "proactively call `excel-get-selection` to fetch the selected cells before answering. " +
            "Call `excel-list-worksheets` first when you need to understand how the workbook is laid out, then `excel-read-range` to read a specific sheet or range. " +
            "When asked to compute, fill in, reformat or generate data, write the result into the workbook with `excel-write-range` (or `excel-add-worksheet` first, when the output should not overwrite existing data) instead of only describing it in chat. " +
            "Do not ask the user to copy-paste spreadsheet content — retrieve it directly with the available tools.",
        }
      );

      // Register all tools with the server.
      registerAllTools(server);

      return server;
    } catch (error) {
      logger.error({ err: error }, "Error creating MCP server.");
      return null;
    }
  }

  /**
   * Connect the MCP server to a transport
   * This is required by the base class but our implementation is workspace-scoped
   */
  async connectServer(
    server: McpServer,
    owner: WorkspaceType,
    onServerIdReceived: (serverId: string) => void
  ): Promise<void> {
    if (!server) {
      throw new Error("Cannot connect null server");
    }

    // If we already have a transport for this workspace, reuse it.
    if (this.transport) {
      return;
    }

    // Create our custom transport with workspace-scoped registration.
    const transport = new BrowserMCPTransport(
      owner.sId,
      "excel-extension-client",
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
      // Connect the server to the transport.
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
   * Get or create an MCP server for the workspace
   * This is a convenience method that provides the main API for client code
   */
  async getOrCreateServer(
    owner: WorkspaceType,
    onServerIdReceived: (serverId: string) => void
  ): Promise<{ server: McpServer | null; serverId: string | undefined }> {
    try {
      // Reuse existing server if we have one.
      if (this.server && this.transport) {
        return { server: this.server, serverId: this.serverId };
      }

      // Create a new server if we don't have one.
      const server = this.createServerForWorkspace();
      if (!server) {
        return { server: null, serverId: undefined };
      }

      // Connect the server.
      await this.connectServer(server, owner, onServerIdReceived);

      return { server: this.server, serverId: this.serverId };
    } catch (error) {
      logger.error({ err: error }, "Error getting or creating MCP server.");
      return { server: null, serverId: undefined };
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
