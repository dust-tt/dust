import { fetchUsedSkills } from "@app/lib/api/assistant/observability/skill_usage";
import { formatDateFromMillis } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";

export const SKILL_EXPORT_HEADERS = [
  "skillId",
  "name",
  "description",
  "editedByEmail",
  "createdAt",
  "lastEdit",
] as const;

export type SkillExportRow = Record<
  (typeof SKILL_EXPORT_HEADERS)[number],
  string
>;

export async function fetchSkillExportRows(
  auth: Authenticator,
  baseQuery: estypes.QueryDslQueryContainer,
  timezone: string
): Promise<Result<SkillExportRow[], Error>> {
  const customSkills = await SkillResource.listByWorkspace(auth, {
    status: "active",
    onlyCustom: true,
    withInstructions: false,
    withTools: false,
  });

  const editorModelIds = [
    ...new Set(removeNulls(customSkills.map((skill) => skill.editedBy))),
  ];
  const editors =
    editorModelIds.length > 0
      ? await UserResource.fetchByModelIds(editorModelIds)
      : [];
  const emailByEditorModelId = new Map(
    editors.map((editor) => [editor.id, editor.email])
  );

  const rows: SkillExportRow[] = customSkills.map((skill) => {
    return {
      skillId: skill.sId,
      name: skill.name,
      description: skill.agentFacingDescription,
      editedByEmail:
        skill.editedBy !== null
          ? (emailByEditorModelId.get(skill.editedBy) ?? "")
          : "",
      createdAt: formatDateFromMillis(skill.createdAt.getTime(), timezone),
      lastEdit: formatDateFromMillis(skill.updatedAt.getTime(), timezone),
    };
  });

  const usedSkillsResult = await fetchUsedSkills(baseQuery);
  if (usedSkillsResult.isErr()) {
    return new Err(usedSkillsResult.error);
  }

  const globalSkillIds = usedSkillsResult.value.filter(
    (skillId) => !isResourceSId("skill", skillId)
  );

  if (globalSkillIds.length > 0) {
    const globalSkills = await SkillResource.fetchByIds(auth, globalSkillIds);
    for (const skill of globalSkills) {
      rows.push({
        skillId: skill.sId,
        name: skill.name,
        description: skill.agentFacingDescription,
        editedByEmail: "",
        createdAt: "",
        lastEdit: "",
      });
    }
  }

  return new Ok(rows.sort((a, b) => a.name.localeCompare(b.name)));
}
