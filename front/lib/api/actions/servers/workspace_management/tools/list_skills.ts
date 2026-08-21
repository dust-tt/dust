import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  makeTextLines,
  paginate,
  renderFields,
  renderPageFooter,
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
    kind: "custom" | "global" | "system" | "all";
    includeUsage?: boolean;
    cursor?: number;
    limit?: number;
  },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const skills = await SkillResource.listByWorkspace(auth, {
    status: status ?? "active",
    availability,
    onlyCustom: kind === "custom",
    withInstructions: false,
    withTools: false,
    withFileAttachments: false,
  });

  const filtered =
    kind !== "all" && kind !== "custom"
      ? skills.filter((skill) => skill.kind === kind)
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

  if (total === 0) {
    return new Ok([
      { type: "text" as const, text: `No ${kind} skills found.` },
    ]);
  }

  return new Ok([
    makeTextLines([
      ...page.map((skill) =>
        [
          `${skill.name} [${skill.sId}]`,
          renderFields({
            kind: skill.kind,
            availability: skill.availability,
            status: skill.status,
            canWrite: skill.canWrite(auth),
            agentsUsing: usageBySkillId
              ? usageBySkillId.get(skill.sId)?.count ?? 0
              : null,
          }),
          skill.userFacingDescription,
          skill.agentFacingDescription,
        ]
          .filter(Boolean)
          .join(" — ")
      ),
      renderPageFooter({ shown: page.length, total, nextCursor }),
    ]),
  ]);
}
