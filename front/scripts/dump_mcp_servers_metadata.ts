import { internalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { connectToInternalMCPServer } from "@app/lib/actions/mcp_internal_actions";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { AVAILABLE_INTERNAL_MCP_SERVER_NAMES } from "@app/lib/actions/mcp_internal_actions/constants";
import { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import { extractMetadataFromTools } from "@app/lib/actions/mcp_metadata";
import type { MCPToolType } from "@app/lib/api/mcp";
import { Authenticator } from "@app/lib/auth";
import { LEGACY_REGION_BIT } from "@app/lib/resources/string_ids";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import * as fs from "fs";

interface ServerMetadataDump {
  name: string;
  tools: ToolMetadataDump[];
}

interface ToolMetadataDump {
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

function sortTools(tools: MCPToolType[]): ToolMetadataDump[] {
  return [...tools]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: sortObjectKeys(tool.inputSchema),
    }));
}

async function getToolsForServer(
  auth: Authenticator,
  serverName: InternalMCPServerNameType
): Promise<MCPToolType[]> {
  const workspace = auth.getNonNullableWorkspace();
  const mcpServerId = internalMCPServerNameToSId({
    name: serverName,
    workspaceId: workspace.id,
    prefix: LEGACY_REGION_BIT,
  });

  const mcpClient = new Client({
    name: "dust-mcp-metadata-dump",
    version: "1.0.0",
  });

  const [client, server] = InMemoryWithAuthTransport.createLinkedPair();

  await connectToInternalMCPServer(mcpServerId, server, auth, undefined);
  await mcpClient.connect(client);

  const toolsResult = await mcpClient.listTools();
  const tools = extractMetadataFromTools(toolsResult.tools);

  await mcpClient.close();

  return tools;
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description:
        "Workspace SID to use for connecting to MCP servers. If not provided, uses the first available workspace.",
      required: false,
    },
    outputFile: {
      type: "string",
      description: "Output file path for the JSON dump.",
      required: true,
    },
    serverName: {
      type: "string",
      description: `Server name to dump. Available: ${AVAILABLE_INTERNAL_MCP_SERVER_NAMES.join(", ")}`,
      required: true,
    },
  },
  async ({ workspaceId, outputFile, serverName }, logger) => {
    if (
      !(AVAILABLE_INTERNAL_MCP_SERVER_NAMES as readonly string[]).includes(
        serverName
      )
    ) {
      throw new Error(
        `Invalid server name: ${serverName}. Available: ${AVAILABLE_INTERNAL_MCP_SERVER_NAMES.join(", ")}`
      );
    }

    let workspace: WorkspaceResource | null;
    if (workspaceId) {
      workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace with SID ${workspaceId} not found.`);
      }
    } else {
      const workspaces = await WorkspaceResource.listAll("ASC");
      if (workspaces.length === 0) {
        throw new Error("No workspaces found in the database.");
      }
      workspace = workspaces[0];
    }

    logger.info({ workspaceId: workspace.sId }, "Using workspace");

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    logger.info({ serverName }, "Fetching tools...");
    const tools = await getToolsForServer(
      auth,
      serverName as InternalMCPServerNameType
    );
    logger.info({ toolCount: tools.length }, "Successfully fetched tools");

    const result: ServerMetadataDump = {
      name: serverName,
      tools: sortTools(tools),
    };

    const output = {
      workspaceId: workspace.sId,
      server: result,
    };

    const jsonOutput = JSON.stringify(output, null, 2);

    await fs.promises.writeFile(outputFile, jsonOutput, "utf-8");
    logger.info({ outputFile }, "Metadata dump written to file");

    logger.info(
      {
        serverName,
        toolCount: tools.length,
      },
      "Metadata dump complete"
    );
  }
);
