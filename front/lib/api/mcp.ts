import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

/**
 * Synchronizes with an MCP server and retrieves its metadata and tools.
 * This function connects to the server and fetches the necessary information.
 */
export async function fetchServerMetadata(url: string) {
  const mcpClient = new Client({
    name: "dust-mcp-client",
    version: "1.0.0",
  });

  try {
    const sseTransport = new SSEClientTransport(new URL(url));
    await mcpClient.connect(sseTransport);

    const serverVersion = mcpClient.getServerVersion();
    const serverName = serverVersion?.name || "A Remote MCP Server";
    const serverDescription =
      serverVersion &&
      "description" in serverVersion &&
      typeof serverVersion.description === "string"
        ? serverVersion.description
        : "Remote MCP server description";

    const toolsResult = await mcpClient.listTools();
    const serverTools = toolsResult.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || "",
    }));

    return {
      name: serverName,
      description: serverDescription,
      tools: serverTools,
    };
  } finally {
    await mcpClient.close();
  }
}
