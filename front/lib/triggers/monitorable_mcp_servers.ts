import type { MCPServerViewType, MCPToolType } from "@app/lib/api/mcp";

export function getMonitorableMCPTools(
  mcpServerView: MCPServerViewType
): MCPToolType[] {
  switch (mcpServerView.serverType) {
    case "remote":
      return mcpServerView.server.tools;
    case "internal":
      switch (mcpServerView.server.name) {
        case "gmail":
          return mcpServerView.server.tools.filter(
            (tool) => tool.name === "get_messages"
          );
        default:
          return [];
      }
  }
}

export function isMonitorableMCPServer(
  mcpServerView: MCPServerViewType
): boolean {
  return getMonitorableMCPTools(mcpServerView).length > 0;
}
