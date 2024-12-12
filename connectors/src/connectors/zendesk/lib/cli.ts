import type {
  ZendeskCheckIsAdminResponseType,
  ZendeskCommandType,
  ZendeskCountTicketsResponseType,
  ZendeskResyncTicketsResponseType,
} from "@dust-tt/types";

import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  fetchZendeskCurrentUser,
  fetchZendeskTicketCount,
  getZendeskBrandSubdomain,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import { launchZendeskTicketReSyncWorkflow } from "@connectors/connectors/zendesk/temporal/client";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { ZendeskConfigurationResource } from "@connectors/resources/zendesk_resources";

export const zendesk = async ({
  command,
  args,
}: ZendeskCommandType): Promise<
  | ZendeskCheckIsAdminResponseType
  | ZendeskCountTicketsResponseType
  | ZendeskResyncTicketsResponseType
> => {
  const logger = topLogger.child({ majorCommand: "zendesk", command, args });

  const connectorId = args.connectorId ? args.connectorId.toString() : null;
  const connector = connectorId
    ? await ConnectorResource.fetchById(connectorId)
    : null;
  if (connector && connector.type !== "zendesk") {
    throw new Error(`Connector ${args.connectorId} is not of type zendesk`);
  }

  switch (command) {
    case "check-is-admin": {
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }
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
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }
      const brandId = args.brandId ? Number(args.brandId) : null;
      if (!brandId) {
        throw new Error(`Missing --brandId argument`);
      }
      const configuration =
        await ZendeskConfigurationResource.fetchByConnectorId(connector.id);
      if (!configuration) {
        throw new Error(`No configuration found for connector ${connector.id}`);
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

      const ticketCount = await fetchZendeskTicketCount({
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
      if (!connector) {
        throw new Error(`Connector ${connectorId} not found`);
      }
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
  }
};
