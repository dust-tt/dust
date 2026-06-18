import { frontSequelize } from "@app/lib/resources/storage";
import { dbConfig } from "@app/lib/resources/storage/config";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { runMigrations } from "../../scripts/db/migration-runner";

makeScript(
  {
    command: {
      type: "string",
      choices: [
        "pre-deploy",
        "post-deploy",
        "status",
        "check",
        "check-pre-deploy",
        "check-post-deploy",
      ],
      demandOption: true,
      describe: "Migration command to run.",
    },
  },
  async ({ command, execute }) => {
    if (!execute) {
      return;
    }
    await runMigrations({
      sequelize: frontSequelize,
      getDatabaseURI: () => dbConfig.getRequiredFrontDatabaseURI(),
      logger,
      command,
    });
    await frontSequelize.close();
  }
);
