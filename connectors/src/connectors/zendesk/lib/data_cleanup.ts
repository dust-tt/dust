import { getArticleInternalId } from "@connectors/connectors/zendesk/lib/id_conversions";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import { deleteFromDataSource } from "@connectors/lib/data_sources";
import {
  ZendeskArticleResource,
  ZendeskCategoryResource,
} from "@connectors/resources/zendesk_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

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
  await concurrentExecutor(
    articles,
    (article) =>
      deleteFromDataSource(
        dataSourceConfig,
        getArticleInternalId({ connectorId, articleId: article.articleId })
      ),
    { concurrency: 10 }
  );
  /// deleting the articles stored in the db
  await ZendeskArticleResource.deleteByCategoryId({
    connectorId,
    categoryId,
  });
  // deleting the category stored in the db
  await ZendeskCategoryResource.deleteByCategoryId({ connectorId, categoryId });
}
