import {
  getArticleInternalId,
  getTicketInternalId,
} from "@connectors/connectors/zendesk/lib/id_conversions";
import { ZENDESK_BATCH_SIZE } from "@connectors/connectors/zendesk/temporal/config";
import { deleteFromDataSource } from "@connectors/lib/data_sources";
import {
  ZendeskArticleResource,
  ZendeskCategoryResource,
  ZendeskTicketResource,
} from "@connectors/resources/zendesk_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

/**
 * Deletes all the tickets stored in the db and in the data source relative to a brand.
 *
 * @returns `true` if there are more tickets to process.
 */
export async function deleteBrandTicketBatch({
  connectorId,
  brandId,
  dataSourceConfig,
}: {
  connectorId: number;
  brandId: number;
  dataSourceConfig: DataSourceConfig;
}): Promise<boolean> {
  const ticketIds = await ZendeskTicketResource.fetchTicketIdsByBrandId({
    connectorId,
    brandId,
    batchSize: ZENDESK_BATCH_SIZE,
  });
  /// deleting the tickets in the data source
  await Promise.all(
    ticketIds.map((ticketId) =>
      deleteFromDataSource(
        dataSourceConfig,
        getTicketInternalId(connectorId, ticketId)
      )
    )
  );
  /// deleting the tickets stored in the db
  await ZendeskTicketResource.deleteByTicketIds({ connectorId, ticketIds });

  /// returning false if we know for sure there isn't any more ticket to process
  return ticketIds.length === ZENDESK_BATCH_SIZE;
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
export async function deleteCategory({
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
  // deleting the category stored in the db
  await ZendeskCategoryResource.deleteByCategoryId({ connectorId, categoryId });
}
