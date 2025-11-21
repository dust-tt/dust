import path from "path";

import type { WorkerName } from "./worker_registry";

/**
 * Returns the workflow bundle path for a worker.
 * In production, uses pre-built bundles. In development, returns undefined for runtime bundling.
 */
export function getWorkflowBundle(workerName: WorkerName): string | undefined {
  if (process.env.NODE_ENV === "production") {
    return path.join(
      __dirname,
      "../dist/temporal-bundles",
      `${workerName}.bundle.js`
    );
  }
  return undefined;
}
