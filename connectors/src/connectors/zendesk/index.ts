import type { ConnectorProvider, Result } from "@dust-tt/client";
import { assertNever, Err, Ok } from "@dust-tt/client";

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
import { getIdsFromInternalId } from "@connectors/connectors/zendesk/lib/id_conversions";
import {
  retrieveAllSelectedNodes,
  retrieveChildrenNodes,
} from "@connectors/connectors/zendesk/lib/permissions";
import {
  allowSyncZendeskTickets,
  forbidSyncZendeskTickets,
} from "@connectors/connectors/zendesk/lib/ticket_permissions";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  fetchZendeskCurrentUser,
  getZendeskTicketFieldById,
  isUserAdmin,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import {
  launchZendeskFullSyncWorkflow,
  launchZendeskGarbageCollectionWorkflow,
  launchZendeskSyncWorkflow,
  launchZendeskTicketReSyncWorkflow,
  stopZendeskWorkflows,
} from "@connectors/connectors/zendesk/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import { ZendeskTimestampCursorModel } from "@connectors/lib/models/zendesk";
import { syncSucceeded } from "@connectors/lib/sync_status";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { ZendeskConfigurationResource } from "@connectors/resources/zendesk_resources";
import type {
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
} from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";

export const ZENDESK_CONFIG_KEYS = {
  TICKET_TAGS_TO_INCLUDE: "zendeskTicketTagsToInclude",
  TICKET_TAGS_TO_EXCLUDE: "zendeskTicketTagsToExclude",
  ORGANIZATION_TAGS_TO_INCLUDE: "zendeskOrganizationTagsToInclude",
  ORGANIZATION_TAGS_TO_EXCLUDE: "zendeskOrganizationTagsToExclude",
  CUSTOM_FIELDS_CONFIG: "zendeskCustomFieldsConfig",
  SYNC_UNRESOLVED_TICKETS: "zendeskSyncUnresolvedTicketsEnabled",
  HIDE_CUSTOMER_DETAILS: "zendeskHideCustomerDetails",
  RETENTION_PERIOD: "zendeskRetentionPeriodDays",
} as const;

const MAX_RETENTION_DAYS = 365;
const DEFAULT_RETENTION_DAYS = 180;

export class ZendeskConnectorManager extends BaseConnectorManager<null> {
  readonly provider: ConnectorProvider = "zendesk";

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
    if (!isUserAdmin(zendeskUser)) {
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
      {
        subdomain,
        retentionPeriodDays: DEFAULT_RETENTION_DAYS,
        syncUnresolvedTickets: false,
        hideCustomerDetails: false,
        organizationTagsToInclude: null,
        organizationTagsToExclude: null,
        ticketTagsToInclude: null,
        ticketTagsToExclude: null,
        customFieldsConfig: [],
      }
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
      throw new Error("[Zendesk] Connector not found.");
    }

    const configuration =
      await ZendeskConfigurationResource.fetchByConnectorId(connectorId);
    if (!configuration) {
      logger.error({ connectorId }, "[Zendesk] Configuration not found.");
      throw new Error(
        "Error retrieving Zendesk configuration to update connector."
      );
    }

    if (connectionId) {
      const newConnectionId = connectionId;

      const { accessToken, subdomain: newSubdomain } =
        await getZendeskSubdomainAndAccessToken(newConnectionId);

      if (configuration.subdomain !== newSubdomain) {
        return new Err(
          new ConnectorManagerError(
            "CONNECTOR_OAUTH_TARGET_MISMATCH",
            "Cannot change the subdomain of a Zendesk connector"
          )
        );
      }

      const zendeskUser = await fetchZendeskCurrentUser({
        subdomain: newSubdomain,
        accessToken,
      });
      if (!isUserAdmin(zendeskUser)) {
        return new Err(
          new ConnectorManagerError(
            "CONNECTOR_OAUTH_USER_MISSING_RIGHTS",
            "New authenticated user is not an admin"
          )
        );
      }

      await connector.update({ connectionId: newConnectionId });

      // if the connector was previously paused, unpause it.
      if (connector.isPaused()) {
        await this.unpauseAndResume();
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
      throw new Error("[Zendesk] Connector not found.");
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
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      throw new Error("[Zendesk] Connector not found.");
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
      throw new Error("[Zendesk] Connector not found.");
    }
    if (connector.isPaused()) {
      logger.warn(
        { connectorId },
        "[Zendesk] Cannot resume a paused connector."
      );
      // we don't return an error since this could be used within a batch-resume, only need to be informed
      return new Ok(undefined);
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
      throw new Error("[Zendesk] Connector not found.");
    }

    // launching an incremental workflow taking the diff starting from the given timestamp
    if (fromTs) {
      const cursors = await ZendeskTimestampCursorModel.findOne({
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
      await ZendeskTimestampCursorModel.destroy({ where: { connectorId } });
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

    try {
      const nodes = await retrieveChildrenNodes({
        connector,
        parentInternalId,
        filterPermission,
        viewType: "document",
      });
      nodes.sort((a, b) => a.title.localeCompare(b.title));
      return new Ok(nodes);
    } catch (e) {
      if (e instanceof ExternalOAuthTokenError) {
        return new Err(
          new ConnectorManagerError(
            "EXTERNAL_OAUTH_TOKEN_ERROR",
            "Authorization error, please re-authorize Zendesk."
          )
        );
      }
      // Unhandled error, throwing to get a 500.
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
    const toBeSignaledCategoryIds = new Set<[number, number]>();

    for (const [id, permission] of Object.entries(permissions)) {
      if (permission !== "none" && permission !== "read") {
        return new Err(
          new Error(
            `Invalid permission ${permission} for connector ${connectorId}`
          )
        );
      }

      const { type, objectIds } = getIdsFromInternalId(connectorId, id);
      const { brandId } = objectIds;
      switch (type) {
        // The brand is just a shortcut to set permissions for Help Center and Tickets at once.
        case "brand": {
          if (permission === "none") {
            const brandWasUnselected = await forbidSyncZendeskBrand({
              connectorId,
              brandId,
            });
            if (brandWasUnselected) {
              toBeSignaledBrandIds.add(brandId);
            }
          }
          if (permission === "read") {
            const brandWasSelected = await allowSyncZendeskBrand({
              connectorId,
              connectionId,
              brandId,
            });
            if (brandWasSelected) {
              toBeSignaledBrandIds.add(brandId);
            }
          }
          break;
        }
        case "help-center": {
          if (permission === "none") {
            const helpCenterWasUnselected = await forbidSyncZendeskHelpCenter({
              connectorId,
              brandId,
            });
            if (helpCenterWasUnselected) {
              toBeSignaledHelpCenterIds.add(brandId);
            }
          }
          if (permission === "read") {
            const helpCenterWasSelected = await allowSyncZendeskHelpCenter({
              connectorId,
              connectionId,
              brandId,
            });
            if (helpCenterWasSelected) {
              toBeSignaledHelpCenterIds.add(brandId);
            }
          }
          break;
        }
        case "tickets": {
          if (permission === "none") {
            const ticketsWereUnselected = await forbidSyncZendeskTickets({
              connectorId,
              brandId,
            });
            if (ticketsWereUnselected) {
              toBeSignaledTicketsIds.add(brandId);
            }
          }
          if (permission === "read") {
            const ticketsWereSelected = await allowSyncZendeskTickets({
              connectorId,
              connectionId,
              brandId,
            });
            if (ticketsWereSelected) {
              toBeSignaledTicketsIds.add(brandId);
            }
          }
          break;
        }
        case "category": {
          const { brandId, categoryId } = objectIds;
          if (permission === "none") {
            const categoryWasUpdated = await forbidSyncZendeskCategory({
              connectorId,
              brandId,
              categoryId,
            });
            if (categoryWasUpdated) {
              toBeSignaledCategoryIds.add([brandId, categoryId]);
            }
          }
          if (permission === "read") {
            const categoryWasUpdated = await allowSyncZendeskCategory({
              connectorId,
              connectionId,
              categoryId,
              brandId,
            });
            if (categoryWasUpdated) {
              toBeSignaledCategoryIds.add([brandId, categoryId]);
            }
          }
          break;
        }
        // we do not set permissions for single articles and tickets
        case "article":
        case "ticket":
          logger.error(
            { connectorId, objectIds, type },
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
        categoryIds: [...toBeSignaledCategoryIds].map(
          ([brandId, categoryId]) => ({
            categoryId,
            brandId,
          })
        ),
      });
    }

    return new Ok(undefined);
  }

  async setConfigurationKey({
    configKey,
    configValue,
  }: {
    configKey: string;
    configValue: string;
  }): Promise<Result<void, Error>> {
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      throw new Error("[Zendesk] Connector not found.");
    }

    const zendeskConfiguration =
      await ZendeskConfigurationResource.fetchByConnectorId(connectorId);
    if (!zendeskConfiguration) {
      logger.error({ connectorId }, "[Zendesk] Configuration not found.");
      throw new Error("[Zendesk] Configuration not found.");
    }

    switch (configKey) {
      case ZENDESK_CONFIG_KEYS.SYNC_UNRESOLVED_TICKETS: {
        await zendeskConfiguration.update({
          syncUnresolvedTickets: configValue === "true",
        });
        const result = await launchZendeskTicketReSyncWorkflow(connector, {
          forceResync: true,
        });
        if (result.isErr()) {
          return result;
        }
        return new Ok(undefined);
      }
      case ZENDESK_CONFIG_KEYS.HIDE_CUSTOMER_DETAILS: {
        await zendeskConfiguration.update({
          hideCustomerDetails: configValue === "true",
        });
        // We need to full sync since this affects tickets and articles.
        const result = await this.sync({ fromTs: null });
        if (result.isErr()) {
          return result;
        }
        return new Ok(undefined);
      }
      case ZENDESK_CONFIG_KEYS.RETENTION_PERIOD: {
        const retentionDays = parseInt(configValue.trim(), 10);
        if (
          configValue.trim() !== "" &&
          (isNaN(retentionDays) || retentionDays < 0)
        ) {
          return new Err(
            new Error(
              "Retention period must be a non-negative integer or empty to use default."
            )
          );
        }
        if (retentionDays > MAX_RETENTION_DAYS) {
          return new Err(
            new Error(
              `Retention period cannot exceed ${MAX_RETENTION_DAYS} days.`
            )
          );
        }

        const finalRetentionDays =
          configValue.trim() === "" ? DEFAULT_RETENTION_DAYS : retentionDays;

        logger.info(
          { connectorId, retentionDays },
          "[Zendesk] Setting retention period"
        );

        const { retentionPeriodDays: currentRetentionDays } =
          zendeskConfiguration;

        await zendeskConfiguration.update({
          retentionPeriodDays: finalRetentionDays,
        });

        // Triggers a ticket sync for a Zendesk connector when retention period is increased.
        if (finalRetentionDays > currentRetentionDays) {
          const syncResult = await launchZendeskTicketReSyncWorkflow(
            connector,
            {
              forceResync: false,
            }
          );

          if (syncResult.isErr()) {
            logger.error(
              { connectorId, error: syncResult.error },
              "[Zendesk] Failed to execute ticket sync"
            );
            return syncResult;
          }
          logger.info(
            { connectorId, workflowId: syncResult.value },
            "[Zendesk] Successfully executed ticket sync"
          );
        }
        return new Ok(undefined);
      }
      case ZENDESK_CONFIG_KEYS.TICKET_TAGS_TO_INCLUDE: {
        const tags = configValue.trim() === "" ? null : JSON.parse(configValue);
        if (tags !== null && !Array.isArray(tags)) {
          return new Err(
            new Error("Ticket tags to include must be an array or empty.")
          );
        }
        await zendeskConfiguration.update({
          ticketTagsToInclude: tags,
        });
        return new Ok(undefined);
      }
      case ZENDESK_CONFIG_KEYS.TICKET_TAGS_TO_EXCLUDE: {
        const tags = configValue.trim() === "" ? null : JSON.parse(configValue);
        if (tags !== null && !Array.isArray(tags)) {
          return new Err(
            new Error("Ticket tags to exclude must be an array or empty.")
          );
        }
        await zendeskConfiguration.update({
          ticketTagsToExclude: tags,
        });
        return new Ok(undefined);
      }
      case ZENDESK_CONFIG_KEYS.ORGANIZATION_TAGS_TO_INCLUDE: {
        const tags = configValue.trim() === "" ? null : JSON.parse(configValue);
        if (tags !== null && !Array.isArray(tags)) {
          return new Err(
            new Error("Organization tags to include must be an array or empty.")
          );
        }
        await zendeskConfiguration.update({
          organizationTagsToInclude: tags,
        });
        return new Ok(undefined);
      }
      case ZENDESK_CONFIG_KEYS.ORGANIZATION_TAGS_TO_EXCLUDE: {
        const tags = configValue.trim() === "" ? null : JSON.parse(configValue);
        if (tags !== null && !Array.isArray(tags)) {
          return new Err(
            new Error("Organization tags to exclude must be an array or empty.")
          );
        }
        await zendeskConfiguration.update({
          organizationTagsToExclude: tags,
        });

        return new Ok(undefined);
      }
      case ZENDESK_CONFIG_KEYS.CUSTOM_FIELDS_CONFIG: {
        const fieldIds =
          configValue.trim() === "" ? null : JSON.parse(configValue);

        if (fieldIds !== null && !Array.isArray(fieldIds)) {
          return new Err(
            new Error("Custom field IDs must be an array or empty.")
          );
        }

        if (fieldIds === null) {
          await zendeskConfiguration.update({
            customFieldsConfig: [],
          });

          return new Ok(undefined);
        }

        for (const fieldId of fieldIds) {
          if (typeof fieldId !== "number" || !Number.isInteger(fieldId)) {
            return new Err(
              new Error(`Field ID "${fieldId}" must be a number.`)
            );
          }
        }

        const { accessToken, subdomain } =
          await getZendeskSubdomainAndAccessToken(connector.connectionId);

        const convertedFields: { id: number; name: string }[] = [];
        for (const fieldId of fieldIds) {
          const field = await getZendeskTicketFieldById({
            accessToken,
            subdomain,
            fieldId,
          });

          if (!field) {
            return new Err(
              new Error(`Field with ID "${fieldId}" not found on Zendesk.`)
            );
          }

          if (!field.active) {
            return new Err(
              new Error(
                `Field with ID "${fieldId}" (${field.title}) is not active in Zendesk.`
              )
            );
          }

          convertedFields.push({
            id: field.id,
            name: field.title,
          });
        }

        await zendeskConfiguration.update({
          customFieldsConfig: convertedFields,
        });

        return new Ok(undefined);
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
    const { connectorId } = this;
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "[Zendesk] Connector not found.");
      throw new Error("[Zendesk] Connector not found.");
    }

    const zendeskConfiguration =
      await ZendeskConfigurationResource.fetchByConnectorId(connectorId);
    if (!zendeskConfiguration) {
      logger.error({ connectorId }, "[Zendesk] Configuration not found.");
      throw new Error("[Zendesk] Configuration not found.");
    }

    switch (configKey) {
      case ZENDESK_CONFIG_KEYS.SYNC_UNRESOLVED_TICKETS: {
        return new Ok(zendeskConfiguration.syncUnresolvedTickets.toString());
      }
      case ZENDESK_CONFIG_KEYS.HIDE_CUSTOMER_DETAILS: {
        return new Ok(zendeskConfiguration.hideCustomerDetails.toString());
      }
      case ZENDESK_CONFIG_KEYS.RETENTION_PERIOD: {
        return new Ok(zendeskConfiguration.retentionPeriodDays.toString());
      }
      case ZENDESK_CONFIG_KEYS.TICKET_TAGS_TO_INCLUDE: {
        return new Ok(
          zendeskConfiguration.ticketTagsToInclude
            ? JSON.stringify(zendeskConfiguration.ticketTagsToInclude)
            : ""
        );
      }
      case ZENDESK_CONFIG_KEYS.TICKET_TAGS_TO_EXCLUDE: {
        return new Ok(
          zendeskConfiguration.ticketTagsToExclude
            ? JSON.stringify(zendeskConfiguration.ticketTagsToExclude)
            : ""
        );
      }
      case ZENDESK_CONFIG_KEYS.ORGANIZATION_TAGS_TO_INCLUDE: {
        return new Ok(
          zendeskConfiguration.organizationTagsToInclude
            ? JSON.stringify(zendeskConfiguration.organizationTagsToInclude)
            : ""
        );
      }
      case ZENDESK_CONFIG_KEYS.ORGANIZATION_TAGS_TO_EXCLUDE: {
        return new Ok(
          zendeskConfiguration.organizationTagsToExclude
            ? JSON.stringify(zendeskConfiguration.organizationTagsToExclude)
            : ""
        );
      }
      case ZENDESK_CONFIG_KEYS.CUSTOM_FIELDS_CONFIG: {
        return new Ok(
          zendeskConfiguration.customFieldsConfig
            ? JSON.stringify(zendeskConfiguration.customFieldsConfig)
            : ""
        );
      }
      default:
        return new Err(new Error(`Invalid config key ${configKey}`));
    }
  }

  async garbageCollect(): Promise<Result<string, Error>> {
    throw new Error("Method not implemented.");
  }

  async configure(): Promise<Result<void, Error>> {
    throw new Error("Method not implemented.");
  }
}
