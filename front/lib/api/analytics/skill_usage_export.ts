import {
  CARDINALITY_PRECISION_THRESHOLD,
  COMPLETED_AT_FIELD,
  CONSUMPTION_DIMENSION_FIELDS,
  MAX_EXPORT_TERMS_SIZE,
} from "@app/lib/api/analytics/consumption/scope";
import {
  bucketsToArray,
  formatDateFromMillis,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

type SkillDateBucket = {
  key: number;
  doc_count: number;
  unique_users?: estypes.AggregationsCardinalityAggregate;
};

type SkillBucket = {
  key: string;
  doc_count: number;
  by_date?: estypes.AggregationsMultiBucketAggregateBase<SkillDateBucket>;
};

type SkillUsageExportAggs = {
  by_skill?: estypes.AggregationsMultiBucketAggregateBase<SkillBucket>;
};

export interface SkillUsageExportRow {
  date: string;
  skillName: string;
  executions: number;
  uniqueUsers: number;
}

/**
 * Skill attribution is a flat, multi-valued field on the consumption index
 * (unlike the old index's nested `skills_used` array, which stored the
 * skill's name directly): a tool call can be attributed to several skills at
 * once, and only the skill id is available, so the display name has to be
 * resolved separately via SkillResource.
 */
export async function fetchSkillUsageExportRows(
  auth: Authenticator,
  baseQuery: estypes.QueryDslQueryContainer,
  timezone: string
): Promise<Result<SkillUsageExportRow[], Error>> {
  const result = await searchConsumptionAnalytics<never, SkillUsageExportAggs>(
    baseQuery,
    {
      aggregations: {
        by_skill: {
          terms: {
            field: CONSUMPTION_DIMENSION_FIELDS.skill,
            size: MAX_EXPORT_TERMS_SIZE,
          },
          aggs: {
            by_date: {
              date_histogram: {
                field: COMPLETED_AT_FIELD,
                calendar_interval: "day",
                time_zone: timezone,
              },
              aggs: {
                unique_users: {
                  cardinality: {
                    field: CONSUMPTION_DIMENSION_FIELDS.user,
                    precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
                  },
                },
              },
            },
          },
        },
      },
      size: 0,
    }
  );

  if (result.isErr()) {
    return result;
  }

  const skillBuckets = bucketsToArray<SkillBucket>(
    result.value.aggregations?.by_skill?.buckets
  );

  const skillIds = skillBuckets.map((b) => String(b.key));
  const skills =
    skillIds.length > 0 ? await SkillResource.fetchByIds(auth, skillIds) : [];
  const nameBySkillId = new Map(skills.map((skill) => [skill.sId, skill.name]));

  const rows: SkillUsageExportRow[] = skillBuckets.flatMap((skillBucket) => {
    const skillId = String(skillBucket.key);
    const skillName = nameBySkillId.get(skillId) ?? skillId;
    const dateBuckets = bucketsToArray<SkillDateBucket>(
      skillBucket.by_date?.buckets
    );
    return dateBuckets.map((dateBucket) => ({
      date: formatDateFromMillis(dateBucket.key, timezone),
      skillName,
      executions: dateBucket.doc_count,
      uniqueUsers: Math.round(dateBucket.unique_users?.value ?? 0),
    }));
  });

  rows.sort((a, b) => {
    const dateCompare = a.date.localeCompare(b.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    return a.skillName.localeCompare(b.skillName);
  });

  return new Ok(rows);
}
