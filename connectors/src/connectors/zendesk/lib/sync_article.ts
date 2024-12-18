import type { ModelId } from "@dust-tt/types";
import TurndownService from "turndown";

import type {
  ZendeskFetchedArticle,
  ZendeskFetchedSection,
  ZendeskFetchedUser,
} from "@connectors/@types/node-zendesk";
import { getArticleInternalId } from "@connectors/connectors/zendesk/lib/id_conversions";
import {
  deleteDataSourceDocument,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertDataSourceDocument,
} from "@connectors/lib/data_sources";
import logger from "@connectors/logger/logger";
import type { ZendeskCategoryResource } from "@connectors/resources/zendesk_resources";
import { ZendeskArticleResource } from "@connectors/resources/zendesk_resources";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const turndownService = new TurndownService();

/**
 * Deletes an article from the db and the data sources.
 */
export async function deleteArticle(
  connectorId: ModelId,
  articleId: number,
  dataSourceConfig: DataSourceConfig,
  loggerArgs: Record<string, string | number | null>
): Promise<void> {
  logger.info(
    { ...loggerArgs, connectorId, articleId },
    "[Zendesk] Deleting article."
  );
  await deleteDataSourceDocument(
    dataSourceConfig,
    getArticleInternalId({ connectorId, articleId })
  );
  await ZendeskArticleResource.deleteByArticleId({ connectorId, articleId });
}

/**
 * Syncs an article from Zendesk to the postgres db and to the data sources.
 */
export async function syncArticle({
  connectorId,
  article,
  category,
  section,
  user,
  currentSyncDateMs,
  dataSourceConfig,
  loggerArgs,
  forceResync,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  article: ZendeskFetchedArticle;
  section: ZendeskFetchedSection | null;
  category: ZendeskCategoryResource;
  user: ZendeskFetchedUser | null;
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

  // we either create a new article or update the existing one
  if (!articleInDb) {
    articleInDb = await ZendeskArticleResource.makeNew({
      blob: {
        categoryId: category.categoryId, // an article can be moved from one category to another, which does not apply to brands
        name: article.name,
        url: article.html_url,
        articleId: article.id,
        brandId: category.brandId,
        permission: "read",
        connectorId,
      },
    });
  } else {
    await articleInDb.update({
      categoryId: category.categoryId, // an article can be moved from one category to another, which does not apply to brands
      name: article.name,
      url: article.html_url,
    });
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

  const articleContentInMarkdown =
    typeof article.body === "string"
      ? turndownService.turndown(article.body)
      : "";

  if (articleContentInMarkdown) {
    const createdAt = new Date(article.created_at);
    const updatedAt = new Date(article.updated_at);

    const header = [
      `CATEGORY: ${category.name} ${category?.description ? ` - ${category.description}` : ""}`,
      section &&
        `SECTION: ${section.name} ${section?.description ? ` - ${section.description}` : ""}`,
      user && `USER: ${user.name} ${user?.email ? ` - ${user.email}` : ""}`,
      `SUM OF VOTES: ${article.vote_sum}`,
      article.label_names.length ? `LABELS: ${article.label_names.join()}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const renderedMarkdown = await renderMarkdownSection(
      dataSourceConfig,
      `${header}\n\n${articleContentInMarkdown}`
    );
    const documentContent = await renderDocumentTitleAndContent({
      dataSourceConfig,
      title: article.title,
      content: renderedMarkdown,
      createdAt,
      updatedAt,
    });

    const documentId = getArticleInternalId({
      connectorId,
      articleId: article.id,
    });

    await upsertDataSourceDocument({
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
      title: article.title,
      mimeType: "application/vnd.dust.zendesk.article",
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
