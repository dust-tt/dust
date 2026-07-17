import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import {
  INTERNAL_MCP_SERVERS,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";

export type StakeOrFrameSignal = "IS_STAKE" | "IS_CREATE_FRAME";

const FRAME_SERVER_FLAGS: Record<string, StakeOrFrameSignal> = {
  interactive_content: "IS_CREATE_FRAME",
};

const INTERNAL_TOOL_STAKES: Map<
  string,
  Map<string, MCPToolStakeLevelType>
> = (() => {
  const byServer = new Map<string, Map<string, MCPToolStakeLevelType>>();
  for (const [serverName, entry] of Object.entries(INTERNAL_MCP_SERVERS)) {
    const byTool = new Map<string, MCPToolStakeLevelType>();
    for (const tool of entry.metadata.tools) {
      byTool.set(tool.name, tool.stake);
    }
    byServer.set(serverName, byTool);
  }
  return byServer;
})();

/**
 * Classifies a (server, tool) as a staked tool or frame-creation signal, or
 * `null` when it is neither.
 */
export function classifyStakeOrFrameTool(
  serverName: string,
  toolName: string
): StakeOrFrameSignal | null {
  const frameFlag = FRAME_SERVER_FLAGS[serverName];
  if (frameFlag) {
    return frameFlag;
  }

  // Custom/remote tools never count.
  if (!isInternalMCPServerName(serverName)) {
    return null;
  }

  const stake = INTERNAL_TOOL_STAKES.get(serverName)?.get(toolName);
  if (stake === undefined) {
    return null;
  }
  return stake === "never_ask" ? null : "IS_STAKE";
}
