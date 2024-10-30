import type { ModelId } from "@dust-tt/types";

import type { ZendeskFetchedArticle } from "@connectors/connectors/zendesk/lib/node-zendesk-types";
import { ZendeskArticleResource } from "@connectors/resources/zendesk_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

export async function syncArticle({
  connectorId,
  article,
  brandId,
  categoryId,
  currentSyncDateMs,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  article: ZendeskFetchedArticle;
  brandId: number;
  categoryId: number;
  currentSyncDateMs: number;
  loggerArgs: Record<string, string | number | null>;
  forceResync: boolean;
}) {
  let articleInDb = await ZendeskArticleResource.fetchByArticleId({
    connectorId,
    articleId: article.id,
  });
  const createdAtDate = new Date(article.created_at);
  const updatedAtDate = new Date(article.updated_at);

  if (!articleInDb) {
    articleInDb = await ZendeskArticleResource.makeNew({
      blob: {
        createdAt: createdAtDate,
        updatedAt: updatedAtDate,
        articleId: article.id,
        brandId,
        categoryId,
        permission: "read",
        name: article.name,
        url: article.url,
        lastUpsertedTs: new Date(currentSyncDateMs),
        connectorId,
      },
    });
  } else {
    await articleInDb.update({
      createdAt: createdAtDate,
      updatedAt: updatedAtDate,
      categoryId, // an article can be moved from one category to another, which does not apply to brands
      name: article.name,
      url: article.url,
      lastUpsertedTs: new Date(currentSyncDateMs),
    });
  }
  /// TODO: upsert the article here
}
