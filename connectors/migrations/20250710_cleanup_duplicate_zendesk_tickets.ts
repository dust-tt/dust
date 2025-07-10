import _ from "lodash";
import type { Logger } from "pino";
import { makeScript } from "scripts/helpers";

import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { fetchZendeskTicket } from "@connectors/connectors/zendesk/lib/zendesk_api";
import { ZendeskTicketModel } from "@connectors/lib/models/zendesk";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

async function checkTicketValidity(
  ticket: ZendeskTicketModel,
  {
    accessToken,
    brandSubdomains,
  }: { accessToken: string; brandSubdomains: Map<number, string> }
) {
  let brandSubdomain = brandSubdomains.get(ticket.brandId);
  if (!brandSubdomains.has(ticket.brandId)) {
    const brand = await ZendeskBrandResource.fetchByBrandId({
      connectorId: ticket.connectorId,
      brandId: ticket.brandId,
    });
    if (!brand) {
      return false;
    }
    brandSubdomains.set(ticket.brandId, brand.subdomain);
    brandSubdomain = brand.subdomain;
  }

  const fetchedTicket = await fetchZendeskTicket({
    accessToken,
    brandSubdomain: brandSubdomain!,
    ticketId: ticket.ticketId,
  });

  return fetchedTicket && fetchedTicket.brand_id === ticket.brandId;
}

async function cleanupConnector(
  connector: ConnectorResource,
  execute: boolean,
  logger: Logger
) {
  const { accessToken } = await getZendeskSubdomainAndAccessToken(
    connector.connectionId
  );
  const brandSubdomains = new Map<number, string>();

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
      brandSubdomains,
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
    if (!isValid) {
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
      } else {
        logger.info(
          {
            connectorId: connector.id,
            ticketId: ticket.ticketId,
            brandId: ticket.brandId,
          },
          "Would destroy duplicate ticket"
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
    await cleanupConnector(connector, execute, logger);
    logger.info({ connectorId }, "Migration done");
  }
);
