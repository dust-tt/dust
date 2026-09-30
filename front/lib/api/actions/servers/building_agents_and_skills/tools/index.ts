import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA,
  DESCRIBE_AGENT_TOOL_NAME,
  DESCRIBE_SKILL_TOOL_NAME,
  SUGGEST_TOOL_NAME,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { describeAgentHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/describe_agent";
import { describeSkillHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/describe_skill";
import { suggestHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest";

const handlers: ToolHandlers<typeof BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA> =
  {
    [DESCRIBE_AGENT_TOOL_NAME]: describeAgentHandler,
    [DESCRIBE_SKILL_TOOL_NAME]: describeSkillHandler,
    [SUGGEST_TOOL_NAME]: suggestHandler,
  };

export const TOOLS = buildTools(
  BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA,
  handlers
);
