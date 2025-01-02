import { makeScript } from "scripts/helpers";
import { Op } from "sequelize";

import {
  getArticleInternalId,
  getTicketInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { deleteDataSourceDocument } from "@connectors/lib/data_sources";
import { ZendeskArticle, ZendeskTicket } from "@connectors/lib/models/zendesk";
import type Logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const QUERY_BATCH_SIZE = 256;
const DOCUMENT_CONCURRENCY = 16;

async function cleanTickets(
  connector: ConnectorResource,
  logger: typeof Logger,
  execute: boolean
) {
  let idCursor: number = 0;
  let tickets: ZendeskTicket[] = [];
  do {
    tickets = await ZendeskTicket.findAll({
      where: {
        connectorId: connector.id,
        id: { [Op.gt]: idCursor },
      },
      limit: QUERY_BATCH_SIZE,
      order: [["id", "ASC"]],
    });

    if (execute) {
      await concurrentExecutor(
        tickets,
        async (ticket) => {
          return deleteDataSourceDocument(
            dataSourceConfigFromConnector(connector),
            // this is the old internal ID
            getTicketInternalId({
              connectorId: connector.id,
              ticketId: ticket.ticketId,
            })
          );
        },
        { concurrency: DOCUMENT_CONCURRENCY }
      );
      logger.info(
        `LIVE: ${tickets[tickets.length - 1]?.id} >= id > ${idCursor}`
      );
    } else {
      logger.info(
        `DRY: ${tickets[tickets.length - 1]?.id} >= id > ${idCursor}`
      );
    }

    if (tickets.length > 0) {
      const lastTicket = tickets[tickets.length - 1];
      if (lastTicket) {
        idCursor = lastTicket.id;
      }
    }
  } while (tickets.length === QUERY_BATCH_SIZE);
}

async function cleanArticles(
  connector: ConnectorResource,
  logger: typeof Logger,
  execute: boolean
) {
  let idCursor: number = 0;
  let articles: ZendeskArticle[] = [];
  do {
    articles = await ZendeskArticle.findAll({
      where: {
        connectorId: connector.id,
        id: { [Op.gt]: idCursor },
      },
      limit: QUERY_BATCH_SIZE,
      order: [["id", "ASC"]],
    });

    if (execute) {
      await concurrentExecutor(
        articles,
        async (article) => {
          return deleteDataSourceDocument(
            dataSourceConfigFromConnector(connector),
            // this is the old internal ID
            getArticleInternalId({
              connectorId: connector.id,
              articleId: article.articleId,
            })
          );
        },
        { concurrency: DOCUMENT_CONCURRENCY }
      );
      logger.info(
        `LIVE: ${articles[articles.length - 1]?.id} >= id > ${idCursor}`
      );
    } else {
      logger.info(
        `DRY: ${articles[articles.length - 1]?.id} >= id > ${idCursor}`
      );
    }

    if (articles.length > 0) {
      const lastTicket = articles[articles.length - 1];
      if (lastTicket) {
        idCursor = lastTicket.id;
      }
    }
  } while (articles.length === QUERY_BATCH_SIZE);
}

makeScript(
  { resourceType: { type: "string", choices: ["tickets", "articles"] } },
  async ({ execute, resourceType }, logger) => {
    const connectors = await ConnectorResource.listByType("zendesk", {});

    switch (resourceType) {
      case "tickets": {
        for (const connector of connectors) {
          logger.info({ connectorId: connector.id }, `MIGRATING`);
          await cleanTickets(
            connector,
            logger.child({ connectorId: connector.id }),
            execute
          );
        }
        break;
      }
      case "articles": {
        for (const connector of connectors) {
          logger.info({ connectorId: connector.id }, `MIGRATING`);
          await cleanArticles(
            connector,
            logger.child({ connectorId: connector.id }),
            execute
          );
        }
        break;
      }
      default: {
        throw new Error(`Invalid resource type: ${resourceType}`);
      }
    }
  }
);
