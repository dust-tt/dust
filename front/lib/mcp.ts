import type { MCPServerType } from "@app/lib/api/mcp";

export const filterMCPServer = (
  mcpServer: MCPServerType,
  filterValue: string
) => {
  {
    return (
      mcpServer.name.toLowerCase().includes(filterValue.toLowerCase()) ||
      mcpServer.description.toLowerCase().includes(filterValue.toLowerCase()) ||
      mcpServer.tools.some((tool) =>
        tool.name.toLowerCase().includes(filterValue.toLowerCase())
      )
    );
  }
};
