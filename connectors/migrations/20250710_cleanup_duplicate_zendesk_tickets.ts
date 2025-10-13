import _ from "lodash";
import type { Logger } from "pino";
import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import { getTicketInternalId } from "@connectors/connectors/zendesk/lib/id_conversions";
import { getZendeskSubdomainAndAccessToken } from "@connectors/connectors/zendesk/lib/zendesk_access_token";
import { fetchZendeskTicket } from "@connectors/connectors/zendesk/lib/zendesk_api";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { deleteDataSourceDocument } from "@connectors/lib/data_sources";
import { ZendeskTicketModel } from "@connectors/lib/models/zendesk";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { ZendeskBrandResource } from "@connectors/resources/zendesk_resources";

const TICKET_BATCH_SIZE = 512;
const CONCURRENCY = 4;

async function getTicketBrandId(
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
      return null;
    }
    brandSubdomains.set(ticket.brandId, brand.subdomain);
    brandSubdomain = brand.subdomain;
  }

  const fetchedTicket = await fetchZendeskTicket({
    accessToken,
    brandSubdomain: brandSubdomain!,
    ticketId: ticket.ticketId,
  });

  return fetchedTicket?.brand_id ?? null;
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
  const ticketIdsSeen = new Set();

  let lastId: number | undefined = 0;
  let ticketIds: ZendeskTicketModel[] = [];

  do {
    ticketIds = await ZendeskTicketModel.findAll({
      where: {
        connectorId: connector.id,
        id: { [Op.gt]: lastId },
      },
      attributes: ["ticketId", "id"],
      order: [["id", "ASC"]],
      limit: TICKET_BATCH_SIZE,
    });
    if (ticketIds.length === 0) {
      break;
    }
    const ticketIdsToSee = _.uniq(ticketIds.map((t) => t.ticketId));

    const tickets = await ZendeskTicketModel.findAll({
      where: {
        connectorId: connector.id,
        ticketId: {
          [Op.in]: ticketIdsToSee.filter(
            (ticketId) => !ticketIdsSeen.has(ticketId)
          ),
        },
      },
    });

    ticketIdsToSee.forEach((id) => ticketIdsSeen.add(id));

    const ticketsByTicketId = _.groupBy(tickets, (t) => t.ticketId);

    await concurrentExecutor(
      Object.values(ticketsByTicketId),
      async (ticketBatch) => {
        // Fetch the first ticket from Zendesk to get the brand ID (they all have the same one).
        const brandIdFromZendesk = await getTicketBrandId(ticketBatch[0]!, {
          accessToken,
          brandSubdomains,
        });
        if (!brandIdFromZendesk) {
          logger.warn(
            { ticketId: ticketBatch[0]?.ticketId },
            "Could not find a brand"
          );
          return;
        }

        for (const ticket of ticketBatch) {
          const localLogger = logger.child({
            ticketId: ticket.ticketId,
            brandIdOnDb: ticket.brandId,
            brandIdFromZendesk,
            lastId,
          });
          const isValid = ticket.brandId === brandIdFromZendesk;
          if (isValid) {
            localLogger.info("Ticket belongs to the correct brand");
            continue;
          }

          if (execute) {
            await ticket.destroy();
            await deleteDataSourceDocument(
              dataSourceConfigFromConnector(connector),
              getTicketInternalId({
                connectorId: connector.id,
                brandId: ticket.brandId,
                ticketId: ticket.ticketId,
              })
            );
            localLogger.info("Destroyed duplicate ticket");
          } else {
            localLogger.info("Would destroy duplicate ticket");
          }
        }
      },
      { concurrency: CONCURRENCY }
    );
    lastId = ticketIds[ticketIds.length - 1]?.id;
  } while (ticketIds.length === TICKET_BATCH_SIZE);
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
