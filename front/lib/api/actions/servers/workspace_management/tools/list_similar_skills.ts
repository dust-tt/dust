import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makeTextLines } from "@app/lib/api/actions/servers/workspace_management/tools/utils";
import { getSimilarSkills } from "@app/lib/api/skills/existing_skill_checker";
import { Err, Ok } from "@app/types/shared/result";

export async function listSimilarSkills(
  { description }: { description: string },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await getSimilarSkills(auth, {
    naturalDescription: description,
    excludeSkillId: null,
  });
  if (result.isErr()) {
    return new Err(
      new MCPError(`Failed to list similar skills: ${result.error.message}`)
    );
  }

  const { similar_skills } = result.value;
  if (similar_skills.length === 0) {
    return new Ok([
      { type: "text" as const, text: "No similar skills found." },
    ]);
  }

  return new Ok([makeTextLines(similar_skills)]);
}
