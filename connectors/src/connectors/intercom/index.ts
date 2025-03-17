import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import {
  allowSyncTeam,
  retrieveIntercomConversationsPermissions,
  revokeSyncTeam,
} from "@connectors/connectors/intercom/lib/conversation_permissions";
import {
  allowSyncCollection,
  allowSyncHelpCenter,
  retrieveIntercomHelpCentersPermissions,
  revokeSyncCollection,
  revokeSyncHelpCenter,
} from "@connectors/connectors/intercom/lib/help_center_permissions";
import { getIntercomAccessToken } from "@connectors/connectors/intercom/lib/intercom_access_token";
import { fetchIntercomWorkspace } from "@connectors/connectors/intercom/lib/intercom_api";
import { retrieveSelectedNodes } from "@connectors/connectors/intercom/lib/permissions";
import {
  getHelpCenterCollectionIdFromInternalId,
  getHelpCenterIdFromInternalId,
  getTeamIdFromInternalId,
  isInternalIdForAllTeams,
} from "@connectors/connectors/intercom/lib/utils";
import {
  launchIntercomSyncWorkflow,
  stopIntercomSyncWorkflow,
} from "@connectors/connectors/intercom/temporal/client";
import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import {
  IntercomHelpCenterModel,
  IntercomTeamModel,
  IntercomWorkspaceModel,
} from "@connectors/lib/models/intercom";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
} from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";

export class IntercomConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const intercomAccessToken = await getIntercomAccessToken(connectionId);

    let connector = null;

    const intercomWorkspace = await fetchIntercomWorkspace({
      accessToken: intercomAccessToken,
    });
    if (!intercomWorkspace) {
      throw new Error(
        "Error retrieving intercom workspace, cannot create Connector."
      );
    }

    const intercomConfigurationBlob = {
      intercomWorkspaceId: intercomWorkspace.id,
      name: intercomWorkspace.name,
      conversationsSlidingWindow: 90,
      region: intercomWorkspace.region,
      syncAllConversations: "disabled" as const,
      shouldSyncNotes: true,
    };

    connector = await ConnectorResource.makeNew(
      "intercom",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      intercomConfigurationBlob
    );

    const workflowStarted = await launchIntercomSyncWorkflow({
      connectorId: connector.id,
    });

    if (workflowStarted.isErr()) {
      await connector.delete();
      logger.error(
        {
          workspaceId: dataSourceConfig.workspaceId,
          error: workflowStarted.error,
        },
        "[Intercom] Error creating connector Could not launch sync workflow."
      );
      throw workflowStarted.error;
    }

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "[Intercom] Connector not found."
      );
      throw new Error(`Connector ${this.connectorId} not found`);
    }

    const intercomWorkspace = await IntercomWorkspaceModel.findOne({
      where: { connectorId: connector.id },
    });

    if (!intercomWorkspace) {
      throw new Error(
        "Error retrieving intercom workspace to update connector"
      );
    }

    if (connectionId) {
      const newConnectionId = connectionId;
      const accessToken = await getIntercomAccessToken(newConnectionId);
      const newIntercomWorkspace = await fetchIntercomWorkspace({
        accessToken,
      });

      if (!newIntercomWorkspace) {
        throw new Error("Error retrieving connection info to update connector");
      }
      if (intercomWorkspace.intercomWorkspaceId !== newIntercomWorkspace.id) {
        return new Err(
          new ConnectorManagerError(
            "CONNECTOR_OAUTH_TARGET_MISMATCH",
            "Cannot change workspace of a Intercom connector"
          )
        );
      }

      await connector.update({ connectionId: newConnectionId });

      // If connector was previously paused, unpause it.
      if (connector.isPaused()) {
        await this.unpause();
      }

      await IntercomWorkspaceModel.update(
        {
          intercomWorkspaceId: newIntercomWorkspace.id,
          name: newIntercomWorkspace.name,
          region: newIntercomWorkspace.region,
        },
        {
          where: { connectorId: connector.id },
        }
      );
    }
    return new Ok(connector.id.toString());
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "Intercom connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    try {
      const accessToken = await getIntercomAccessToken(connector.connectionId);

      const resp = await fetch(`https://api.intercom.io/auth/uninstall`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: `application/json`,
          ContentType: `application/json`,
        },
      });

      if (!resp.ok) {
        throw new Error(resp.statusText);
      } else {
        logger.info({ connectorId: this.connectorId }, "Uninstalled Intercom.");
      }
    } catch (e) {
      // If we error we still continue the process, as it's likely the fact that the connection
      // was already deleted or the intercom app was already uninstalled.
      logger.error(
        { connectorId: this.connectorId, error: e },
        "Error uninstalling Intercom, continuing..."
      );
    }

    const res = await connector.delete();
    if (res.isErr()) {
      logger.error(
        { connectorId: this.connectorId, error: res.error },
        "Error cleaning up Intercom connector."
      );
      return res;
    }

    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    const res = await stopIntercomSyncWorkflow(this.connectorId);
    if (res.isErr()) {
      return res;
    }

    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "[Intercom] Connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    try {
      await launchIntercomSyncWorkflow({
        connectorId: this.connectorId,
      });
    } catch (e) {
      logger.error(
        {
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceId: dataSourceConfig.dataSourceId,
          error: e,
        },
        "Error launching Intercom sync workflow."
      );
    }

    return new Ok(undefined);
  }

  async sync(): Promise<Result<string, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "Notion connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    const helpCentersIds = await IntercomHelpCenterModel.findAll({
      where: {
        connectorId: this.connectorId,
      },
      attributes: ["helpCenterId"],
    });
    const teamsIds = await IntercomTeamModel.findAll({
      where: {
        connectorId: this.connectorId,
      },
      attributes: ["teamId"],
    });

    const toBeSignaledHelpCenterIds = helpCentersIds.map(
      (hc) => hc.helpCenterId
    );
    const toBeSignaledTeamIds = teamsIds.map((team) => team.teamId);

    const sendSignalToWorkflowResult = await launchIntercomSyncWorkflow({
      connectorId: this.connectorId,
      helpCenterIds: toBeSignaledHelpCenterIds,
      teamIds: toBeSignaledTeamIds,
      forceResync: true,
    });
    if (sendSignalToWorkflowResult.isErr()) {
      return new Err(sendSignalToWorkflowResult.error);
    }
    return new Ok(connector.id.toString());
  }

  async retrievePermissions({
    parentInternalId,
    filterPermission,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
    viewType: ContentNodesViewType;
  }): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "[Intercom] Connector not found."
      );
      return new Err(
        new ConnectorManagerError("CONNECTOR_NOT_FOUND", "Connector not found")
      );
    }

    if (filterPermission === "read" && parentInternalId === null) {
      // We want all selected nodes despite the hierarchy
      const selectedNodes = await retrieveSelectedNodes({
        connectorId: this.connectorId,
      });
      return new Ok(selectedNodes);
    }

    try {
      const helpCenterNodes = await retrieveIntercomHelpCentersPermissions({
        connectorId: this.connectorId,
        parentInternalId,
        filterPermission,
        viewType: "document",
      });
      const convosNodes = await retrieveIntercomConversationsPermissions({
        connectorId: this.connectorId,
        parentInternalId,
        filterPermission,
        viewType: "document",
      });
      const nodes = [...helpCenterNodes, ...convosNodes];
      return new Ok(nodes);
    } catch (e) {
      if (e instanceof ExternalOAuthTokenError) {
        return new Err(
          new ConnectorManagerError(
            "EXTERNAL_OAUTH_TOKEN_ERROR",
            "Authorization error, please re-authorize Intercom."
          )
        );
      }
      // Unanhdled error, throwing to get a 500.
      throw e;
    }
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
  }): Promise<Result<string[], Error>> {
    // TODO: Implement this.
    return new Ok([internalId]);
  }

  async setPermissions({
    permissions,
  }: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "[Intercom] Connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    const intercomWorkspace = await IntercomWorkspaceModel.findOne({
      where: {
        connectorId: this.connectorId,
      },
    });
    if (!intercomWorkspace) {
      logger.error(
        { connectorId: this.connectorId },
        "[Intercom] IntercomWorkspace not found. Cannot set permissions."
      );
      return new Err(new Error("IntercomWorkspace not found"));
    }

    const connectionId = connector.connectionId;

    const toBeSignaledHelpCenterIds = new Set<string>();
    const toBeSignaledTeamIds = new Set<string>();
    let toBeSignaledSelectAllConversations = false;

    try {
      for (const [id, permission] of Object.entries(permissions)) {
        if (permission !== "none" && permission !== "read") {
          return new Err(
            new Error(
              `Invalid permission ${permission} for connector ${this.connectorId}`
            )
          );
        }

        const helpCenterId = getHelpCenterIdFromInternalId(
          this.connectorId,
          id
        );
        const collectionId = getHelpCenterCollectionIdFromInternalId(
          this.connectorId,
          id
        );
        const isAllConversations = isInternalIdForAllTeams(
          this.connectorId,
          id
        );
        const teamId = getTeamIdFromInternalId(this.connectorId, id);

        if (helpCenterId) {
          toBeSignaledHelpCenterIds.add(helpCenterId);
          if (permission === "none") {
            await revokeSyncHelpCenter({
              connectorId: this.connectorId,
              helpCenterId,
            });
          }
          if (permission === "read") {
            await allowSyncHelpCenter({
              connectorId: this.connectorId,
              connectionId,
              helpCenterId,
              region: intercomWorkspace.region,
              withChildren: true,
            });
          }
        } else if (collectionId) {
          if (permission === "none") {
            const revokedCollection = await revokeSyncCollection({
              connectorId: this.connectorId,
              collectionId,
            });
            if (revokedCollection) {
              toBeSignaledHelpCenterIds.add(revokedCollection.helpCenterId);
            }
          }
          if (permission === "read") {
            const newCollection = await allowSyncCollection({
              connectorId: this.connectorId,
              connectionId,
              collectionId,
              region: intercomWorkspace.region,
            });
            if (newCollection) {
              toBeSignaledHelpCenterIds.add(newCollection.helpCenterId);
            }
          }
        } else if (isAllConversations) {
          if (permission === "none") {
            await intercomWorkspace.update({
              syncAllConversations: "scheduled_revoke",
            });
            toBeSignaledSelectAllConversations = true;
          } else if (permission === "read") {
            await intercomWorkspace.update({
              syncAllConversations: "scheduled_activate",
            });
            toBeSignaledSelectAllConversations = true;
          }
        } else if (teamId) {
          if (permission === "none") {
            const revokedTeam = await revokeSyncTeam({
              connectorId: this.connectorId,
              teamId,
            });
            if (revokedTeam) {
              toBeSignaledTeamIds.add(revokedTeam.teamId);
            }
          }
          if (permission === "read") {
            const newTeam = await allowSyncTeam({
              connectorId: this.connectorId,
              connectionId,
              teamId,
            });
            if (newTeam) {
              toBeSignaledTeamIds.add(newTeam.teamId);
            }
          }
        }
      }

      if (
        toBeSignaledHelpCenterIds.size > 0 ||
        toBeSignaledTeamIds.size > 0 ||
        toBeSignaledSelectAllConversations
      ) {
        const sendSignalToWorkflowResult = await launchIntercomSyncWorkflow({
          connectorId: this.connectorId,
          helpCenterIds: [...toBeSignaledHelpCenterIds],
          teamIds: [...toBeSignaledTeamIds],
          hasUpdatedSelectAllConversations: toBeSignaledSelectAllConversations,
        });
        if (sendSignalToWorkflowResult.isErr()) {
          return new Err(sendSignalToWorkflowResult.error);
        }
      }

      return new Ok(undefined);
    } catch (e) {
      logger.error(
        {
          connectorId: this.connectorId,
          error: e,
        },
        "Error setting connector permissions."
      );
      return new Err(new Error("Error setting permissions"));
    }
  }

  async setConfigurationKey({
    configKey,
    configValue,
  }: {
    configKey: string;
    configValue: string;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found (connectorId: ${this.connectorId})`)
      );
    }

    switch (configKey) {
      case "intercomConversationsNotesSyncEnabled": {
        const connectorState = await IntercomWorkspaceModel.findOne({
          where: {
            connectorId: connector.id,
          },
        });
        if (!connectorState) {
          return new Err(
            new Error(
              `Connector state not found (connectorId: ${connector.id})`
            )
          );
        }

        await connectorState.update({
          shouldSyncNotes: configValue === "true",
        });

        const teamsIds = await IntercomTeamModel.findAll({
          where: {
            connectorId: this.connectorId,
          },
          attributes: ["teamId"],
        });
        const toBeSignaledTeamIds = teamsIds.map((team) => team.teamId);
        const r = await launchIntercomSyncWorkflow({
          connectorId: this.connectorId,
          teamIds: toBeSignaledTeamIds,
          forceResync: true,
        });
        if (r.isErr()) {
          return r;
        }

        return new Ok(void 0);
      }

      default: {
        return new Err(new Error(`Invalid config key ${configKey}`));
      }
    }
  }

  async getConfigurationKey({
    configKey,
  }: {
    configKey: string;
  }): Promise<Result<string | null, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found (connectorId: ${this.connectorId})`)
      );
    }

    switch (configKey) {
      case "intercomConversationsNotesSyncEnabled": {
        const connectorState = await IntercomWorkspaceModel.findOne({
          where: {
            connectorId: connector.id,
          },
        });
        if (!connectorState) {
          return new Err(
            new Error(
              `Connector state not found (connectorId: ${connector.id})`
            )
          );
        }

        return new Ok(connectorState.shouldSyncNotes.toString());
      }
      default:
        return new Err(new Error(`Invalid config key ${configKey}`));
    }
  }

  async pause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "[Intercom] Connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    await connector.markAsPaused();
    const stopRes = await this.stop();
    if (stopRes.isErr()) {
      return stopRes;
    }

    return new Ok(undefined);
  }

  async unpause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "[Intercom] Connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    await connector.markAsUnpaused();
    const teamsIds = await IntercomTeamModel.findAll({
      where: {
        connectorId: this.connectorId,
      },
      attributes: ["teamId"],
    });
    const toBeSignaledTeamIds = teamsIds.map((team) => team.teamId);
    const r = await launchIntercomSyncWorkflow({
      connectorId: this.connectorId,
      teamIds: toBeSignaledTeamIds,
    });
    if (r.isErr()) {
      return r;
    }

    return new Ok(undefined);
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}
