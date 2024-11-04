import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ContentNodesViewType,
  Result,
} from "@dust-tt/types";
import { assertNever, Err, Ok } from "@dust-tt/types";

import type { ConnectorManagerError } from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import {
  allowSyncZendeskBrand,
  revokeSyncZendeskBrand,
} from "@connectors/connectors/zendesk/lib/brand_permissions";
import {
  allowSyncZendeskCategory,
  allowSyncZendeskHelpCenter,
  revokeSyncZendeskCategory,
  revokeSyncZendeskHelpCenter,
} from "@connectors/connectors/zendesk/lib/help_center_permissions";
import {
  getBrandInternalId,
  getCategoryInternalId,
  getHelpCenterInternalId,
  getIdFromInternalId,
  getTicketsInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import {
  retrieveChildrenNodes,
  retrieveSelectedNodes,
} from "@connectors/connectors/zendesk/lib/permissions";
import {
  allowSyncZendeskTickets,
  revokeSyncZendeskTickets,
} from "@connectors/connectors/zendesk/lib/ticket_permissions";
import { getZendeskAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  launchZendeskSyncWorkflow,
  stopZendeskSyncWorkflow,
} from "@connectors/connectors/zendesk/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
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
  }): Promise<Result<string, ConnectorManagerError>> {
    await getZendeskAccessToken(connectionId);

    const connector = await ConnectorResource.makeNew(
      "zendesk",
      {
        connectionId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
      },
      { subdomain: "d3v-dust", conversationsSlidingWindow: 90 }
    );

    const workflowStartResult = await launchZendeskSyncWorkflow(connector);

    if (workflowStartResult.isErr()) {
      await connector.delete();
      logger.error(
        {
          workspaceId: dataSourceConfig.workspaceId,
          error: workflowStartResult.error,
        },
        "[Zendesk] Error launching the sync workflow."
      );
      throw workflowStartResult.error;
    }

    return new Ok(connector.id.toString());
  }

  async update({
    connectionId,
  }: {
    connectionId: string;
  }): Promise<Result<string, ConnectorsAPIError>> {
    logger.info({ connectionId }, "Updating Zendesk connector");
    throw new Error("Method not implemented.");
  }

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

  async stop(): Promise<Result<undefined, Error>> {
    return stopZendeskSyncWorkflow(this.connectorId);
  }

  async resume(): Promise<Result<undefined, Error>> {
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      return new Err(new Error("Connector not found"));
    }

    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    const result = await launchZendeskSyncWorkflow(connector);
    if (result.isErr()) {
      logger.error(
        {
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceId: dataSourceConfig.dataSourceId,
          error: result.error,
        },
        "[Zendesk] Error resuming the sync workflow."
      );
      return result;
    }
    return new Ok(undefined);
  }

  async sync(): Promise<Result<string, Error>> {
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      return new Err(new Error("Connector not found"));
    }

    const brandIds = await ZendeskBrandResource.fetchAllBrandIds({
      connectorId,
    });
    const result = await launchZendeskSyncWorkflow(connector, {
      brandIds,
      forceResync: true,
    });

    return result.isErr() ? result : new Ok(connector.id.toString());
  }

  async retrievePermissions({
    parentInternalId,
    filterPermission,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      return new Err(new Error("Connector not found"));
    }

    if (filterPermission === "read" && parentInternalId === null) {
      // We want all selected nodes despite the hierarchy
      const selectedNodes = await retrieveSelectedNodes({ connectorId });
      return new Ok(selectedNodes);
    }

    try {
      return new Ok(
        await retrieveChildrenNodes({
          connectorId,
          parentInternalId,
          filterPermission,
          viewType: "documents",
        })
      );
    } catch (e) {
      return new Err(e as Error);
    }
  }

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

    const connectionId = connector.connectionId;
    const zendeskConfiguration =
      await ZendeskConfigurationResource.fetchByConnectorId(connectorId);
    if (!zendeskConfiguration) {
      logger.error(
        { connectorId },
        "[Zendesk] ZendeskConfiguration not found. Cannot set permissions."
      );
      return new Err(new Error("ZendeskConfiguration not found"));
    }
    const subdomain = zendeskConfiguration.subdomain;

    const toBeSignaledBrandIds = new Set<number>();
    const toBeSignaledTicketsIds = new Set<number>();
    const toBeSignaledHelpCenterIds = new Set<number>();
    const toBeSignaledCategoryIds = new Set<number>();

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
          toBeSignaledBrandIds.add(objectId);
          if (permission === "none") {
            await revokeSyncZendeskBrand({
              connectorId,
              brandId: objectId,
            });
          }
          if (permission === "read") {
            await allowSyncZendeskBrand({
              subdomain,
              connectorId,
              connectionId,
              brandId: objectId,
            });
          }
          break;
        }
        case "help-center": {
          if (permission === "none") {
            const revokedCollection = await revokeSyncZendeskHelpCenter({
              connectorId,
              brandId: objectId,
            });
            if (revokedCollection) {
              toBeSignaledHelpCenterIds.add(revokedCollection.brandId);
            }
          }
          if (permission === "read") {
            const newBrand = await allowSyncZendeskHelpCenter({
              connectorId,
              connectionId,
              brandId: objectId,
              subdomain,
            });
            if (newBrand) {
              toBeSignaledHelpCenterIds.add(newBrand.brandId);
            }
          }
          break;
        }
        case "tickets": {
          if (permission === "none") {
            const revokedCollection = await revokeSyncZendeskTickets({
              connectorId,
              brandId: objectId,
            });
            if (revokedCollection) {
              toBeSignaledTicketsIds.add(revokedCollection.brandId);
            }
          }
          if (permission === "read") {
            const newBrand = await allowSyncZendeskTickets({
              connectorId,
              connectionId,
              brandId: objectId,
              subdomain,
            });
            if (newBrand) {
              toBeSignaledTicketsIds.add(newBrand.brandId);
            }
          }
          break;
        }
        case "category": {
          if (permission === "none") {
            const revokedCategory = await revokeSyncZendeskCategory({
              connectorId,
              categoryId: objectId,
            });
            if (revokedCategory) {
              toBeSignaledCategoryIds.add(revokedCategory.categoryId);
            }
          }
          if (permission === "read") {
            const newCategory = await allowSyncZendeskCategory({
              subdomain,
              connectorId,
              connectionId,
              categoryId: objectId,
            });
            if (newCategory) {
              toBeSignaledCategoryIds.add(newCategory.categoryId);
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
          throw new Error(
            "Cannot set permissions for a single article or ticket"
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
        categoryIds: [...toBeSignaledCategoryIds],
      });
    }

    return new Ok(undefined);
  }

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
          categoryIds.push(objectId);
          return;
        }
        case "article":
        case "ticket": {
          logger.error(
            { connectorId, objectId },
            "[Zendesk] Cannot retrieve single articles or tickets"
          );
          throw new Error("Cannot retrieve single articles or tickets");
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
    const helpCenters = allBrands.filter((brand) =>
      brandHelpCenterIds.includes(brand.brandId)
    );
    const tickets = allBrands.filter((brand) =>
      brandTicketsIds.includes(brand.brandId)
    );

    const categories = await ZendeskCategoryResource.fetchByCategoryIds({
      connectorId,
      categoryIds,
    });

    return new Ok([
      ...brands.map((brand) => brand.toContentNode({ connectorId })),
      ...helpCenters.map((brand) =>
        brand.getHelpCenterContentNode({ connectorId })
      ),
      ...tickets.map((brand) => brand.getTicketsContentNode({ connectorId })),
      ...categories.map((category) => category.toContentNode({ connectorId })),
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
        return new Ok([internalId, getBrandInternalId(connectorId, objectId)]);
      }
      /// Categories have two parents: the Help Center and the brand.
      case "category": {
        const category = await ZendeskCategoryResource.fetchByCategoryId({
          connectorId,
          categoryId: objectId,
        });
        if (category) {
          return new Ok([
            internalId,
            getHelpCenterInternalId(connectorId, category.brandId),
            getBrandInternalId(connectorId, category.brandId),
          ]);
        } else {
          logger.error(
            { connectorId, categoryId: objectId },
            "[Zendesk] Category not found"
          );
          return new Err(new Error("Category not found"));
        }
      }
      /// Articles have three parents: the category, the Help Center and the brand.
      case "article": {
        const article = await ZendeskArticleResource.fetchByArticleId({
          connectorId,
          articleId: objectId,
        });
        if (article) {
          return new Ok([
            internalId,
            getCategoryInternalId(connectorId, article.categoryId),
            getHelpCenterInternalId(connectorId, article.brandId),
            getBrandInternalId(connectorId, article.brandId),
          ]);
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
          return new Ok([
            internalId,
            getTicketsInternalId(connectorId, ticket.brandId),
            getBrandInternalId(connectorId, ticket.brandId),
          ]);
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

  async unpause(): Promise<Result<undefined, Error>> {
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      return new Err(new Error("Connector not found"));
    }
    await connector.markAsUnpaused();

    const brandIds = await ZendeskBrandResource.fetchAllBrandIds({
      connectorId,
    });
    return launchZendeskSyncWorkflow(connector, { brandIds });
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}
