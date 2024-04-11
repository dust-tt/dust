import axios from "axios";

import { client, v2 } from "@datadog/datadog-api-client";
import assert from "assert";

const { QDRANT_CLUSTERS, QDRANT_MONITORING_API_KEY } = process.env;

assert(QDRANT_CLUSTERS, "QDRANT_CLUSTERS is not set.");
assert(QDRANT_MONITORING_API_KEY, "QDRANT_MONITORING_API_KEY is not set.");

// This automatically pulls API keys from env vars DD_API_KEY.
const configuration = client.createConfiguration();

configuration.setServerVariables({
  site: "datadoghq.eu", // We're using the EU site for Datadog.
});

const datadogMetricsApi = new v2.MetricsApi(configuration);
const qdrantClusters = QDRANT_CLUSTERS.split(",");

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

      if (metricName === "collections_total") {
        metrics.push({
          metric: `qdrant.${metricName.replace("_", ".")}`,
          points: [
            {
              timestamp: Date.now(),
              value: parseFloat(metricValue),
            },
          ],
          tags: ["qdrant", `cluster:${clusterName}`],
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
