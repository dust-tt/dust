import logger from "@app/logger/logger";
import { StatsD } from "hot-shots";

let statsDClient: StatsD | undefined = undefined;

function getStatsDClient(): StatsD {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!statsDClient) {
    statsDClient = new StatsD({
      globalTags: process.env.DD_ENTITY_ID
        ? { "dd.internal.entity_tag": process.env.DD_ENTITY_ID }
        : {},
      // Without an errorHandler, hot-shots emits "error" on its dgram socket with no listener
      // attached, which crashes the process on the rare send failure. Metrics are best-effort,
      // so log and move on.
      errorHandler: (err) => {
        logger.warn({ err }, "StatsD send error");
      },
    });
  }
  return statsDClient;
}

// The Datadog agent interprets a client-sent `host:` tag as a hostname override; an empty
// value submits the metric with no host tag at all. Each host multiplies the indexed
// custom-metric count for every tag combination, so dropping it keeps cardinality (and
// Datadog billing) flat as the fleet scales.
const HOSTLESS_TAG = "host:";

interface MetricOptions {
  // Overrides the per-type host-tag default. Distributions drop the host tag by default:
  // they are aggregated server-side, so the host adds cardinality without changing results.
  // Counters, gauges, histograms and timings keep it: they are aggregated per host, and
  // hostless series flushed by different nodes can collide on the same timestamp and lose
  // points. Only opt a counter out of the host tag if sporadic undercounting is acceptable.
  includeHostTag?: boolean;
}

function withHostPolicy(tags: string[], includeHostTag: boolean): string[] {
  return includeHostTag ? tags : [...tags, HOSTLESS_TAG];
}

export const statsDMetrics = {
  increment(
    name: string,
    value: number = 1,
    tags: string[] = [],
    { includeHostTag = true }: MetricOptions = {}
  ): void {
    getStatsDClient().increment(
      name,
      value,
      withHostPolicy(tags, includeHostTag)
    );
  },

  decrement(
    name: string,
    value: number = 1,
    tags: string[] = [],
    { includeHostTag = true }: MetricOptions = {}
  ): void {
    getStatsDClient().decrement(
      name,
      value,
      withHostPolicy(tags, includeHostTag)
    );
  },

  gauge(
    name: string,
    value: number,
    tags: string[] = [],
    { includeHostTag = true }: MetricOptions = {}
  ): void {
    getStatsDClient().gauge(name, value, withHostPolicy(tags, includeHostTag));
  },

  distribution(
    name: string,
    value: number,
    tags: string[] = [],
    { includeHostTag = false }: MetricOptions = {}
  ): void {
    getStatsDClient().distribution(
      name,
      value,
      withHostPolicy(tags, includeHostTag)
    );
  },

  // Prefer distribution() for new timing-style metrics: histograms and timings are
  // aggregated per host by the agent, so they cannot safely drop the host tag.
  histogram(
    name: string,
    value: number,
    tags: string[] = [],
    { includeHostTag = true }: MetricOptions = {}
  ): void {
    getStatsDClient().histogram(
      name,
      value,
      withHostPolicy(tags, includeHostTag)
    );
  },

  timing(
    name: string,
    value: number,
    tags: string[] = [],
    { includeHostTag = true }: MetricOptions = {}
  ): void {
    getStatsDClient().timing(name, value, withHostPolicy(tags, includeHostTag));
  },
};
