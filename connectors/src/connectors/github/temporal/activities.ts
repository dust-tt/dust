import { getReposPage } from "@connectors/connectors/github/lib/github_api";
import mainLogger from "@connectors/logger/logger";

const logger = mainLogger.child({
  provider: "github",
});

export async function getReposResultPage(
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
