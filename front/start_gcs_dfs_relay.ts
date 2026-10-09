import { readFile } from "node:fs/promises";

import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { RelayConfigSchema } from "@app/workers/gcs_dfs/protocol";
import { runRelay } from "@app/workers/gcs_dfs/relay";
import { startRuntime } from "@app/workers/gcs_dfs/runtime";
import { GoogleTransport } from "@app/workers/gcs_dfs/transport";

async function main() {
  const settings = RelayConfigSchema.parse(
    JSON.parse(await readFile(config.getGcsDfsRelayConfigPath(), "utf8"))
  );
  const runtime = await startRuntime(settings, "relay", async () => {});
  const google = new GoogleTransport(settings, runtime.observe);
  logger.info(
    { concurrency: settings.concurrency, bindings: settings.bindings.length },
    "GCS DFS relay started"
  );
  try {
    await runRelay(settings, google, google, runtime.stopping, runtime.observe);
  } finally {
    await runtime.close();
  }
}

void main().catch(() => {
  logger.fatal("GCS DFS relay startup failed; check configuration");
  process.exitCode = 1;
});
