import logger from "@connectors/logger/logger";
import { connectorsSequelize } from "@connectors/resources/storage";
import { dbConfig } from "@connectors/resources/storage/config";
import { runMigrations } from "../../scripts/db/migration-runner";
import { makeScript } from "./helpers";

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
      sequelize: connectorsSequelize,
      getDatabaseURI: () => dbConfig.getRequiredDatabaseURI(),
      logger,
      command,
      name,
    });
    await connectorsSequelize.close();
  }
);
