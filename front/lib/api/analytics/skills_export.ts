import { CONSUMPTION_DIMENSION_FIELDS } from "@app/lib/api/analytics/consumption/scope";
import {
  bucketsToArray,
  formatDateFromMillis,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { removeNulls } from "@app/types/shared/utils/general";
import type { estypes } from "@elastic/elasticsearch";

type UsedSkillBucket = {
  key: string;
  doc_count: number;
};

type UsedSkillsAggs = {
  by_skill_id?: estypes.AggregationsMultiBucketAggregateBase<UsedSkillBucket>;
};

// Upper bound on the number of distinct skills a workspace can have used in
// the period; large enough that no real workspace hits it.
const MAX_USED_SKILL_IDS = 1_000;

// Skill attribution is a flat, multi-valued field on the consumption index
// (unlike the old index's nested `skills_used` array), so a plain terms
// aggregation is enough to list which skills saw any activity in the period.
async function fetchUsedConsumptionSkillIds(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<string[], Error>> {
  const result = await searchConsumptionAnalytics<never, UsedSkillsAggs>(
    baseQuery,
    {
      aggregations: {
        by_skill_id: {
          terms: {
            field: CONSUMPTION_DIMENSION_FIELDS.skill,
            size: MAX_USED_SKILL_IDS,
          },
        },
      },
      size: 0,
    }
  );

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const buckets = bucketsToArray<UsedSkillBucket>(
    result.value.aggregations?.by_skill_id?.buckets
  );

  return new Ok(buckets.map((b) => String(b.key)));
}

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
  const activeCustomSkills = await SkillResource.listByWorkspace(auth, {
    status: "active",
    onlyCustom: true,
    withInstructions: false,
    withTools: false,
    withFileAttachments: false,
  });

  const usedSkillsResult = await fetchUsedConsumptionSkillIds(baseQuery);
  if (usedSkillsResult.isErr()) {
    return new Err(usedSkillsResult.error);
  }

  const activeCustomSkillIds = new Set(
    activeCustomSkills.map((skill) => skill.sId)
  );
  const usedButNotActiveIds = usedSkillsResult.value.filter(
    (skillId) => !activeCustomSkillIds.has(skillId)
  );
  const rehydratedSkills =
    usedButNotActiveIds.length > 0
      ? await SkillResource.fetchByIds(auth, usedButNotActiveIds)
      : [];

  const allSkills = [...activeCustomSkills, ...rehydratedSkills];

  const editorModelIds = [
    ...new Set(removeNulls(allSkills.map((skill) => skill.editedBy))),
  ];
  const editors =
    editorModelIds.length > 0
      ? await UserResource.fetchByModelIds(editorModelIds)
      : [];
  const emailByEditorModelId = new Map(
    editors.map((editor) => [editor.id, editor.email])
  );

  const rows = allSkills.map<SkillExportRow>((skill) => {
    const isGlobal = !isResourceSId("skill", skill.sId);
    return {
      skillId: skill.sId,
      name: skill.name,
      description: skill.agentFacingDescription,
      editedByEmail:
        !isGlobal && skill.editedBy !== null
          ? (emailByEditorModelId.get(skill.editedBy) ?? "")
          : "",
      createdAt: isGlobal
        ? ""
        : formatDateFromMillis(skill.createdAt.getTime(), timezone),
      lastEdit: isGlobal
        ? ""
        : formatDateFromMillis(skill.updatedAt.getTime(), timezone),
    };
  });

  return new Ok(rows.sort((a, b) => a.name.localeCompare(b.name)));
}
