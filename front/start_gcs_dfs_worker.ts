import { readFile } from "node:fs/promises";

import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { ConfigSchema } from "@app/workers/gcs_dfs/protocol";
import { DfsProjection, GoogleTransport } from "@app/workers/gcs_dfs/transport";
import { runWorker } from "@app/workers/gcs_dfs/worker";

async function main() {
  const settings = ConfigSchema.parse(
    JSON.parse(await readFile(config.getGcsDfsWorkerConfigPath(), "utf8"))
  );
  const google = new GoogleTransport(settings);
  const dfs = new DfsProjection(settings.requestTimeoutMs);
  let stopping = false;
  const stop = () => {
    if (!stopping) {
      stopping = true;
      logger.info("GCS DFS worker draining");
      setTimeout(() => {
        process.exit(1);
      }, 60_000).unref();
    }
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  logger.info(
    { concurrency: settings.concurrency, bindings: settings.bindings.length },
    "GCS DFS worker started"
  );
  await runWorker(settings, google, google, dfs, () => stopping);
}

void main().catch(() => {
  logger.fatal(
    "GCS DFS worker startup failed; check configuration and credential files"
  );
  process.exitCode = 1;
});
