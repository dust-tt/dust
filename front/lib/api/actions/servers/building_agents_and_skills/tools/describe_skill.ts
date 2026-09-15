import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { formatSkillContext } from "@app/lib/reinforcement/format_skill_context";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { Err, Ok } from "@app/types/shared/result";

export async function describeSkillHandler(
  { skillId }: { skillId: string },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  if (!isResourceSId("skill", skillId)) {
    return new Err(
      new MCPError("Only custom workspace skills can be described.")
    );
  }

  const skill = await SkillResource.fetchById(auth, skillId);
  if (!skill) {
    return new Err(new MCPError("Skill not found."));
  }

  return new Ok([
    {
      type: "text" as const,
      text: formatSkillContext(skill.toJSON(auth)),
    },
  ]);
}
