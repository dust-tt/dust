import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import {
  getConfluenceAccessToken,
  getConfluenceCloudInformation,
  getConfluenceUserAccountId,
  listConfluenceSpaces,
} from "@connectors/connectors/confluence/lib/confluence_api";
import type { ConfluenceSpaceType } from "@connectors/connectors/confluence/lib/confluence_client";
import { getConfluenceIdFromInternalId } from "@connectors/connectors/confluence/lib/internal_ids";
import {
  retrieveAvailableSpaces,
  retrieveHierarchyForParent,
} from "@connectors/connectors/confluence/lib/permissions";
import {
  launchConfluencePersonalDataReportingSchedule,
  launchConfluenceRemoveSpacesSyncWorkflow,
  launchConfluenceSyncWorkflow,
  stopConfluenceSyncWorkflow,
} from "@connectors/connectors/confluence/temporal/client";
import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import {
  ConfluenceConfiguration,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ConnectorPermission, ContentNode } from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";
import { ConfluenceClientError } from "@connectors/types";

const logger = mainLogger.child({
  connector: "confluence",
});

export class ConfluenceConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const confluenceAccessTokenRes =
      await getConfluenceAccessToken(connectionId);
    if (confluenceAccessTokenRes.isErr()) {
      throw confluenceAccessTokenRes.error;
    }

    const confluenceAccessToken = confluenceAccessTokenRes.value;

    const confluenceCloudInformation = await getConfluenceCloudInformation(
      confluenceAccessToken
    );
    if (!confluenceCloudInformation) {
      throw new Error("Confluence access token is invalid");
    }

    const userAccountId = await getConfluenceUserAccountId(
      confluenceAccessToken
    );

    const { id: cloudId, url: cloudUrl } = confluenceCloudInformation;

    const confluenceConfigurationBlob = {
      cloudId,
      url: cloudUrl,
      userAccountId,
    };

    const connector = await ConnectorResource.makeNew(
      "confluence",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      confluenceConfigurationBlob
    );

    const workflowStarted = await launchConfluenceSyncWorkflow(
      connector.id,
      null
    );
    if (workflowStarted.isErr()) {
      throw workflowStarted.error;
    }

    await launchConfluencePersonalDataReportingSchedule();

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found.");
      throw new Error(`Connector ${this.connectorId} not found`);
    }

    if (connectionId) {
      const currentCloudInformation = await ConfluenceConfiguration.findOne({
        attributes: ["cloudId"],
        where: {
          connectorId: this.connectorId,
        },
      });

      const confluenceAccessTokenRes =
        await getConfluenceAccessToken(connectionId);
      if (confluenceAccessTokenRes.isErr()) {
        throw new Error(confluenceAccessTokenRes.error.message);
      }

      const newConfluenceCloudInformation = await getConfluenceCloudInformation(
        confluenceAccessTokenRes.value
      );

      // Change connection only if "cloudId" matches.
      if (
        newConfluenceCloudInformation &&
        currentCloudInformation &&
        newConfluenceCloudInformation.id === currentCloudInformation.cloudId
      ) {
        await connector.update({ connectionId });

        // If connector was previously paused, unpause it.
        if (connector.isPaused()) {
          await this.unpause();
        }
      } else {
        logger.info(
          {
            connectorId: this.connectorId,
            newCloudId: newConfluenceCloudInformation?.id,
            previousCloudId: currentCloudInformation?.cloudId,
          },
          "Cannot change the workspace of a Confluence connector"
        );

        return new Err(
          new ConnectorManagerError(
            "CONNECTOR_OAUTH_TARGET_MISMATCH",
            "Cannot change the workspace of a Confluence connector"
          )
        );
      }
    }

    return new Ok(connector.id.toString());
  }

  async clean(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "Confluence connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    const res = await connector.delete();
    if (res.isErr()) {
      logger.error(
        { connectorId: this.connectorId, error: res.error },
        "Error cleaning up Confluence connector."
      );
      return res;
    }

    return new Ok(undefined);
  }

  async stop(): Promise<Result<undefined, Error>> {
    const res = await stopConfluenceSyncWorkflow(this.connectorId);
    if (res.isErr()) {
      return res;
    }

    return new Ok(undefined);
  }

  async resume(): Promise<Result<undefined, Error>> {
    try {
      const connector = await ConnectorResource.fetchById(this.connectorId);
      if (!connector) {
        return new Err(
          new Error(
            `Confluence connector not found (connectorId: ${this.connectorId}`
          )
        );
      }

      const connectorState = await ConfluenceConfiguration.findOne({
        where: {
          connectorId: connector.id,
        },
      });
      if (!connectorState) {
        return new Err(new Error("Confluence configuration not found"));
      }

      await launchConfluenceSyncWorkflow(connector.id, null);

      return new Ok(undefined);
    } catch (err) {
      return new Err(err as Error);
    }
  }

  async sync({
    fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    const spaces = await ConfluenceSpace.findAll({
      attributes: ["spaceId"],
      where: {
        connectorId: this.connectorId,
      },
    });

    return launchConfluenceSyncWorkflow(
      this.connectorId,
      fromTs,
      spaces.map((s) => s.spaceId),
      true
    );
  }

  async retrievePermissions({
    parentInternalId,
    filterPermission,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
  }): Promise<
    Result<ContentNode[], ConnectorManagerError<RetrievePermissionsErrorCode>>
  > {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(
        new ConnectorManagerError("CONNECTOR_NOT_FOUND", "Connector not found")
      );
    }

    const confluenceConfig = await ConfluenceConfiguration.findOne({
      where: {
        connectorId: this.connectorId,
      },
    });
    if (!confluenceConfig) {
      logger.error(
        { connectorId: this.connectorId },
        "Confluence configuration not found"
      );
      throw new Error("Confluence configuration not found");
    }

    try {
      // When the filter permission is set to 'read', the full hierarchy of spaces
      // and pages that Dust can access is displayed to the user.
      if (filterPermission === "read") {
        const data = await retrieveHierarchyForParent(
          connector,
          confluenceConfig,
          parentInternalId
        );
        if (data.isErr()) {
          throw data.error;
        }

        return new Ok(data.value);
      } else {
        // If the permission is not set to 'read', users are limited to selecting only
        // spaces for synchronization with Dust.
        const allSpacesRes = await retrieveAvailableSpaces(
          connector,
          confluenceConfig
        );
        if (allSpacesRes.isErr()) {
          throw allSpacesRes.error;
        }

        return allSpacesRes;
      }
    } catch (e) {
      if (e instanceof ExternalOAuthTokenError) {
        return new Err(
          new ConnectorManagerError(
            "EXTERNAL_OAUTH_TOKEN_ERROR",
            "Confluence authorization error, please re-authorize."
          )
        );
      }
      if (e instanceof ConfluenceClientError && e.status === 429) {
        return new Err(
          new ConnectorManagerError(
            "RATE_LIMIT_ERROR",
            `Confluence rate limit error when retrieving content nodes.`
          )
        );
      }
      // Unanhdled error, throwing to get a 500.
      throw e;
    }
  }

  async setPermissions({
    permissions,
  }: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      return new Err(
        new Error(`Connector not found with id ${this.connectorId}`)
      );
    }

    let spaces: ConfluenceSpaceType[] = [];
    // Fetch Confluence spaces only if the intention is to add new spaces to sync.
    const shouldFetchConfluenceSpaces = Object.values(permissions).some(
      (permission) => permission === "read"
    );
    if (shouldFetchConfluenceSpaces) {
      const spacesRes = await listConfluenceSpaces(connector);
      if (spacesRes.isErr()) {
        return spacesRes;
      }

      spaces = spacesRes.value;
    }

    const addedSpaceIds = [];
    const removedSpaceIds = [];
    for (const [internalId, permission] of Object.entries(permissions)) {
      const confluenceId = getConfluenceIdFromInternalId(internalId);
      if (permission === "none") {
        await ConfluenceSpace.destroy({
          where: {
            connectorId: this.connectorId,
            spaceId: confluenceId,
          },
        });

        removedSpaceIds.push(confluenceId);
      } else if (permission === "read") {
        const confluenceSpace = spaces.find((s) => s.id === confluenceId);

        await ConfluenceSpace.upsert({
          connectorId: this.connectorId,
          name: confluenceSpace?.name ?? confluenceId,
          spaceId: confluenceId,
          urlSuffix: confluenceSpace?._links.webui,
        });

        addedSpaceIds.push(confluenceId);
      } else {
        return new Err(
          new Error(
            `Invalid permission ${permission} for resource ${confluenceId}`
          )
        );
      }
    }

    if (addedSpaceIds.length > 0) {
      const addedSpacesResult = await launchConfluenceSyncWorkflow(
        this.connectorId,
        null,
        addedSpaceIds
      );
      if (addedSpacesResult.isErr()) {
        return new Err(addedSpacesResult.error);
      }
    }

    if (removedSpaceIds.length > 0) {
      const removedSpacesResult =
        await launchConfluenceRemoveSpacesSyncWorkflow(
          this.connectorId,
          removedSpaceIds
        );
      if (removedSpacesResult.isErr()) {
        return new Err(removedSpacesResult.error);
      }
    }

    return new Ok(undefined);
  }

  async pause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found.");
      return new Err(new Error("Connector not found"));
    }

    await connector.markAsPaused();
    const r = await stopConfluenceSyncWorkflow(this.connectorId);
    if (r.isErr()) {
      return r;
    }

    return new Ok(undefined);
  }

  async unpause(): Promise<Result<undefined, Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found.");
      return new Err(new Error("Connector not found"));
    }

    await connector.markAsUnpaused();
    const r = await launchConfluenceSyncWorkflow(this.connectorId, null);
    if (r.isErr()) {
      return r;
    }

    return new Ok(undefined);
  }

  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
  }): Promise<Result<string[], Error>> {
    // Confluence only let you select spaces (root nodes).
    return new Ok([internalId]);
  }

  async setConfigurationKey(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }

  async getConfigurationKey(): Promise<Result<string | null, Error>> {
    throw new Error("Method not implemented.");
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}
