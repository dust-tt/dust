import { getReposPage } from "@connectors/connectors/github/lib/github_api";
import {
  GithubCodeRepositoryModel,
  GithubConnectorStateModel,
} from "@connectors/lib/models/github";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { makeScript } from "scripts/helpers";

/**
 * Backfill migration to create missing GithubCodeRepository records for repositories
 * that are accessible via GitHub App installations but don't have code repository records.
 *
 * This fixes the issue where repositories added via installation_repositories.added webhook
 * didn't get GithubCodeRepository records created, causing code sync webhooks to silently skip.
 *
 * Usage:
 *   DRY RUN: npx tsx migrations/20260122_backfill_missing_github_code_repos.ts
 *   EXECUTE: npx tsx migrations/20260122_backfill_missing_github_code_repos.ts -e
 */
makeScript({}, async ({ execute }, logger) => {
  logger.info("Starting backfill of missing GithubCodeRepository records");

  // 1. Find all connectors with code sync enabled
  const connectorStates = await GithubConnectorStateModel.findAll({
    where: { codeSyncEnabled: true },
  });

  logger.info(
    `Found ${connectorStates.length} connectors with code sync enabled`
  );

  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const connectorState of connectorStates) {
    const connector = await ConnectorResource.fetchById(
      connectorState.connectorId
    );

    if (!connector) {
      logger.warn(
        {
          connectorId: connectorState.connectorId,
        },
        "Connector not found, skipping"
      );
      totalErrors++;
      continue;
    }

    const connectorLogger = logger.child({
      connectorId: connector.id,
    });

    try {
      // 2. Fetch repos from GitHub API
      connectorLogger.info("Fetching repositories from GitHub API");
      const githubRepos: Array<{
        id: number;
        name: string;
        owner: { login: string };
      }> = [];

      let pageNumber = 1;
      for (;;) {
        const reposPageResult = await getReposPage(connector, pageNumber);
        if (reposPageResult.isErr()) {
          connectorLogger.error(
            {
              error: reposPageResult.error,
            },
            "Failed to fetch repositories page, skipping connector"
          );
          totalErrors++;
          break;
        }

        const reposPage = reposPageResult.value;
        if (reposPage.length === 0) {
          break;
        }

        githubRepos.push(
          ...reposPage.map((r) => ({
            id: r.id,
            name: r.name,
            owner: { login: r.owner.login },
          }))
        );

        pageNumber++;
      }

      connectorLogger.info(
        `Fetched ${githubRepos.length} repositories from GitHub API`
      );

      // 3. Check which ones are missing from database
      const existingRepos = await GithubCodeRepositoryModel.findAll({
        where: { connectorId: connector.id },
      });
      const existingRepoIds = new Set(existingRepos.map((r) => r.repoId));

      // 4. Create missing records
      let created = 0;
      let skipped = 0;

      for (const repo of githubRepos) {
        const repoIdStr = repo.id.toString();
        if (existingRepoIds.has(repoIdStr)) {
          skipped++;
          continue;
        }

        if (execute) {
          try {
            await GithubCodeRepositoryModel.create({
              connectorId: connector.id,
              repoId: repoIdStr,
              repoLogin: repo.owner.login,
              repoName: repo.name,
              sourceUrl: `https://github.com/${repo.owner.login}/${repo.name}`,
              lastSeenAt: new Date(0), // Use epoch to indicate needs first sync
              codeUpdatedAt: new Date(0), // Use epoch to indicate needs first sync
              skipReason: null,
              forceDailySync: false,
            });

            created++;
            connectorLogger.info(
              {
                repoId: repo.id,
                repoName: repo.name,
                repoLogin: repo.owner.login,
              },
              "Created GithubCodeRepository record"
            );
          } catch (err) {
            connectorLogger.error(
              {
                err,
                repoId: repo.id,
                repoName: repo.name,
              },
              "Failed to create GithubCodeRepository record"
            );
            totalErrors++;
          }
        } else {
          created++;
          connectorLogger.info(
            {
              repoId: repo.id,
              repoName: repo.name,
              repoLogin: repo.owner.login,
            },
            "Would create GithubCodeRepository record"
          );
        }
      }

      totalCreated += created;
      totalSkipped += skipped;

      connectorLogger.info(
        {
          created,
          skipped,
          total: githubRepos.length,
        },
        "Finished processing connector"
      );
    } catch (err) {
      connectorLogger.error(
        {
          err,
        },
        "Error processing connector"
      );
      totalErrors++;
    }
  }

  logger.info(
    {
      totalCreated,
      totalSkipped,
      totalErrors,
      totalConnectors: connectorStates.length,
    },
    "Backfill completed"
  );
});
