import {
  bucketsToArray,
  formatUTCDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

export type SkillUsagePoint = {
  timestamp: number;
  date: string;
  uniqueUsers: number;
  executionCount: number;
};

export type AvailableSkill = {
  skillName: string;
  totalExecutions: number;
};

type DateBucket = {
  key: number;
  key_as_string: string;
  doc_count: number;
  skills_nested: {
    doc_count: number;
    unique_users: {
      doc_count: number;
      cardinality: estypes.AggregationsCardinalityAggregate;
    };
  };
};

type SkillUsageAggs = {
  by_date: estypes.AggregationsMultiBucketAggregateBase<DateBucket>;
};

type FilteredDateBucket = {
  key: number;
  key_as_string: string;
  doc_count: number;
  skills_nested: {
    filtered: {
      doc_count: number;
      unique_users: {
        doc_count: number;
        cardinality: estypes.AggregationsCardinalityAggregate;
      };
    };
  };
};

type FilteredSkillUsageAggs = {
  by_date: estypes.AggregationsMultiBucketAggregateBase<FilteredDateBucket>;
};

type SkillBucket = {
  key: string;
  doc_count: number;
};

type SkillListAggs = {
  skills_nested: {
    by_skill: estypes.AggregationsMultiBucketAggregateBase<SkillBucket>;
  };
};

function bucketToPoint(bucket: DateBucket): SkillUsagePoint {
  return {
    timestamp: bucket.key,
    date: formatUTCDateFromMillis(bucket.key),
    uniqueUsers: bucket.skills_nested?.unique_users?.cardinality?.value ?? 0,
    executionCount: bucket.skills_nested?.doc_count ?? 0,
  };
}

function filteredBucketToPoint(bucket: FilteredDateBucket): SkillUsagePoint {
  return {
    timestamp: bucket.key,
    date: formatUTCDateFromMillis(bucket.key),
    uniqueUsers:
      bucket.skills_nested?.filtered?.unique_users?.cardinality?.value ?? 0,
    executionCount: bucket.skills_nested?.filtered?.doc_count ?? 0,
  };
}

export async function fetchSkillUsageMetrics(
  baseQuery: estypes.QueryDslQueryContainer,
  skillName: string | null,
  timezone: string = "UTC"
): Promise<Result<SkillUsagePoint[], Error>> {
  const nestedAggs: Record<string, estypes.AggregationsAggregationContainer> =
    skillName
      ? {
          filtered: {
            filter: { term: { "skills_used.skill_name": skillName } },
            aggs: {
              unique_users: {
                reverse_nested: {},
                aggs: {
                  cardinality: {
                    cardinality: { field: "user_id" },
                  },
                },
              },
            },
          },
        }
      : {
          unique_users: {
            reverse_nested: {},
            aggs: {
              cardinality: {
                cardinality: { field: "user_id" },
              },
            },
          },
        };

  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    by_date: {
      date_histogram: {
        field: "timestamp",
        calendar_interval: "day",
        time_zone: timezone,
      },
      aggs: {
        skills_nested: {
          nested: { path: "skills_used" },
          aggs: nestedAggs,
        },
      },
    },
  };

  if (skillName) {
    const result = await searchAnalytics<never, FilteredSkillUsageAggs>(
      baseQuery,
      { aggregations: aggs, size: 0 }
    );

    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }

    const dateBuckets = bucketsToArray<FilteredDateBucket>(
      result.value.aggregations?.by_date?.buckets
    );

    return new Ok(dateBuckets.map((b) => filteredBucketToPoint(b)));
  }

  const result = await searchAnalytics<never, SkillUsageAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const dateBuckets = bucketsToArray<DateBucket>(
    result.value.aggregations?.by_date?.buckets
  );

  return new Ok(dateBuckets.map((b) => bucketToPoint(b)));
}

export async function fetchAvailableSkills(
  baseQuery: estypes.QueryDslQueryContainer
): Promise<Result<AvailableSkill[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    skills_nested: {
      nested: { path: "skills_used" },
      aggs: {
        by_skill: {
          terms: {
            field: "skills_used.skill_name",
            size: 100,
            order: { _count: "desc" },
          },
        },
      },
    },
  };

  const result = await searchAnalytics<never, SkillListAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const skillBuckets = bucketsToArray<SkillBucket>(
    result.value.aggregations?.skills_nested?.by_skill?.buckets
  );

  const skills: AvailableSkill[] = skillBuckets.map((bucket) => ({
    skillName: bucket.key,
    totalExecutions: bucket.doc_count,
  }));

  return new Ok(skills);
}
