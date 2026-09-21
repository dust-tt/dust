import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { Authenticator } from "@app/lib/auth";
import { formatSkillContext } from "@app/lib/reinforcement/format_skill_context";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type DescribeSkillArgs = { skillId: string };

/**
 * @cc [owner:avervaet,label:security] read-gated-by-fetch
 * `skillId` MUST resolve to a skill the caller can read. This relies on `SkillResource.fetchById`
 * defaulting to `"strict"` permission filtering, which returns `null` for a skill the caller
 * cannot read; this function MUST NOT pass a `permissionFiltering` override that weakens that
 * check.
 */
export async function describeSkill(
  auth: Authenticator,
  { skillId }: DescribeSkillArgs
): Promise<
  Result<{ skill: SkillResource; editors: UserResource[] | null }, MCPError>
> {
  if (!isResourceSId("skill", skillId)) {
    return new Err(
      new MCPError("Only custom workspace skills can be described.")
    );
  }

  const skill = await SkillResource.fetchById(auth, skillId);
  if (!skill) {
    return new Err(new MCPError("Skill not found."));
  }

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
