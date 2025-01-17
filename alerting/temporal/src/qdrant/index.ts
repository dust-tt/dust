import assert from "assert";
import axios from "axios";
import { StatsD } from "hot-shots";

const { QDRANT_NODES, QDRANT_MONITORING_API_KEY } = process.env;

assert(QDRANT_NODES, "QDRANT_NODES is not set.");
assert(QDRANT_MONITORING_API_KEY, "QDRANT_MONITORING_API_KEY is not set.");

const QDRANT_METRICS_TO_WATCH: Record<
  "count_metrics" | "gauge_metrics",
  ReadonlyArray<String>
> = {
  count_metrics: [
    "app_info",
    "grpc_responses_total",
    "grpc_responses_fail_total",
  ],
  gauge_metrics: [
    "cluster_peers_total",
    "collections_total",
    "collections_vector_total",
    "cluster_pending_operations_total",
    "grpc_responses_avg_duration_seconds",
    "grpc_responses_max_duration_seconds",
    "grpc_responses_min_duration_seconds",
    "rest_responses_avg_duration_seconds",
    "rest_responses_max_duration_seconds",
    "rest_responses_min_duration_seconds",
  ],
};

const qdrantClusters = QDRANT_NODES.split(",");
const statsClient = new StatsD();

// Example: "https://node-3-xyz123abc-456-789-xyz-cloud.example.com:6333".
const NODE_AND_CLUSTER_REGEXP = /https:\/\/(node-\d+)-(.+)\:\d+/;

/**
 * Logic to extract valuable information from Prometheus metrics.
 */

// Example: "grpc_responses_max_duration_seconds{endpoint="/qdrant.Points/Search"} 3.701747".
// Support nested curly braces in labels.
const prometheusMetricsRegexp =
  /(\w+)(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\})? (\d+(?:\.\d+)?)/;
const supportedPrometheusLabels = [
  "endpoint",
  "le",
  "method",
  "status",
] as const;
type SupportedPrometheusLabels = (typeof supportedPrometheusLabels)[number];

function isSupportedPrometheusLabel(
  label: string
): label is SupportedPrometheusLabels {
  return supportedPrometheusLabels.includes(label as SupportedPrometheusLabels);
}

function extractMetricDetails(line: string) {
  const match = line.match(prometheusMetricsRegexp);
  if (match) {
    const name = match[1];

    // Labels are optional.
    const labels =
      match[2]?.split(",").reduce((acc, label) => {
        const [key, value] = label.split("=");
        if (isSupportedPrometheusLabel(key)) {
          acc[key] = value.replace(/"/g, "");
        }
        return acc;
      }, {} as { [key: string]: string }) ?? {};

    const value = match[3];

    return { name, labels, value };
  }

  return null;
}

function formatMetricName(rawMetricName: string) {
  return `qdrant.${rawMetricName.replace("_", ".")}`;
}

async function fetchPrometheusMetrics(clusterNodeUrl: string): Promise<void> {
  const found = clusterNodeUrl.match(NODE_AND_CLUSTER_REGEXP);
  if (!found) {
    console.error(`Invalid node url ${clusterNodeUrl} -- skipping`);
    return;
  }

  const [, node, clusterName] = found;

  try {
    const response = await axios.get(`${clusterNodeUrl}/metrics`, {
      headers: {
        "api-key": QDRANT_MONITORING_API_KEY,
      },
    });

    const metricLines: string[] = response.data
      .trim()
      .split("\n")
      // Ignore comments.
      .filter((l: string) => !l.startsWith("#"));

    const tags = [
      `cluster:${clusterName}`,
      `node:${node}`,
      `region:${process.env.DUST_REGION}`,
    ];

    for (const metric of metricLines) {
      const metricDetails = extractMetricDetails(metric);
      if (!metricDetails) {
        console.error(`Could not parse metric (${metric}) -- skipping.`);
        continue;
      }

      const { name, labels, value } = metricDetails;
      const metricName = formatMetricName(name);
      const metricTags = [
        ...tags,
        ...Object.entries(labels).map(([key, value]) => `${key}:${value}`),
      ];

      if (QDRANT_METRICS_TO_WATCH.gauge_metrics.includes(name)) {
        statsClient.gauge(metricName, parseFloat(value), metricTags);
      } else if (QDRANT_METRICS_TO_WATCH.count_metrics.includes(name)) {
        statsClient.increment(metricName, parseInt(value), metricTags);
      }
    }
  } catch (error) {
    console.error("Error fetching Prometheus metrics:", error);
  }
}

export async function collectMetricsFromQdrant() {
  for (const clusterNodeUrl of qdrantClusters) {
    await fetchPrometheusMetrics(clusterNodeUrl);
  }
}
