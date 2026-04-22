import { isJITMCPServerView } from "@app/lib/actions/mcp_internal_actions/utils";
import { buildToolsetsContext } from "@app/lib/api/assistant/global_agents/configurations/dust/dust";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SystemSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";

export const discoverToolsSkill = {
  sId: "discover_tools",
  name: "Discover Tools",
  userFacingDescription:
    "Automatically discover and activate specialized tools as needed. Extend your agent's capabilities on-demand without manual configuration.",
  agentFacingDescription:
    "List available toolsets and enable them for the current conversation.",
  fetchInstructions: async (
    auth: Authenticator,
    { spaceIds }: { spaceIds: string[]; agentLoopData?: AgentLoopExecutionData }
  ) => {
    const allToolsets = await MCPServerViewResource.listBySpaceIds(
      auth,
      spaceIds,
      { includeGlobalSpace: true }
    );

    const availableToolsets = allToolsets.filter((toolset) => {
      const mcpServerView = toolset.toJSON();
      return (
        isJITMCPServerView(mcpServerView) &&
        mcpServerView.server.availability !== "auto_hidden_builder"
      );
    });

    return buildDiscoverToolsInstructions(availableToolsets);
  },
  mcpServers: [{ name: "toolsets" }],
  version: 1,
  icon: "ToolsIcon",
} as const satisfies SystemSkillDefinition;

export function buildDiscoverToolsInstructions(
  availableToolsets: MCPServerViewResource[]
): string {
  return buildToolsetsContext(availableToolsets);
}
