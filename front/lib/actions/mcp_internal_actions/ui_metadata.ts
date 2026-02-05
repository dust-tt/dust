import type { ToolUIMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalMCPServerNameFromSId } from "@app/lib/actions/mcp_internal_actions/constants";
import { GMAIL_TOOLS_METADATA } from "@app/lib/api/actions/servers/gmail/metadata";

// Registry of UI metadata for internal MCP server tools
const UI_METADATA_REGISTRY: Partial<
  Record<InternalMCPServerNameType, Record<string, ToolUIMetadata>>
> = {
  gmail: Object.fromEntries(
    Object.entries(GMAIL_TOOLS_METADATA)
      .filter(([, meta]) => "ui" in meta && meta.ui)
      .map(([name, meta]) => [
        name,
        (meta as { ui: ToolUIMetadata }).ui,
      ])
  ),
};

/**
 * Gets the UI metadata for a tool if it exists.
 * Returns null if the tool doesn't have UI metadata or isn't an internal server tool.
 */
export function getToolUIMetadata(
  toolServerId: string,
  toolName: string
): ToolUIMetadata | null {
  const serverName = getInternalMCPServerNameFromSId(toolServerId);
  if (!serverName) {
    return null;
  }

  const serverMetadata = UI_METADATA_REGISTRY[serverName];
  if (!serverMetadata) {
    return null;
  }

  return serverMetadata[toolName] ?? null;
}
