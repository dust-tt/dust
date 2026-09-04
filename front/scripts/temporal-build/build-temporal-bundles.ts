import type { WorkerName } from "@app/temporal/worker_registry";
import { ALL_WORKERS } from "@app/temporal/worker_registry";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { bundleWorkflowCode } from "@temporalio/worker";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

interface BundleInfo {
  workerNames: WorkerName[];
  workflowsPath: string;
}

function discoverBundles(): BundleInfo[] {
  // Workers sharing a workflows directory (the agent-loop pools) run the same workflow code:
  // bundle it once and write the result under each of their names.
  const bundles = new Map<string, BundleInfo>();
  for (const workerName of ALL_WORKERS) {
    const name = workerName as WorkerName;
    const workflowsPath = getWorkerWorkflowsPath(name);
    const bundle = bundles.get(workflowsPath);
    if (bundle) {
      bundle.workerNames.push(name);
    } else {
      bundles.set(workflowsPath, { workerNames: [name], workflowsPath });
    }
  }
  return [...bundles.values()];
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
    case "activation_scheduler":
      return path.join(baseDir, "temporal/activation_scheduler");
    case "agent_inactivity":
      return path.join(baseDir, "temporal/agent_inactivity");
    case "agent_loop_batch":
    case "agent_loop_interactive":
    case "agent_loop_programmatic":
    case "agent_loop_schedules":
      return path.join(baseDir, "temporal/agent_loop");
    case "agent_schedule":
      return path.join(baseDir, "temporal/triggers");
    case "agent_trigger_webhook":
      return path.join(baseDir, "temporal/triggers_garbage_collect");
    case "analytics_queue":
      return path.join(baseDir, "temporal/analytics_queue");
    case "conversation_fork_queue":
      return path.join(baseDir, "temporal/conversation_fork_queue");
    case "credit_alerts":
      return path.join(baseDir, "temporal/credit_alerts");
    case "data_retention":
      return path.join(baseDir, "temporal/data_retention");
    case "hard_delete":
      return path.join(baseDir, "temporal/hard_delete");
    case "invitations":
      return path.join(baseDir, "temporal/invitations");
    case "labs":
      return path.join(baseDir, "temporal/labs/transcripts");
    case "mentions_count":
      return path.join(baseDir, "temporal/mentions_count_queue");
    case "mentions_queue":
      return path.join(baseDir, "temporal/mentions_queue");
    case "model_health":
      return path.join(baseDir, "temporal/model_health");
    case "notifications_queue":
      return path.join(baseDir, "temporal/notifications_queue");
    case "poke":
      return path.join(baseDir, "poke/temporal");
    case "production_checks":
      return path.join(baseDir, "temporal/production_checks");
    case "relocation":
      return path.join(baseDir, "temporal/relocation");
    case "sandbox_functions":
      return path.join(baseDir, "temporal/sandbox_functions");
    case "sandbox_reaper":
      return path.join(baseDir, "temporal/sandbox_reaper");
    case "remote_tools_sync":
      return path.join(baseDir, "temporal/remote_tools");
    case "scrub_workspace_queue":
      return path.join(baseDir, "temporal/scrub_workspace");
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
    case "metronome_events_queue":
      return path.join(baseDir, "temporal/metronome_events_queue");
    case "reinforcement":
      return path.join(baseDir, "temporal/reinforcement");
    default:
      return assertNever(workerName);
  }
}

async function buildBundles() {
  const bundles = discoverBundles();
  const bundleDir = path.join(__dirname, "../../dist/temporal-bundles");

  await mkdir(bundleDir, { recursive: true });

  console.log(
    `Found ${bundles.length} bundles:`,
    bundles.map((b) => b.workerNames.join("/")).join(", ")
  );

  await Promise.all(
    bundles.map(async ({ workerNames, workflowsPath }) => {
      console.log(`Bundling ${workerNames.join("/")}...`);

      const { code } = await bundleWorkflowCode({
        workflowsPath: require.resolve(workflowsPath),
        workflowInterceptorModules: [require.resolve(workflowsPath)],
        webpackConfigHook: (config) => {
          const plugins = config.resolve?.plugins ?? [];
          config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
          return config;
        },
      });

      for (const name of workerNames) {
        await writeFile(path.join(bundleDir, `${name}.bundle.js`), code);
        console.log(`✓ ${name}`);
      }
    })
  );

  console.log(`\n✓ Built ${bundles.length} bundles`);
}

if (require.main === module) {
  buildBundles().catch((error) => {
    console.error("Failed to build temporal bundles:", error);
    process.exit(1);
  });
}
