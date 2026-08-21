import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  makeJsonText,
  paginate,
} from "@app/lib/api/actions/servers/workspace_management/tools/utils";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type {
  SkillAvailability,
  SkillStatus,
} from "@app/types/assistant/skill_configuration";
import { Err, Ok } from "@app/types/shared/result";

export async function listSkills(
  {
    availability,
    status,
    kind,
    includeUsage,
    cursor,
    limit,
  }: {
    availability?: SkillAvailability[];
    status?: SkillStatus;
    kind?: "custom" | "global" | "system" | "all";
    includeUsage?: boolean;
    cursor?: number;
    limit?: number;
  },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const resolvedKind = kind ?? "custom";

  const skills = await SkillResource.listByWorkspace(auth, {
    status: status ?? "active",
    availability,
    onlyCustom: resolvedKind === "custom",
    withInstructions: false,
    withTools: false,
    withFileAttachments: false,
  });

  const filtered =
    resolvedKind !== "all" && resolvedKind !== "custom"
      ? skills.filter((skill) => skill.kind === resolvedKind)
      : skills;

  const sorted = [...filtered].sort(
    (a, b) => a.name.localeCompare(b.name) || a.sId.localeCompare(b.sId)
  );

  const paginated = paginate(sorted, { cursor, limit });
  if (paginated.isErr()) {
    return new Err(paginated.error);
  }
  const { page, total, nextCursor } = paginated.value;

  // Usage is only fetched for the current page, and in a single batched query.
  const usageBySkillId = includeUsage
    ? await SkillResource.batchFetchUsage(auth, page)
    : null;

  return new Ok([
    makeJsonText({
      total,
      nextCursor,
      skills: page.map((skill) => ({
        sId: skill.sId,
        name: skill.name,
        userFacingDescription: skill.userFacingDescription,
        agentFacingDescription: skill.agentFacingDescription,
        availability: skill.availability,
        status: skill.status,
        kind: skill.kind,
        canWrite: skill.canWrite(auth),
        ...(usageBySkillId
          ? { agentsUsingCount: usageBySkillId.get(skill.sId)?.count ?? 0 }
          : {}),
      })),
    }),
  ]);
}
