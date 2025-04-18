import { removeNulls } from "@dust-tt/client";
import assert from "assert";
import fs from "fs";
import path from "path";

import { getRun } from "@app/lib/api/run";
import { Authenticator } from "@app/lib/auth";
import { AppResource } from "@app/lib/resources/app_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import type {
  LightWorkspaceType,
  LoggerInterface,
  SpecificationBlockType,
} from "@app/types";

const FILE_NAME = "curl_queries.json";

async function writeJSONBrackets({ isOpen }: { isOpen: boolean }) {
  const curlPath = path.join(process.cwd(), FILE_NAME);
  if (isOpen) {
    fs.appendFileSync(curlPath, "[\n");
  } else {
    fs.appendFileSync(curlPath, "]\n");
  }
}

async function writeCurlQueries(
  auth: Authenticator,
  app: AppResource,
  block: SpecificationBlockType
) {
  const curlPath = path.join(process.cwd(), "curl_queries.json");
  fs.appendFileSync(
    curlPath,
    `${JSON.stringify(
      {
        appId: app.sId,
        spec: block.spec,
        workspaceId: auth.getNonNullableWorkspace().sId,
      },
      null,
      2
    )},\n`
  );
}

let appsWithCurlBlocksCount = 0;

async function listRunsForWorkspace(
  workspace: LightWorkspaceType,
  {
    concurrency,
    execute,
    logger,
  }: { concurrency: number; execute: boolean; logger: LoggerInterface }
) {
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

  const apps = await AppResource.listByWorkspace(auth, {
    includeDeleted: true,
  });

  logger.info({ appsTotal: apps.length }, "Found apps for workspace");

  for (const app of apps) {
    const runs = await RunResource.listByAppAndRunType(
      auth.getNonNullableWorkspace(),
      {
        appId: app.id,
        runType: ["local", "deploy", "execute"],
      }
    );

    logger.info({ app: app.sId, runsTotal: runs.length }, "Found runs");

    const blocksForAppRuns = await concurrentExecutor(
      runs,
      async (r) => {
        const runSpec = await getRun(auth, app.toJSON(), r.dustRunId);

        if (runSpec) {
          const curlBlocks = runSpec.spec.filter((s) => s.type === "curl");

          return curlBlocks;
        }

        return runSpec;
      },
      { concurrency }
    );

    const blocksWithCurl = removeNulls(blocksForAppRuns.flatMap((b) => b));

    if (blocksWithCurl.length > 0) {
      appsWithCurlBlocksCount++;
    }

    logger.info(
      { app: app.sId, blocksWithCurlTotal: blocksWithCurl.length },
      "Found blocks with curl"
    );

    for (const b of blocksWithCurl) {
      assert(b.type === "curl", "Block is not a curl block");

      if (execute) {
        logger.info({ block: b }, "Replaying curl block");
        await writeCurlQueries(auth, app, b);
      }
    }
  }
}

makeScript(
  {
    concurrency: {
      type: "number",
      default: 50,
    },
  },
  async ({ execute, concurrency }, logger) => {
    await writeJSONBrackets({ isOpen: true });

    await runOnAllWorkspaces(async (workspace) => {
      const childLogger = logger.child({
        workspace: { sId: workspace.sId },
      });

      await listRunsForWorkspace(workspace, {
        concurrency,
        execute,
        logger: childLogger,
      });
    });

    await writeJSONBrackets({ isOpen: false });

    logger.info({ appsWithCurlBlocksCount }, "Found apps with curl blocks");
  }
);
