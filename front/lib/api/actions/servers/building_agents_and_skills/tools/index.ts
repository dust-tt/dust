import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA,
  DESCRIBE_AGENT_TOOL_NAME,
  DESCRIBE_SKILL_TOOL_NAME,
  SUGGEST_AGENT_CREATION_TOOL_NAME,
  SUGGEST_AGENT_DELETION_TOOL_NAME,
  SUGGEST_AGENT_DESCRIPTION_TOOL_NAME,
  SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME,
  SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME,
  SUGGEST_AGENT_NAME_TOOL_NAME,
  SUGGEST_AGENT_PUBLISH_STATE_TOOL_NAME,
  SUGGEST_SKILL_AVAILABILITY_TOOL_NAME,
  SUGGEST_SKILL_DELETION_TOOL_NAME,
  SUGGEST_SKILL_EDITORS_TOOL_NAME,
  SUGGEST_SKILL_NAME_TOOL_NAME,
  SUGGEST_SKILL_UPDATE_TOOL_NAME,
  SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { describeAgentHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/describe_agent";
import { describeSkillHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/describe_skill";
import { suggestAgentCreationHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_agent_creation";
import { suggestAgentDeletionHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_agent_deletion";
import { suggestAgentDescriptionHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_agent_description";
import { suggestAgentInstructionsChangeHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_agent_instructions_change";
import { suggestAgentModelChangeHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_agent_model_change";
import { suggestAgentNameHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_agent_name";
import { suggestAgentPublishStateHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_agent_publish_state";
import { suggestSkillAvailabilityHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_skill_availability";
import { suggestSkillDeletionHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_skill_deletion";
import { suggestSkillEditorsHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_skill_editors";
import { suggestSkillNameHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_skill_name";
import { suggestSkillUpdateHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_skill_update";
import { suggestSkillUserFacingDescriptionHandler } from "@app/lib/api/actions/servers/building_agents_and_skills/tools/suggest_skill_user_facing_description";

const handlers: ToolHandlers<typeof BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA> =
  {
    [DESCRIBE_AGENT_TOOL_NAME]: describeAgentHandler,
    [DESCRIBE_SKILL_TOOL_NAME]: describeSkillHandler,
    [SUGGEST_AGENT_CREATION_TOOL_NAME]: suggestAgentCreationHandler,
    [SUGGEST_AGENT_DELETION_TOOL_NAME]: suggestAgentDeletionHandler,
    [SUGGEST_AGENT_DESCRIPTION_TOOL_NAME]: suggestAgentDescriptionHandler,
    [SUGGEST_AGENT_INSTRUCTIONS_CHANGE_TOOL_NAME]:
      suggestAgentInstructionsChangeHandler,
    [SUGGEST_AGENT_MODEL_CHANGE_TOOL_NAME]: suggestAgentModelChangeHandler,
    [SUGGEST_AGENT_NAME_TOOL_NAME]: suggestAgentNameHandler,
    [SUGGEST_AGENT_PUBLISH_STATE_TOOL_NAME]: suggestAgentPublishStateHandler,
    [SUGGEST_SKILL_AVAILABILITY_TOOL_NAME]: suggestSkillAvailabilityHandler,
    [SUGGEST_SKILL_DELETION_TOOL_NAME]: suggestSkillDeletionHandler,
    [SUGGEST_SKILL_EDITORS_TOOL_NAME]: suggestSkillEditorsHandler,
    [SUGGEST_SKILL_NAME_TOOL_NAME]: suggestSkillNameHandler,
    [SUGGEST_SKILL_UPDATE_TOOL_NAME]: suggestSkillUpdateHandler,
    [SUGGEST_SKILL_USER_FACING_DESCRIPTION_TOOL_NAME]:
      suggestSkillUserFacingDescriptionHandler,
  };

export const TOOLS = buildTools(
  BUILDING_AGENTS_AND_SKILLS_TOOLS_METADATA,
  handlers
);
