import { readFileSync } from "fs";
import path from "path";

import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import type { WorkerName } from "./worker_registry";

/**
 * Returns the workflow configuration for a worker.
 * In production, uses pre-built bundles. In development, uses runtime bundling.
 *
 * @param workerName The worker name
 * @param workflowsPath The RESOLVED path to workflows (use require.resolve("./workflows") from worker)
 */
export function getWorkflowConfig({
  workerName,
  getWorkflowsPath,
}: {
  workerName: WorkerName;
  getWorkflowsPath: () => string;
}) {
  if (!isDevelopment() || process.env.USE_TEMPORAL_BUNDLES === "true") {
    const bundlePath = path.join(
      __dirname,
      "../dist/temporal-bundles",
      `${workerName}.bundle.js`
    );

    try {
      const code = readFileSync(bundlePath, "utf8");
      return { workflowBundle: { code } };
    } catch (error) {
      logger.error(
        {
          error: normalizeError(error),
          workerName,
        },
        "Failed to read workflow bundle, falling back to runtime bundling"
      );

      // Fallback to runtime bundling if bundle read fails.
      return { workflowsPath: getWorkflowsPath() };
    }
  }

  // Development: use runtime bundling
  return { workflowsPath: getWorkflowsPath() };
}
