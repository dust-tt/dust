import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  Result,
} from "@dust-tt/types";
import { assertNever, Err, Ok } from "@dust-tt/types";

import type {
  CreateConnectorErrorCode,
  RetrievePermissionsErrorCode,
  UpdateConnectorErrorCode,
} from "@connectors/connectors/interface";
import {
  BaseConnectorManager,
  ConnectorManagerError,
} from "@connectors/connectors/interface";
import {
  allowSyncZendeskBrand,
  forbidSyncZendeskBrand,
} from "@connectors/connectors/zendesk/lib/brand_permissions";
import {
  allowSyncZendeskCategory,
  allowSyncZendeskHelpCenter,
  forbidSyncZendeskCategory,
  forbidSyncZendeskHelpCenter,
} from "@connectors/connectors/zendesk/lib/help_center_permissions";
import {
  getBrandInternalId,
  getIdFromInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import {
  retrieveAllSelectedNodes,
  retrieveChildrenNodes,
} from "@connectors/connectors/zendesk/lib/permissions";
import {
  allowSyncZendeskTickets,
  forbidSyncZendeskTickets,
} from "@connectors/connectors/zendesk/lib/ticket_permissions";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { fetchZendeskCurrentUser } from "@connectors/connectors/zendesk/lib/zendesk_api";
import {
  launchZendeskFullSyncWorkflow,
  launchZendeskGarbageCollectionWorkflow,
  launchZendeskSyncWorkflow,
  stopZendeskWorkflows,
} from "@connectors/connectors/zendesk/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { ZendeskTimestampCursor } from "@connectors/lib/models/zendesk";
import { syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskArticleResource,
  ZendeskBrandResource,
  ZendeskCategoryResource,
  ZendeskConfigurationResource,
  ZendeskTicketResource,
} from "@connectors/resources/zendesk_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export class ZendeskConnectorManager extends BaseConnectorManager<null> {
  static async create({
    dataSourceConfig,
    connectionId,
  }: {
    dataSourceConfig: DataSourceConfig;
    connectionId: string;
  }): Promise<Result<string, ConnectorManagerError<CreateConnectorErrorCode>>> {
    const { subdomain, accessToken } =
      await getZendeskSubdomainAndAccessToken(connectionId);
    const zendeskUser = await fetchZendeskCurrentUser({
      subdomain,
      accessToken,
    });
    if (!zendeskUser.active || zendeskUser.role !== "admin") {
      throw new ExternalOAuthTokenError(
        new Error(`Zendesk user is not an admin: connectionId=${connectionId}`)
      );
    }

    const connector = await ConnectorResource.makeNew(
      "zendesk",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      { subdomain, retentionPeriodDays: 180 }
    );
    const loggerArgs = {
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceId: dataSourceConfig.dataSourceId,
    };

    let result = await launchZendeskSyncWorkflow(connector);
    if (result.isErr()) {
      await connector.delete();
      logger.error(
        { ...loggerArgs, error: result.error },
        "[Zendesk] Error launching the sync workflow."
      );
      throw result.error;
    }

    result = await launchZendeskGarbageCollectionWorkflow(connector);
    if (result.isErr()) {
      await connector.delete();
      logger.error(
        { ...loggerArgs, error: result.error },
        "[Zendesk] Error launching the garbage collection workflow."
      );
      throw result.error;
    }

    // artificially marking the sync as succeeded since we can create the connection without syncing anything
    await syncSucceeded(connector.id);

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId?: string | null;
  }): Promise<Result<string, ConnectorManagerError<UpdateConnectorErrorCode>>> {
    const { connectorId } = this;

    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      throw new Error(`Connector ${connectorId} not found`);
    }

    const configuration =
      await ZendeskConfigurationResource.fetchByConnectorId(connectorId);
    if (!configuration) {
      throw new Error(
        "Error retrieving Zendesk configuration to update connector"
      );
    }

    if (connectionId) {
      const newConnectionId = connectionId;

      const { subdomain: newSubdomain } =
        await getZendeskSubdomainAndAccessToken(newConnectionId);

      if (configuration.subdomain !== newSubdomain) {
        return new Err(
          new ConnectorManagerError(
            "CONNECTOR_OAUTH_TARGET_MISMATCH",
            "Cannot change the subdomain of a Zendesk connector"
          )
        );
      }

      await connector.update({ connectionId: newConnectionId });

      // if the connector was previously paused, unpause it.
      if (connector.isPaused()) {
        await this.unpause();
      }
    }
    return new Ok(connector.id.toString());
  }

  /**
   * Deletes the connector and all its related resources.
   */
  async clean(): Promise<Result<undefined, Error>> {
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      return new Err(new Error("Connector not found"));
    }

    const result = await connector.delete();
    if (result.isErr()) {
      logger.error(
        { connectorId, error: result.error },
        "[Zendesk] Error while cleaning up the connector."
      );
    }
    return result;
  }

  /**
   * Stops all workflows related to the connector (sync and garbage collection).
   */
  async stop(): Promise<Result<undefined, Error>> {
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      throw new Error(
        `[Zendesk] Connector not found. ConnectorId: ${connectorId}`
      );
    }
    return stopZendeskWorkflows(connector);
  }

  /**
   * Launches an incremental workflow (sync workflow without signals) and the garbage collection workflow for the connector.
   */
  async resume(): Promise<Result<undefined, Error>> {
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      return new Err(new Error("Connector not found"));
    }

    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    const loggerArgs = {
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceId: dataSourceConfig.dataSourceId,
    };

    const syncResult = await launchZendeskSyncWorkflow(connector);
    if (syncResult.isErr()) {
      logger.error(
        { ...loggerArgs, error: syncResult.error },
        "[Zendesk] Error resuming the sync workflow."
      );
      return syncResult;
    }

    const gcResult = await launchZendeskGarbageCollectionWorkflow(connector);
    if (gcResult.isErr()) {
      logger.error(
        { ...loggerArgs, error: gcResult.error },
        "[Zendesk] Error resuming the garbage collection workflow."
      );
      return gcResult;
    }
    return new Ok(undefined);
  }

  /**
   * Launches a full re-sync workflow for the connector,
   * syncing every resource selected by the user with forceResync = true.
   */
  async sync({
    fromTs,
  }: {
    fromTs: number | null;
  }): Promise<Result<string, Error>> {
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      return new Err(new Error("Connector not found"));
    }

    // launching an incremental workflow taking the diff starting from the given timestamp
    if (fromTs) {
      const cursors = await ZendeskTimestampCursor.findOne({
        where: { connectorId },
      });
      if (!cursors) {
        throw new Error(
          "[Zendesk] Cannot use fromTs on a connector that has never completed an initial sync."
        );
      }
      await cursors.update({ timestampCursor: new Date(fromTs) });
      const result = await launchZendeskSyncWorkflow(connector);
      return result.isErr() ? result : new Ok(connector.id.toString());
    } else {
      await ZendeskTimestampCursor.destroy({ where: { connectorId } });
    }

    // launching a full sync workflow otherwise
    return launchZendeskFullSyncWorkflow(connector, { forceResync: true });
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
    if (filterPermission === "read" && parentInternalId === null) {
      // retrieving all the selected nodes despite the hierarchy
      return new Ok(await retrieveAllSelectedNodes(this.connectorId));
    }

    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "[Zendesk] Connector not found."
      );
      return new Err(
        new ConnectorManagerError("CONNECTOR_NOT_FOUND", "Connector not found")
      );
    }

    const nodes = await retrieveChildrenNodes({
      connector,
      parentInternalId,
      filterPermission,
      viewType: "documents",
    });

    nodes.sort((a, b) => a.title.localeCompare(b.title));
    return new Ok(nodes);
  }

  /**
   * Updates the permissions stored in db,
   * then launches a sync workflow with the signals
   * corresponding to the resources that were modified to reflect the changes.
   */
  async setPermissions({
    permissions,
  }: {
    permissions: Record<string, ConnectorPermission>;
  }): Promise<Result<void, Error>> {
    const { connectorId } = this;

    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      return new Err(new Error("Connector not found"));
    }
    const { connectionId } = connector;

    const toBeSignaledBrandIds = new Set<number>();
    const toBeSignaledTicketsIds = new Set<number>();
    const toBeSignaledHelpCenterIds = new Set<number>();
    const toBeSignaledCategoryIds = new Set<number>();
    const categoryBrandIds: Record<number, number> = {};

    for (const [id, permission] of Object.entries(permissions)) {
      if (permission !== "none" && permission !== "read") {
        return new Err(
          new Error(
            `Invalid permission ${permission} for connector ${connectorId}`
          )
        );
      }

      const { type, objectId } = getIdFromInternalId(connectorId, id);
      switch (type) {
        case "brand": {
          if (permission === "none") {
            const updatedBrand = await forbidSyncZendeskBrand({
              connectorId,
              brandId: objectId,
            });
            if (updatedBrand) {
              toBeSignaledBrandIds.add(objectId);
            }
          }
          if (permission === "read") {
            const wasBrandUpdated = await allowSyncZendeskBrand({
              connectorId,
              connectionId,
              brandId: objectId,
            });
            if (wasBrandUpdated) {
              toBeSignaledBrandIds.add(objectId);
            }
          }
          break;
        }
        case "help-center": {
          if (permission === "none") {
            const updatedBrandHelpCenter = await forbidSyncZendeskHelpCenter({
              connectorId,
              brandId: objectId,
            });
            if (updatedBrandHelpCenter) {
              toBeSignaledHelpCenterIds.add(updatedBrandHelpCenter.brandId);
            }
          }
          if (permission === "read") {
            const wasBrandUpdated = await allowSyncZendeskHelpCenter({
              connectorId,
              connectionId,
              brandId: objectId,
            });
            if (wasBrandUpdated) {
              toBeSignaledHelpCenterIds.add(objectId);
            }
          }
          break;
        }
        case "tickets": {
          if (permission === "none") {
            const updatedBrandTickets = await forbidSyncZendeskTickets({
              connectorId,
              brandId: objectId,
            });
            if (updatedBrandTickets) {
              toBeSignaledTicketsIds.add(updatedBrandTickets.brandId);
            }
          }
          if (permission === "read") {
            const wasBrandUpdated = await allowSyncZendeskTickets({
              connectorId,
              connectionId,
              brandId: objectId,
            });
            if (wasBrandUpdated) {
              toBeSignaledTicketsIds.add(objectId);
            }
          }
          break;
        }
        case "category": {
          if (permission === "none") {
            const updatedCategory = await forbidSyncZendeskCategory({
              connectorId,
              categoryId: objectId.categoryId,
            });
            if (updatedCategory) {
              toBeSignaledCategoryIds.add(updatedCategory.categoryId);
              categoryBrandIds[updatedCategory.categoryId] =
                updatedCategory.brandId;
            }
          }
          if (permission === "read") {
            const newCategory = await allowSyncZendeskCategory({
              connectorId,
              connectionId,
              categoryId: objectId.categoryId,
              brandId: objectId.brandId,
            });
            if (newCategory) {
              toBeSignaledCategoryIds.add(newCategory.categoryId);
              categoryBrandIds[newCategory.categoryId] = newCategory.brandId;
            }
          }
          break;
        }
        // we do not set permissions for single articles and tickets
        case "article":
        case "ticket":
          logger.error(
            { connectorId, objectId },
            "[Zendesk] Cannot set permissions for a single article or ticket"
          );
          return new Err(
            new Error("Cannot set permissions for a single article or ticket")
          );
        default:
          assertNever(type);
      }
    }

    if (
      toBeSignaledBrandIds.size > 0 ||
      toBeSignaledTicketsIds.size > 0 ||
      toBeSignaledHelpCenterIds.size > 0 ||
      toBeSignaledCategoryIds.size > 0
    ) {
      return launchZendeskSyncWorkflow(connector, {
        brandIds: [...toBeSignaledBrandIds],
        ticketsBrandIds: [...toBeSignaledTicketsIds],
        helpCenterBrandIds: [...toBeSignaledHelpCenterIds],
        categoryIds: [...toBeSignaledCategoryIds].map((categoryId) => ({
          categoryId,
          brandId: categoryBrandIds[categoryId] as number,
        })),
      });
    }

    return new Ok(undefined);
  }

  /**
   * Retrieves a batch of content nodes given their internal IDs.
   */
  async retrieveBatchContentNodes({
    internalIds,
  }: {
    internalIds: string[];
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    const brandIds: number[] = [];
    const brandHelpCenterIds: number[] = [];
    const brandTicketsIds: number[] = [];
    const categoryIds: number[] = [];
    const articleIds: number[] = [];
    const ticketIds: number[] = [];
    internalIds.forEach((internalId) => {
      const { type, objectId } = getIdFromInternalId(
        this.connectorId,
        internalId
      );
      switch (type) {
        case "brand": {
          brandIds.push(objectId);
          return;
        }
        case "tickets": {
          brandTicketsIds.push(objectId);
          return;
        }
        case "help-center": {
          brandHelpCenterIds.push(objectId);
          return;
        }
        case "category": {
          categoryIds.push(objectId.categoryId);
          return;
        }
        case "article": {
          articleIds.push(objectId);
          return;
        }
        case "ticket": {
          ticketIds.push(objectId);
          return;
        }
        default: {
          assertNever(type);
        }
      }
    });

    const { connectorId } = this;

    const allBrandIds = [
      ...new Set([...brandIds, ...brandTicketsIds, ...brandHelpCenterIds]),
    ];
    const allBrands = await ZendeskBrandResource.fetchByBrandIds({
      connectorId,
      brandIds: allBrandIds,
    });
    const brands = allBrands.filter((brand) =>
      brandIds.includes(brand.brandId)
    );
    const brandHelpCenters = allBrands.filter((brand) =>
      brandHelpCenterIds.includes(brand.brandId)
    );
    const brandTickets = allBrands.filter((brand) =>
      brandTicketsIds.includes(brand.brandId)
    );

    const categories = await ZendeskCategoryResource.fetchByCategoryIds({
      connectorId,
      categoryIds,
    });
    const articles = await ZendeskArticleResource.fetchByArticleIds({
      connectorId,
      articleIds,
    });
    const tickets = await ZendeskTicketResource.fetchByTicketIds({
      connectorId,
      ticketIds,
    });

    return new Ok([
      ...brands.map((brand) => brand.toContentNode(connectorId)),
      ...brandHelpCenters.map((brand) =>
        brand.getHelpCenterContentNode(connectorId, { richTitle: true })
      ),
      ...brandTickets.map((brand) =>
        brand.getTicketsContentNode(connectorId, { richTitle: true })
      ),
      ...categories.map((category) => category.toContentNode(connectorId)),
      ...articles.map((article) => article.toContentNode(connectorId)),
      ...tickets.map((ticket) => ticket.toContentNode(connectorId)),
    ]);
  }

  /**
   * Retrieves the parent IDs of a content node in hierarchical order.
   * The first ID is the internal ID of the content node itself.
   */
  async retrieveContentNodeParents({
    internalId,
  }: {
    internalId: string;
    memoizationKey?: string;
  }): Promise<Result<string[], Error>> {
    const { connectorId } = this;

    const { type, objectId } = getIdFromInternalId(connectorId, internalId);
    switch (type) {
      case "brand": {
        return new Ok([internalId]);
      }
      /// Help Centers and tickets are just beneath their brands, so they have one parent.
      case "help-center":
      case "tickets": {
        return new Ok([
          internalId,
          getBrandInternalId({ connectorId, brandId: objectId }),
        ]);
      }
      case "category": {
        const category = await ZendeskCategoryResource.fetchByCategoryId({
          connectorId,
          categoryId: objectId.categoryId,
        });
        if (category) {
          return new Ok(category.getParentInternalIds(connectorId));
        } else {
          const { brandId, categoryId } = objectId;
          logger.error(
            { connectorId, categoryId, brandId },
            "[Zendesk] Category not found"
          );
          return new Err(new Error("Category not found"));
        }
      }
      case "article": {
        const article = await ZendeskArticleResource.fetchByArticleId({
          connectorId,
          articleId: objectId,
        });
        if (article) {
          return new Ok(article.getParentInternalIds(connectorId));
        } else {
          logger.error(
            { connectorId, articleId: objectId },
            "[Zendesk] Article not found"
          );
          return new Err(new Error("Article not found"));
        }
      }
      case "ticket": {
        const ticket = await ZendeskTicketResource.fetchByTicketId({
          connectorId,
          ticketId: objectId,
        });
        if (ticket) {
          return new Ok(ticket.getParentInternalIds(connectorId));
        } else {
          logger.error(
            { connectorId, ticketId: objectId },
            "[Zendesk] Ticket not found"
          );
          return new Err(new Error("Ticket not found"));
        }
      }
      default:
        assertNever(type);
    }
  }

  async setConfigurationKey({
    configKey,
    configValue,
  }: {
    configKey: string;
    configValue: string;
  }): Promise<Result<void, Error>> {
    logger.info({ configKey, configValue }, "Setting configuration key");
    throw new Error("Method not implemented.");
  }

  async getConfigurationKey({
    configKey,
  }: {
    configKey: string;
  }): Promise<Result<string | null, Error>> {
    logger.info({ configKey }, "Getting configuration key");
    throw new Error("Method not implemented.");
  }

  /**
   * Marks the connector as paused in db and stops all workflows.
   */
  async pause(): Promise<Result<undefined, Error>> {
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      return new Err(new Error("Connector not found"));
    }
    await connector.markAsPaused();
    return this.stop();
  }

  /**
   * Marks the connector as unpaused in db and restarts the workflows.
   * Does not trigger full syncs, only restart the incremental and gc workflows.
   */
  async unpause(): Promise<Result<undefined, Error>> {
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      return new Err(new Error("Connector not found"));
    }
    await connector.markAsUnpaused();
    // launch a gc and an incremental workflow (sync workflow without signals).
    return this.resume();
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}
