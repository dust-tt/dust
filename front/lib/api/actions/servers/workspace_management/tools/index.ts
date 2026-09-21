import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  CREATE_GROUP_TOOL_NAME,
  GET_AGENT_DETAILS_TOOL_NAME,
  GET_GROUP_MEMBERS_TOOL_NAME,
  GET_SKILL_DETAILS_TOOL_NAME,
  GET_TOOL_DETAILS_TOOL_NAME,
  LIST_AGENTS_TOOL_NAME,
  LIST_GROUPS_TOOL_NAME,
  LIST_SKILLS_TOOL_NAME,
  LIST_TOOLS_TOOL_NAME,
  LIST_WORKSPACE_MEMBERS_TOOL_NAME,
  UPDATE_GROUP_MEMBERS_TOOL_NAME,
  WORKSPACE_MANAGEMENT_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/workspace_management/metadata";
import { createGroup } from "@app/lib/api/actions/servers/workspace_management/tools/create_group";
import { getAgentDetails } from "@app/lib/api/actions/servers/workspace_management/tools/get_agent_details";
import { getGroupMembers } from "@app/lib/api/actions/servers/workspace_management/tools/get_group_members";
import { getSkillDetails } from "@app/lib/api/actions/servers/workspace_management/tools/get_skill_details";
import { getToolDetails } from "@app/lib/api/actions/servers/workspace_management/tools/get_tool_details";
import { listAgents } from "@app/lib/api/actions/servers/workspace_management/tools/list_agents";
import { listGroups } from "@app/lib/api/actions/servers/workspace_management/tools/list_groups";
import { listSkills } from "@app/lib/api/actions/servers/workspace_management/tools/list_skills";
import { listTools } from "@app/lib/api/actions/servers/workspace_management/tools/list_tools";
import { listWorkspaceMembers } from "@app/lib/api/actions/servers/workspace_management/tools/list_workspace_members";
import { updateGroupMembers } from "@app/lib/api/actions/servers/workspace_management/tools/update_group_members";

const handlers: ToolHandlers<typeof WORKSPACE_MANAGEMENT_TOOLS_METADATA> = {
  [LIST_AGENTS_TOOL_NAME]: listAgents,
  [GET_AGENT_DETAILS_TOOL_NAME]: getAgentDetails,
  [LIST_SKILLS_TOOL_NAME]: listSkills,
  [GET_SKILL_DETAILS_TOOL_NAME]: getSkillDetails,
  [LIST_TOOLS_TOOL_NAME]: listTools,
  [GET_TOOL_DETAILS_TOOL_NAME]: getToolDetails,
  [LIST_WORKSPACE_MEMBERS_TOOL_NAME]: listWorkspaceMembers,
  [LIST_GROUPS_TOOL_NAME]: listGroups,
  [GET_GROUP_MEMBERS_TOOL_NAME]: getGroupMembers,
  [UPDATE_GROUP_MEMBERS_TOOL_NAME]: updateGroupMembers,
  [CREATE_GROUP_TOOL_NAME]: createGroup,
};

export const TOOLS = buildTools(WORKSPACE_MANAGEMENT_TOOLS_METADATA, handlers);
