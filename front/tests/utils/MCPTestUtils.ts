import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import { getInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/servers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";

/**
 * Utility class for testing MCP servers.
 * Provides helpers to create test clients, connect to servers, and assert tool results.
 */
export class MCPTestUtils {
  /**
   * Creates an MCP client connected to an internal server for testing.
   * Returns the client, server, and a cleanup function to close connections.
   *
   * @example
   * const { client, cleanup } = await MCPTestUtils.createTestClient(
   *   auth,
   *   "skill_management",
   *   agentLoopContext
   * );
   * try {
   *   const result = await client.callTool({ name: "enable_skill", arguments: { skillName: "test" } });
   *   // ... assertions
   * } finally {
   *   await cleanup();
   * }
   */
  static async createTestClient(
    auth: Authenticator,
    serverName: InternalMCPServerNameType,
    agentLoopContext?: AgentLoopContextType
  ): Promise<{
    client: Client;
    cleanup: () => Promise<void>;
  }> {
    // Create linked transports for client-server communication
    const [clientTransport, serverTransport] =
      InMemoryWithAuthTransport.createLinkedPair();

    // Create and connect the server
    const server = await getInternalMCPServer(
      auth,
      {
        internalMCPServerName: serverName,
        mcpServerId: `test-${serverName}`,
      },
      agentLoopContext
    );
    await server.connect(serverTransport);

    // Create and connect the client
    const client = new Client(
      { name: "test-client", version: "1.0.0" },
      { capabilities: {} }
    );
    await client.connect(clientTransport);

    return {
      client,
      cleanup: async () => {
        await client.close();
        await server.close();
      },
    };
  }

  /**
   * Asserts that a CallToolResult is successful and returns the content.
   * Throws if the result indicates an error.
   *
   * @example
   * const result = await client.callTool({ name: "some_tool", arguments: {} });
   * const content = MCPTestUtils.assertToolSuccess(result);
   * expect(content[0].text).toContain("success");
   */
  static assertToolSuccess(result: CallToolResult) {
    if (result.isError) {
      throw new Error(
        `Expected tool success but got error: ${JSON.stringify(result.content)}`
      );
    }
    if (!result.content) {
      throw new Error("Expected content but got none");
    }
    return result.content;
  }

  /**
   * Asserts that a CallToolResult is an error and returns the error message.
   * Throws if the result indicates success.
   *
   * @example
   * const result = await client.callTool({ name: "some_tool", arguments: { invalid: true } });
   * const errorMessage = MCPTestUtils.assertToolError(result);
   * expect(errorMessage).toContain("not found");
   */
  static assertToolError(result: CallToolResult): string {
    if (!result.isError) {
      throw new Error(
        `Expected tool error but got success: ${JSON.stringify(result.content)}`
      );
    }
    if (!result.content || result.content.length === 0) {
      throw new Error("Expected error content but got none");
    }
    if (result.content[0].type !== "text") {
      throw new Error(
        `Expected text content but got ${result.content[0].type}`
      );
    }
    return result.content[0].text;
  }

  /**
   * Lists all available tools from a connected client.
   * Useful for verifying tool registration.
   *
   * @example
   * const { client, cleanup } = await MCPTestUtils.createTestClient(auth, "skill_management");
   * try {
   *   const tools = await MCPTestUtils.listTools(client);
   *   expect(tools.some(t => t.name === "enable_skill")).toBe(true);
   * } finally {
   *   await cleanup();
   * }
   */
  static async listTools(client: Client): Promise<
    Array<{
      name: string;
      description?: string;
      inputSchema: Record<string, unknown>;
    }>
  > {
    const result = await client.listTools();
    return result.tools;
  }
}
