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
import { retrieveZendeskBrandPermissions } from "@connectors/connectors/zendesk/lib/brand_permissions";
import { retrieveZendeskHelpCenterPermissions } from "@connectors/connectors/zendesk/lib/help_center_permissions";
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
import { retrieveZendeskTicketPermissions } from "@connectors/connectors/zendesk/lib/ticket_permissions";
import { getZendeskAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskArticleResource,
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
    logger.info({ permissions }, "Setting permissions");
    throw new Error("Method not implemented.");
  }

  async retrieveBatchContentNodes({
    internalIds,
  }: {
    internalIds: string[];
    viewType: ContentNodesViewType;
  }): Promise<Result<ContentNode[], Error>> {
    logger.info({ internalIds }, "Retrieving batch content nodes");
    throw new Error("Method not implemented.");
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
