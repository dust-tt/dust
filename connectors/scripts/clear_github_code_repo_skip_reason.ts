import { GithubCodeRepositoryModel } from "@connectors/lib/models/github";
import { makeScript } from "scripts/helpers";

makeScript(
  {
    skipReason: {
      describe: "The skipReason value to match and clear",
      type: "string" as const,
      demandOption: true,
    },
  },
  async ({ execute, skipReason }, logger) => {
    const where = { skipReason };

    const count = await GithubCodeRepositoryModel.count({ where });
    logger.info(
      { count, skipReason },
      "Found github_code_repositories with matching skipReason"
    );

    if (!execute) {
      logger.info("Dry run mode. Pass -e to clear skipReason.");
      return;
    }

    const [updatedCount] = await GithubCodeRepositoryModel.update(
      { skipReason: null },
      { where }
    );

    logger.info(
      { updatedCount },
      "Cleared skipReason on matching github_code_repositories"
    );
  }
);
