import type { CoreAPIDataSourceDocumentSection } from "@dust-tt/types";
import { hash as blake3 } from "blake3";
import { promises as fs } from "fs";
import PQueue from "p-queue";
import { Op } from "sequelize";

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
import {
  deleteFromDataSource,
  renderDocumentTitleAndContent,
  renderMarkdownSection,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import { Connector } from "@connectors/lib/models";
import {
  GithubCodeDirectory,
  GithubCodeFile,
  GithubCodeRepository,
  GithubConnectorState,
  GithubDiscussion,
  GithubIssue,
} from "@connectors/lib/models/github";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import mainLogger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config";

const logger = mainLogger.child({
  provider: "github",
});

export async function githubGetReposResultPageActivity(
  githubInstallationId: string,
  pageNumber: number, // 1-indexed
  loggerArgs: Record<string, string | number>
): Promise<{ name: string; id: number; login: string }[]> {
  const localLogger = logger.child({
    ...loggerArgs,
    pageNumber,
  });

  if (pageNumber < 1) {
    throw new Error("Page number must be greater than 0 (1-indexed)");
  }

  localLogger.info("Fetching GitHub repos result page.");
  const page = await getReposPage(githubInstallationId, pageNumber);
  return page.map((repo) => ({
    name: repo.name,
    id: repo.id,
    login: repo.owner.login,
  }));
}

export async function githubGetRepoIssuesResultPageActivity(
  githubInstallationId: string,
  repoName: string,
  login: string,
  pageNumber: number, // 1-indexed
  loggerArgs: Record<string, string | number>
): Promise<number[]> {
  const localLogger = logger.child({
    ...loggerArgs,
    pageNumber,
  });

  if (pageNumber < 1) {
    throw new Error("Page number must be greater than 0 (1-indexed)");
  }

  localLogger.info("Fetching GitHub repo issues result page.");
  const page = await getRepoIssuesPage(
    githubInstallationId,
    repoName,
    login,
    pageNumber
  );

  return page.map((issue) => issue.number);
}

async function renderIssue(
  installationId: string,
  repoName: string,
  repoId: number,
  login: string,
  issueNumber: number,
  loggerArgs: Record<string, string | number>
): Promise<{
  issue: GithubIssueType;
  updatedAtTimestamp: number;
  content: CoreAPIDataSourceDocumentSection;
}> {
  const localLogger = logger.child({
    ...loggerArgs,
    issueNumber,
  });

  const issue = await getIssue(installationId, repoName, login, issueNumber);

  const content = renderDocumentTitleAndContent({
    title: `Issue #${issue.number} [${repoName}]: ${issue.title}`,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    content: renderMarkdownSection(issue.body ?? "", { flavor: "gfm" }),
  });

  let resultPage = 1;
  let lastCommentUpdateTime: Date | null = null;

  for (;;) {
    const resultPageLogger = localLogger.child({
      page: resultPage,
    });
    resultPageLogger.info("Fetching GitHub issue comments result page.");

    let comments = undefined;
    try {
      comments = await getIssueCommentsPage(
        installationId,
        repoName,
        login,
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
          sections: [renderMarkdownSection(comment.body, { flavor: "gfm" })],
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
  installationId: string,
  repoName: string,
  repoId: number,
  login: string,
  issueNumber: number,
  dataSourceConfig: DataSourceConfig,
  loggerArgs: Record<string, string | number>,
  isBatchSync = false
) {
  const localLogger = logger.child({
    ...loggerArgs,
    issueNumber,
  });

  localLogger.info("Upserting GitHub issue.");

  const {
    issue,
    updatedAtTimestamp,
    content: renderedIssue,
  } = await renderIssue(
    installationId,
    repoName,
    repoId,
    login,
    issueNumber,
    loggerArgs
  );

  const documentId = getIssueDocumentId(repoId.toString(), issueNumber);
  const issueAuthor = renderGithubUser(issue.creator);
  const tags = [
    `title:${issue.title}`,
    `isPullRequest:${issue.isPullRequest}`,
    `createdAt:${issue.createdAt.getTime()}`,
    `updatedAt:${issue.updatedAt.getTime()}`,
  ];
  if (issueAuthor) {
    tags.push(`author:${issueAuthor}`);
  }

  // TODO: last commentor, last comment date, issue labels (as tags)
  await upsertToDatasource({
    dataSourceConfig,
    documentId,
    documentContent: renderedIssue,
    documentUrl: issue.url,
    timestampMs: updatedAtTimestamp,
    tags: tags,
    // The convention for parents is to use the external id string; it is ok for
    // repos, but not practical for issues since the external id is the
    // issue number, which is not guaranteed unique in the workspace.
    // Therefore as a special case we use getIssueDocumentId() to get a parent string
    // The repo id from github is globally unique so used as-is, as per
    // convention to use the external id string.
    parents: [documentId, `${repoId}-issues`, repoId.toString()],
    retries: 3,
    delayBetweenRetriesMs: 500,
    loggerArgs: { ...loggerArgs, provider: "github" },
    upsertContext: {
      sync_type: isBatchSync ? "batch" : "incremental",
    },
  });

  const connector = await Connector.findOne({
    where: {
      connectionId: installationId,
      dataSourceName: dataSourceConfig.dataSourceName,
      workspaceId: dataSourceConfig.workspaceId,
    },
  });
  if (!connector) {
    throw new Error(`Connector not found (installationId: ${installationId})`);
  }

  localLogger.info("Upserting GitHub issue in DB.");
  await GithubIssue.upsert({
    repoId: repoId.toString(),
    issueNumber,
    connectorId: connector.id,
  });
}

async function renderDiscussion(
  installationId: string,
  repoName: string,
  repoId: number,
  login: string,
  discussionNumber: number,
  loggerArgs: Record<string, string | number>
) {
  const localLogger = logger.child({
    ...loggerArgs,
    discussionNumber,
  });

  const discussion = await getDiscussion(
    installationId,
    repoName,
    login,
    discussionNumber
  );

  const content = renderDocumentTitleAndContent({
    title: `Discussion #${discussion.number} [${repoName}]: ${discussion.title}`,
    createdAt: new Date(discussion.createdAt),
    updatedAt: new Date(discussion.updatedAt),
    content: renderMarkdownSection(discussion.bodyText, { flavor: "gfm" }),
  });

  let nextCursor: string | null = null;

  for (;;) {
    const cursorLogger = localLogger.child({
      nextCursor,
    });
    cursorLogger.info("Fetching GitHub discussion comments page.");

    const { cursor, comments } = await getDiscussionCommentsPage(
      installationId,
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
        sections: [renderMarkdownSection(comment.bodyText, { flavor: "gfm" })],
      };
      content.sections.push(c);

      let nextChildCursor: string | null = null;

      for (;;) {
        const cursorLogger = localLogger.child({
          nextCursor,
          nextChildCursor,
        });
        cursorLogger.info("Fetching GitHub discussion comments replies page.");

        const { cursor: childCursor, comments: childComments } =
          await getDiscussionCommentRepliesPage(
            installationId,
            comment.id,
            nextChildCursor
          );

        for (const childComment of childComments) {
          const cc = {
            prefix: `>> ${childComment.author?.login || "Unknown author"}:\n`,
            content: null,
            sections: [
              renderMarkdownSection(comment.bodyText, { flavor: "gfm" }),
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

  return {
    discussion,
    content,
  };
}

export async function githubUpsertDiscussionActivity(
  installationId: string,
  repoName: string,
  repoId: number,
  login: string,
  discussionNumber: number,
  dataSourceConfig: DataSourceConfig,
  loggerArgs: Record<string, string | number>,
  isBatchSync: boolean
) {
  const localLogger = logger.child({
    ...loggerArgs,
    discussionNumber,
  });

  localLogger.info("Upserting GitHub discussion.");

  const { discussion, content: renderedDiscussion } = await renderDiscussion(
    installationId,
    repoName,
    repoId,
    login,
    discussionNumber,
    loggerArgs
  );

  const documentId = getDiscussionDocumentId(
    repoId.toString(),
    discussionNumber
  );
  const tags = [
    `title:${discussion.title}`,
    `author:${discussion.author ? discussion.author.login : "unknown"}`,
    `updatedAt:${new Date(discussion.updatedAt).getTime()}`,
  ];

  await upsertToDatasource({
    dataSourceConfig,
    documentId,
    documentContent: renderedDiscussion,
    documentUrl: discussion.url,
    timestampMs: new Date(discussion.createdAt).getTime(),
    tags,
    // The convention for parents is to use the external id string; it is ok for
    // repos, but not practical for discussions since the external id is the
    // issue number, which is not guaranteed unique in the workspace. Therefore
    // as a special case we use getDiscussionDocumentId() to get a parent string
    // The repo id from github is globally unique so used as-is, as per
    // convention to use the external id string.
    parents: [documentId, `${repoId}-discussions`, repoId.toString()],
    retries: 3,
    delayBetweenRetriesMs: 500,
    loggerArgs: { ...loggerArgs, provider: "github" },
    upsertContext: {
      sync_type: isBatchSync ? "batch" : "incremental",
    },
  });

  const connector = await Connector.findOne({
    where: {
      connectionId: installationId,
      dataSourceName: dataSourceConfig.dataSourceName,
      workspaceId: dataSourceConfig.workspaceId,
    },
  });
  if (!connector) {
    throw new Error("Connector not found");
  }

  localLogger.info("Upserting GitHub discussion in DB.");
  await GithubDiscussion.upsert({
    repoId: repoId.toString(),
    discussionNumber: discussionNumber,
    connectorId: connector.id,
  });
}

export async function githubGetRepoDiscussionsResultPageActivity(
  installationId: string,
  repoName: string,
  login: string,
  cursor: string | null,
  loggerArgs: Record<string, string | number>
): Promise<{ cursor: string | null; discussionNumbers: number[] }> {
  const localLogger = logger.child({
    ...loggerArgs,
    cursor,
  });

  localLogger.info("Fetching GitHub discussions result page.");

  const { cursor: nextCursor, discussions } = await getRepoDiscussionsPage(
    installationId,
    repoName,
    login,
    cursor
  );

  return {
    cursor: nextCursor,
    discussionNumbers: discussions.map((discussion) => discussion.number),
  };
}

export async function githubSaveStartSyncActivity(
  dataSourceConfig: DataSourceConfig
) {
  const connector = await Connector.findOne({
    where: {
      type: "github",
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
    },
  });

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
  const connector = await Connector.findOne({
    where: {
      type: "github",
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
    },
  });

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
  installationId: string,
  repoId: string,
  issueNumber: number,
  loggerArgs: Record<string, string | number>
) {
  await deleteIssue(
    dataSourceConfig,
    installationId,
    repoId,
    issueNumber,
    loggerArgs
  );
}

export async function githubDiscussionGarbageCollectActivity(
  dataSourceConfig: DataSourceConfig,
  installationId: string,
  repoId: string,
  discussionNumber: number,
  loggerArgs: Record<string, string | number>
) {
  await deleteDiscussion(
    dataSourceConfig,
    installationId,
    repoId,
    discussionNumber,
    loggerArgs
  );
}

export async function githubRepoGarbageCollectActivity(
  dataSourceConfig: DataSourceConfig,
  installationId: string,
  repoId: string,
  loggerArgs: Record<string, string | number>
) {
  const connector = await Connector.findOne({
    where: {
      connectionId: installationId,
    },
  });

  if (!connector) {
    throw new Error("Connector not found");
  }

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
          installationId,
          repoId,
          issue.issueNumber,
          loggerArgs
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
          installationId,
          repoId,
          discussion.discussionNumber,
          loggerArgs
        )
      )
    );
  }

  await Promise.all(promises);
}

async function deleteIssue(
  dataSourceConfig: DataSourceConfig,
  installationId: string,
  repoId: string,
  issueNumber: number,
  loggerArgs: Record<string, string | number>
) {
  const localLogger = logger.child({ ...loggerArgs, issueNumber });

  const connector = await Connector.findOne({
    where: {
      connectionId: installationId,
      dataSourceName: dataSourceConfig.dataSourceName,
      workspaceId: dataSourceConfig.workspaceId,
    },
  });
  if (!connector) {
    throw new Error(`Connector not found (installationId: ${installationId})`);
  }

  const issueInDb = await GithubIssue.findOne({
    where: {
      repoId: repoId.toString(),
      issueNumber,
      connectorId: connector.id,
    },
  });
  if (!issueInDb) {
    throw new Error(
      `Issue not found in DB (issueNumber: ${issueNumber}, repoId: ${repoId}, connectorId: ${connector.id})`
    );
  }

  const documentId = getIssueDocumentId(repoId.toString(), issueNumber);
  localLogger.info(
    { documentId },
    "Deleting GitHub issue from Dust data source."
  );
  await deleteFromDataSource(dataSourceConfig, documentId, {
    ...loggerArgs,
    issueNumber,
  });

  localLogger.info("Deleting GitHub issue from database.");
  await GithubIssue.destroy({
    where: {
      repoId: repoId.toString(),
      issueNumber,
      connectorId: connector.id,
    },
  });
}

async function deleteDiscussion(
  dataSourceConfig: DataSourceConfig,
  installationId: string,
  repoId: string,
  discussionNumber: number,
  loggerArgs: Record<string, string | number>
) {
  const localLogger = logger.child({ ...loggerArgs, discussionNumber });

  const connector = await Connector.findOne({
    where: {
      connectionId: installationId,
      dataSourceName: dataSourceConfig.dataSourceName,
      workspaceId: dataSourceConfig.workspaceId,
    },
  });
  if (!connector) {
    throw new Error(`Connector not found (installationId: ${installationId})`);
  }

  const discussionInDb = await GithubDiscussion.findOne({
    where: {
      repoId: repoId.toString(),
      discussionNumber,
      connectorId: connector.id,
    },
  });

  if (!discussionInDb) {
    localLogger.warn("Discussion not found in DB");
  }

  const documentId = getDiscussionDocumentId(
    repoId.toString(),
    discussionNumber
  );
  localLogger.info(
    { documentId },
    "Deleting GitHub discussion from Dust data source."
  );
  await deleteFromDataSource(dataSourceConfig, documentId, {
    ...loggerArgs,
    discussionNumber,
  });

  localLogger.info("Deleting GitHub discussion from database.");
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

export function getIssueDocumentId(
  repoId: string,
  issueNumber: number
): string {
  return `github-issue-${repoId}-${issueNumber}`;
}

export function getDiscussionDocumentId(
  repoId: string,
  discussionNumber: number
): string {
  return `github-discussion-${repoId}-${discussionNumber}`;
}

export function formatCodeContentForUpsert(
  sourceUrl: string,
  content: Buffer
): CoreAPIDataSourceDocumentSection {
  // For now we simply add the file name as prefix to all chunks.
  return {
    prefix: `SOURCE FILE: ${sourceUrl}\n\n`,
    content: content.toString(),
    sections: [],
  };
}

async function garbageCollectCodeSync(
  dataSourceConfig: DataSourceConfig,
  connector: Connector,
  repoId: number,
  codeSyncStartedAt: Date,
  loggerArgs: Record<string, string | number>
) {
  const localLogger = logger.child(loggerArgs);
  const filesToDelete = await GithubCodeFile.findAll({
    where: {
      connectorId: connector.id,
      repoId: repoId.toString(),
      lastSeenAt: {
        [Op.lt]: codeSyncStartedAt,
      },
    },
  });

  if (filesToDelete.length > 0) {
    localLogger.info(
      { filesToDelete: filesToDelete.length },
      "GarbageCollectCodeSync: deleting files"
    );

    const fq = new PQueue({ concurrency: 8 });
    filesToDelete.forEach((f) =>
      fq.add(async () => {
        await deleteFromDataSource(dataSourceConfig, f.documentId, loggerArgs);
        // Only destroy once we succesfully removed from the data source. This is idempotent and will
        // work as expected when retried.
        await f.destroy();
      })
    );
    await fq.onIdle();
  }

  const directoriesToDelete = await GithubCodeDirectory.findAll({
    where: {
      connectorId: connector.id,
      repoId: repoId.toString(),
      lastSeenAt: {
        [Op.lt]: codeSyncStartedAt,
      },
    },
  });

  if (directoriesToDelete.length > 0) {
    localLogger.info(
      {
        directoriesToDelete: directoriesToDelete.length,
      },
      "GarbageCollectCodeSync: deleting directories"
    );

    await GithubCodeDirectory.destroy({
      where: {
        connectorId: connector.id,
        repoId: repoId.toString(),
        lastSeenAt: {
          [Op.lt]: codeSyncStartedAt,
        },
      },
    });
  }
}

export async function githubCodeSyncActivity({
  dataSourceConfig,
  installationId,
  repoLogin,
  repoName,
  repoId,
  loggerArgs,
  isBatchSync,
}: {
  dataSourceConfig: DataSourceConfig;
  installationId: string;
  repoLogin: string;
  repoName: string;
  repoId: number;
  loggerArgs: Record<string, string | number>;
  isBatchSync: boolean;
}) {
  const codeSyncStartedAt = new Date();
  const localLogger = logger.child(loggerArgs);

  const connector = await Connector.findOne({
    where: {
      connectionId: installationId,
      dataSourceName: dataSourceConfig.dataSourceName,
      workspaceId: dataSourceConfig.workspaceId,
    },
  });
  if (!connector) {
    throw new Error(`Connector not found (installationId: ${installationId})`);
  }

  const connectorState = await GithubConnectorState.findOne({
    where: {
      connectorId: connector.id,
    },
  });
  if (!connectorState) {
    throw new Error(`Connector state not found for connector ${connector.id}`);
  }

  if (!connectorState.codeSyncEnabled) {
    // Garbage collect any existing code files.
    localLogger.info("Code sync disabled for connector");

    await garbageCollectCodeSync(
      dataSourceConfig,
      connector,
      repoId,
      codeSyncStartedAt,
      { ...loggerArgs, task: "garbageCollectCodeSyncDisabled" }
    );

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

  if (!githubCodeRepository) {
    githubCodeRepository = await GithubCodeRepository.create({
      connectorId: connector.id,
      repoId: repoId.toString(),
      repoLogin,
      repoName,
      createdAt: codeSyncStartedAt,
      updatedAt: codeSyncStartedAt,
      lastSeenAt: codeSyncStartedAt,
      sourceUrl: `https://github.com/${repoLogin}/${repoName}`,
    });
  }

  // We update the repo name and source url in case they changed. We also update the lastSeenAt as
  // soon as possible to prevent further attempt to incrementally synchronize it.
  githubCodeRepository.repoName = repoName;
  githubCodeRepository.sourceUrl = `https://github.com/${repoLogin}/${repoName}`;
  githubCodeRepository.lastSeenAt = codeSyncStartedAt;
  await githubCodeRepository.save();

  const { tempDir, files, directories } = await processRepository({
    installationId,
    repoLogin,
    repoName,
    repoId,
  });

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

    const rootInternalId = `github-code-${repoId}`;
    const updatedDirectories: { [key: string]: boolean } = {};
    let repoUpdatedAt: Date | null = null;

    const fq = new PQueue({ concurrency: 4 });
    files.forEach((f) =>
      fq.add(async () => {
        // Read file (files are 1MB at most).
        const content = await fs.readFile(f.localFilePath);
        const contentHash = blake3(content).toString("hex");
        const parentInternalId = f.parentInternalId || rootInternalId;

        // Find file or create it with an empty contentHash.
        let githubCodeFile = await GithubCodeFile.findOne({
          where: {
            connectorId: connector.id,
            repoId: repoId.toString(),
            documentId: f.documentId,
          },
        });

        if (!githubCodeFile) {
          githubCodeFile = await GithubCodeFile.create({
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
          });
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
          contentHash !== githubCodeFile.contentHash;

        if (needsUpdate) {
          // Record the parent directories to update their updatedAt.
          for (const parentInternalId of f.parents) {
            updatedDirectories[parentInternalId] = true;
          }
          repoUpdatedAt = codeSyncStartedAt;

          const tags = [
            `title:${f.fileName}`,
            `lasUpdatedAt:${codeSyncStartedAt.getTime()}`,
          ];

          // Time to upload the file to the data source.
          await upsertToDatasource({
            dataSourceConfig,
            documentId: f.documentId,
            documentContent: formatCodeContentForUpsert(f.sourceUrl, content),
            documentUrl: f.sourceUrl,
            timestampMs: codeSyncStartedAt.getTime(),
            tags,
            parents: [...f.parents, rootInternalId, repoId.toString()],
            retries: 3,
            delayBetweenRetriesMs: 1000,
            loggerArgs: { ...loggerArgs, provider: "github" },
            upsertContext: {
              sync_type: isBatchSync ? "batch" : "incremental",
            },
          });

          // Finally update the file.
          githubCodeFile.fileName = f.fileName;
          githubCodeFile.sourceUrl = f.sourceUrl;
          githubCodeFile.contentHash = contentHash;
          githubCodeFile.updatedAt = codeSyncStartedAt;
        } else {
          localLogger.info(
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
    await fq.onIdle();

    const dq = new PQueue({ concurrency: 8 });
    directories.forEach((d) =>
      dq.add(async () => {
        const parentInternalId = d.parentInternalId || rootInternalId;

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
          githubCodeDirectory.updatedAt = codeSyncStartedAt;
        }

        // Update everything else.
        githubCodeDirectory.dirName = d.dirName;
        githubCodeDirectory.sourceUrl = d.sourceUrl;
        githubCodeDirectory.lastSeenAt = codeSyncStartedAt;

        await githubCodeDirectory.save();
      })
    );
    await dq.onIdle();

    // Final part of the sync, we delete all files and directories that were not seen during the
    // sync.
    await garbageCollectCodeSync(
      dataSourceConfig,
      connector,
      repoId,
      codeSyncStartedAt,
      { ...loggerArgs, task: "garbageCollectCodeSync" }
    );

    // Finally we update the repository updatedAt value.
    if (repoUpdatedAt) {
      githubCodeRepository.updatedAt = repoUpdatedAt;
      await githubCodeRepository.save();
    }
  } finally {
    await cleanUpProcessRepository(tempDir);
    localLogger.info(
      {
        repoId,
      },
      "Cleaned-up Github repository post sync"
    );
  }
}
