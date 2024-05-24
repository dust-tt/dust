import axios from "axios";

import { client, v2 } from "@datadog/datadog-api-client";
import assert from "assert";
import {
  COUNT,
  GAUGE,
} from "@datadog/datadog-api-client/dist/packages/datadog-api-client-v2/models/MetricIntakeType";

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

// This automatically pulls API keys from env vars DD_API_KEY.
const configuration = client.createConfiguration();

configuration.setServerVariables({
  site: "datadoghq.eu", // We're using the EU site for Datadog.
});

const datadogMetricsApi = new v2.MetricsApi(configuration);
const qdrantClusters = QDRANT_NODES.split(",");

// Example: "https://node-3-xyz123abc-456-789-xyz-cloud.example.com:6333".
const NODE_AND_CLUSTER_REGEXP = /https:\/\/(node-\d+)-(.+)\:\d+/;

/**
 * Logic to extract valuable information from Prometheus metrics.
 */

// Example: "grpc_responses_max_duration_seconds{endpoint="/qdrant.Points/Search"} 3.701747".
const prometheusMetricsRegexp = /(\w+)\{([^}]*)\} (\d+(\.\d+)?)/;
const supportedPrometheusLabels = ["endpoint", "le"] as const;
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
    const labels = match[2].split(",").reduce((acc, label) => {
      const [key, value] = label.split("=");
      if (isSupportedPrometheusLabel(key)) {
        acc[key] = value.replace(/"/g, "");
      }
      return acc;
    }, {} as { [key: string]: string });
    const value = match[3];

    return { name, labels, value };
  }
  return null;
}

function formatMetricName(rawMetricName: string) {
  return `qdrant.${rawMetricName.replace("_", ".")}`;
}

async function fetchPrometheusMetrics(
  clusterNodeUrl: string
): Promise<v2.MetricSeries[]> {
  const metrics: v2.MetricSeries[] = [];

  const found = clusterNodeUrl.match(NODE_AND_CLUSTER_REGEXP);
  if (!found) {
    console.error(`Invalid node url ${clusterNodeUrl} -- skipping`);

    return [];
  }

  const [, node, clusterName] = found;

  try {
    const response = await axios.get(`${clusterNodeUrl}/metrics`, {
      headers: {
        "api-key": QDRANT_MONITORING_API_KEY,
      },
    });

    const metricLines: string[] = response.data.trim().split("\n");
    // Create a single timestamp for all Prometheus metrics retrievals to ensure histogram consistency.
    const timestamp = Math.floor(Date.now() / 1000);
    const clusterTags = [
      "resource:qdrant",
      `cluster:${clusterName}`,
      `node:${node}`,
    ];

    for (const metric of metricLines) {
      const metricDetails = extractMetricDetails(metric);
      if (!metricDetails) {
        console.error(`Could not parse metric (${metric}) -- skipping.`);
        continue;
      }

      const { name, labels, value } = metricDetails;

      const metricName = formatMetricName(name);
      const metricTags: Array<string> = [
        ...clusterTags,
        ...Object.entries(labels).map(([key, value]) => `${key}:${value}`),
      ];

      // Use the raw metric name to determine if it should be reported.
      if (QDRANT_METRICS_TO_WATCH.gauge_metrics.includes(name)) {
        metrics.push({
          metric: metricName,
          points: [
            {
              timestamp,
              value: parseFloat(value),
            },
          ],
          tags: metricTags,
          type: GAUGE,
        });
      } else if (QDRANT_METRICS_TO_WATCH.count_metrics.includes(name)) {
        metrics.push({
          metric: metricName,
          points: [
            {
              timestamp,
              value: parseInt(value),
            },
          ],
          tags: metricTags,
          type: COUNT,
        });
      }
    }
  } catch (error) {
    console.error("Error fetching Prometheus metrics:", error);
  }

  return metrics;
}

// Send metrics to Datadog.
async function sendMetricsToDatadog(metrics: v2.MetricSeries[]) {
  try {
    await datadogMetricsApi.submitMetrics({ body: { series: metrics } });
  } catch (error) {
    console.error("Error sending metrics to Datadog:", error);
  }
}

export async function collectMetricsFromQdrant() {
  for (const clusterNodeUrl of qdrantClusters) {
    const metricsForCluster = await fetchPrometheusMetrics(clusterNodeUrl);

    if (metricsForCluster.length > 0) {
      await sendMetricsToDatadog(metricsForCluster);
    }
  }
}
