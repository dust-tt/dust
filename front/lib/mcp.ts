import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import type { MCPServerType, MCPServerViewType } from "@app/lib/api/mcp";

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

export const filterMCPServerView = (
  mcpServerView: MCPServerViewType,
  filterValue: string
) => {
  const filterLower = filterValue.toLowerCase();

  return (
    getMcpServerViewDisplayName(mcpServerView)
      .toLowerCase()
      .includes(filterLower) ||
    getMcpServerViewDescription(mcpServerView)
      .toLowerCase()
      .includes(filterLower) ||
    mcpServerView.server.tools.some((tool) =>
      tool.name.toLowerCase().includes(filterLower)
    )
  );
};
