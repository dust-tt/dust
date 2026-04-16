import { Authenticator, getFeatureFlags } from "@app/lib/auth";
import { FeatureFlagModel } from "@app/lib/models/feature_flag";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import { launchOrSignalProjectTodoWorkflow } from "@app/temporal/project_todo/client";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { LightWorkspaceType } from "@app/types/user";

const PROJECTS_FEATURE_FLAG =
  "projects" as const satisfies WhitelistableFeature;

async function listWorkspacesWithProjectsFeatureFlag(): Promise<
  LightWorkspaceType[]
> {
  const flags = await FeatureFlagModel.findAll({
    where: { name: PROJECTS_FEATURE_FLAG },
    attributes: ["workspaceId"],
    // WORKSPACE_ISOLATION_BYPASS: list workspace IDs with the projects flag for this admin-only backfill script.
    // @ts-expect-error -- Script operates across all workspaces.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  const workspaceIds = [...new Set(flags.map((f) => f.workspaceId))];
  if (workspaceIds.length === 0) {
    return [];
  }

  const workspaces = await WorkspaceResource.fetchByModelIds(workspaceIds);
  return workspaces.map((workspace) => renderLightWorkspaceType({ workspace }));
}

makeScript(
  {
    wId: {
      type: "string",
      describe: "Optional workspace sId to process a single workspace.",
    },
    requireProjectTodo: {
      type: "boolean",
      describe:
        "If true, only start workflows when the workspace also has the project_todo feature flag.",
      default: true,
    },
  },
  async ({ execute, wId, requireProjectTodo }, logger) => {
    const processWorkspace = async (workspace: LightWorkspaceType) => {
      const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

      if (requireProjectTodo) {
        const flags = await getFeatureFlags(auth);
        if (!flags.includes("project_todo")) {
          logger.info(
            { workspaceId: workspace.sId },
            "Skipping workspace: project_todo feature flag not enabled"
          );
          return;
        }
      }

      const projectSpaces = await SpaceResource.listProjectSpaces(auth);
      let started = 0;
      let skippedArchived = 0;

      for (const space of projectSpaces) {
        const metadata = await ProjectMetadataResource.fetchBySpace(
          auth,
          space
        );
        if (metadata?.archivedAt) {
          skippedArchived += 1;
          continue;
        }

        if (execute) {
          await launchOrSignalProjectTodoWorkflow({
            workspaceId: workspace.sId,
            spaceId: space.sId,
          });
        }
        started += 1;
      }

      logger.info(
        {
          workspaceId: workspace.sId,
          projectSpaceCount: projectSpaces.length,
          wouldStartOrStarted: started,
          skippedArchived,
          execute,
        },
        execute
          ? "Started project todo workflows for workspace project spaces"
          : "Dry run: would start project todo workflows for workspace project spaces"
      );
    };

    if (wId) {
      const workspace = await WorkspaceResource.fetchById(wId);
      if (!workspace) {
        throw new Error(`Workspace not found: ${wId}`);
      }

      const hasProjectsFlag = await FeatureFlagModel.findOne({
        where: {
          workspaceId: workspace.id,
          name: PROJECTS_FEATURE_FLAG,
        },
      });

      if (!hasProjectsFlag) {
        throw new Error(
          `Workspace ${wId} does not have the workspace-level "${PROJECTS_FEATURE_FLAG}" feature flag.`
        );
      }

      await processWorkspace(renderLightWorkspaceType({ workspace }));
      return;
    }

    const workspaces = await listWorkspacesWithProjectsFeatureFlag();
    logger.info(
      { workspaceCount: workspaces.length, requireProjectTodo },
      "Workspaces with projects feature flag"
    );

    if (workspaces.length === 0) {
      logger.info("No workspaces to process.");
      return;
    }

    await concurrentExecutor(workspaces, processWorkspace, { concurrency: 2 });
  }
);
