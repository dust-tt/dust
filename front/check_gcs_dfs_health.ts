import { readFile } from "node:fs/promises";
import { z } from "zod";

import logger from "@app/logger/logger";
import {
  HealthConfigSchema,
  runHealthChecks,
} from "@app/workers/gcs_dfs/health";
import { GoogleHealthTransport } from "@app/workers/gcs_dfs/health_transport";
import { ConfigSchema } from "@app/workers/gcs_dfs/protocol";
import { DfsProjection } from "@app/workers/gcs_dfs/transport";

async function main() {
  const [workerPath, healthPath] = z
    .tuple([z.string().min(1), z.string().min(1)])
    .parse(process.argv.slice(2));
  const worker = ConfigSchema.parse(
    JSON.parse(await readFile(workerPath, "utf8"))
  );
  const health = HealthConfigSchema.parse(
    JSON.parse(await readFile(healthPath, "utf8"))
  );
  if (
    worker.pubsubEmulatorHost ||
    health.targets.some((target) => !worker.bindings[target.bindingIndex])
  ) {
    logger.error(
      "GCS DFS health probe requires real cloud resources and valid binding indexes"
    );
    process.exitCode = 1;
    return;
  }
  const checks = await runHealthChecks(
    worker,
    health,
    new GoogleHealthTransport(worker),
    new DfsProjection(worker.requestTimeoutMs)
  );
  for (const check of checks) {
    if (check.healthy) {
      logger.info(check, "GCS DFS health check passed");
    } else {
      logger.error(check, "GCS DFS health check failed");
    }
  }
  const healthy = checks.every((check) => check.healthy);
  logger.info(
    { healthy, checks: checks.length, completedAtMs: Date.now() },
    "GCS DFS health probe completed"
  );
  process.exitCode = healthy ? 0 : 1;
}

void main().catch(() => {
  logger.fatal(
    "GCS DFS health probe failed; check configuration and credential files"
  );
  process.exitCode = 1;
});
