import {
  bucketsToArray,
  formatDateFromMillis,
  searchAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";

// Shared aggregation shapes for analytics stored as a nested field on the
// per-message document (tools_used, skills_used, ...): a daily time series of
// executions/unique users, optionally scoped to one value of the nested
// field, and a terms breakdown of that field's distinct values.

export type NestedUsagePoint = {
  timestamp: number;
  date: string;
  uniqueUsers: number;
  executionCount: number;
};

type DateBucket = {
  key: number;
  key_as_string: string;
  doc_count: number;
  nested: {
    doc_count: number;
    unique_users: {
      doc_count: number;
      cardinality: estypes.AggregationsCardinalityAggregate;
    };
  };
};

type UsageAggs = {
  by_date: estypes.AggregationsMultiBucketAggregateBase<DateBucket>;
};

type FilteredDateBucket = {
  key: number;
  key_as_string: string;
  doc_count: number;
  nested: {
    filtered: {
      doc_count: number;
      unique_users: {
        doc_count: number;
        cardinality: estypes.AggregationsCardinalityAggregate;
      };
    };
  };
};

type FilteredUsageAggs = {
  by_date: estypes.AggregationsMultiBucketAggregateBase<FilteredDateBucket>;
};

export async function fetchNestedUsageMetrics(
  baseQuery: estypes.QueryDslQueryContainer,
  {
    nestedPath,
    filterField,
    filterValue,
    timezone = "UTC",
  }: {
    nestedPath: string;
    filterField: string;
    filterValue: string | null;
    timezone?: string;
  }
): Promise<Result<NestedUsagePoint[], Error>> {
  const nestedAggs: Record<string, estypes.AggregationsAggregationContainer> =
    filterValue
      ? {
          filtered: {
            filter: { term: { [filterField]: filterValue } },
            aggs: {
              unique_users: {
                reverse_nested: {},
                aggs: { cardinality: { cardinality: { field: "user_id" } } },
              },
            },
          },
        }
      : {
          unique_users: {
            reverse_nested: {},
            aggs: { cardinality: { cardinality: { field: "user_id" } } },
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
        nested: {
          nested: { path: nestedPath },
          aggs: nestedAggs,
        },
      },
    },
  };

  if (filterValue) {
    const result = await searchAnalytics<never, FilteredUsageAggs>(baseQuery, {
      aggregations: aggs,
      size: 0,
    });

    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }

    const dateBuckets = bucketsToArray<FilteredDateBucket>(
      result.value.aggregations?.by_date?.buckets
    );

    return new Ok(
      dateBuckets.map((bucket) => ({
        timestamp: bucket.key,
        date: formatDateFromMillis(bucket.key, timezone),
        uniqueUsers:
          bucket.nested?.filtered?.unique_users?.cardinality?.value ?? 0,
        executionCount: bucket.nested?.filtered?.doc_count ?? 0,
      }))
    );
  }

  const result = await searchAnalytics<never, UsageAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const dateBuckets = bucketsToArray<DateBucket>(
    result.value.aggregations?.by_date?.buckets
  );

  return new Ok(
    dateBuckets.map((bucket) => ({
      timestamp: bucket.key,
      date: formatDateFromMillis(bucket.key, timezone),
      uniqueUsers: bucket.nested?.unique_users?.cardinality?.value ?? 0,
      executionCount: bucket.nested?.doc_count ?? 0,
    }))
  );
}

export type NestedTermBucket = {
  key: string;
  docCount: number;
};

type TermBucket = { key: string; doc_count: number };

type TermListAggs = {
  nested: {
    by_term: estypes.AggregationsMultiBucketAggregateBase<TermBucket>;
  };
};

export async function fetchNestedTermsBuckets(
  baseQuery: estypes.QueryDslQueryContainer,
  {
    nestedPath,
    field,
    size = 100,
  }: {
    nestedPath: string;
    field: string;
    size?: number;
  }
): Promise<Result<NestedTermBucket[], Error>> {
  const aggs: Record<string, estypes.AggregationsAggregationContainer> = {
    nested: {
      nested: { path: nestedPath },
      aggs: {
        by_term: {
          terms: { field, size, order: { _count: "desc" } },
        },
      },
    },
  };

  const result = await searchAnalytics<never, TermListAggs>(baseQuery, {
    aggregations: aggs,
    size: 0,
  });

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const buckets = bucketsToArray<TermBucket>(
    result.value.aggregations?.nested?.by_term?.buckets
  );

  return new Ok(
    buckets.map((bucket) => ({
      key: bucket.key,
      docCount: bucket.doc_count,
    }))
  );
}
