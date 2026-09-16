import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA,
  DESCRIBE_SKILL_TOOL_NAME,
  SUGGEST_AGENT_CREATION_TOOL_NAME,
  SUGGEST_SKILL_EDITORS_TOOL_NAME,
  SUGGEST_SKILL_UPDATE_TOOL_NAME,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { describeSkillHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/describe_skill";
import { suggestAgentCreationHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_agent_creation";
import { suggestSkillEditorsHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_skill_editors";
import { suggestSkillUpdateHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_skill_update";

const handlers: ToolHandlers<typeof BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA> =
  {
    [DESCRIBE_SKILL_TOOL_NAME]: describeSkillHandler,
    [SUGGEST_SKILL_UPDATE_TOOL_NAME]: suggestSkillUpdateHandler,
    [SUGGEST_SKILL_EDITORS_TOOL_NAME]: suggestSkillEditorsHandler,
    [SUGGEST_AGENT_CREATION_TOOL_NAME]: suggestAgentCreationHandler,
  };

export const TOOLS = buildTools(
  BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA,
  handlers
);
