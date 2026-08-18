import { GithubCodeRepositoryModel } from "@connectors/lib/models/github";
import { makeScript } from "scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  const where = { skipReason: "persistent_download_failure" };

  const repositoriesCount = await GithubCodeRepositoryModel.count({ where });
  logger.info(
    { repositoriesCount },
    "Found GitHub repositories skipped on persistent download failure"
  );

  if (!execute) {
    logger.info("Dry run mode. Pass -e to clear their skipReason.");
    return;
  }

  const [updatedCount] = await GithubCodeRepositoryModel.update(
    { skipReason: null },
    { where }
  );

  logger.info(
    { updatedCount },
    "Cleared skipReason on GitHub repositories, code sync will be retried"
  );
});
