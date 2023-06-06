import {
  getIssue,
  getIssueCommentsPage,
  getRepoIssuesPage,
  getReposPage,
  GithubUser,
} from "@connectors/connectors/github/lib/github_api";
import { upsertToDatasource } from "@connectors/lib/data_sources";
import { Connector } from "@connectors/lib/models";
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
): Promise<{ name: string; login: string }[]> {
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
  login: string,
  issueNumber: number,
  dataSourceConfig: DataSourceConfig,
  loggerArgs: Record<string, string | number>
) {
  const localLogger = logger.child({
    ...loggerArgs,
    issueNumber,
  });

  localLogger.info("Upserting GitHub issue.");
  const issue = await getIssue(installationId, repoName, login, issueNumber);
  let renderedIssue = `# ${issue.title}||\n${issue.body}||\n`;
  let resultPage = 1;
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
    }
    resultPage += 1;
  }

  const documentId = `github-issue-${repoName}-${issueNumber}`;
  const issueAuthor = renderGithubUser(issue.creator);
  const tags = [`title:${issue.title}`];
  if (issueAuthor) {
    tags.push(`author:${issueAuthor}`);
  }
  // TODO: last commentor, last comment date, issue labels (as tags)
  await upsertToDatasource(
    dataSourceConfig,
    documentId,
    renderedIssue,
    issue.url,
    issue.createdAt.getTime(),
    tags,
    3,
    500,
    { ...loggerArgs, provider: "github" }
  );
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

function renderGithubUser(user: GithubUser | null): string {
  if (!user) {
    return "";
  }
  if (user.login) {
    return `@${user.login}`;
  }
  return `@${user.id}`;
}
