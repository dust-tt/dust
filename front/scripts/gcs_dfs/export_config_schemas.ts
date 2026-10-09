import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";

import logger from "@app/logger/logger";
import { CanaryConfigSchema } from "@app/workers/gcs_dfs/canary";
import { ConfigSchema, RelayConfigSchema } from "@app/workers/gcs_dfs/protocol";

async function main() {
  const directory = resolve("../x/jd/dfs-fdb/import/config");
  await writeFile(
    resolve(directory, "canary.schema.json"),
    JSON.stringify(
      zodToJsonSchema(CanaryConfigSchema, "GcsDfsCanaryConfig"),
      null,
      2
    ) + "\n"
  );
  await writeFile(
    resolve(directory, "worker.schema.json"),
    JSON.stringify(
      zodToJsonSchema(ConfigSchema, "GcsDfsWorkerConfig"),
      null,
      2
    ) + "\n"
  );
  await writeFile(
    resolve(directory, "relay.schema.json"),
    JSON.stringify(
      zodToJsonSchema(RelayConfigSchema, "GcsDfsRelayConfig"),
      null,
      2
    ) + "\n"
  );
}

void main().catch(() => {
  logger.error("GCS DFS configuration schema export failed");
  process.exitCode = 1;
});
