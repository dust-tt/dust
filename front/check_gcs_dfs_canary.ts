import { readFile } from "node:fs/promises";

import config from "@app/lib/api/config";
import { getStatsDClient, statsDMetrics } from "@app/lib/utils/statsd";
import logger from "@app/logger/logger";
import {
  CanaryConfigSchema,
  observeCheck,
  runCanary,
} from "@app/workers/gcs_dfs/canary";
import { frontCanaryProducer } from "@app/workers/gcs_dfs/canary_producer";
import { CanaryTransport } from "@app/workers/gcs_dfs/canary_transport";
import { checkDrift } from "@app/workers/gcs_dfs/drift";
import { metricsObserver } from "@app/workers/gcs_dfs/telemetry";

async function main(): Promise<number> {
  const canary = CanaryConfigSchema.parse(
    JSON.parse(await readFile(config.getGcsDfsCanaryConfigPath(), "utf8"))
  );
  const observer = metricsObserver(canary, "checker");
  const transport = new CanaryTransport(canary);
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    const outcome = await observeCheck(
      "canary_run",
      async () => {
        const drift = await checkDrift(canary, transport, observer);
        controller.signal.throwIfAborted();
        await transport.checkReaders();
        const producer = await frontCanaryProducer(canary.binding);
        const checks = [
          ...drift,
          ...(await runCanary(
            canary,
            producer,
            transport,
            observer,
            metricsObserver(canary, "producer"),
            undefined,
            controller.signal
          )),
        ];
        for (const check of checks) {
          if (check.healthy) {
            logger.info(check, "GCS DFS canary check passed");
          } else {
            logger.error(check, "GCS DFS canary check failed");
          }
        }
        return (
          checks.every((check) => check.healthy) && !controller.signal.aborted
        );
      },
      observer
    );
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
    logger.info(outcome, "GCS DFS canary run completed");
    if (outcome.healthy) {
      statsDMetrics.gauge(
        "gcs_dfs.canary.last_success_unixtime",
        Date.now() / 1000,
        [
          `environment:${canary.environment}`,
          `cell:${canary.cell}`,
          "component:checker",
        ],
        { includeHostTag: false }
      );
    }
    return outcome.healthy ? 0 : 1;
  } finally {
    transport.close();
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
  }
}

void main()
  .catch(() => {
    logger.error(
      "GCS DFS canary failed; check configuration, credentials and front dependencies"
    );
    return 1;
  })
  .then(async (code) => {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 2000);
      getStatsDClient().close(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    process.exit(code);
  });
