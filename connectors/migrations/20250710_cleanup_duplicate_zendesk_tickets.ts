import _ from "lodash";
import { makeScript } from "scripts/helpers";

import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { fetchZendeskTicket } from "@connectors/connectors/zendesk/lib/zendesk_api";
import { ZendeskTicketModel } from "@connectors/lib/models/zendesk";
import { ConnectorResource } from "@connectors/resources/connector_resource";
export type { Logger } from "pino";

async function checkTicketValidity(
  ticket: ZendeskTicketModel,
  { accessToken, subdomain }: { accessToken: string; subdomain: string }
) {
  const fetchedTicket = await fetchZendeskTicket({
    accessToken,
    brandSubdomain: subdomain,
    ticketId: ticket.ticketId,
  });

  return fetchedTicket?.brand_id === ticket.brandId;
}

async function migrateConnector(
  connector: ConnectorResource,
  execute: boolean,
  logger: Logger
) {
  const { accessToken, subdomain } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );

  const tickets = await ZendeskTicketModel.findAll({
    where: { connectorId: connector.id },
  });
  const ticketsByTicketId = _.groupBy(tickets, (t) => t.ticketId);
  const duplicateTickets = Object.values(ticketsByTicketId)
    .filter((t) => t.length > 1)
    .flat();

  for (const ticket of duplicateTickets) {
    const isValid = await checkTicketValidity(ticket, {
      accessToken,
      subdomain,
    });
    logger.info(
      {
        connectorId: connector.id,
        ticketId: ticket.ticketId,
        brandId: ticket.brandId,
        isValid,
      },
      "Checked duplicate ticket"
    );
    if (isValid) {
      if (execute) {
        await ticket.destroy();
        logger.info(
          {
            connectorId: connector.id,
            ticketId: ticket.ticketId,
            brandId: ticket.brandId,
          },
          "Destroyed duplicate ticket"
        );
      }
    }
  }
}

makeScript(
  {
    connectorId: { type: "number" },
  },
  async ({ execute, connectorId }, logger) => {
    const connector = await ConnectorResource.fetchById(connectorId);
    if (!connector) {
      logger.error({ connectorId }, "Connector not found");
      return;
    }
    if (connector.type !== "zendesk") {
      logger.error({ connectorId }, "Not a Zendesk connector");
      return;
    }

    logger.info({ connectorId }, "Starting migration");
    await migrateConnector(connector, execute, logger);
    logger.info({ connectorId }, "Migration done");
  }
);
