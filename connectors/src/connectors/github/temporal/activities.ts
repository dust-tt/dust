import PQueue from "p-queue";

import {
  getDiscussion,
  getDiscussionCommentRepliesPage,
  getDiscussionCommentsPage,
  getIssue,
  getIssueCommentsPage,
  getRepoDiscussionsPage,
  getRepoIssuesPage,
  getReposPage,
  GithubUser,
} from "@connectors/connectors/github/lib/github_api";
import {
  deleteFromDataSource,
  upsertToDatasource,
} from "@connectors/lib/data_sources";
import {
  Connector,
  GithubDiscussion,
  GithubIssue,
} from "@connectors/lib/models";
import { syncStarted, syncSucceeded } from "@connectors/lib/sync_status";
import mainLogger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";

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
  const issue = await getIssue(installationId, repoName, login, issueNumber);
  let renderedIssue = `# ${issue.title}||\n`;
  if (issue.body) {
    renderedIssue += `${issue.body}||\n`;
  }
  let resultPage = 1;
  let lastCommentUpdateTime: Date | null = null;
  for (;;) {
    const resultPageLogger = localLogger.child({
      page: resultPage,
    });
    resultPageLogger.info("Fetching GitHub issue comments result page.");
    const comments = await getIssueCommentsPage(
      installationId,
      repoName,
      login,
      issueNumber,
      resultPage
    );
    if (!comments.length) {
      break;
    }
    for (const comment of comments) {
      renderedIssue += `${renderGithubUser(comment.creator)}: ${
        comment.body
      }||\n`;
      if (
        !lastCommentUpdateTime ||
        comment.updatedAt.getTime() > lastCommentUpdateTime.getTime()
      ) {
        lastCommentUpdateTime = comment.updatedAt;
      }
    }
    resultPage += 1;
  }

  const documentId = getIssueDocumentId(repoId.toString(), issueNumber);
  const issueAuthor = renderGithubUser(issue.creator);
  const tags = [
    `title:${issue.title}`,
    `isPullRequest:${issue.isPullRequest}`,
    `lasUpdatedAt:${issue.updatedAt.getTime()}`,
  ];
  if (issueAuthor) {
    tags.push(`author:${issueAuthor}`);
  }

  const lastUpdateTimestamp = Math.max(
    issue.updatedAt.getTime(),
    lastCommentUpdateTime ? lastCommentUpdateTime.getTime() : 0
  );

  // TODO: last commentor, last comment date, issue labels (as tags)
  await upsertToDatasource({
    dataSourceConfig,
    documentId,
    documentText: renderedIssue,
    documentUrl: issue.url,
    timestampMs: lastUpdateTimestamp,
    tags: tags,
    // The convention for parents is to use the external id string; it is ok for
    // repos, but not practical for issues since the external id is the
    // issue number, which is not guaranteed unique in the workspace.
    // Therefore as a special case we use getIssueDocumentId() to get a parent string
    // The repo id from github is globally unique so used as-is, as per
    // convention to use the external id string.
    parents: [
      getIssueDocumentId(repoId.toString(), issue.number),
      repoId.toString(),
    ],
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

  const discussion = await getDiscussion(
    installationId,
    repoName,
    login,
    discussionNumber
  );

  let renderedDiscussion = `# ${discussion.title}||\n${discussion.bodyText}||\n`;

  let nextCursor: string | null = null;

  for (;;) {
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
      if (comment.isAnswer) {
        renderedDiscussion += "[ACCEPTED ANSWER] ";
      }
      renderedDiscussion += `${comment.author?.login || "Unknown author"}: ${
        comment.bodyText
      }||`;
      let nextChildCursor: string | null = null;
      for (;;) {
        const { cursor: childCursor, comments: childComments } =
          await getDiscussionCommentRepliesPage(
            installationId,
            comment.id,
            nextChildCursor
          );
        for (const childComment of childComments) {
          renderedDiscussion += `----${
            childComment.author?.login || "Unknown author"
          }: ${childComment.bodyText}||`;
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

  const documentId = getDiscussionDocumentId(
    repoId.toString(),
    discussionNumber
  );
  const tags = [
    `title:${discussion.title}`,
    `author:${discussion.author ? discussion.author.login : "unknown"}`,
    `lasUpdatedAt:${new Date(discussion.updatedAt).getTime()}`,
  ];

  await upsertToDatasource({
    dataSourceConfig,
    documentId,
    documentText: renderedDiscussion,
    documentUrl: discussion.url,
    timestampMs: new Date(discussion.createdAt).getTime(),
    tags,
    // The convention for parents is to use the external id string; it is ok for
    // repos, but not practical for discussions since the external id is the
    // issue number, which is not guaranteed unique in the workspace. Therefore
    // as a special case we use getDiscussionDocumentId() to get a parent string
    // The repo id from github is globally unique so used as-is, as per
    // convention to use the external id string.
    parents: [
      getDiscussionDocumentId(repoId.toString(), discussionNumber),
      repoId.toString(),
    ],
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
  await deleteFromDataSource(dataSourceConfig, documentId);

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
  await deleteFromDataSource(dataSourceConfig, documentId);

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
