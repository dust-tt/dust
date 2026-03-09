import type { WorkerName } from "@connectors/temporal/worker_registry";
import { ALL_WORKERS } from "@connectors/temporal/worker_registry";
import { assertNever } from "@dust-tt/client";
import { bundleWorkflowCode } from "@temporalio/worker";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";

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
  return path.join(workerDir, "workflows");
}

function getWorkerDirectory(workerName: WorkerName): string {
  const baseDir = path.join(__dirname, "../../src/connectors");

  switch (workerName) {
    case "bigquery":
      return path.join(baseDir, "bigquery/temporal");
    case "confluence":
      return path.join(baseDir, "confluence/temporal");
    case "dust_project":
      return path.join(baseDir, "dust_project/temporal");
    case "github":
      return path.join(baseDir, "github/temporal");
    case "gong":
      return path.join(baseDir, "gong/temporal");
    case "google_drive":
      return path.join(baseDir, "google_drive/temporal");
    case "intercom":
      return path.join(baseDir, "intercom/temporal");
    case "microsoft":
      return path.join(baseDir, "microsoft/temporal");
    case "notion":
    case "notion_garbage_collector":
      return path.join(baseDir, "notion/temporal");
    case "salesforce":
      return path.join(baseDir, "salesforce/temporal");
    case "slack":
      return path.join(baseDir, "slack/temporal");
    case "snowflake":
      return path.join(baseDir, "snowflake/temporal");
    case "webcrawler":
      return path.join(baseDir, "webcrawler/temporal");
    case "zendesk":
      return path.join(baseDir, "zendesk/temporal");
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
        workflowInterceptorModules: [require.resolve(workflowsPath)],
        webpackConfigHook: (config) => {
          const plugins = config.resolve?.plugins ?? [];
          config.resolve!.plugins = [...plugins, new TsconfigPathsPlugin({})];
          return config;
        },
      });

      const bundlePath = path.join(bundleDir, `${name}.bundle.js`);
      await writeFile(bundlePath, code);

      console.log(`Done: ${name}`);
    })
  );

  console.log(`\nBuilt ${workers.length} bundles`);
}

if (require.main === module) {
  buildBundles().catch((error) => {
    console.error("Failed to build temporal bundles:", error);
    process.exit(1);
  });
}
