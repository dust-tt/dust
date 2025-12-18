import { bundleWorkflowCode } from "@temporalio/worker";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

import type { WorkerName } from "@app/temporal/worker_registry";
import { ALL_WORKERS } from "@app/temporal/worker_registry";
import { assertNever } from "@app/types";

interface WorkerInfo {
  name: string;
  workflowsPath: string;
}

function discoverWorkers(): WorkerInfo[] {
  return ALL_WORKERS.map((workerName): WorkerInfo => {
    const name = workerName as WorkerName;
    const workflowsPath = getWorkerWorkflowsPath(name);
    return { name, workflowsPath };
  });
}

function getWorkerWorkflowsPath(workerName: WorkerName): string {
  const workerDir = getWorkerDirectory(workerName);
  if (!workerDir) {
    throw new Error(`No directory found for worker: ${workerName}`);
  }
  return path.join(workerDir, "workflows");
}

// TODO(2025-11-21: flav): Temporary, refactors once webhooks and schedules are moved to temporal/.
function getWorkerDirectory(workerName: WorkerName): string | null {
  const baseDir = path.join(__dirname, "../../");

  switch (workerName) {
    case "agent_loop":
      return path.join(baseDir, "temporal/agent_loop");
    case "agent_schedule":
      return path.join(baseDir, "temporal/triggers/common");
    case "agent_trigger_webhook":
      return path.join(baseDir, "temporal/triggers/webhook");
    case "analytics_queue":
      return path.join(baseDir, "temporal/analytics_queue");
    case "credit_alerts":
      return path.join(baseDir, "temporal/credit_alerts");
    case "data_retention":
      return path.join(baseDir, "temporal/data_retention");
    case "document_tracker":
      return path.join(baseDir, "temporal/tracker");
    case "hard_delete":
      return path.join(baseDir, "temporal/hard_delete");
    case "labs":
      return path.join(baseDir, "temporal/labs/transcripts");
    case "mentions_count":
      return path.join(baseDir, "temporal/mentions_count_queue");
    case "poke":
      return path.join(baseDir, "poke/temporal");
    case "production_checks":
      return path.join(baseDir, "temporal/production_checks");
    case "relocation":
      return path.join(baseDir, "temporal/relocation");
    case "remote_tools_sync":
      return path.join(baseDir, "temporal/remote_tools");
    case "scrub_workspace_queue":
      return path.join(baseDir, "temporal/scrub_workspace");
    case "tracker_notification":
      return path.join(baseDir, "temporal/tracker");
    case "update_workspace_usage":
      return path.join(baseDir, "temporal/usage_queue");
    case "upsert_queue":
      return path.join(baseDir, "temporal/upsert_queue");
    case "upsert_table_queue":
      return path.join(baseDir, "temporal/upsert_tables");
    case "es_indexation_queue":
      return path.join(baseDir, "temporal/es_indexation");
    case "workos_events_queue":
      return path.join(baseDir, "temporal/workos_events_queue");
    default:
      return assertNever(workerName);
  }
}

async function buildBundles() {
  const workers = discoverWorkers();
  const bundleDir = path.join(__dirname, "../../dist/temporal-bundles");

  await mkdir(bundleDir, { recursive: true });

  console.log(
    `Found ${workers.length} workers:`,
    workers.map((w) => w.name).join(", ")
  );

  await Promise.all(
    workers.map(async ({ name, workflowsPath }) => {
      console.log(`Bundling ${name}...`);

      const { code } = await bundleWorkflowCode({
        workflowsPath: require.resolve(workflowsPath),
        workflowInterceptorModules: [
          require.resolve(workflowsPath),
        ],
        webpackConfigHook: (config) => {
          const plugins = config.resolve?.plugins ?? [];
          config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
          return config;
        },
      });

      const bundlePath = path.join(bundleDir, `${name}.bundle.js`);
      await writeFile(bundlePath, code);

      console.log(`✓ ${name}`);
    })
  );

  console.log(`\n✓ Built ${workers.length} bundles`);
}

if (require.main === module) {
  buildBundles().catch((error) => {
    console.error("Failed to build temporal bundles:", error);
    process.exit(1);
  });
}
