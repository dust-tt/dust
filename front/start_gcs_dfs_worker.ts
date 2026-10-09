import { readFile } from "node:fs/promises";

import config from "@app/lib/api/config";
import { closeRedisClients, getRedisStreamClient } from "@app/lib/api/redis";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { createDfsProjection } from "@app/workers/gcs_dfs/projection";
import { ConfigSchema } from "@app/workers/gcs_dfs/protocol";
import { startRuntime } from "@app/workers/gcs_dfs/runtime";
import { metricsObserver } from "@app/workers/gcs_dfs/telemetry";
import { GoogleTransport } from "@app/workers/gcs_dfs/transport";
import { runWorker } from "@app/workers/gcs_dfs/worker";

async function main() {
  const settings = ConfigSchema.parse(
    JSON.parse(await readFile(config.getGcsDfsWorkerConfigPath(), "utf8"))
  );
  let observe = metricsObserver(settings, "importer");
  const dfs = await createDfsProjection(settings, (event) => observe(event));
  let runtime: Awaited<ReturnType<typeof startRuntime>> | undefined;
  try {
    const probeGoogle = new GoogleTransport(settings);
    runtime = await startRuntime(settings, "importer", async () => {
      const redis = await getRedisStreamClient({ origin: "lock" });
      await redis.ping();
      await concurrentExecutor(
        settings.bindings,
        async (binding) => {
          const source = {
            bucket: binding.bucket,
            name: `${binding.prefix}.dust-gcs-dfs-readiness`,
          };
          await Promise.all([
            probeGoogle.metadata(source),
            dfs.cursor(binding, source),
          ]);
        },
        { concurrency: 4 }
      );
    });
    observe = runtime.observe;
    const google = new GoogleTransport(settings, runtime.observe);
    logger.info(
      { concurrency: settings.concurrency, bindings: settings.bindings.length },
      "GCS DFS worker started"
    );
    await runWorker(
      settings,
      google,
      google,
      dfs,
      runtime.stopping,
      runtime.observe
    );
  } finally {
    try {
      await runtime?.close();
    } finally {
      dfs.close();
      await closeRedisClients();
    }
  }
}

void main().catch(() => {
  logger.fatal(
    "GCS DFS worker startup failed; check configuration and credential files"
  );
  process.exitCode = 1;
});
