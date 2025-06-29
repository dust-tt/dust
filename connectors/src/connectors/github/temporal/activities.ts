import type { Result } from "@dust-tt/client";
import { assertNever, Err, Ok } from "@dust-tt/client";
import { hash as blake3 } from "blake3";
import { promises as fs } from "fs";
import PQueue from "p-queue";

import { formatCodeContentForUpsert } from "@connectors/connectors/github/lib/code/file_operations";
import { garbageCollectCodeSync } from "@connectors/connectors/github/lib/code/garbage_collect";
import {
  isGraphQLNotFound,
  isGraphQLRepositoryNotFound,
  RepositoryAccessBlockedError,
  RepositoryNotFoundError,
} from "@connectors/connectors/github/lib/errors";
import type {
  GithubIssue as GithubIssueType,
  GithubUser,
} from "@connectors/connectors/github/lib/github_api";
import {
  cleanUpProcessRepository,
  getDiscussion,
  getDiscussionCommentRepliesPage,
  getDiscussionCommentsPage,
  getIssue,
  getIssueCommentsPage,
  getRepoDiscussionsPage,
  getRepoIssuesPage,
  getReposPage,
  processRepository,
} from "@connectors/connectors/github/lib/github_api";
import type { DiscussionNode } from "@connectors/connectors/github/lib/github_graphql";
import {
  getCodeRootInternalId,
  getDiscussionInternalId,
  getDiscussionsInternalId,
  getDiscussionsUrl,
  getIssueInternalId,
  getIssuesInternalId,
  getIssuesUrl,
  getRepositoryInternalId,
  getRepoUrl,
} from "@connectors/connectors/github/lib/utils";
import { QUEUE_NAME } from "@connectors/connectors/github/temporal/config";
import { newWebhookSignal } from "@connectors/connectors/github/temporal/signals";
import { getCodeSyncWorkflowId } from "@connectors/connectors/github/temporal/utils";
import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import {
  deleteDataSourceDocument,
  deleteDataSourceFolder,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  sectionLength,
  upsertDataSourceDocument,
  upsertDataSourceFolder,
} from "@connectors/lib/data_sources";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import {
  GithubCodeDirectory,
  GithubCodeFile,
  GithubCodeRepository,
  GithubConnectorState,
  GithubDiscussion,
  GithubIssue,
} from "@connectors/lib/models/github";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import { heartbeat } from "@connectors/lib/temporal";
import { getTemporalClient } from "@connectors/lib/temporal";
import type { Logger } from "@connectors/logger/logger";
import { getActivityLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ModelId } from "@connectors/types";
import type { DataSourceConfig } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";
import { normalizeError } from "@connectors/types/api";

// Only allow documents up to 5mb to be processed.
const MAX_DOCUMENT_TXT_LEN = 5000000;

export async function githubGetReposResultPageActivity(
  connectorId: ModelId,
  pageNumber: number, // 1-indexed
  loggerArgs: Record<string, string | number>
): Promise<{ name: string; id: number; login: string }[]> {
  if (pageNumber < 1) {
    throw new Error("Page number must be greater than 0 (1-indexed)");
  }
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found (connectorId: ${connectorId})`);
  }
  const logger = getActivityLogger(connector, {
    pageNumber,
    ...loggerArgs,
  });

  logger.info("Fetching GitHub repos result page.");
  const pageRes = await getReposPage(connector, pageNumber);
  if (pageRes.isErr()) {
    throw pageRes.error;
  }
  const page = pageRes.value;
  return page.map((repo) => ({
    name: repo.name,
    id: repo.id,
    login: repo.owner.login,
  }));
}

export async function githubGetRepoIssuesResultPageActivity(
  connectorId: ModelId,
  repoName: string,
  repoLogin: string,
  pageNumber: number, // 1-indexed
  loggerArgs: Record<string, string | number>
): Promise<number[]> {
  if (pageNumber < 1) {
    throw new Error("Page number must be greater than 0 (1-indexed)");
  }
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found (connectorId: ${connectorId})`);
  }
  const logger = getActivityLogger(connector, {
    repoName,
    repoLogin,
    pageNumber,
    ...loggerArgs,
  });

  logger.info("Fetching GitHub repo issues result page.");
  const page = await getRepoIssuesPage(
    connector,
    repoName,
    repoLogin,
    pageNumber
  );

  return page.map((issue) => issue.number);
}

async function renderIssue(
  dataSourceConfig: DataSourceConfig,
  connector: ConnectorResource,
  repoName: string,
  repoLogin: string,
  issueNumber: number,
  logger: Logger
): Promise<{
  issue: GithubIssueType;
  updatedAtTimestamp: number;
  content: CoreAPIDataSourceDocumentSection;
} | null> {
  const issue = await getIssue(
    connector,
    repoName,
    repoLogin,
    issueNumber,
    logger
  );
  if (!issue) {
    return null;
  }

  const content = await renderDocumentTitleAndContent({
    dataSourceConfig,
    title: `${issue.isPullRequest ? "Pull Request" : "Issue"} #${issue.number} [${repoName}]: ${issue.title}`,
    createdAt: issue.createdAt || issue.updatedAt,
    updatedAt: issue.updatedAt,
    author: renderGithubUser(issue.creator),
    additionalPrefixes: {
      labels: issue.labels.join(", "),
      isPullRequest: issue.isPullRequest.toString(),
    },
    content: await renderMarkdownSection(dataSourceConfig, issue.body ?? "", {
      flavor: "gfm",
    }),
  });

  let resultPage = 1;
  let lastCommentUpdateTime: Date | null = null;

  for (;;) {
    logger.info(
      { page: resultPage },
      "Fetching GitHub issue comments result page."
    );

    let comments = undefined;
    try {
      comments = await getIssueCommentsPage(
        connector,
        repoName,
        repoLogin,
        issueNumber,
        resultPage
      );
    } catch (e) {
      if (e instanceof Error && "status" in e && e.status === 404) {
        // Github may return a 404 on the first page if the issue has no comments
        break;
      } else {
        throw e;
      }
    }

    if (!comments.length) {
      break;
    }

    for (const comment of comments) {
      if (comment.body) {
        const c = {
          prefix: `>> ${renderGithubUser(comment.creator)}:\n`,
          content: null,
          sections: [
            await renderMarkdownSection(dataSourceConfig, comment.body, {
              flavor: "gfm",
            }),
          ],
        };
        content.sections.push(c);
      }
      if (
        !lastCommentUpdateTime ||
        comment.updatedAt.getTime() > lastCommentUpdateTime.getTime()
      ) {
        lastCommentUpdateTime = comment.updatedAt;
      }
    }

    resultPage += 1;
  }

  const updatedAtTimestamp = Math.max(
    issue.updatedAt.getTime(),
    lastCommentUpdateTime ? lastCommentUpdateTime.getTime() : 0
  );

  return {
    issue,
    updatedAtTimestamp,
    content,
  };
}

export async function githubUpsertIssueActivity(
  connectorId: ModelId,
  repoName: string,
  repoId: number,
  repoLogin: string,
  issueNumber: number,
  dataSourceConfig: DataSourceConfig,
  loggerArgs: Record<string, string | number>,
  isBatchSync = false
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found (connectorId: ${connectorId})`);
  }
  const logger = getActivityLogger(connector, {
    issueNumber,
    repoId,
    repoLogin,
    repoName,
    ...loggerArgs,
  });
  logger.info("Upserting GitHub issue.");
  const existingIssue = await GithubIssue.findOne({
    where: {
      repoId: repoId.toString(),
      issueNumber,
      connectorId: connector.id,
    },
  });
  if (existingIssue && existingIssue.skipReason) {
    logger.info("Issue skipped.");
    return;
  }

  const renderedIssueResult = await renderIssue(
    dataSourceConfig,
    connector,
    repoName,
    repoLogin,
    issueNumber,
    logger
  );

  // Silently skip the current issue if fetching fails.
  if (!renderedIssueResult) {
    logger.info("Skip upserting GitHub issue.");
    return;
  }

  const {
    issue,
    updatedAtTimestamp,
    content: renderedIssue,
  } = renderedIssueResult;

  if (sectionLength(renderedIssue) > MAX_DOCUMENT_TXT_LEN) {
    logger.info("Issue is too large to upsert.");
    return;
  }

  const documentId = getIssueInternalId(repoId.toString(), issueNumber);
  const issueAuthor = renderGithubUser(issue.creator);
  const tags = [
    `title:${issue.title}`,
    `isPullRequest:${issue.isPullRequest}`,
    `createdAt:${issue.createdAt.getTime()}`,
    `updatedAt:${issue.updatedAt.getTime()}`,
    ...(issueAuthor ? [`author:${issueAuthor}`] : []),
    ...issue.labels,
  ];

  const parents: [string, string, string] = [
    documentId,
    getIssuesInternalId(repoId),
    getRepositoryInternalId(repoId),
  ];
  // TODO: last commentor, last comment date, issue labels (as tags)
  await upsertDataSourceDocument({
    dataSourceConfig,
    documentId,
    documentContent: renderedIssue,
    documentUrl: issue.url,
    timestampMs: updatedAtTimestamp,
    tags: tags,
    parents,
    parentId: parents[1],
    loggerArgs: logger.bindings(),
    upsertContext: {
      sync_type: isBatchSync ? "batch" : "incremental",
    },
    title: issue.title,
    mimeType: INTERNAL_MIME_TYPES.GITHUB.ISSUE,
    async: true,
  });

  logger.info("Upserting GitHub issue in DB.");
  await GithubIssue.upsert({
    repoId: repoId.toString(),
    issueNumber,
    connectorId: connector.id,
  });
}

async function renderDiscussion(
  dataSourceConfig: DataSourceConfig,
  connector: ConnectorResource,
  repoName: string,
  login: string,
  discussionNumber: number,
  logger: Logger
): Promise<
  Result<
    {
      discussion: DiscussionNode;
      content: CoreAPIDataSourceDocumentSection;
    },
    Error
  >
> {
  const discussionRes = await getDiscussion(
    connector,
    repoName,
    login,
    discussionNumber
  );
  if (discussionRes.isErr()) {
    return new Err(discussionRes.error);
  }

  const discussion = discussionRes.value;

  const content = await renderDocumentTitleAndContent({
    dataSourceConfig,
    title: `Discussion #${discussion.number} [${repoName}]: ${discussion.title}`,
    createdAt: new Date(discussion.createdAt),
    updatedAt: new Date(discussion.updatedAt),
    content: await renderMarkdownSection(
      dataSourceConfig,
      discussion.bodyText,
      {
        flavor: "gfm",
      }
    ),
  });

  let nextCursor: string | null = null;

  for (;;) {
    logger.info({ nextCursor }, "Fetching GitHub discussion comments page.");

    const { cursor, comments } = await getDiscussionCommentsPage(
      connector,
      repoName,
      login,
      discussionNumber,
      nextCursor
    );

    // Not parallelizing here. We can increase the number of concurrent issues/discussions
    // that are processed when doing the full repo sync, so it's easier to assume
    // a single job isn't doing more than 1 concurrent request.
    for (const comment of comments) {
      let prefix = "> ";
      if (comment.isAnswer) {
        prefix += "[ACCEPTED ANSWER] ";
      }
      prefix += `${comment.author?.login || "Unknown author"}:\n`;
      const c = {
        prefix,
        content: null,
        sections: [
          await renderMarkdownSection(dataSourceConfig, comment.bodyText, {
            flavor: "gfm",
          }),
        ],
      };
      content.sections.push(c);

      let nextChildCursor: string | null = null;

      for (;;) {
        logger.info(
          {
            nextCursor,
            nextChildCursor,
          },
          "Fetching GitHub discussion comments replies page."
        );

        const { cursor: childCursor, comments: childComments } =
          await getDiscussionCommentRepliesPage(
            connector,
            comment.id,
            nextChildCursor
          );

        for (const childComment of childComments) {
          const cc = {
            prefix: `>> ${childComment.author?.login || "Unknown author"}:\n`,
            content: null,
            sections: [
              await renderMarkdownSection(dataSourceConfig, comment.bodyText, {
                flavor: "gfm",
              }),
            ],
          };
          c.sections.push(cc);
        }

        if (!childCursor) {
          break;
        }

        nextChildCursor = childCursor;
      }
    }

    if (!cursor) {
      break;
    }

    nextCursor = cursor;
  }

  return new Ok({
    discussion,
    content,
  });
}

export async function githubUpsertDiscussionActivity(
  connectorId: ModelId,
  repoName: string,
  repoId: number,
  repoLogin: string,
  discussionNumber: number,
  dataSourceConfig: DataSourceConfig,
  loggerArgs: Record<string, string | number>,
  isBatchSync: boolean
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found (connectorId: ${connectorId})`);
  }
  const logger = getActivityLogger(connector, {
    discussionNumber,
    repoId,
    repoLogin,
    repoName,
    ...loggerArgs,
  });
  logger.info("Upserting GitHub discussion.");
  const renderedDiscussionRes = await renderDiscussion(
    dataSourceConfig,
    connector,
    repoName,
    repoLogin,
    discussionNumber,
    logger
  );

  if (renderedDiscussionRes.isErr()) {
    if (isGraphQLNotFound(renderedDiscussionRes.error)) {
      logger.warn("Discussion not found. Skipping.");
      return;
    }
    throw renderedDiscussionRes.error;
  }

  const { discussion, content: renderedDiscussion } =
    renderedDiscussionRes.value;

  if (sectionLength(renderedDiscussion) > MAX_DOCUMENT_TXT_LEN) {
    logger.info("Discussion is too large to upsert.");
    return;
  }

  const documentId = getDiscussionInternalId(
    repoId.toString(),
    discussionNumber
  );
  const tags = [
    `title:${discussion.title}`,
    `author:${discussion.author ? discussion.author.login : "unknown"}`,
    `updatedAt:${new Date(discussion.updatedAt).getTime()}`,
  ];

  const parents: [string, string, string] = [
    documentId,
    getDiscussionsInternalId(repoId),
    getRepositoryInternalId(repoId),
  ];
  await upsertDataSourceDocument({
    dataSourceConfig,
    documentId,
    documentContent: renderedDiscussion,
    documentUrl: discussion.url,
    timestampMs: new Date(discussion.createdAt).getTime(),
    tags,
    parents,
    parentId: parents[1],
    loggerArgs: logger.bindings(),
    upsertContext: {
      sync_type: isBatchSync ? "batch" : "incremental",
    },
    title: discussion.title,
    mimeType: INTERNAL_MIME_TYPES.GITHUB.DISCUSSION,
    async: true,
  });

  logger.info("Upserting GitHub discussion in DB.");
  await GithubDiscussion.upsert({
    repoId: repoId.toString(),
    discussionNumber: discussionNumber,
    connectorId: connector.id,
  });
}

export async function githubGetRepoDiscussionsResultPageActivity(
  connectorId: ModelId,
  repoName: string,
  repoLogin: string,
  cursor: string | null,
  loggerArgs: Record<string, string | number>
): Promise<{ cursor: string | null; discussionNumbers: number[] } | null> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found (connectorId: ${connectorId})`);
  }
  const logger = getActivityLogger(connector, {
    cursor,
    repoLogin,
    repoName,
    ...loggerArgs,
  });
  logger.info("Fetching GitHub discussions result page.");

  try {
    const { cursor: nextCursor, discussions } = await getRepoDiscussionsPage(
      connector,
      repoName,
      repoLogin,
      cursor
    );

    return {
      cursor: nextCursor,
      discussionNumbers: discussions.map((discussion) => discussion.number),
    };
  } catch (err) {
    if (isGraphQLRepositoryNotFound(err)) {
      logger.info(
        {
          connectorId,
          repoName,
          repoOwner: repoLogin,
          error: normalizeError(err).message,
        },
        "Skipping repository - repository not found"
      );
      return null;
    }
    throw err;
  }
}

export async function githubSaveStartSyncActivity(
  dataSourceConfig: DataSourceConfig
) {
  const connector = await ConnectorResource.findByDataSource(dataSourceConfig);
  if (!connector) {
    throw new Error("Could not find connector");
  }
  const res = await syncStarted(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

export async function githubSaveSuccessSyncActivity(
  dataSourceConfig: DataSourceConfig
) {
  const connector = await ConnectorResource.findByDataSource(dataSourceConfig);
  if (!connector) {
    throw new Error("Could not find connector");
  }

  const res = await syncSucceeded(connector.id);
  if (res.isErr()) {
    throw res.error;
  }
}

export async function githubIssueGarbageCollectActivity(
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  repoId: string,
  issueNumber: number
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found (connectorId: ${connectorId})`);
  }
  const logger = getActivityLogger(connector, {
    repoId,
    issueNumber,
  });

  await deleteIssue(dataSourceConfig, connector, repoId, issueNumber, logger);
}

export async function githubDiscussionGarbageCollectActivity(
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  repoId: string,
  discussionNumber: number
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found (connectorId: ${connectorId})`);
  }
  const logger = getActivityLogger(connector, {
    repoId,
    discussionNumber,
  });

  await deleteDiscussion(
    dataSourceConfig,
    connector,
    repoId,
    discussionNumber,
    logger
  );
}

export async function githubRepoGarbageCollectActivity(
  dataSourceConfig: DataSourceConfig,
  connectorId: ModelId,
  repoId: string
) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found (connectorId: ${connectorId})`);
  }
  const logger = getActivityLogger(connector, { repoId });

  const issuesInRepo = await GithubIssue.findAll({
    where: {
      repoId,
      connectorId: connector.id,
    },
  });

  const queue = new PQueue({ concurrency: 5 });
  const promises = [];

  for (const issue of issuesInRepo) {
    promises.push(
      queue.add(() =>
        deleteIssue(
          dataSourceConfig,
          connector,
          repoId,
          issue.issueNumber,
          logger.child({ issueNumber: issue.issueNumber })
        )
      )
    );
  }

  const discussionsInRepo = await GithubDiscussion.findAll({
    where: {
      repoId,
      connectorId: connector.id,
    },
  });

  for (const discussion of discussionsInRepo) {
    promises.push(
      queue.add(() =>
        deleteDiscussion(
          dataSourceConfig,
          connector,
          repoId,
          discussion.discussionNumber,
          logger.child({ discussionNumber: discussion.discussionNumber })
        )
      )
    );
  }

  await Promise.all(promises);

  await garbageCollectCodeSync(
    dataSourceConfig,
    connector,
    parseInt(repoId, 10),
    new Date(),
    logger
  );

  // deleting the folders that are tied to a repository from data_source_folders (core)
  await deleteDataSourceFolder({
    dataSourceConfig,
    folderId: getDiscussionsInternalId(repoId),
  });
  await deleteDataSourceFolder({
    dataSourceConfig,
    folderId: getIssuesInternalId(repoId),
  });
  await deleteDataSourceFolder({
    dataSourceConfig,
    folderId: getCodeRootInternalId(repoId),
  });
  await deleteDataSourceFolder({
    dataSourceConfig,
    folderId: getRepositoryInternalId(repoId),
  });

  // Finally delete the repository object if it exists.
  await GithubCodeRepository.destroy({
    where: {
      connectorId: connector.id,
      repoId: repoId.toString(),
    },
  });
}

async function deleteIssue(
  dataSourceConfig: DataSourceConfig,
  connector: ConnectorResource,
  repoId: string,
  issueNumber: number,
  logger: Logger
) {
  const issueInDb = await GithubIssue.findOne({
    where: {
      repoId: repoId.toString(),
      issueNumber,
      connectorId: connector.id,
    },
  });
  if (!issueInDb) {
    logger.info(
      `Issue not found in DB (issueNumber: ${issueNumber}, repoId: ${repoId}, connectorId: ${connector.id}), skipping deletion`
    );
  }

  const documentId = getIssueInternalId(repoId.toString(), issueNumber);
  logger.info({ documentId }, "Deleting GitHub issue from Dust data source.");
  await deleteDataSourceDocument(
    dataSourceConfig,
    documentId,
    logger.bindings()
  );

  if (issueInDb) {
    logger.info("Deleting GitHub issue from database.");
    await GithubIssue.destroy({
      where: {
        repoId: repoId.toString(),
        issueNumber,
        connectorId: connector.id,
      },
    });
  }
}

async function deleteDiscussion(
  dataSourceConfig: DataSourceConfig,
  connector: ConnectorResource,
  repoId: string,
  discussionNumber: number,
  logger: Logger
) {
  const discussionInDb = await GithubDiscussion.findOne({
    where: {
      repoId: repoId.toString(),
      discussionNumber,
      connectorId: connector.id,
    },
  });

  if (!discussionInDb) {
    logger.warn("Discussion not found in DB");
  }

  const documentId = getDiscussionInternalId(
    repoId.toString(),
    discussionNumber
  );
  logger.info(
    { documentId },
    "Deleting GitHub discussion from Dust data source."
  );
  await deleteDataSourceDocument(
    dataSourceConfig,
    documentId,
    logger.bindings()
  );

  logger.info({ documentId }, "Deleting GitHub discussion from database.");
  await GithubDiscussion.destroy({
    where: {
      repoId: repoId.toString(),
      discussionNumber: discussionNumber,
      connectorId: connector.id,
    },
  });
}

function renderGithubUser(user: GithubUser | null): string {
  if (!user) {
    return "";
  }
  if (user.login) {
    return `@${user.login}`;
  }
  return `@${user.id}`;
}

export async function githubCodeSyncActivity({
  dataSourceConfig,
  connectorId,
  repoLogin,
  repoName,
  repoId,
  loggerArgs,
  isBatchSync,
  forceResync = false,
}: {
  dataSourceConfig: DataSourceConfig;
  connectorId: ModelId;
  repoLogin: string;
  repoName: string;
  repoId: number;
  loggerArgs: Record<string, string | number>;
  isBatchSync: boolean;
  forceResync?: boolean;
}) {
  const codeSyncStartedAt = new Date();

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found (connectorId: ${connectorId})`);
  }
  const logger = getActivityLogger(connector, {
    repoId,
    repoName,
    repoLogin,
    ...loggerArgs,
  });

  const connectorState = await GithubConnectorState.findOne({
    where: {
      connectorId: connector.id,
    },
  });
  if (!connectorState) {
    throw new Error(`Connector state not found for connector ${connector.id}`);
  }

  await heartbeat();
  if (!connectorState.codeSyncEnabled) {
    // Garbage collect any existing code files.
    logger.info("Code sync disabled for connector");

    await garbageCollectCodeSync(
      dataSourceConfig,
      connector,
      repoId,
      codeSyncStartedAt,
      logger.child({ task: "garbageCollectCodeSyncDisabled" })
    );

    // deleting the code root folder from data_source_folders (core)
    await deleteDataSourceFolder({
      dataSourceConfig,
      folderId: getCodeRootInternalId(repoId),
    });

    // Finally delete the repository object if it exists.
    await GithubCodeRepository.destroy({
      where: {
        connectorId: connector.id,
        repoId: repoId.toString(),
      },
    });

    return;
  }

  let githubCodeRepository = await GithubCodeRepository.findOne({
    where: {
      connectorId: connector.id,
      repoId: repoId.toString(),
    },
  });

  if (githubCodeRepository && githubCodeRepository.skipReason) {
    logger.info(
      { skipReason: githubCodeRepository.skipReason },
      "Repository skipped, not syncing."
    );
    return;
  }

  // upserting a folder for the code root in data_source_folders (core)
  await upsertDataSourceFolder({
    dataSourceConfig,
    folderId: getCodeRootInternalId(repoId),
    title: "Code",
    parents: [getCodeRootInternalId(repoId), getRepositoryInternalId(repoId)],
    parentId: getRepositoryInternalId(repoId),
    mimeType: INTERNAL_MIME_TYPES.GITHUB.CODE_ROOT,
    sourceUrl: getRepoUrl(repoLogin, repoName),
  });

  if (!githubCodeRepository) {
    githubCodeRepository = await GithubCodeRepository.create({
      connectorId: connector.id,
      repoId: repoId.toString(),
      repoLogin,
      repoName,
      createdAt: codeSyncStartedAt,
      updatedAt: codeSyncStartedAt,
      lastSeenAt: codeSyncStartedAt,
      sourceUrl: getRepoUrl(repoLogin, repoName),
      forceDailySync: false,
    });
  }

  // We update the repo name and source url in case they changed. We also update the lastSeenAt as
  // soon as possible to prevent further attempt to incrementally synchronize it.
  githubCodeRepository.repoName = repoName;
  githubCodeRepository.sourceUrl = getRepoUrl(repoLogin, repoName);
  githubCodeRepository.lastSeenAt = codeSyncStartedAt;
  await githubCodeRepository.save();

  logger.info(
    {
      repoId,
      codeSyncStartedAt,
    },
    "Attempting download of Github repository for sync"
  );

  await heartbeat();
  let nbEntries = 0;
  const repoRes = await processRepository({
    connector,
    repoLogin,
    repoName,
    repoId,
    onEntry: () => {
      if (nbEntries % 100 === 0) {
        void heartbeat();
      }
      ++nbEntries;
    },
    logger: logger,
  });
  await heartbeat();

  if (repoRes.isErr()) {
    if (
      repoRes.error instanceof ExternalOAuthTokenError ||
      repoRes.error instanceof RepositoryAccessBlockedError ||
      repoRes.error instanceof RepositoryNotFoundError
    ) {
      logger.info(
        { err: repoRes.error },
        "Missing Github repository: Garbage collecting repo."
      );

      await garbageCollectCodeSync(
        dataSourceConfig,
        connector,
        repoId,
        new Date(),
        logger.child({ task: "garbageCollectRepoNotFound" })
      );

      await heartbeat();

      // deleting the code root folder from data_source_folders (core)
      await deleteDataSourceFolder({
        dataSourceConfig,
        folderId: getCodeRootInternalId(repoId),
      });

      // Finally delete the repository object if it exists.
      await GithubCodeRepository.destroy({
        where: {
          connectorId: connector.id,
          repoId: repoId.toString(),
        },
      });

      return;
    }

    // There is no other error returned for now.
    assertNever(repoRes.error);
  }

  const { tempDir, files, directories } = repoRes.value;

  try {
    logger.info(
      {
        repoId,
        filesCount: files.length,
        directoriesCount: directories.length,
        totalSize: files.reduce((acc, file) => acc + file.sizeBytes, 0),
      },
      "Downloaded Github repository for sync"
    );

    // From here everything happens locally or consists in upserting data. This is a big activity
    // but if retried we're really just retrying downloading the repository externally and the
    // upserts that succeeded before won't be retried as their associated GithubCodeFile object will
    // have been updated. This means that while the syncing is not succeeedd we might have slightly
    // incoherent state (files that moved will appear twice before final cleanup). This seems fine
    // given that syncing stallness is already considered an incident.

    const rootInternalId = getCodeRootInternalId(repoId);
    const updatedDirectories: { [key: string]: boolean } = {};
    let repoUpdatedAt: Date | null = null;

    const fq = new PQueue({ concurrency: 4 });
    const fqPromises = files.map((f) =>
      fq.add(async () => {
        await heartbeat();
        // Read file (files are 1MB at most).
        let content;
        try {
          content = await fs.readFile(f.localFilePath);
        } catch (e) {
          logger.warn(
            { repoId, fileName: f.fileName, documentId: f.documentId, err: e },
            "[Github] Error reading file"
          );
          if (e instanceof Error && "code" in e && e.code === "ENOENT") {
            return;
          }
          throw e;
        }
        const contentHash = blake3(content).toString("hex");
        const parentInternalId = f.parentInternalId || rootInternalId;

        // Find file or create it with an empty contentHash.
        const [githubCodeFile] = await GithubCodeFile.findOrCreate({
          where: {
            connectorId: connector.id,
            repoId: repoId.toString(),
            documentId: f.documentId,
          },
          defaults: {
            connectorId: connector.id,
            repoId: repoId.toString(),
            documentId: f.documentId,
            parentInternalId,
            fileName: f.fileName,
            sourceUrl: f.sourceUrl,
            contentHash: "",
            createdAt: codeSyncStartedAt,
            updatedAt: codeSyncStartedAt,
            lastSeenAt: codeSyncStartedAt,
            codeUpdatedAt: codeSyncStartedAt,
          },
        });

        // Skip processing if the file has a skipReason.
        if (githubCodeFile.skipReason) {
          logger.info(
            {
              repoId,
              fileName: f.fileName,
              documentId: f.documentId,
              skipReason: githubCodeFile.skipReason,
            },
            "Skipping file due to skipReason"
          );
          // Update lastSeenAt to prevent garbage collection.
          githubCodeFile.lastSeenAt = codeSyncStartedAt;
          await githubCodeFile.save();
          return;
        }

        // If the parents have updated then the documentId gets updated as well so we should never
        // have an udpate to parentInternalId. We check that this is always the case. If the file
        // is moved (the parents change) then it will trigger the creation of a new file with a
        // new docuemntId and the existing GithubCodeFile (with old documentId) will be cleaned up
        // at the end of the activity.
        if (parentInternalId !== githubCodeFile.parentInternalId) {
          throw new Error(
            `File parentInternalId mismatch for ${connector.id}/${f.documentId}` +
              ` (expected ${parentInternalId}, got ${githubCodeFile.parentInternalId})`
          );
        }

        // We update the if the file name, source url or content has changed.
        const needsUpdate =
          f.fileName !== githubCodeFile.fileName ||
          f.sourceUrl !== githubCodeFile.sourceUrl ||
          contentHash !== githubCodeFile.contentHash ||
          forceResync;

        if (needsUpdate) {
          // Record the parent directories to update their updatedAt.
          for (const parentInternalId of f.parents) {
            updatedDirectories[parentInternalId] = true;
          }
          repoUpdatedAt = codeSyncStartedAt;

          const renderedCode = formatCodeContentForUpsert(f.sourceUrl, content);

          if (sectionLength(renderedCode) > MAX_DOCUMENT_TXT_LEN) {
            logger.info("Code file is too large to upsert.");
            return;
          }

          const tags = [
            `title:${f.fileName}`,
            `lasUpdatedAt:${codeSyncStartedAt.getTime()}`,
          ];

          const parents: [...string[], string, string] = [
            ...f.parents,
            rootInternalId,
            getRepositoryInternalId(repoId),
          ];
          // Time to upload the file to the data source.
          await upsertDataSourceDocument({
            dataSourceConfig,
            documentId: f.documentId,
            documentContent: renderedCode,
            documentUrl: f.sourceUrl,
            timestampMs: codeSyncStartedAt.getTime(),
            tags,
            parents,
            parentId: parents[1],
            loggerArgs: logger.bindings(),
            upsertContext: {
              sync_type: isBatchSync ? "batch" : "incremental",
            },
            title: f.fileName,
            mimeType: INTERNAL_MIME_TYPES.GITHUB.CODE_FILE,
            async: true,
          });

          // Finally update the file.
          githubCodeFile.fileName = f.fileName;
          githubCodeFile.sourceUrl = f.sourceUrl;
          githubCodeFile.contentHash = contentHash;
          githubCodeFile.codeUpdatedAt = codeSyncStartedAt;
        } else {
          logger.info(
            {
              repoId,
              fileName: f.fileName,
              documentId: f.documentId,
            },
            "Skipping update of unchanged GithubCodeFile"
          );
        }

        // Finally we update the lastSeenAt for all files we've seen, and save.
        githubCodeFile.lastSeenAt = codeSyncStartedAt;
        await githubCodeFile.save();
      })
    );
    await Promise.all(fqPromises);

    const dq = new PQueue({ concurrency: 8 });
    const dqPromises = directories.map((d) =>
      dq.add(async () => {
        await heartbeat();
        const parentInternalId = d.parentInternalId || rootInternalId;

        const parents: [...string[], string, string] = [
          ...d.parents,
          getCodeRootInternalId(repoId),
          getRepositoryInternalId(repoId),
        ];
        await upsertDataSourceFolder({
          dataSourceConfig,
          folderId: d.internalId,
          parents,
          parentId: parents[1],
          title: d.dirName,
          mimeType: INTERNAL_MIME_TYPES.GITHUB.CODE_DIRECTORY,
          sourceUrl: d.sourceUrl,
        });

        // Find directory or create it.
        let githubCodeDirectory = await GithubCodeDirectory.findOne({
          where: {
            connectorId: connector.id,
            repoId: repoId.toString(),
            internalId: d.internalId,
          },
        });

        if (!githubCodeDirectory) {
          githubCodeDirectory = await GithubCodeDirectory.create({
            connectorId: connector.id,
            repoId: repoId.toString(),
            internalId: d.internalId,
            parentInternalId,
            dirName: d.dirName,
            sourceUrl: d.sourceUrl,
            createdAt: codeSyncStartedAt,
            updatedAt: codeSyncStartedAt,
            lastSeenAt: codeSyncStartedAt,
            codeUpdatedAt: codeSyncStartedAt,
          });
        }

        // If the parents have updated then the internalId gets updated as well so we should never
        // have an udpate to parentInternalId. We check that this is always the case. If the
        // directory is moved (the parents change) then it will trigger the creation of a new
        // directory with a new internalId and the existing GithubCodeDirectory (with old
        // internalId) will be cleaned up at the end of the activity.
        if (parentInternalId !== githubCodeDirectory.parentInternalId) {
          throw new Error(
            `Directory parentInternalId mismatch for ${connector.id}/${d.internalId}` +
              ` (expected ${parentInternalId}, got ${githubCodeDirectory.parentInternalId})`
          );
        }

        // If some files were updated as part of the sync, refresh the directory updatedAt.
        if (updatedDirectories[d.internalId]) {
          githubCodeDirectory.codeUpdatedAt = codeSyncStartedAt;
        }

        // Update everything else.
        githubCodeDirectory.dirName = d.dirName;
        githubCodeDirectory.sourceUrl = d.sourceUrl;
        githubCodeDirectory.lastSeenAt = codeSyncStartedAt;

        await githubCodeDirectory.save();
      })
    );
    await Promise.all(dqPromises);

    await heartbeat();

    // Final part of the sync, we delete all files and directories that were not seen during the
    // sync.
    await garbageCollectCodeSync(
      dataSourceConfig,
      connector,
      repoId,
      codeSyncStartedAt,
      logger.child({ task: "garbageCollectCodeSync" })
    );

    // Finally we update the repository updatedAt value.
    if (repoUpdatedAt) {
      githubCodeRepository.codeUpdatedAt = repoUpdatedAt;
      await githubCodeRepository.save();
    }
    await heartbeat();
  } finally {
    await heartbeat();
    await cleanUpProcessRepository(tempDir);
    logger.info(
      {
        repoId,
      },
      "Cleaned-up Github repository post sync"
    );
  }
}

// This activity simply signalWithStart the main githubCodeSyncWorkflow for a repo.
// This is used for repos that are flagged with `forceDailyCodeSync`, which we use for
// specific repos that do not use pull requests.
export async function githubCodeSyncDailyCronActivity({
  connectorId,
  repoId,
  repoLogin,
  repoName,
}: {
  connectorId: ModelId;
  repoLogin: string;
  repoName: string;
  repoId: number;
}) {
  const client = await getTemporalClient();

  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  const dataSourceConfig = dataSourceConfigFromConnector(connector);

  await client.workflow.signalWithStart("githubCodeSyncWorkflow", {
    args: [dataSourceConfig, connectorId, repoName, repoId, repoLogin],
    taskQueue: QUEUE_NAME,
    workflowId: getCodeSyncWorkflowId(connectorId, repoId),
    searchAttributes: {
      connectorId: [connectorId],
    },
    signal: newWebhookSignal,
    signalArgs: undefined,
    memo: {
      connectorId: connectorId,
    },
  });
}

export async function githubUpsertRepositoryFolderActivity({
  connectorId,
  repoId,
  repoName,
  repoLogin,
}: {
  connectorId: ModelId;
  repoId: number;
  repoName: string;
  repoLogin: string;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  await upsertDataSourceFolder({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    folderId: getRepositoryInternalId(repoId),
    title: repoName,
    parents: [getRepositoryInternalId(repoId)],
    parentId: null,
    sourceUrl: getRepoUrl(repoLogin, repoName),
    mimeType: INTERNAL_MIME_TYPES.GITHUB.REPOSITORY,
  });
}

export async function githubUpsertIssuesFolderActivity({
  connectorId,
  repoId,
  repoLogin,
  repoName,
}: {
  connectorId: ModelId;
  repoId: number;
  repoLogin: string;
  repoName: string;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  await upsertDataSourceFolder({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    folderId: getIssuesInternalId(repoId),
    title: "Issues",
    parents: [getIssuesInternalId(repoId), getRepositoryInternalId(repoId)],
    parentId: getRepositoryInternalId(repoId),
    mimeType: INTERNAL_MIME_TYPES.GITHUB.ISSUES,
    sourceUrl: getIssuesUrl(getRepoUrl(repoLogin, repoName)),
  });
}

export async function githubUpsertDiscussionsFolderActivity({
  connectorId,
  repoId,
  repoLogin,
  repoName,
}: {
  connectorId: ModelId;
  repoId: number;
  repoLogin: string;
  repoName: string;
}) {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error(`Connector not found. ConnectorId: ${connectorId}`);
  }
  await upsertDataSourceFolder({
    dataSourceConfig: dataSourceConfigFromConnector(connector),
    folderId: getDiscussionsInternalId(repoId),
    title: "Discussions",
    parents: [
      getDiscussionsInternalId(repoId),
      getRepositoryInternalId(repoId),
    ],
    parentId: getRepositoryInternalId(repoId),
    mimeType: INTERNAL_MIME_TYPES.GITHUB.DISCUSSIONS,
    sourceUrl: getDiscussionsUrl(getRepoUrl(repoLogin, repoName)),
  });
}
