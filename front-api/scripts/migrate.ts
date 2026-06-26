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
        "mark-pre-deploy",
        "mark-post-deploy",
      ],
      demandOption: true,
      describe: "Migration command to run.",
    },
    name: {
      type: "string",
      describe:
        "Migration filename for mark commands (e.g. 20250101000000_my_migration or 20250101000000_my_migration.sql).",
    },
  },
  async ({ command, name, execute }) => {
    if (!execute) {
      return;
    }
    await runMigrations({
      sequelize: frontSequelize,
      getDatabaseURI: () => dbConfig.getRequiredFrontDatabaseURI(),
      logger,
      command,
      name,
    });
    await frontSequelize.close();
  }
);
