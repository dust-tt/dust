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
  getBrandIdFromHelpCenterId,
  getBrandIdFromInternalId,
  getBrandIdFromTicketsId,
  getCategoryIdFromInternalId,
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
    try {
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
    logger.info({ internalId }, "Retrieving content node parents");
    throw new Error("Method not implemented.");
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
