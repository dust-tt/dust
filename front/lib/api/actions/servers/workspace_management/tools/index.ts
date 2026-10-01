import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  CREATE_GROUP_TOOL_NAME,
  GET_AGENT_DETAILS_TOOL_NAME,
  GET_GROUP_MEMBERS_TOOL_NAME,
  GET_SKILL_DETAILS_TOOL_NAME,
  GET_TOOL_DETAILS_TOOL_NAME,
  LIST_GROUPS_TOOL_NAME,
  LIST_MODELS_TOOL_NAME,
  LIST_TAGS_TOOL_NAME,
  LIST_TOOLS_TOOL_NAME,
  LIST_WORKSPACE_MEMBERS_TOOL_NAME,
  SEARCH_AGENTS_TOOL_NAME,
  SEARCH_KNOWLEDGE_TOOL_NAME,
  SEARCH_SKILLS_TOOL_NAME,
  UPDATE_GROUP_MEMBERS_TOOL_NAME,
  WORKSPACE_MANAGEMENT_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/workspace_management/metadata";
import { createGroup } from "@app/lib/api/actions/servers/workspace_management/tools/create_group";
import { getAgentDetails } from "@app/lib/api/actions/servers/workspace_management/tools/get_agent_details";
import { getGroupMembers } from "@app/lib/api/actions/servers/workspace_management/tools/get_group_members";
import { getSkillDetails } from "@app/lib/api/actions/servers/workspace_management/tools/get_skill_details";
import { getToolDetails } from "@app/lib/api/actions/servers/workspace_management/tools/get_tool_details";
import { listGroups } from "@app/lib/api/actions/servers/workspace_management/tools/list_groups";
import { listModels } from "@app/lib/api/actions/servers/workspace_management/tools/list_models";
import { listTags } from "@app/lib/api/actions/servers/workspace_management/tools/list_tags";
import { listTools } from "@app/lib/api/actions/servers/workspace_management/tools/list_tools";
import { listWorkspaceMembers } from "@app/lib/api/actions/servers/workspace_management/tools/list_workspace_members";
import { searchAgentsTool } from "@app/lib/api/actions/servers/workspace_management/tools/search_agents";
import { searchKnowledgeTool } from "@app/lib/api/actions/servers/workspace_management/tools/search_knowledge";
import { searchSkillsTool } from "@app/lib/api/actions/servers/workspace_management/tools/search_skills";
import { updateGroupMembers } from "@app/lib/api/actions/servers/workspace_management/tools/update_group_members";

const handlers: ToolHandlers<typeof WORKSPACE_MANAGEMENT_TOOLS_METADATA> = {
  [SEARCH_AGENTS_TOOL_NAME]: searchAgentsTool,
  [GET_AGENT_DETAILS_TOOL_NAME]: getAgentDetails,
  [SEARCH_SKILLS_TOOL_NAME]: searchSkillsTool,
  [GET_SKILL_DETAILS_TOOL_NAME]: getSkillDetails,
  [LIST_TOOLS_TOOL_NAME]: listTools,
  [GET_TOOL_DETAILS_TOOL_NAME]: getToolDetails,
  [LIST_MODELS_TOOL_NAME]: listModels,
  [LIST_TAGS_TOOL_NAME]: listTags,
  [SEARCH_KNOWLEDGE_TOOL_NAME]: searchKnowledgeTool,
  [LIST_WORKSPACE_MEMBERS_TOOL_NAME]: listWorkspaceMembers,
  [LIST_GROUPS_TOOL_NAME]: listGroups,
  [GET_GROUP_MEMBERS_TOOL_NAME]: getGroupMembers,
  [UPDATE_GROUP_MEMBERS_TOOL_NAME]: updateGroupMembers,
  [CREATE_GROUP_TOOL_NAME]: createGroup,
};

export const TOOLS = buildTools(WORKSPACE_MANAGEMENT_TOOLS_METADATA, handlers);
