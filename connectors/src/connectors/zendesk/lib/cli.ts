import type {
  ZendeskCheckIsAdminResponseType,
  ZendeskCommandType,
  ZendeskCountTicketsResponseType,
} from "@dust-tt/types";

import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import {
  changeZendeskClientSubdomain,
  createZendeskClient,
  fetchZendeskCurrentUser,
  fetchZendeskTicketCount,
} from "@connectors/connectors/zendesk/lib/zendesk_api";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { ZendeskConfigurationResource } from "@connectors/resources/zendesk_resources";

export const zendesk = async ({
  command,
  args,
}: ZendeskCommandType): Promise<
  ZendeskCheckIsAdminResponseType | ZendeskCountTicketsResponseType
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

      const { accessToken, subdomain } =
        await getZendeskSubdomainAndAccessToken(connector.connectionId);
      const zendeskApiClient = createZendeskClient({ subdomain, accessToken });
      const brandSubdomain = await changeZendeskClientSubdomain(
        zendeskApiClient,
        { connectorId: connector.id, brandId }
      );

      const ticketCount = await fetchZendeskTicketCount({
        brandSubdomain,
        accessToken,
        retentionPeriodDays: configuration.retentionPeriodDays,
      });
      logger.info(
        { connectorId, brandId, ticketCount },
        "Number of valid tickets found for the brand."
      );
      return { ticketCount };
    }
  }
};
