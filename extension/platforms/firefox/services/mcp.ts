import { BrowserMCPTransport } from "@app/lib/client/BrowserMCPTransport";
import type { WorkspaceType } from "@app/types/user";
import type { CaptureService } from "@extension/shared/services/capture";
import { McpService } from "@extension/shared/services/mcp";
import { registerAllTools } from "@extension/shared/tools";
import { getBrowserMCPServerInstructions } from "@extension/shared/tools/metadata";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const FIREFOX_MCP_SERVER_NAME = "firefox-mcp-server";

export class FirefoxMcpService extends McpService {
  private captureService: CaptureService | null = null;
  private server: McpServer | null = null;
  private transport: BrowserMCPTransport | null = null;
  private serverId: string | undefined = undefined;

  constructor() {
    super();
  }

  setCaptureService(captureService: CaptureService): void {
    this.captureService = captureService;
  }

  private createServerForWorkspace(workspaceId: string): McpServer | null {
    try {
      const server = new McpServer(
        {
          name: FIREFOX_MCP_SERVER_NAME,
          version: "1.0.0",
        },
        {
          instructions: getBrowserMCPServerInstructions({
            platformName: "Firefox",
            serverName: FIREFOX_MCP_SERVER_NAME,
          }),
        }
      );

      registerAllTools(server, this.captureService, workspaceId);

      return server;
    } catch (error) {
      console.error("Error creating MCP server:", error);
      return null;
    }
  }

  async connectServer(
    server: McpServer,
    owner: WorkspaceType,
    onServerIdReceived: (serverId: string) => void
  ): Promise<void> {
    if (!server) {
      throw new Error("Cannot connect null server");
    }

    if (this.transport) {
      return;
    }

    const transport = new BrowserMCPTransport(
      owner.sId,
      "dust-firefox-extension",
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
      console.error("Failed to connect MCP server:", error);
      throw error;
    }
  }

  async getOrCreateServer(
    owner: WorkspaceType,
    onServerIdReceived: (serverId: string) => void
  ): Promise<{ server: McpServer | null; serverId: string | undefined }> {
    try {
      if (this.server && this.transport) {
        return { server: this.server, serverId: this.serverId };
      }

      const server = this.createServerForWorkspace(owner.sId);
      if (!server) {
        return { server: null, serverId: undefined };
      }

      await this.connectServer(server, owner, onServerIdReceived);
      return { server: this.server, serverId: this.serverId };
    } catch (error) {
      console.error("Error getting or creating MCP server:", error);
      return { server: null, serverId: undefined };
    }
  }

  getServerId(): string | undefined {
    return this.serverId;
  }

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
