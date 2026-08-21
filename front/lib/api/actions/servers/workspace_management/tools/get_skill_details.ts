import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  makeTextLines,
  renderFields,
} from "@app/lib/api/actions/servers/workspace_management/tools/utils";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { Ok } from "@app/types/shared/result";

export async function getSkillDetails(
  { skillId }: { skillId: string },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const skill = await SkillResource.fetchById(auth, skillId);
  if (!skill) {
    return new Ok([
      {
        type: "text" as const,
        text:
          `No skill found with id ${skillId} (it may be archived or not ` +
          "accessible).",
      },
    ]);
  }

  // `toJSON` is what decides whether a code-defined skill exposes its instructions.
  const json = skill.toJSON(auth);

  const toolNames = json.tools.map((tool) => tool.server.name).join(", ");

  return new Ok([
    makeTextLines([
      `Skill ${json.name} [${json.sId}]`,
      renderFields({
        kind: skill.kind,
        availability: json.availability,
        status: json.status,
        icon: json.icon,
        canWrite: json.canWrite,
      }),
      `- For users: ${json.userFacingDescription}`,
      `- For agents: ${json.agentFacingDescription}`,
      `- Tools: ${toolNames || "none"}`,
      "",
      "Instructions:",
      json.instructions ?? "(not exposed for this skill)",
    ]),
  ]);
}
