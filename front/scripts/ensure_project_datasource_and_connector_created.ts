import { default as config } from "@app/lib/api/config";
import {
  createDataSourceAndConnectorForProject,
  fetchProjectDataSource,
} from "@app/lib/api/projects";
import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";

// Function to process a single project space
async function processProjectSpace(
  execute: boolean,
  spaceId: number,
  workspaceId: number,
  stats: {
    total: number;
    alreadyHasConnector: number;
    created: number;
    syncStarted: number;
    errors: number;
  },
  errors: {
    workspaceId: string;
    spaceId: string;
    error: unknown;
  }[]
): Promise<void> {
  // Fetch workspace
  const workspace = await WorkspaceResource.fetchByModelIds([workspaceId]);
  if (workspace.length === 0) {
    logger.warn(
      { workspaceId },
      "Workspace not found for project space, skipping"
    );
    return;
  }
  const workspaceResource = workspace[0];

  // Fetch space
  const auth = await Authenticator.internalAdminForWorkspace(
    workspaceResource.sId
  );
  const spaces = await SpaceResource.fetchByModelIds(auth, [spaceId]);
  if (spaces.length === 0) {
    logger.warn(
      { workspaceId: workspaceResource.sId, spaceId },
      "Space not found, skipping"
    );
    return;
  }
  const space = spaces[0];
  if (space.kind !== "project") {
    logger.warn(
      { workspaceId: workspaceResource.sId, spaceId, kind: space.kind },
      "Space is not a project, skipping"
    );
    return;
  }

  const localLogger = logger.child({
    workspaceId: workspaceResource.sId,
    spaceId: space.sId,
    spaceName: space.name,
  });

  try {
    // Check if datasource already exists to track stats
    const existingDataSource = await fetchProjectDataSource(auth, space);
    const hadConnectorBefore =
      existingDataSource.isOk() &&
      existingDataSource.value.connectorId !== null;

    if (execute) {
      // Use the idempotent function which handles all cases:
      // - Creates missing components (Core API project, data source, folder, front datasource, connector)
      // - Verifies existing components
      // - Recreates missing components if needed
      const createResult = await createDataSourceAndConnectorForProject(
        auth,
        space
      );

      if (createResult.isErr()) {
        throw createResult.error;
      }

      // Fetch the datasource after creation to get updated state
      const r = await fetchProjectDataSource(auth, space);
      if (r.isOk() && r.value.connectorId) {
        if (!hadConnectorBefore) {
          stats.created++;
          localLogger.info("Successfully created dust_project connector");
        } else {
          stats.alreadyHasConnector++;
        }

        const connectorsAPI = new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        );

        // Try to resume/unpause the connector to ensure sync is running
        // This is idempotent - if already running, it's a no-op
        const unpauseResult = await connectorsAPI.unpauseConnector(
          r.value.connectorId.toString()
        );
        if (unpauseResult.isErr()) {
          localLogger.warn(
            {
              error: unpauseResult.error,
            },
            "Failed to unpause connector sync"
          );
        } else {
          localLogger.info("Successfully ensured connector sync is running");
          stats.syncStarted++;
        }
      } else {
        // This shouldn't happen if createDataSourceAndConnectorForProject succeeded
        localLogger.warn(
          "createDataSourceAndConnectorForProject succeeded but no connector found"
        );
      }

      // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
      let metadata = await ProjectMetadataResource.fetchBySpace(auth, space);

      // Create new metadata
      metadata ??= await ProjectMetadataResource.makeNew(auth, space, {
        description: null,
      });
    } else {
      if (hadConnectorBefore) {
        localLogger.info("Would ensure dust_project connector sync is running");
      } else {
        localLogger.info(
          "Would create dust_project connector and ensure sync is running"
        );
      }
    }
  } catch (e) {
    localLogger.error({ error: e }, "Error ensuring project connector");
    errors.push({
      workspaceId: workspaceResource.sId,
      spaceId: space.sId,
      error: e,
    });
    stats.errors++;
  }
}

makeScript(
  {
    workspaceId: {
      type: "string",
      description:
        "Workspace SID to ensure project connectors for (if not provided, processes all workspaces)",
      required: false,
    },
    concurrency: {
      type: "number",
      description: "Number of concurrent projects to process",
      required: false,
      default: 5,
    },
  },
  async ({ execute, workspaceId, concurrency }, parentLogger) => {
    // Get list of project spaces to process
    let projectSpaces: { spaceId: number; workspaceId: number }[] = [];

    if (workspaceId) {
      // Process all projects in a specific workspace
      const workspace = await WorkspaceResource.fetchById(workspaceId);
      if (!workspace) {
        throw new Error(`Workspace with SID ${workspaceId} not found.`);
      }
      const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
      const allSpaces = await SpaceResource.listWorkspaceSpaces(auth, {
        includeProjectSpaces: true,
      });
      const projectSpacesResources = allSpaces.filter(
        (s) => s.kind === "project"
      );
      projectSpaces = projectSpacesResources.map((space) => ({
        spaceId: space.id,
        workspaceId: workspace.id,
      }));
    } else {
      // Process all projects across all workspaces
      // Get all project spaces and their workspaceIds
      const projectSpaceModels = await SpaceModel.findAll({
        where: {
          kind: "project",
          deletedAt: null,
        },
        // WORKSPACE_ISOLATION_BYPASS: This script operates across all workspaces to ensure project connectors are created
        // @ts-expect-error -- It's a one-off script that operates across all workspaces
        // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
        dangerouslyBypassWorkspaceIsolationSecurity: true,
        attributes: ["id", "workspaceId"],
      });

      projectSpaces = projectSpaceModels.map((s) => ({
        spaceId: s.id,
        workspaceId: s.workspaceId,
      }));
    }

    if (projectSpaces.length === 0) {
      parentLogger.info("No project spaces found.");
      return;
    }

    parentLogger.info(
      `Found ${projectSpaces.length} project spaces to process.`
    );

    const stats = {
      total: projectSpaces.length,
      alreadyHasConnector: 0,
      created: 0,
      syncStarted: 0,
      errors: 0,
    };

    const errors: {
      workspaceId: string;
      spaceId: string;
      error: unknown;
    }[] = [];

    await concurrentExecutor(
      projectSpaces,
      async ({ spaceId, workspaceId }) => {
        await processProjectSpace(execute, spaceId, workspaceId, stats, errors);
      },
      { concurrency }
    );

    parentLogger.info(
      {
        stats,
      },
      `Script completed. Stats: ${stats.created} created, ${stats.alreadyHasConnector} already had connectors, ${stats.syncStarted} syncs started/resumed, ${stats.errors} errors.`
    );

    if (errors.length > 0) {
      parentLogger.error(
        `Script completed with ${errors.length} errors for the following projects: ${errors
          .map((e) => `${e.workspaceId}/${e.spaceId}`)
          .join(", ")}`
      );
    } else {
      parentLogger.info("Script completed successfully.");
    }
  }
);
