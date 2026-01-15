// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";

import { default as config } from "@app/lib/api/config";
import {
  createDataSourceAndConnectorForProject,
  fetchProjectDataSource,
} from "@app/lib/api/projects";
import { PROJECT_CONTEXT_FOLDER_ID } from "@app/lib/api/projects/constants";
import { Authenticator } from "@app/lib/auth";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SpaceModel } from "@app/lib/resources/storage/models/spaces";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getSpaceConversationsRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { assertNever, ConnectorsAPI, CoreAPI } from "@app/types";

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
    const owner = auth.getNonNullableWorkspace();

    // Check if data source already exists
    const r = await fetchProjectDataSource(auth, space);

    // Make sure we handle all possible future error codes
    if (r.isErr() && r.error.code !== "data_source_not_found") {
      assertNever(r.error.code);
    }

    if (r.isOk() && r.value.connectorId) {
      stats.alreadyHasConnector++;

      // Check if sync needs to be started and ensure garbage collection is running
      if (execute) {
        const connectorsAPI = new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        );

        // Upsert the context folder
        const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
        await coreAPI.upsertDataSourceFolder({
          projectId: r.value.dustAPIProjectId,
          dataSourceId: r.value.dustAPIDataSourceId,
          folderId: PROJECT_CONTEXT_FOLDER_ID,
          parentId: null,
          parents: [PROJECT_CONTEXT_FOLDER_ID],
          mimeType: INTERNAL_MIME_TYPES.DUST_PROJECT.CONTEXT_FOLDER,
          sourceUrl:
            config.getClientFacingUrl() +
            getSpaceConversationsRoute(owner.sId, space.sId),
          timestamp: null,
          providerVisibility: null,
          title: "Context",
        });

        // Try to resume the connector (will start full sync if needed, or incremental sync if already synced)
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
          localLogger.info("Successfully unpaused connector sync");
          stats.syncStarted++;
        }
      } else {
        localLogger.info(
          "Would unpause connector sync and ensure garbage collection is running"
        );
      }
      return;
    }

    if (execute) {
      localLogger.info("Creating dust_project connector for project");

      // Create the connector
      const createResult = await createDataSourceAndConnectorForProject(
        auth,
        space
      );

      if (createResult.isErr()) {
        throw createResult.error;
      }

      stats.created++;
      localLogger.info("Successfully created dust_project connector");

      // Trigger initial sync
      const r = await fetchProjectDataSource(auth, space);

      if (r.isOk() && r.value.connectorId) {
        const connectorsAPI = new ConnectorsAPI(
          config.getConnectorsAPIConfig(),
          logger
        );

        const syncResult = await connectorsAPI.syncConnector(
          r.value.connectorId.toString()
        );
        if (syncResult.isErr()) {
          localLogger.warn(
            {
              error: syncResult.error,
            },
            "Failed to trigger initial sync, but connector was created"
          );
        } else {
          localLogger.info(
            {
              workflowId: syncResult.value.workflowId,
            },
            "Successfully triggered initial sync"
          );
          stats.syncStarted++;
        }
      }
    } else {
      localLogger.info("Would create dust_project connector and start sync");
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
        includeDeleted: false,
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
