import type { estypes } from "@elastic/elasticsearch";

const DEFAULT_METRIC_VALUE = 0;
export const MISSING_CONFIG_NAME = "__no_config__";

type TermBucket = {
  key: string;
  doc_count: number;
};

export type ConfigBucket = TermBucket;

export function buildConfigBreakdown(
  buckets?: estypes.AggregationsMultiBucketAggregateBase<ConfigBucket>
): Record<string, number> {
  const configBuckets = (buckets?.buckets ?? []) as ConfigBucket[];

  return configBuckets.reduce<Record<string, number>>((acc, cb) => {
    const sid = cb.key;
    if (sid && sid !== MISSING_CONFIG_NAME) {
      acc[sid] = (acc[sid] ?? 0) + (cb.doc_count ?? DEFAULT_METRIC_VALUE);
    }
    return acc;
  }, {});
}
