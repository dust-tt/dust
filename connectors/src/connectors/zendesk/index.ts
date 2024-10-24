import type {
  ConnectorPermission,
  ConnectorsAPIError,
  ContentNode,
  ContentNodesViewType,
  Result,
} from "@dust-tt/types";
import { Err } from "@dust-tt/types";
import { Ok } from "@dust-tt/types";

import type { ConnectorManagerError } from "@connectors/connectors/interface";
import { BaseConnectorManager } from "@connectors/connectors/interface";
import {
  allowSyncZendeskBrand,
  retrieveZendeskBrandPermissions,
  revokeSyncZendeskBrand,
} from "@connectors/connectors/zendesk/lib/brand_permissions";
import {
  allowSyncZendeskCategory,
  allowSyncZendeskHelpCenter,
  retrieveZendeskHelpCenterPermissions,
  revokeSyncZendeskCategory,
  revokeSyncZendeskHelpCenter,
} from "@connectors/connectors/zendesk/lib/help_center_permissions";
import {
  getArticleIdFromInternalId,
  getBrandIdFromHelpCenterId,
  getBrandIdFromInternalId,
  getBrandIdFromTicketsId,
  getBrandInternalId,
  getCategoryIdFromInternalId,
  getCategoryInternalId,
  getHelpCenterInternalId,
  getTicketIdFromInternalId,
  getTicketsInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { retrieveSelectedNodes } from "@connectors/connectors/zendesk/lib/permissions";
import {
  allowSyncZendeskTickets,
  retrieveZendeskTicketPermissions,
  revokeSyncZendeskTickets,
} from "@connectors/connectors/zendesk/lib/ticket_permissions";
import { getZendeskAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { ZendeskConfigurationResource } from "@connectors/resources/zendesk_resources";
import {
  ZendeskArticleResource,
  ZendeskBrandResource,
  ZendeskCategoryResource,
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
    throw new Error("Method not implemented.");
  }

  async stop(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  async resume(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  async sync(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async retrievePermissions({
    parentInternalId,
    filterPermission,
  }: {
    parentInternalId: string | null;
    filterPermission: ConnectorPermission | null;
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    const connector = await ConnectorResource.fetchById(this.connectorId);
    if (!connector) {
      logger.error(
        { connectorId: this.connectorId },
        "[Zendesk] Connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    if (filterPermission === "read" && parentInternalId === null) {
      // We want all selected nodes despite the hierarchy
      const selectedNodes = await retrieveSelectedNodes({
        connectorId: this.connectorId,
      });
      return new Ok(selectedNodes);
    }

    try {
      const brandNodes = await retrieveZendeskBrandPermissions({
        connectorId: this.connectorId,
        parentInternalId,
        filterPermission,
        viewType: "documents",
      });
      const helpCenterNodes = await retrieveZendeskHelpCenterPermissions({
        connectorId: this.connectorId,
        parentInternalId,
        filterPermission,
        viewType: "documents",
      });
      const ticketNodes = await retrieveZendeskTicketPermissions({
        connectorId: this.connectorId,
        parentInternalId,
        filterPermission,
        viewType: "documents",
      });
      return new Ok([...brandNodes, ...helpCenterNodes, ...ticketNodes]);
    } catch (e) {
      return new Err(e as Error);
    }
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
        "[Zendesk] Connector not found."
      );
      return new Err(new Error("Connector not found"));
    }

    const connectionId = connector.connectionId;
    const zendeskConfiguration = await ZendeskConfigurationResource.fetchById(
      this.connectorId
    );
    if (!zendeskConfiguration) {
      logger.error(
        { connectorId: this.connectorId },
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
            `Invalid permission ${permission} for connector ${this.connectorId}`
          )
        );
      }

      const brandId = getBrandIdFromInternalId(this.connectorId, id);
      const brandHelpCenterId = getBrandIdFromHelpCenterId(
        this.connectorId,
        id
      );
      const brandTicketsId = getBrandIdFromTicketsId(this.connectorId, id);
      const categoryId = getCategoryIdFromInternalId(this.connectorId, id);

      if (brandId) {
        toBeSignaledBrandIds.add(brandId);
        if (permission === "none") {
          await revokeSyncZendeskBrand({
            connectorId: this.connectorId,
            brandId,
          });
        }
        if (permission === "read") {
          await allowSyncZendeskBrand({
            subdomain,
            connectorId: this.connectorId,
            connectionId,
            brandId,
          });
        }
      } else if (brandHelpCenterId) {
        if (permission === "none") {
          const revokedCollection = await revokeSyncZendeskHelpCenter({
            connectorId: this.connectorId,
            brandId: brandHelpCenterId,
          });
          if (revokedCollection) {
            toBeSignaledHelpCenterIds.add(revokedCollection.brandId);
          }
        }
        if (permission === "read") {
          const newBrand = await allowSyncZendeskHelpCenter({
            connectorId: this.connectorId,
            connectionId,
            brandId: brandHelpCenterId,
            subdomain,
          });
          if (newBrand) {
            toBeSignaledHelpCenterIds.add(newBrand.brandId);
          }
        }
      } else if (brandTicketsId) {
        if (permission === "none") {
          const revokedCollection = await revokeSyncZendeskTickets({
            connectorId: this.connectorId,
            brandId: brandTicketsId,
          });
          if (revokedCollection) {
            toBeSignaledTicketsIds.add(revokedCollection.brandId);
          }
        }
        if (permission === "read") {
          const newBrand = await allowSyncZendeskTickets({
            connectorId: this.connectorId,
            connectionId,
            brandId: brandTicketsId,
            subdomain,
          });
          if (newBrand) {
            toBeSignaledTicketsIds.add(newBrand.brandId);
          }
        }
      } else if (categoryId) {
        if (permission === "none") {
          const revokedCategory = await revokeSyncZendeskCategory({
            connectorId: this.connectorId,
            categoryId,
          });
          if (revokedCategory) {
            toBeSignaledCategoryIds.add(revokedCategory.categoryId);
          }
        }
        if (permission === "read") {
          const newCategory = await allowSyncZendeskCategory({
            subdomain,
            connectorId: this.connectorId,
            connectionId,
            categoryId,
          });
          if (newCategory) {
            toBeSignaledCategoryIds.add(newCategory.categoryId);
          }
        }
      }
    }

    /// Launch a sync workflow here

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
      let brandId = getBrandIdFromInternalId(this.connectorId, internalId);
      if (brandId) {
        brandIds.push(brandId);
        return;
      }
      brandId = getBrandIdFromTicketsId(this.connectorId, internalId);
      if (brandId) {
        brandTicketsIds.push(brandId);
        return;
      }
      brandId = getBrandIdFromHelpCenterId(this.connectorId, internalId);
      if (brandId) {
        brandHelpCenterIds.push(brandId);
        return;
      }
      const categoryId = getCategoryIdFromInternalId(
        this.connectorId,
        internalId
      );
      if (categoryId) {
        categoryIds.push(categoryId);
      }
    });

    const [brands, helpCenters, tickets, categories] = await Promise.all([
      ZendeskBrandResource.fetchByBrandIds({
        connectorId: this.connectorId,
        brandIds,
      }),
      ZendeskBrandResource.fetchByBrandIds({
        connectorId: this.connectorId,
        brandIds: brandHelpCenterIds,
      }),
      ZendeskBrandResource.fetchByBrandIds({
        connectorId: this.connectorId,
        brandIds: brandTicketsIds,
      }),
      ZendeskCategoryResource.fetchByCategoryIds({
        connectorId: this.connectorId,
        categoryIds,
      }),
    ]);

    const connectorId = this.connectorId;
    return new Ok([
      ...brands.map((brand) => brand.toContentNode({ connectorId })),
      ...helpCenters.map(
        (brand): ContentNode => ({
          provider: "zendesk",
          internalId: getHelpCenterInternalId(connectorId, brand.brandId),
          parentInternalId: getBrandInternalId(connectorId, brand.brandId),
          type: "database",
          title: "Help Center",
          sourceUrl: null,
          expandable: true,
          permission: "none", // TODO: use the new permission system
          dustDocumentId: null,
          lastUpdatedAt: null,
        })
      ),
      ...tickets.map(
        (brand): ContentNode => ({
          provider: "zendesk",
          internalId: getTicketsInternalId(connectorId, brand.brandId),
          parentInternalId: getBrandInternalId(connectorId, brand.brandId),
          type: "database",
          title: "Tickets",
          sourceUrl: null,
          expandable: false,
          permission: "none", // TODO: use the new permission system
          dustDocumentId: null,
          lastUpdatedAt: null,
        })
      ),
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
    /// Brands are at the top level, so they have no parents.
    let brandId = getBrandIdFromInternalId(this.connectorId, internalId);
    if (brandId) {
      return new Ok([internalId]);
    }

    /// Tickets are just beneath their brands, so they have one parent.
    brandId = getBrandIdFromTicketsId(this.connectorId, internalId);
    if (brandId) {
      return new Ok([
        internalId,
        getBrandInternalId(this.connectorId, brandId),
      ]);
    }

    /// Help Centers are just beneath their brands, so they have one parent.
    brandId = getBrandIdFromHelpCenterId(this.connectorId, internalId);
    if (brandId) {
      return new Ok([
        internalId,
        getBrandInternalId(this.connectorId, brandId),
      ]);
    }

    /// Categories have two parents: the Help Center and the brand.
    const categoryId = getCategoryIdFromInternalId(
      this.connectorId,
      internalId
    );
    if (categoryId) {
      const category = await ZendeskCategoryResource.fetchByCategoryId({
        connectorId: this.connectorId,
        categoryId,
      });
      if (category) {
        return new Ok([
          internalId,
          getHelpCenterInternalId(this.connectorId, category.brandId),
          getBrandInternalId(this.connectorId, category.brandId),
        ]);
      } else {
        logger.error(
          { connectorId: this.connectorId, categoryId },
          "[Zendesk] Category not found"
        );
        return new Err(new Error("Category not found"));
      }
    }

    /// Articles have three parents: the category, the Help Center and the brand.
    const articleId = getArticleIdFromInternalId(this.connectorId, internalId);
    if (articleId) {
      const article = await ZendeskArticleResource.fetchByArticleId({
        connectorId: this.connectorId,
        articleId,
      });
      if (article) {
        return new Ok([
          internalId,
          getCategoryInternalId(this.connectorId, article.categoryId),
          getHelpCenterInternalId(this.connectorId, article.brandId),
          getBrandInternalId(this.connectorId, article.brandId),
        ]);
      } else {
        logger.error(
          { connectorId: this.connectorId, categoryId },
          "[Zendesk] Article not found"
        );
        return new Err(new Error("Article not found"));
      }
    }

    /// Tickets have two parents: the Tickets and the brand.
    const ticketId = getTicketIdFromInternalId(this.connectorId, internalId);
    if (ticketId) {
      const ticket = await ZendeskTicketResource.fetchByTicketId({
        connectorId: this.connectorId,
        ticketId,
      });
      if (ticket) {
        return new Ok([
          internalId,
          getTicketsInternalId(this.connectorId, ticket.brandId),
          getBrandInternalId(this.connectorId, ticket.brandId),
        ]);
      } else {
        logger.error(
          { connectorId: this.connectorId, categoryId },
          "[Zendesk] Ticket not found"
        );
        return new Err(new Error("Ticket not found"));
      }
    }
    logger.error(
      { connectorId: this.connectorId, internalId },
      "[Zendesk] Internal ID not recognized"
    );
    return new Err(new Error("Internal ID not recognized"));
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
    throw new Error("Method not implemented.");
  }

  async unpause(): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}
