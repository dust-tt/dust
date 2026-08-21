import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  GET_AGENT_DETAILS_TOOL_NAME,
  GET_SKILL_DETAILS_TOOL_NAME,
  LIST_AGENTS_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  LIST_WORKSPACE_MEMBERS_TOOL_NAME,
  WORKSPACE_MANAGEMENT_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/workspace_management/metadata";
import { getAgentDetails } from "@app/lib/api/actions/servers/workspace_management/tools/get_agent_details";
import { getSkillDetails } from "@app/lib/api/actions/servers/workspace_management/tools/get_skill_details";
import { listAgents } from "@app/lib/api/actions/servers/workspace_management/tools/list_agents";
import { listSkills } from "@app/lib/api/actions/servers/workspace_management/tools/list_skills";
import { listWorkspaceMembers } from "@app/lib/api/actions/servers/workspace_management/tools/list_workspace_members";

const handlers: ToolHandlers<typeof WORKSPACE_MANAGEMENT_TOOLS_METADATA> = {
  [LIST_AGENTS_TOOL_NAME]: listAgents,
  [GET_AGENT_DETAILS_TOOL_NAME]: getAgentDetails,
  [LIST_SKILLS_TOOL_NAME]: listSkills,
  [GET_SKILL_DETAILS_TOOL_NAME]: getSkillDetails,
  [LIST_WORKSPACE_MEMBERS_TOOL_NAME]: listWorkspaceMembers,
};

export const TOOLS = buildTools(WORKSPACE_MANAGEMENT_TOOLS_METADATA, handlers);
