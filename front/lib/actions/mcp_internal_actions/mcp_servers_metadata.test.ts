/**
 * MCP Server Metadata Snapshot Test
 *
 * This test ensures that MCP server metadata (tools, their descriptions, input schemas,
 * and tool stakes) remains stable across code changes. It helps detect unintended changes
 * when refactoring MCP servers from old-style (inline tool definitions) to new-style
 * (separate metadata files).
 *
 * How it works:
 * 1. Instantiates each server with a mock authenticator
 * 2. Extracts the registered tools via the MCP protocol
 * 3. Fetches tool stakes from the server configuration
 * 4. Compares the extracted metadata against a saved snapshot file
 *
 * Usage:
 * - Run tests: `npm test lib/actions/mcp_internal_actions/mcp_servers_metadata.test.ts`
 * - Update snapshot: Export UPDATE_MCP_METADATA_SNAPSHOT=1 before running
 *   Example: `UPDATE_MCP_METADATA_SNAPSHOT=1 NODE_ENV=test npm test lib/actions/mcp_internal_actions/mcp_servers_metadata.test.ts`
 *
 * Note: This test uses a mock authenticator and does not require database access for the
 * metadata extraction itself. The auth is only used during server instantiation, not during
 * tool registration.
 */

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  AVAILABLE_INTERNAL_MCP_SERVER_NAMES,
  getInternalMCPServerToolStakes,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import { getInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/servers";
import { extractMetadataFromTools } from "@app/lib/actions/mcp_metadata";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { LEGACY_REGION_BIT } from "@app/lib/resources/string_ids";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it } from "vitest";

interface ServerMetadataSnapshot {
  name: string;
  tools: ToolMetadataSnapshot[];
  toolsStakes: Record<string, MCPToolStakeLevelType> | null;
}

interface ToolMetadataSnapshot {
  name: string;
  description: string;
  inputSchema?: unknown;
}

/**
 * Recursively sorts object keys to ensure stable JSON output.
 * Arrays are preserved as-is but their object elements are sorted.
 */
function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }

  const sorted: Record<string, unknown> = {};
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  for (const key of keys) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

function sortTools(tools: MCPToolType[]): ToolMetadataSnapshot[] {
  return [...tools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: sortObjectKeys(tool.inputSchema),
    }));
}

/**
 * Sort tools stakes by key for stable output.
 */
function sortToolsStakes(
  stakes: Record<string, MCPToolStakeLevelType> | undefined
): Record<string, MCPToolStakeLevelType> | null {
  if (!stakes) {
    return null;
  }

  const sorted: Record<string, MCPToolStakeLevelType> = {};
  const keys = Object.keys(stakes).sort();
  for (const key of keys) {
    sorted[key] = stakes[key];
  }
  return sorted;
}

/**
 * Creates a minimal mock authenticator for testing.
 * This mock is only used to instantiate MCP servers - the auth is not
 * actually used during tool registration, only during tool execution.
 *
 * Note: We include a mock user because some servers (e.g., agent_memory)
 * have conditional tool registration based on user presence.
 */
function createMockAuthenticator(): Authenticator {
  const mockWorkspace = {
    id: 1,
    sId: "mock-workspace-sid",
    name: "Mock Workspace",
  };

  const mockUser = {
    id: 1,
    sId: "mock-user-sid",
    name: "Mock User",
    email: "mock@example.com",
  };

  return {
    getNonNullableWorkspace: () => mockWorkspace,
    workspace: () => mockWorkspace,
    isAdmin: () => true,
    isBuilder: () => true,
    isUser: () => true,
    role: () => "admin",
    user: () => mockUser,
    groups: () => [],
    subscription: () => null,
    plan: () => null,
    featureFlags: () => [],
    _workspace: null,
    _user: mockUser,
    _subscription: null,
    _role: "admin",
    _groupModelIds: [],
    _authMethod: "internal",
  } as unknown as Authenticator;
}

/**
 * Extract tools from a server by instantiating it and listing tools via MCP client.
 * Always uses the mock path for consistency across all servers.
 */
async function getToolsFromServer(
  serverName: InternalMCPServerNameType
): Promise<MCPToolType[]> {
  const mockAuth = createMockAuthenticator();
  const mcpServerId = internalMCPServerNameToSId({
    name: serverName,
    workspaceId: 1,
    prefix: LEGACY_REGION_BIT,
  });

  const mcpClient = new Client({
    name: "dust-mcp-metadata-test",
    version: "1.0.0",
  });

  const [clientTransport, serverTransport] =
    InMemoryWithAuthTransport.createLinkedPair();

  const server = await getInternalMCPServer(
    mockAuth,
    {
      internalMCPServerName: serverName,
      mcpServerId,
    },
    undefined
  );

  await server.connect(serverTransport);
  await mcpClient.connect(clientTransport);

  const toolsResult = await mcpClient.listTools();
  const tools = extractMetadataFromTools(toolsResult.tools);

  await mcpClient.close();

  return tools;
}

/**
 * Collect metadata from all MCP servers.
 */
async function collectAllServersMetadata(): Promise<ServerMetadataSnapshot[]> {
  const servers: ServerMetadataSnapshot[] = [];

  for (const serverName of AVAILABLE_INTERNAL_MCP_SERVER_NAMES) {
    try {
      const tools = await getToolsFromServer(serverName);
      const toolsStakes = getInternalMCPServerToolStakes(serverName);

      servers.push({
        name: serverName,
        tools: sortTools(tools),
        toolsStakes: sortToolsStakes(toolsStakes),
      });
    } catch (error) {
      // If we can't get tools for a server, record it with an error marker
      // This helps identify which servers need attention
      servers.push({
        name: serverName,
        tools: [
          {
            name: "__ERROR__",
            description: `Failed to extract metadata: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        toolsStakes: null,
      });
    }
  }

  // Sort servers by name for stable output
  return servers.sort((a, b) => a.name.localeCompare(b.name));
}

describe("MCP Servers Metadata Snapshot", () => {
  it("should have all servers accounted for", async () => {
    const currentMetadata = await collectAllServersMetadata();

    // Check that we have entries for all known servers
    const serverNames = currentMetadata.map((s) => s.name);
    for (const expectedName of AVAILABLE_INTERNAL_MCP_SERVER_NAMES) {
      expect(serverNames).toContain(expectedName);
    }
  });

  it("should not have any servers with extraction errors", async () => {
    const currentMetadata = await collectAllServersMetadata();

    const serversWithErrors = currentMetadata.filter((s) =>
      s.tools.some((t) => t.name === "__ERROR__")
    );

    if (serversWithErrors.length > 0) {
      const errorDetails = serversWithErrors
        .map(
          (s) =>
            `${s.name}: ${s.tools.find((t) => t.name === "__ERROR__")?.description}`
        )
        .join("\n");
      throw new Error(
        `Failed to extract metadata from ${serversWithErrors.length} server(s):\n${errorDetails}`
      );
    }
  });

  it("should have stable tool stakes across all servers", () => {
    const allStakes: Record<string, Record<string, MCPToolStakeLevelType>> = {};

    for (const serverName of [...AVAILABLE_INTERNAL_MCP_SERVER_NAMES].sort()) {
      const stakes = getInternalMCPServerToolStakes(serverName);
      allStakes[serverName] = sortToolsStakes(stakes) ?? {};
    }

    try {
      expect(allStakes).toMatchSnapshot();
    } catch (error) {
      const hint =
        "\n\nTool stakes changed. Review the diff above and run:\n" +
        "  NODE_ENV=test npm test -- --update lib/actions/" +
        "mcp_internal_actions/mcp_servers_metadata.test.ts\n" +
        "to update the snapshot.";

      if (error instanceof Error) {
        error.message += hint;
      }
      throw error;
    }
  });
});
