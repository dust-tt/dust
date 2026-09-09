import { Authenticator } from "@app/lib/auth";
import config from "@app/lib/api/config";
import { AppModel } from "@app/lib/resources/storage/models/apps";
import { RunModel } from "@app/lib/resources/storage/models/runs";
import { RunResource } from "@app/lib/resources/run_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { makeScript } from "@app/scripts/helpers";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types";

const DELETE_CONCURRENCY = 12;

/**
 * Removes all Core and front run records for a single Core project.
 *
 * This is intentionally dry-run by default. Pass --execute to mutate data.
 * Core is cleaned first because the project cannot be deleted while Core runs
 * still reference it through the runs_project_fkey constraint.
 */
makeScript(
  {
    workspaceId: {
      alias: "wId",
      type: "string",
      description: "Workspace sId",
      demandOption: true,
    },
    projectId: {
      alias: "project",
      type: "number",
      description: "Core project ID",
      demandOption: true,
    },
  },
  async ({ workspaceId, projectId, execute }, scriptLogger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const apps = await AppModel.findAll({
      where: {
        workspaceId: workspace.id,
        dustAPIProjectId: projectId,
      },
    });

    if (apps.length === 0) {
      throw new Error(
        `No front app found for workspace=${workspace.sId}, project=${projectId}`
      );
    }

    if (apps.length > 1) {
      throw new Error(
        `Expected one front app for project=${projectId}, found ${apps.length}`
      );
    }

    const app = apps[0];
    const runs = await RunModel.findAll({
      where: {
        workspaceId: workspace.id,
        appId: app.id,
      },
      order: [["createdAt", "ASC"]],
    });

    scriptLogger.info(
      {
        execute,
        workspaceId: workspace.sId,
        workspaceName: workspace.name,
        projectId,
        appId: app.id,
        runCount: runs.length,
        runIds: runs.map((run) => run.dustRunId),
      },
      execute ? "Runs selected for deletion" : "Dry run: runs selected"
    );

    if (!execute || runs.length === 0) {
      return;
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    await concurrentExecutor(
      runs,
      async (run) => {
        const coreDeleteResult = await coreAPI.deleteRun({
          projectId: String(projectId),
          runId: run.dustRunId,
        });

        if (coreDeleteResult.isErr()) {
          throw new Error(
            `Failed to delete Core run ${run.dustRunId}: ${coreDeleteResult.error.message}`
          );
        }

        const runResource = new RunResource(RunModel, run.get());
        const frontDeleteResult = await runResource.delete(auth);
        if (frontDeleteResult.isErr()) {
          throw new Error(
            `Failed to delete front run ${run.dustRunId}: ${frontDeleteResult.error.message}`
          );
        }

        scriptLogger.info(
          { projectId, runId: run.dustRunId },
          "Deleted Core and front run"
        );
      },
      { concurrency: DELETE_CONCURRENCY }
    );

    const remaining = await RunModel.count({
      where: {
        workspaceId: workspace.id,
        appId: app.id,
      },
    });

    if (remaining !== 0) {
      throw new Error(
        `Cleanup incomplete: ${remaining} front run rows remain for project=${projectId}`
      );
    }

    scriptLogger.info(
      { workspaceId: workspace.sId, projectId },
      "Project run cleanup completed"
    );
  }
);
