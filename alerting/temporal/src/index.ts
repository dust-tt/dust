import assert from "assert";
import axios from "axios";
import { Agent } from "https";
import { z } from "zod";
import * as fs from "fs";
import statsDClient from "hot-shots";

/**
 * This service polls the Temporal Cloud Prometheus endpoint and submits the metrics to Datadog.
 *
 * Code is adapted from https://github.com/temporalio/samples-server/tree/main/cloud/observability/promql-to-dd-ts
 */
const TARGET_METRIC_NAMES = [
  "temporal_cloud_v0_workflow_terminate_count",
  "temporal_cloud_v0_workflow_timeout_count",
  "temporal_cloud_v0_workflow_failed_count",
  "temporal_cloud_v0_workflow_cancel_count",
  "temporal_cloud_v0_frontend_service_error_count",
  "temporal_cloud_v0_resource_exhausted_error_count",
  "temporal_cloud_v0_schedule_buffer_overruns_count",
  "temporal_cloud_v0_schedule_rate_limited_count",
];

const { METRICS_CLIENT_CERT, METRICS_CLIENT_KEY, TEMPORAL_CLOUD_BASE_URL } =
  process.env;

assert(METRICS_CLIENT_CERT, "METRICS_CLIENT_CERT env var is not set.");
assert(METRICS_CLIENT_KEY, "METRICS_CLIENT_KEY env var is not set.");
assert(TEMPORAL_CLOUD_BASE_URL, "TEMPORAL_CLOUD_BASE_URL env var is not set.");

const PROM_LABELS_URL = `${TEMPORAL_CLOUD_BASE_URL}/prometheus/api/v1/label/__name__/values`;
const PROM_QUERY_URL = `${TEMPORAL_CLOUD_BASE_URL}/prometheus/api/v1/query_range`;

// This allows people to do local development on this service without polluting the metrics which
// are critical to ongoing LXB production observability.
const DATADOG_METRIC_PREFIX = process.env.TEST_METRIC_PREFIX || "";

// We're going to query Prometheus with a resolution of 1 minute
const PROMETHEUS_STEP_SECONDS = 60;

// On an ongoing basis, query only for the last 1 minutes of data.
const QUERY_WINDOW_SECONDS = 1 * 60;

const HISTOGRAM_QUANTILES = [0.5, 0.9, 0.95, 0.99];

const statsD = new statsDClient({
  prefix: DATADOG_METRIC_PREFIX,
});

const setTimeoutAsync = async (millis: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, millis));
};

const httpsAgent = new Agent({
  cert: fs.readFileSync(METRICS_CLIENT_CERT),
  key: fs.readFileSync(METRICS_CLIENT_KEY),
});

const basePrometheusQueryParams = {
  step: PROMETHEUS_STEP_SECONDS.toFixed(0),
  format: "json",
};

const labelsResponseDataSchema = z.object({
  status: z.literal("success"),
  data: z.string().array(),
});

const getMetricNames = async (): Promise<{
  countMetricNames: string[];
  histogramMetricNames: string[];
} | void> => {
  const maxRetries = 3;
  const retryDelay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const metricNamesResponse = await axios.get(PROM_LABELS_URL, {
        httpsAgent,
      });
      const { data: metricNames } = labelsResponseDataSchema.parse(
        metricNamesResponse.data
      );

      const countMetricNames = metricNames.filter(
        (metricName) =>
          TARGET_METRIC_NAMES.includes(metricName) &&
          metricName.endsWith("_count")
      );
      const histogramMetricNames = metricNames.filter(
        (metricName) =>
          TARGET_METRIC_NAMES.includes(metricName) &&
          metricName.endsWith("_bucket")
      );

      return { countMetricNames, histogramMetricNames };
    } catch (error) {
      if (attempt === maxRetries) {
        console.log({
          level: "error",
          message: `Error getting metric names from Prometheus after ${maxRetries} attempts`,
          error,
        });
        return; // We give up
      } else {
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
      }
    }
  }
};

const queryResponseDataSchema = z.object({
  status: z.literal("success"),
  data: z.object({
    resultType: z.literal("matrix"),
    result: z
      .object({
        metric: z.record(z.string()),
        values: z.tuple([z.number(), z.string()]).array(),
      })
      .array(),
  }),
});

type MetricData = z.infer<typeof queryResponseDataSchema>["data"];

type QueryWindow = {
  startSecondsSinceEpoch: number;
  endSecondsSinceEpoch: number;
};

const generateQueryWindow = (): QueryWindow => {
  const endSecondsSinceEpoch = Date.now() / 1000;

  const windowInSeconds = QUERY_WINDOW_SECONDS;
  const startSecondsSinceEpoch = endSecondsSinceEpoch - windowInSeconds;
  return alignQueryWindowOnPrometheusStep({
    startSecondsSinceEpoch,
    endSecondsSinceEpoch,
  });
};

// I'm not exactly sure why this is important, but I think that without it, we may inaccurately
// report some metrics.
const alignQueryWindowOnPrometheusStep = (
  queryWindow: QueryWindow
): QueryWindow => {
  const startSecondsSinceEpoch =
    Math.floor(
      queryWindow.startSecondsSinceEpoch / PROMETHEUS_STEP_SECONDS - 1
    ) * PROMETHEUS_STEP_SECONDS;
  const endSecondsSinceEpoch =
    Math.floor(queryWindow.endSecondsSinceEpoch / PROMETHEUS_STEP_SECONDS + 1) *
    PROMETHEUS_STEP_SECONDS;

  return { startSecondsSinceEpoch, endSecondsSinceEpoch };
};

const queryPrometheusCount = async (
  metricName: string,
  queryWindow: QueryWindow
): Promise<MetricData> => {
  try {
    const response = await axios.get(PROM_QUERY_URL, {
      httpsAgent,
      params: {
        ...basePrometheusQueryParams,
        query: `rate(${metricName}[1m])`,
        start: queryWindow.startSecondsSinceEpoch.toFixed(0),
        end: queryWindow.endSecondsSinceEpoch.toFixed(0),
      },
    });
    return queryResponseDataSchema.parse(response.data).data;
  } catch (error) {
    console.log({
      level: "info",
      message: "Error querying prometheus to get count metric",
      error,
    });
    return { resultType: "matrix", result: [] };
  }
};

const convertPrometheusCountToDatadogRateSeries = (
  metricName: string,
  metricData: MetricData
): void => {
  metricData.result.forEach((prometheusMetric) => {
    const metric = metricName.split("_count")[0] + "_rate1m";
    const tags = Object.entries(prometheusMetric.metric)
      .filter(([key]) => key !== "__rollup__")
      .map(([key, value]) => `${key}:${value.substring(0, 200)}`);

    prometheusMetric.values.forEach(([_timestamp, value]) => {
      statsD.increment(metric, parseFloat(value), 1.0, tags);
    });
  });
};

const queryPrometheusHistogram = async (
  metricName: string,
  quantile: number,
  queryWindow: QueryWindow
): Promise<MetricData> => {
  try {
    const response = await axios.get(PROM_QUERY_URL, {
      httpsAgent,
      params: {
        ...basePrometheusQueryParams,
        query: `histogram_quantile(${quantile}, sum(rate(${metricName}[1m])) by (temporal_account,temporal_namespace,operation,le))`,
        start: queryWindow.startSecondsSinceEpoch.toFixed(0),
        end: queryWindow.endSecondsSinceEpoch.toFixed(0),
      },
    });
    return queryResponseDataSchema.parse(response.data).data;
  } catch (error) {
    console.log({
      level: "info",
      message: "Error querying prometheus to get histogram metric",
      error,
    });
    return { resultType: "matrix", result: [] };
  }
};

const convertPrometheusHistogramToDatadogGuageSeries = (
  metricName: string,
  quantile: number,
  metricData: MetricData
): void => {
  metricData.result.forEach((prometheusMetric) => {
    const metric = metricName.split("_bucket")[0] + "_P" + quantile * 100;
    const tags = Object.entries(prometheusMetric.metric)
      .filter(([key]) => key !== "__rollup__")
      // Datadog tags can't be longer than 200 characters
      .map(([key, value]) => `${key}:${value.substring(0, 200)}`);

    prometheusMetric.values.forEach(([_timestamp, value]) => {
      statsD.gauge(metric, parseFloat(value), tags);
    });
  });
};

const main = async () => {
  const metricsName = await getMetricNames();
  if (!metricsName) {
    return;
  }
  const { countMetricNames, histogramMetricNames } = metricsName;

  while (true) {
    const queryWindow = generateQueryWindow();

    statsD.increment("temporal_metrics.collection.start");

    // Process count metrics
    await Promise.all(
      countMetricNames.map(async (metricName) => {
        const data = await queryPrometheusCount(
          metricName,
          generateQueryWindow()
        );
        convertPrometheusCountToDatadogRateSeries(metricName, data);
      })
    );

    // Process histogram metrics
    await Promise.all(
      histogramMetricNames.map(async (metricName) =>
        Promise.all(
          HISTOGRAM_QUANTILES.map(async (quantile) => {
            const data = await queryPrometheusHistogram(
              metricName,
              quantile,
              generateQueryWindow()
            );
            convertPrometheusHistogramToDatadogGuageSeries(
              metricName,
              quantile,
              data
            );
          })
        )
      )
    );

    statsD.increment("temporal_metrics.collection.success");

    await setTimeoutAsync(60 * 1000);
  }
};

// Update error handling to use StatsD
main().catch((error) => {
  statsD.increment("temporal_metrics.collection.error");
  console.error("Error in main loop:", error);
});
