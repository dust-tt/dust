import type { ModelId } from "@dust-tt/types";
import { MIME_TYPES } from "@dust-tt/types";
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
  brandId: number,
  articleId: number,
  dataSourceConfig: DataSourceConfig,
  loggerArgs: Record<string, string | number | null>
): Promise<void> {
  logger.info({ ...loggerArgs, articleId }, "[Zendesk] Deleting article.");
  await deleteDataSourceDocument(
    dataSourceConfig,
    getArticleInternalId({ connectorId, brandId, articleId })
  );
  await ZendeskArticleResource.deleteByArticleId({
    connectorId,
    brandId,
    articleId,
  });
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
  helpCenterIsAllowed,
  dataSourceConfig,
  loggerArgs,
}: {
  connectorId: ModelId;
  dataSourceConfig: DataSourceConfig;
  article: ZendeskFetchedArticle;
  section: ZendeskFetchedSection | null;
  category: ZendeskCategoryResource;
  user: ZendeskFetchedUser | null;
  helpCenterIsAllowed: boolean;
  currentSyncDateMs: number;
  loggerArgs: Record<string, string | number | null>;
}) {
  let articleInDb = await ZendeskArticleResource.fetchByArticleId({
    connectorId,
    brandId: category.brandId,
    articleId: article.id,
  });
  const updatedAtDate = new Date(article.updated_at);

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
      articleId: article.id,
      articleUpdatedAt: updatedAtDate,
      dataSourceLastUpsertedAt: articleInDb?.lastUpsertedTs ?? null,
    },
    "[Zendesk] Article to sync."
  );

  let articleContentInMarkdown =
    typeof article.body === "string"
      ? turndownService.turndown(article.body)
      : "";

  if (!articleContentInMarkdown) {
    logger.warn(
      { ...loggerArgs, articleId: article.id },
      "[Zendesk] Article has no content."
    );
    // We still sync articles that have no content to have the node appear.
    articleContentInMarkdown = "Article without content.";
  }

  const createdAt = new Date(article.created_at);
  const updatedAt = new Date(article.updated_at);

  const header = [
    `CATEGORY: ${category.name} ${category?.description ? ` - ${category.description}` : ""}`,
    section &&
      `SECTION: ${section.name} ${section?.description ? ` - ${section.description}` : ""}`,
    user && `USER: ${user.name} ${user?.email ? ` - ${user.email}` : ""}`,
    `SUM OF VOTES: ${article.vote_sum}`,
    article.label_names?.length ? `LABELS: ${article.label_names.join()}` : "",
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
    brandId: category.brandId,
    articleId: article.id,
  });

  const parents = articleInDb.getParentInternalIds(
    connectorId,
    helpCenterIsAllowed
  );
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
    parents,
    parentId: parents[1],
    loggerArgs: { ...loggerArgs, articleId: article.id },
    upsertContext: { sync_type: "batch" },
    title: article.title,
    mimeType: MIME_TYPES.ZENDESK.ARTICLE,
    async: true,
  });
  await articleInDb.update({ lastUpsertedTs: new Date(currentSyncDateMs) });
}
