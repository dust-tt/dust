import type { estypes } from "@elastic/elasticsearch";

import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type FeedbackDistributionPoint = {
  timestamp: number;
  positive: number;
  negative: number;
};

type ScriptedMetricResultRow = {
  day: string;
  up: number;
  down: number;
};

type FeedbackDistributionAggs = {
  feedback_by_day?: {
    value: ScriptedMetricResultRow[];
  };
};

export async function fetchFeedbackDistribution(
  baseQuery: estypes.QueryDslQueryContainer,
  days: number
): Promise<Result<FeedbackDistributionPoint[], Error>> {
  const aggregations: Record<string, estypes.AggregationsAggregationContainer> =
    {
      feedback_by_day: {
        scripted_metric: {
          init_script: "state.by_day = new HashMap();",
          params: {
            days,
          },
          map_script: `
            def src = params._source;
            if (src == null || !src.containsKey('feedbacks') || src.feedbacks == null) return;

            def cutoffMillis = System.currentTimeMillis() - (params.days * 24L * 60L * 60L * 1000L);

            for (def f : src.feedbacks) {
              def createdAt = ZonedDateTime.parse(f.created_at);
              def feedbackMillis = createdAt.toInstant().toEpochMilli();

              if (feedbackMillis < cutoffMillis) continue;

              def day = createdAt.toLocalDate().toString();

              if (!state.by_day.containsKey(day)) {
                def counters = new HashMap();
                counters.up = 0;
                counters.down = 0;
                state.by_day.put(day, counters);
              }

              def countersForDay = state.by_day.get(day);
              if (f.thumb_direction == 'up') {
                countersForDay.up = countersForDay.up + 1;
              } else if (f.thumb_direction == 'down') {
                countersForDay.down = countersForDay.down + 1;
              }
            }
          `,
          combine_script: "return state.by_day;",
          reduce_script: `
            def merged = new HashMap();

            for (def part : states) {
              if (part == null) continue;
              for (def entry : part.entrySet()) {
                def day = entry.getKey();
                def counts = entry.getValue();

                if (!merged.containsKey(day)) {
                  def init = new HashMap();
                  init.up = 0;
                  init.down = 0;
                  merged.put(day, init);
                }
                def agg = merged.get(day);
                agg.up = agg.up + counts.up;
                agg.down = agg.down + counts.down;
              }
            }

            def keys = new ArrayList(merged.keySet());
            java.util.Collections.sort(keys);

            def out = new ArrayList();
            for (def d : keys) {
              def c = merged.get(d);
              def row = new HashMap();
              row.day = d;
              row.up = c.up;
              row.down = c.down;
              out.add(row);
            }
            return out;
          `,
        },
      },
    };

  const result = await searchAnalytics<never, FeedbackDistributionAggs>(
    baseQuery,
    {
      aggregations,
      size: 0,
    }
  );

  if (result.isErr()) {
    return new Err(new Error(result.error.message));
  }

  const scriptedMetricResult = result.value.aggregations?.feedback_by_day;

  if (!scriptedMetricResult) {
    return new Ok([]);
  }

  const points: FeedbackDistributionPoint[] = scriptedMetricResult.value.map(
    (row) => ({
      timestamp: new Date(row.day).getTime(),
      positive: row.up,
      negative: row.down,
    })
  );

  return new Ok(points);
}
