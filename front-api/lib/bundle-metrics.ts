const BUNDLE_SIZE_METRIC = "dust.build.bundle.size_bytes";
const DATADOG_METRICS_URL = "https://api.datadoghq.eu/api/v2/series";
const DATADOG_REQUEST_TIMEOUT_MS = 5_000;
const DATADOG_GAUGE_TYPE = 3;

export interface BundleSize {
  name: string;
  bytes: number;
}

interface BundleMetricsConfig {
  apiKey: string;
  service: string;
}

function bundleMetricsConfig(
  env: NodeJS.ProcessEnv
): BundleMetricsConfig | null {
  if (env.REPORT_BUNDLE_METRICS !== "true") {
    return null;
  }

  const apiKey = env.DATADOG_API_KEY?.trim();
  const service = env.NEXT_PUBLIC_DATADOG_SERVICE?.trim();
  if (!apiKey || !service) {
    console.warn(
      "Bundle metrics enabled without DATADOG_API_KEY or NEXT_PUBLIC_DATADOG_SERVICE; skipping submission."
    );
    return null;
  }

  return { apiKey, service: `${service}-api` };
}

export async function reportBundleSizes({
  bundleSizes,
  env = process.env,
}: {
  bundleSizes: BundleSize[];
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const config = bundleMetricsConfig(env);
  if (!config) {
    return;
  }

  const timestamp = Math.floor(Date.now() / 1_000);
  try {
    const response = await fetch(DATADOG_METRICS_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "DD-API-KEY": config.apiKey,
      },
      body: JSON.stringify({
        series: bundleSizes.map(({ name, bytes }) => ({
          metric: BUNDLE_SIZE_METRIC,
          type: DATADOG_GAUGE_TYPE,
          points: [{ timestamp, value: bytes }],
          tags: [`service:${config.service}`, `bundle:${name}`],
        })),
      }),
      signal: AbortSignal.timeout(DATADOG_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(
        `Datadog rejected bundle metrics with HTTP ${response.status}.`
      );
    } else {
      console.log(`Reported ${bundleSizes.length} bundle sizes to Datadog.`);
    }
  } catch (error) {
    console.warn("Failed to submit bundle metrics to Datadog.", error);
  }
}
