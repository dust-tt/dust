import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA,
  SUGGEST_SKILL_UPDATE_TOOL_NAME,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { suggestSkillUpdateHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_skill_update";

const handlers: ToolHandlers<typeof BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA> =
  {
    [SUGGEST_SKILL_UPDATE_TOOL_NAME]: suggestSkillUpdateHandler,
  };

export const TOOLS = buildTools(
  BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA,
  handlers
);
