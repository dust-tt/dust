import axios from "axios";

import { client, v2 } from "@datadog/datadog-api-client";
import assert from "assert";
import {
  COUNT,
  GAUGE,
} from "@datadog/datadog-api-client/dist/packages/datadog-api-client-v2/models/MetricIntakeType";

const { QDRANT_CLUSTERS, QDRANT_MONITORING_API_KEY } = process.env;

assert(QDRANT_CLUSTERS, "QDRANT_CLUSTERS is not set.");
assert(QDRANT_MONITORING_API_KEY, "QDRANT_MONITORING_API_KEY is not set.");

const QDRANT_METRICS_TO_WATCH: Record<
  "count_metrics" | "gauge_metrics",
  ReadonlyArray<String>
> = {
  count_metrics: ["app_info"],
  gauge_metrics: [
    "cluster_peers_total",
    "collections_total",
    "collections_vector_total",
    "grpc_responses_avg_duration_seconds",
    "grpc_responses_fail_total",
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
const qdrantClusters = QDRANT_CLUSTERS.split(",");

function formatMetricName(rawMetricName: string) {
  return `qdrant.${rawMetricName.replace("_", ".")}`;
}

async function fetchPrometheusMetrics(
  clusterName: string
): Promise<v2.MetricSeries[]> {
  const metrics: v2.MetricSeries[] = [];

  try {
    const response = await axios.get(`${clusterName}:6333/metrics`, {
      headers: {
        "api-key": QDRANT_MONITORING_API_KEY,
      },
    });
    const metricLines: string[] = response.data.trim().split("\n");

    // Parse and update metric values.
    metricLines.forEach((line) => {
      const [metricName, metricValue] = line.split(" ");

      const timestamp = Math.floor(Date.now() / 1000);

      if (QDRANT_METRICS_TO_WATCH.gauge_metrics.includes(metricName)) {
        metrics.push({
          metric: formatMetricName(metricName),
          points: [
            {
              timestamp,
              value: parseFloat(metricValue),
            },
          ],
          tags: ["resource:qdrant", `cluster:${clusterName}`],
          type: GAUGE,
        });
      } else if (QDRANT_METRICS_TO_WATCH.count_metrics.includes(metricName)) {
        metrics.push({
          metric: formatMetricName(metricName),
          points: [
            {
              timestamp,
              value: parseInt(metricValue),
            },
          ],
          tags: ["resource:qdrant", `cluster:${clusterName}`],
          type: COUNT,
        });
      }
    });
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
  for (const clusterName of qdrantClusters) {
    const metricsForCluster = await fetchPrometheusMetrics(clusterName);

    await sendMetricsToDatadog(metricsForCluster);
  }
}
