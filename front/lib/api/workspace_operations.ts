import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI, removeNulls } from "@app/types";

/**
 * Helper function to pause all connectors for a workspace.
 * This is used when a workspace is downgraded to prevent further processing.
 */
export async function pauseWorkspaceConnectors(
  workspaceId: string
): Promise<void> {
  try {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    const dataSources = await DataSourceResource.listByWorkspace(auth);
    const connectorIds = removeNulls(dataSources.map((ds) => ds.connectorId));

    if (connectorIds.length === 0) {
      logger.info(
        { workspaceId },
        "No connectors found for workspace, skipping pause"
      );
      return;
    }

    const connectorsApi = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    for (const connectorId of connectorIds) {
      const result = await connectorsApi.pauseConnector(connectorId);
      if (result.isErr()) {
        logger.error(
          { workspaceId, connectorId, error: result.error },
          "Failed to pause connector during workspace downgrade"
        );
      } else {
        logger.info(
          { workspaceId, connectorId },
          "Successfully paused connector during workspace downgrade"
        );
      }
    }

    logger.info(
      { workspaceId, connectorCount: connectorIds.length },
      "Completed pausing connectors for downgraded workspace"
    );
  } catch (error) {
    logger.error(
      { workspaceId, error },
      "Failed to pause connectors for workspace during downgrade"
    );
    throw error;
  }
}
