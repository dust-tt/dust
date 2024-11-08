import type { ModelId } from "@dust-tt/types";
import TurndownService from "turndown";

import { getArticleInternalId } from "@connectors/connectors/zendesk/lib/id_conversions";
import type { ZendeskFetchedArticle } from "@connectors/connectors/zendesk/lib/node-zendesk-types";
import {
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import type { ZendeskCategoryResource } from "@connectors/resources/zendesk_resources";
import { ZendeskArticleResource } from "@connectors/resources/zendesk_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const turndownService = new TurndownService();

/**
 * Syncs an article from Zendesk to the postgres db and to the data sources.
 */
export async function syncArticle({
  connectorId,
  article,
  category,
  currentSyncDateMs,
  dataSourceConfig,
  loggerArgs,
  forceResync,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  article: ZendeskFetchedArticle;
  category: ZendeskCategoryResource;
  currentSyncDateMs: number;
  loggerArgs: Record<string, string | number | null>;
  forceResync: boolean;
}) {
  let articleInDb = await ZendeskArticleResource.fetchByArticleId({
    connectorId,
    articleId: article.id,
  });
  const updatedAtDate = new Date(article.updated_at);

  const shouldPerformUpsertion =
    forceResync ||
    !articleInDb ||
    !articleInDb.lastUpsertedTs ||
    articleInDb.lastUpsertedTs < updatedAtDate; // upserting if the article was updated after the last upsert

  const updatableFields = {
    createdAt: new Date(article.created_at),
    updatedAt: updatedAtDate,
    categoryId: category.categoryId, // an article can be moved from one category to another, which does not apply to brands
    name: article.name,
    url: article.html_url,
  };
  // we either create a new article or update the existing one
  if (!articleInDb) {
    articleInDb = await ZendeskArticleResource.makeNew({
      blob: {
        ...updatableFields,
        articleId: article.id,
        brandId: category.brandId,
        permission: "read",
        connectorId,
      },
    });
  } else {
    await articleInDb.update(updatableFields);
  }

  logger.info(
    {
      ...loggerArgs,
      connectorId,
      articleId: article.id,
      articleUpdatedAt: updatedAtDate,
      dataSourceLastUpsertedAt: articleInDb?.lastUpsertedTs ?? null,
    },
    shouldPerformUpsertion
      ? "[Zendesk] Article to sync."
      : "[Zendesk] Article already up to date. Skipping sync."
  );

  if (!shouldPerformUpsertion) {
    return;
  }

  const categoryContent =
    category.name + category.description ? ` - ${category.description}` : "";

  const articleContentInMarkdown =
    typeof article.body === "string"
      ? turndownService.turndown(article.body)
      : "";

  // append the collection description at the beginning of the article
  const markdown = `CATEGORY: ${categoryContent}\n\n${articleContentInMarkdown}`;

  if (articleContentInMarkdown) {
    const createdAt = new Date(article.created_at);
    const updatedAt = new Date(article.updated_at);

    const renderedMarkdown = await renderMarkdownSection(
      dataSourceConfig,
      markdown
    );
    const documentContent = await renderDocumentTitleAndContent({
      dataSourceConfig,
      title: article.title,
      content: renderedMarkdown,
      createdAt,
      updatedAt,
    });

    const documentId = getArticleInternalId(connectorId, article.id);

    await upsertToDatasource({
      dataSourceConfig,
      documentId,
      documentContent,
      documentUrl: article.html_url,
      timestampMs: updatedAt.getTime(),
      tags: [
        `title:${article.title}`,
        `createdAt:${createdAt.getTime()}`,
        `updatedAt:${updatedAt.getTime()}`,
      ],
      parents: articleInDb.getParentInternalIds(connectorId),
      loggerArgs: { ...loggerArgs, articleId: article.id },
      upsertContext: { sync_type: "batch" },
      async: true,
    });
    await articleInDb.update({ lastUpsertedTs: new Date(currentSyncDateMs) });
  } else {
    logger.warn(
      { ...loggerArgs, connectorId, articleId: article.id },
      "[Zendesk] Article has no content. Skipping sync."
    );
  }
}
