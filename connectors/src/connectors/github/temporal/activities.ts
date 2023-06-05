import {
  getIssue,
  getIssueCommentsPage,
  getRepoIssuesPage,
  getReposPage,
  GithubUser,
} from "@connectors/connectors/github/lib/github_api";
import { upsertToDatasource } from "@connectors/lib/data_sources";
import mainLogger from "@connectors/logger/logger";
import { DataSourceConfig } from "@connectors/types/data_source_config";

const logger = mainLogger.child({
  provider: "github",
});

export async function githubGetReposResultPageActivity(
  githubInstallationId: string,
  pageNumber: number, // 1-indexed
  loggerArgs: Record<string, string | number>
): Promise<{ repoId: number; login: string }[]> {
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
    repoId: repo.id,
    login: repo.owner.login,
  }));
}

export async function githubGetRepoIssuesResultPageActivity(
  githubInstallationId: string,
  repoId: string,
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
    repoId,
    login,
    pageNumber
  );

  return page.map((issue) => issue.number);
}

export async function githubUpsertIssueActivity(
  installationId: string,
  repoId: string,
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
  const issue = await getIssue(installationId, repoId, login, issueNumber);
  let renderedIssue = `# ${issue.title}||\n${issue.body}||\n`;
  let resultPage = 1;
  for (;;) {
    const resultPageLogger = localLogger.child({
      page: resultPage,
    });
    resultPageLogger.info("Fetching GitHub issue comments result page.");
    const comments = await getIssueCommentsPage(
      installationId,
      repoId,
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

  const documentId = `github-issue-${repoId}-${issueNumber}`;
  const issueAuthor = renderGithubUser(issue.creator);
  const tags = [`title:${issue.title}`];
  if (issueAuthor) {
    tags.push(`author:${issueAuthor}`);
  }
  // TODO: last commentor, last comment date
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

function renderGithubUser(user: GithubUser | null): string {
  if (!user) {
    return "";
  }
  if (user.login) {
    return `@${user.login}`;
  }
  return `@${user.id}`;
}
