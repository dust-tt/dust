import {
  getArticleInternalId,
  getTicketInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { deleteFromDataSource } from "@connectors/lib/data_sources";
import {
  ZendeskArticleResource,
  ZendeskBrandResource,
  ZendeskCategoryResource,
  ZendeskTicketResource,
} from "@connectors/resources/zendesk_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

/**
 * Deletes all the data relative to a brand (tickets, help center, categories, articles) in the data source and in the db.
 */
export async function deleteBrand({
  connectorId,
  brandId,
  dataSourceConfig,
}: {
  connectorId: number;
  brandId: number;
  dataSourceConfig: DataSourceConfig;
}) {
  await Promise.all([
    deleteBrandHelpCenter({ connectorId, brandId, dataSourceConfig }),
    deleteBrandTickets({ connectorId, brandId, dataSourceConfig }),
  ]);
  await ZendeskBrandResource.deleteByConnectorId(connectorId);
}

/**
 * Deletes all the tickets stored in the db and in the data source relative to a brand.
 */
export async function deleteBrandTickets({
  connectorId,
  brandId,
  dataSourceConfig,
}: {
  connectorId: number;
  brandId: number;
  dataSourceConfig: DataSourceConfig;
}) {
  const tickets = await ZendeskTicketResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  /// deleting the tickets in the data source
  await Promise.all(
    tickets.map((ticket) =>
      deleteFromDataSource(
        dataSourceConfig,
        getTicketInternalId(ticket.connectorId, ticket.ticketId)
      )
    )
  );
  /// deleting the tickets stored in the db
  await ZendeskTicketResource.deleteByBrandId({ connectorId, brandId });
}

/**
 * Deletes all the data stored in the db and in the data source relative to a brand's help center (category, articles).
 */
export async function deleteBrandHelpCenter({
  connectorId,
  brandId,
  dataSourceConfig,
}: {
  connectorId: number;
  brandId: number;
  dataSourceConfig: DataSourceConfig;
}) {
  /// deleting the articles in the data source
  const articles = await ZendeskArticleResource.fetchByBrandId({
    connectorId,
    brandId,
  });
  await Promise.all(
    articles.map((article) =>
      deleteFromDataSource(
        dataSourceConfig,
        getArticleInternalId(connectorId, article.articleId)
      )
    )
  );
  /// deleting the articles stored in the db
  await ZendeskArticleResource.deleteByBrandId({
    connectorId,
    brandId,
  });
  /// deleting the categories stored in the db
  await ZendeskCategoryResource.deleteByBrandId({ connectorId, brandId });
}

/**
 * Deletes all the data stored in the db and in the data source relative to a category (articles).
 */
export async function deleteCategoryChildren({
  connectorId,
  categoryId,
  dataSourceConfig,
}: {
  connectorId: number;
  categoryId: number;
  dataSourceConfig: DataSourceConfig;
}) {
  /// deleting the articles in the data source
  const articles = await ZendeskArticleResource.fetchByCategoryId({
    connectorId,
    categoryId,
  });
  await Promise.all(
    articles.map((article) =>
      deleteFromDataSource(
        dataSourceConfig,
        getArticleInternalId(connectorId, article.articleId)
      )
    )
  );
  /// deleting the articles stored in the db
  await ZendeskArticleResource.deleteByCategoryId({
    connectorId,
    categoryId,
  });
}
