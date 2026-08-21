import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makeJsonText } from "@app/lib/api/actions/servers/workspace_management/tools/utils";
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

  return new Ok([
    makeJsonText({
      skill: {
        sId: json.sId,
        name: json.name,
        userFacingDescription: json.userFacingDescription,
        agentFacingDescription: json.agentFacingDescription,
        availability: json.availability,
        status: json.status,
        kind: skill.kind,
        icon: json.icon,
        canWrite: json.canWrite,
        tools: json.tools.map((tool) => tool.server.name),
        instructions: json.instructions,
      },
    }),
  ]);
}
