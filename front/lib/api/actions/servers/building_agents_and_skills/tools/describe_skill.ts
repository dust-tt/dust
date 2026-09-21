import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { fetchCustomSkillById } from "@app/lib/api/skills/write_access";
import type { Authenticator } from "@app/lib/auth";
import { formatSkillContext } from "@app/lib/reinforcement/format_skill_context";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type DescribeSkillArgs = { skillId: string };

export async function describeSkill(
  auth: Authenticator,
  { skillId }: DescribeSkillArgs
): Promise<
  Result<{ skill: SkillResource; editors: UserResource[] | null }, MCPError>
> {
  const skillResult = await fetchCustomSkillById(
    auth,
    skillId,
    "Only custom workspace skills can be described."
  );
  if (skillResult.isErr()) {
    return new Err(new MCPError(skillResult.error.message));
  }

  const skill = skillResult.value;
  const editors = await skill.listEditors(auth);

  return new Ok({ skill, editors });
}

export async function describeSkillHandler(
  args: DescribeSkillArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await describeSkill(auth, args);
  if (result.isErr()) {
    return result;
  }

  const { skill, editors } = result.value;
  const editorsBlock = editors
    ? `<editors>${editors.map((editor) => editor.sId).join(", ")}</editors>`
    : "";

  return new Ok([
    {
      type: "text" as const,
      text: formatSkillContext(skill.toJSON(auth), "full") + editorsBlock,
    },
  ]);
}
