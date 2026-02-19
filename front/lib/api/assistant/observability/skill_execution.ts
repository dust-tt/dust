import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type SkillExecutionByVersion = {
  version: string;
  skills: Record<string, { count: number }>;
};

export type SkillExecutionBySource = {
  skillName: string;
  sources: Record<string, number>;
};

type TermBucket = {
  key: string;
  doc_count: number;
};

type SkillNameBucket = TermBucket & {
  sources?: estypes.AggregationsMultiBucketAggregateBase<TermBucket>;
};

type VersionBucket = TermBucket & {
  skills?: {
    skill_names?: estypes.AggregationsMultiBucketAggregateBase<TermBucket>;
  };
  first_seen?: estypes.AggregationsMinAggregate;
};

type SkillExecutionAggs = {
  by_version?: estypes.AggregationsMultiBucketAggregateBase<VersionBucket>;
  by_skill_source?: {
    skill_names?: estypes.AggregationsMultiBucketAggregateBase<SkillNameBucket>;
  };
};

export async function fetchSkillExecutionMetrics(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<
  Result<
    {
      byVersion: SkillExecutionByVersion[];
      bySource: SkillExecutionBySource[];
    },
    Error
  >
> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_version: {
      terms: {
        field: "agent_version",
        size: 100,
        order: { first_seen: "asc" },
      },
      aggs: {
        first_seen: {
          min: { field: "timestamp" },
        },
        skills: {
          nested: { path: "skills_used" },
          aggs: {
            skill_names: {
              terms: {
                field: "skills_used.skill_name",
                size: 50,
              },
            },
          },
        },
      },
    },
    by_skill_source: {
      nested: { path: "skills_used" },
      aggs: {
        skill_names: {
          terms: {
            field: "skills_used.skill_name",
            size: 50,
          },
          aggs: {
            sources: {
              terms: { field: "skills_used.source" },
            },
          },
        },
      },
    },
  };

  const result = await searchAnalytics<never, SkillExecutionAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const versionBuckets = bucketsToArray<VersionBucket>(
    result.value.aggregations?.by_version?.buckets
  );

  const byVersion: SkillExecutionByVersion[] = versionBuckets.map((vb) => {
    const skillBuckets = bucketsToArray<TermBucket>(
      vb.skills?.skill_names?.buckets
    );

    const skills: Record<string, { count: number }> = {};
    for (const sb of skillBuckets) {
      skills[sb.key] = { count: sb.doc_count };
    }

    return {
      version: vb.key,
      skills,
    };
  });

  const skillNameBuckets = bucketsToArray<SkillNameBucket>(
    result.value.aggregations?.by_skill_source?.skill_names?.buckets
  );

  const bySource: SkillExecutionBySource[] = skillNameBuckets.map((snb) => {
    const sourceBuckets = bucketsToArray<TermBucket>(snb.sources?.buckets);
    const sources: Record<string, number> = {};
    for (const sb of sourceBuckets) {
      sources[sb.key] = sb.doc_count;
    }

    return {
      skillName: snb.key,
      sources,
    };
  });

  return new Ok({ byVersion, bySource });
}
