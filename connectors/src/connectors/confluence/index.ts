import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ContentNodesViewType,
  Result,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { Mutex } from "async-mutex";

import {
  getConfluenceAccessToken,
  getConfluenceCloudInformation,
  getConfluenceUserAccountId,
  listConfluenceSpaces,
} from "@connectors/connectors/confluence/lib/confluence_api";
import type { ConfluenceSpaceType } from "@connectors/connectors/confluence/lib/confluence_client";
import {
  getConfluencePageParentIds,
  getSpaceHierarchy,
} from "@connectors/connectors/confluence/lib/hierarchy";
import {
  getIdFromConfluenceInternalId,
  isConfluenceInternalPageId,
  isConfluenceInternalSpaceId,
  makeConfluenceInternalSpaceId,
} from "@connectors/connectors/confluence/lib/internal_ids";
import {
  checkPageHasChildren,
  createContentNodeFromPage,
  createContentNodeFromSpace,
  retrieveAvailableSpaces,
  retrieveHierarchyForParent,
} from "@connectors/connectors/confluence/lib/permissions";
import {
  launchConfluencePersonalDataReportingSchedule,
  launchConfluenceRemoveSpacesSyncWorkflow,
  launchConfluenceSyncWorkflow,
  stopConfluenceSyncWorkflow,
} from "@connectors/connectors/confluence/temporal/client";
import type { ConnectorManagerError } from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import {
  ConfluenceConfiguration,
  ConfluencePage,
  ConfluenceSpace,
} from "@connectors/lib/models/confluence";
import mainLogger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

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
  }): Promise<Result<string, ConnectorManagerError>> {
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
  }): Promise<Result<string, ConnectorsAPIError>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found.");
      return new Err({
        message: "Connector not found",
        type: "connector_not_found",
      });
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
        return new Err({
          type: "connector_oauth_error",
          message: confluenceAccessTokenRes.error.message,
        });
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
      } else {
        logger.info(
          {
            connectorId: this.connectorId,
            newCloudId: newConfluenceCloudInformation?.id,
            previousCloudId: currentCloudInformation?.cloudId,
          },
          "Cannot change the workspace of a Confluence connector"
        );

        return new Err({
          type: "connector_oauth_target_mismatch",
          message: "Cannot change the workspace of a Confluence connector",
        });
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
  }): Promise<Result<ContentNode[], Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId: this.connectorId }, "Connector not found");
      return new Err(new Error("Connector not found"));
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
      return new Err(new Error("Confluence configuration not found"));
    }

    // When the filter permission is set to 'read', the full hierarchy of spaces
    // and pages that Dust can access is displayed to the user.
    if (filterPermission === "read") {
      const data = await retrieveHierarchyForParent(
        connector,
        confluenceConfig,
        parentInternalId
      );

      if (data.isErr()) {
        return new Err(data.error);
      }

      return new Ok(data.value);
    } else {
      // If the permission is not set to 'read', users are limited to selecting only
      // spaces for synchronization with Dust.
      const allSpacesRes = await retrieveAvailableSpaces(
        connector,
        confluenceConfig
      );

      return allSpacesRes;
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
      const confluenceId = getIdFromConfluenceInternalId(internalId);
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

  async retrieveBatchContentNodes({
    internalIds,
  }: {
    internalIds: string[];
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    const connectorState = await ConfluenceConfiguration.findOne({
      where: {
        connectorId: this.connectorId,
      },
    });
    if (!connectorState) {
      return new Err(new Error("Confluence configuration not found"));
    }

    const spaceIds: string[] = [];
    const pageIds: string[] = [];

    internalIds.forEach((internalId) => {
      if (isConfluenceInternalSpaceId(internalId)) {
        spaceIds.push(getIdFromConfluenceInternalId(internalId));
      } else if (isConfluenceInternalPageId(internalId)) {
        pageIds.push(getIdFromConfluenceInternalId(internalId));
      }
    });

    const [confluenceSpaces, confluencePages] = await Promise.all([
      ConfluenceSpace.findAll({
        where: {
          connectorId: this.connectorId,
          spaceId: spaceIds,
        },
      }),
      ConfluencePage.findAll({
        where: {
          connectorId: this.connectorId,
          pageId: pageIds,
        },
      }),
    ]);

    const spaceContentNodes: ContentNode[] = confluenceSpaces.map((space) => {
      return createContentNodeFromSpace(space, connectorState.url, "read", {
        isExpandable: true,
      });
    });

    const pageContentNodes: ContentNode[] = await concurrentExecutor(
      confluencePages,
      async (page) => {
        let parentId: string;
        let parentType: "page" | "space";

        if (page.parentId) {
          parentId = page.parentId;
          parentType = "page";
        } else {
          parentId = page.spaceId;
          parentType = "space";
        }
        const isExpandable = await checkPageHasChildren(
          this.connectorId,
          page.pageId
        );

        return createContentNodeFromPage(
          { id: parentId, type: parentType },
          connectorState.url,
          page,
          isExpandable
        );
      },
      { concurrency: 8 }
    );

    const contentNodes = spaceContentNodes.concat(pageContentNodes);
    return new Ok(contentNodes);
  }

  private _cachedHierarchyMutex = new Mutex();
  private _cachedHierarchy: Map<string, Map<string, string | null>> = new Map();

  private async getCachedHierarchy(
    memoizationKey: string,
    spaceId: string
  ): Promise<Map<string, string | null>> {
    return this._cachedHierarchyMutex.runExclusive(async () => {
      if (!this._cachedHierarchy.has(memoizationKey)) {
        this._cachedHierarchy.set(
          memoizationKey,
          await getSpaceHierarchy(this.connectorId, spaceId)
        );
      }

      // pleasing typescript
      const cachedHierarchy = this._cachedHierarchy.get(memoizationKey);
      if (!cachedHierarchy) {
        throw new Error("Unreachable: Cached hierarchy is not set.");
      }
      return cachedHierarchy;
    });
  }

  async retrieveContentNodeParents({
    internalId,
    memoizationKey,
  }: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>> {
    if (isConfluenceInternalSpaceId(internalId)) {
      return new Ok([internalId]);
    }

    if (isConfluenceInternalPageId(internalId)) {
      const confluenceId = getIdFromConfluenceInternalId(internalId);
      const currentPage = await ConfluencePage.findOne({
        attributes: ["pageId", "parentId", "spaceId"],
        where: {
          connectorId: this.connectorId,
          pageId: confluenceId,
        },
      });

      if (!currentPage) {
        return new Err(new Error("Confluence page not found."));
      }

      // If the page does not have a parentId, return only the spaceId.
      if (!currentPage.parentId) {
        return new Ok([
          internalId,
          makeConfluenceInternalSpaceId(currentPage.spaceId),
        ]);
      }

      // if a memoization key is provided, use it to cache the hierarchy which
      // is expensive to compute
      const cachedHierarchy = memoizationKey
        ? await this.getCachedHierarchy(memoizationKey, currentPage.spaceId)
        : undefined;

      const parentIds = await getConfluencePageParentIds(
        this.connectorId,
        currentPage,
        cachedHierarchy
      );
      return new Ok(parentIds);
    }

    return new Ok([]);
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
