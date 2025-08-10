import type { Logger } from "pino";

import {
  ZENDESK_CONFIG_KEYS,
  ZendeskConnectorManager,
} from "@connectors/connectors/zendesk";
import {
  extractMetadataFromDocumentUrl,
  shouldSyncTicket,
  syncTicket,
} from "@connectors/connectors/zendesk/lib/sync_ticket";
import type { ZendeskFetchedTicket } from "@connectors/connectors/zendesk/lib/types";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  fetchZendeskBrand,
  fetchZendeskCurrentUser,
  fetchZendeskTicket,
  getZendeskBrandSubdomain,
  getZendeskTicketCount,
  listZendeskOrganizations,
  listZendeskTicketComments,
  listZendeskUsers,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import { syncZendeskBrandActivity } from "@connectors/connectors/zendesk/temporal/activities";
import {
  launchZendeskSyncWorkflow,
  launchZendeskTicketReSyncWorkflow,
} from "@connectors/connectors/zendesk/temporal/client";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import {
  ZendeskBrandResource,
  ZendeskCategoryResource,
  ZendeskConfigurationResource,
  ZendeskTicketResource,
} from "@connectors/resources/zendesk_resources";
import type {
  AdminResponseType,
  ZendeskCheckIsAdminResponseType,
  ZendeskCommandType,
  ZendeskCountTicketsResponseType,
  ZendeskFetchBrandResponseType,
  ZendeskFetchTicketResponseType,
  ZendeskGetRetentionPeriodResponseType,
  ZendeskOrganizationTagResponseType,
} from "@connectors/types";
import { normalizeError } from "@connectors/types";

function getTagsArgs(args: ZendeskCommandType["args"]) {
  const tag = args.tag;
  if (!tag) {
    throw new Error("Missing --tag argument");
  }

  const include = args.include === "true";
  const exclude = args.exclude === "true";

  if (include && exclude) {
    throw new Error("Cannot specify both --in and --not-in options");
  }

  if (!include && !exclude) {
    throw new Error("Must specify either --in or --not-in option");
  }

  return { tag, include, exclude };
}

async function checkTicketShouldBeSynced(
  ticket: ZendeskFetchedTicket | null,
  configuration: ZendeskConfigurationResource,
  {
    brandId,
    accessToken,
    brandSubdomain,
  }: {
    brandId?: number;
    brandSubdomain: string;
    accessToken: string;
  },
  logger: Logger
) {
  if (!ticket) {
    return { shouldSync: false, reason: "Ticket not found" };
  }

  let organizationTags: string[] = [];

  if (
    configuration.enforcesOrganizationTagConstraint() &&
    ticket.organization_id
  ) {
    const [organization] = await listZendeskOrganizations({
      accessToken,
      brandSubdomain,
      organizationIds: [ticket.organization_id],
    });
    if (!organization) {
      logger.error(
        { ticketId: ticket.id, organizationId: ticket.organization_id },
        "Organization not found."
      );
    } else {
      organizationTags = organization.tags;
    }
  }

  return shouldSyncTicket(ticket, configuration, {
    brandId,
    organizationTags,
    ticketTags: ticket.tags,
  });
}

export const zendesk = async ({
  command,
  args,
}: ZendeskCommandType): Promise<
  | ZendeskCheckIsAdminResponseType
  | ZendeskCountTicketsResponseType
  | ZendeskFetchTicketResponseType
  | ZendeskFetchBrandResponseType
  | ZendeskGetRetentionPeriodResponseType
  | ZendeskOrganizationTagResponseType
  | AdminResponseType
> => {
  const logger = topLogger.child({ majorCommand: "zendesk", command, args });

  // Fetch the connector.
  let connector;
  if (args.wId && args.dsId) {
    connector = await ConnectorResource.findByDataSource({
      workspaceId: args.wId,
      dataSourceId: args.dsId,
    });
    if (!connector) {
      throw new Error(
        `Connector not found for workspace ${args.wId} and data source ${args.dsId}.`
      );
    }
  } else if (args.connectorId) {
    connector = await ConnectorResource.fetchById(args.connectorId);
    if (!connector) {
      throw new Error(`Connector ${args.connectorId} not found.`);
    }
  } else {
    throw new Error(
      "Either the workspace and dataSource IDs or the connector ID are required."
    );
  }
  const connectorId = connector.id;

  if (connector.type !== "zendesk") {
    throw new Error(`Connector ${args.connectorId} is not of type zendesk`);
  }

  // Fetch the configuration.
  const configuration = await ZendeskConfigurationResource.fetchByConnectorId(
    connector.id
  );
  if (!configuration) {
    throw new Error(`No configuration found for connector ${connector.id}`);
  }

  // Run the command.
  switch (command) {
    case "check-is-admin": {
      const user = await fetchZendeskCurrentUser(
        await getZendeskSubdomainAndAccessToken(connector.connectionId)
      );
      logger.info({ user }, "User returned by /users/me");
      return {
        userActive: user.active,
        userRole: user.role,
        userIsAdmin: user.role === "admin" && user.active,
      };
    }
    case "count-tickets": {
      const brandId = args.brandId ?? null;
      if (!brandId) {
        throw new Error(`Missing --brandId argument`);
      }
      const { retentionPeriodDays } = configuration;

      const { accessToken, subdomain } =
        await getZendeskSubdomainAndAccessToken(connector.connectionId);
      const brandSubdomain = await getZendeskBrandSubdomain({
        connectorId: connector.id,
        brandId,
        subdomain,
        accessToken,
      });

      const ticketCount = await getZendeskTicketCount({
        brandSubdomain,
        accessToken,
        retentionPeriodDays,
        query: args.query || null,
      });
      logger.info(
        { connectorId, brandId, ticketCount, retentionPeriodDays },
        "Number of valid tickets found for the brand."
      );
      return { ticketCount };
    }
    case "resync-tickets": {
      const result = await launchZendeskTicketReSyncWorkflow(connector, {
        forceResync: args.forceResync === "true",
      });
      if (result.isErr()) {
        logger.error(
          { error: result.error },
          "Error launching the sync workflow."
        );
        throw result.error;
      }
      return { success: true };
    }
    case "fetch-ticket": {
      const { accessToken, subdomain } =
        await getZendeskSubdomainAndAccessToken(connector.connectionId);

      if (args.ticketUrl) {
        let brandSubdomain, ticketId;
        try {
          const {
            brandSubdomain: extractedSubdomain,
            ticketId: extractedTicketId,
          } = extractMetadataFromDocumentUrl(args.ticketUrl);
          brandSubdomain = extractedSubdomain;
          ticketId = extractedTicketId;
        } catch (e) {
          return {
            ticket: null,
            shouldSyncTicket: {
              shouldSync: false,
              reason: `Error getting ticket metadata: ${normalizeError(e).message}`,
            },
            isTicketOnDb: false,
          };
        }
        const ticket = await fetchZendeskTicket({
          accessToken,
          ticketId,
          brandSubdomain,
        });
        const brand = await ZendeskBrandResource.fetchByBrandSubdomain({
          connectorId: connector.id,
          subdomain: brandSubdomain,
        });
        const ticketOnDb = brand
          ? await ZendeskTicketResource.fetchByTicketId({
              connectorId: connector.id,
              brandId: brand.brandId,
              ticketId,
            })
          : null;

        const shouldSyncTicket = await checkTicketShouldBeSynced(
          ticket,
          configuration,
          { accessToken, brandSubdomain },
          logger
        );

        return {
          ticket: ticket as { [key: string]: unknown } | null,
          shouldSyncTicket,
          isTicketOnDb: ticketOnDb !== null,
        };
      }

      const brandId = args.brandId ?? null;
      const ticketId = args.ticketId ?? null;
      if (!ticketId) {
        throw new Error(`Missing --ticketId argument`);
      }

      let ticketOnDb = null;
      let brandSubdomain = subdomain;

      if (brandId) {
        ticketOnDb = await ZendeskTicketResource.fetchByTicketId({
          connectorId: connector.id,
          brandId,
          ticketId,
        });
        brandSubdomain = await getZendeskBrandSubdomain({
          connectorId: connector.id,
          brandId,
          subdomain,
          accessToken,
        });
      }

      const ticket = await fetchZendeskTicket({
        accessToken,
        ticketId,
        brandSubdomain,
      });

      const shouldSyncTicket = await checkTicketShouldBeSynced(
        ticket,
        configuration,
        { brandId: brandId ?? undefined, accessToken, brandSubdomain },
        logger
      );

      return {
        ticket: ticket as { [key: string]: unknown } | null,
        shouldSyncTicket,
        isTicketOnDb: ticketOnDb !== null,
      };
    }
    case "fetch-brand": {
      const brandId = args.brandId ?? null;
      if (!brandId) {
        throw new Error(`Missing --brandId argument`);
      }

      const brand = await fetchZendeskBrand({
        brandId,
        ...(await getZendeskSubdomainAndAccessToken(connector.connectionId)),
      });
      const brandOnDb = await ZendeskBrandResource.fetchByBrandId({
        connectorId: connector.id,
        brandId,
      });
      return {
        brand: brand as { [key: string]: unknown } | null,
        brandOnDb: brandOnDb as { [key: string]: unknown } | null,
      };
    }
    case "resync-help-centers": {
      const helpCenterBrandIds =
        await ZendeskBrandResource.fetchHelpCenterReadAllowedBrandIds(
          connector.id
        );

      const selectedCategoryIds =
        await ZendeskCategoryResource.fetchAllReadOnly(connector.id);
      const categoryIds = selectedCategoryIds
        .filter(
          (c) => !helpCenterBrandIds.includes(c.brandId) // skipping categories that will be synced through the Help Center
        )
        .map((c) => {
          const { categoryId, brandId } = c;
          return { brandId, categoryId };
        });

      const result = await launchZendeskSyncWorkflow(connector, {
        helpCenterBrandIds,
        categoryIds,
      });
      if (result.isErr()) {
        logger.error(
          { error: result.error },
          "Error launching the sync workflow."
        );
        throw result.error;
      }
      return { success: true };
    }
    // Resyncs the metadata of a brand already in DB.
    // Can be used to sync the data_sources_folders relative to the brand.
    case "resync-brand-metadata": {
      const brandId = args.brandId ?? null;
      if (!brandId) {
        throw new Error(`Missing --brandId argument`);
      }
      await syncZendeskBrandActivity({
        connectorId: connectorId,
        brandId,
        currentSyncDateMs: Date.now(),
      });
      return { success: true };
    }
    case "sync-ticket": {
      const brandId = args.brandId ?? null;
      if (!brandId) {
        throw new Error(`Missing --brandId argument`);
      }
      const ticketId = args.ticketId ?? null;
      if (!ticketId) {
        throw new Error(`Missing --ticketId argument`);
      }

      const { accessToken, subdomain } =
        await getZendeskSubdomainAndAccessToken(connector.connectionId);

      const brandSubdomain = await getZendeskBrandSubdomain({
        connectorId: connector.id,
        brandId,
        subdomain,
        accessToken,
      });

      const ticket = await fetchZendeskTicket({
        accessToken,
        ticketId,
        brandSubdomain,
      });
      if (!ticket) {
        throw new Error(`Ticket ${ticketId} not found`);
      }

      const shouldSyncTicket = await checkTicketShouldBeSynced(
        ticket,
        configuration,
        { brandId, accessToken, brandSubdomain },
        logger
      );

      if (!shouldSyncTicket) {
        logger.info(
          { ticketId, brandId, status: ticket.status },
          "Ticket should not be synced based on status and configuration."
        );
        return { success: true };
      }

      const comments = await listZendeskTicketComments({
        accessToken,
        brandSubdomain,
        ticketId,
      });

      const userIds = Array.from(
        new Set(
          [
            ticket.requester_id,
            ticket.assignee_id,
            ticket.submitter_id,
            ...comments.map((comment) => comment.author_id),
          ].filter(Boolean)
        )
      );

      const users = await listZendeskUsers({
        accessToken,
        brandSubdomain,
        userIds,
      });

      const dataSourceConfig = dataSourceConfigFromConnector(connector);

      await syncTicket({
        ticket,
        connector,
        configuration,
        brandId,
        currentSyncDateMs: Date.now(),
        dataSourceConfig,
        loggerArgs: {
          dataSourceId: dataSourceConfig.dataSourceId,
          provider: "zendesk",
          workspaceId: dataSourceConfig.workspaceId,
        },
        forceResync: args.forceResync === "true",
        comments,
        users,
      });

      logger.info(
        { ticketId, brandId, connectorId: connector.id },
        "Successfully synced single ticket"
      );
      return { success: true };
    }
    case "get-retention-period": {
      return {
        retentionPeriodDays: configuration.retentionPeriodDays,
      };
    }
    case "set-retention-period": {
      const retentionPeriodDays = args.retentionPeriodDays;
      if (retentionPeriodDays === undefined) {
        throw new Error("Missing --retentionPeriodDays argument");
      }
      const manager = new ZendeskConnectorManager(connectorId);
      await manager.setConfigurationKey({
        configKey: ZENDESK_CONFIG_KEYS.RETENTION_PERIOD,
        configValue: retentionPeriodDays.toString(),
      });
      return { success: true };
    }
    case "add-organization-tag": {
      const { tag, include, exclude } = getTagsArgs(args);

      const { wasAdded, message } = await configuration.addOrganizationTag({
        tag,
        includeOrExclude: include ? "include" : "exclude",
      });
      logger.info({ wasAdded, tag, include, exclude }, message);

      return { success: true, message };
    }
    case "remove-organization-tag": {
      const { tag, include, exclude } = getTagsArgs(args);

      const { wasRemoved, message } = await configuration.removeOrganizationTag(
        {
          tag,
          includeOrExclude: include ? "include" : "exclude",
        }
      );
      logger.info({ wasRemoved, tag, include, exclude }, message);

      return { success: true, message };
    }
    case "add-ticket-tag": {
      const { tag, include, exclude } = getTagsArgs(args);

      const { wasAdded, message } = await configuration.addTicketTag({
        tag,
        includeOrExclude: include ? "include" : "exclude",
      });
      logger.info({ wasAdded, tag, include, exclude }, message);

      return { success: true, message };
    }
    case "remove-ticket-tag": {
      const { tag, include, exclude } = getTagsArgs(args);

      const { wasRemoved, message } = await configuration.removeTicketTag({
        tag,
        includeOrExclude: include ? "include" : "exclude",
      });
      logger.info({ wasRemoved, tag, include, exclude }, message);

      return { success: true, message };
    }
    default: {
      throw new Error(`Unknown command: ${command}`);
    }
  }
};
