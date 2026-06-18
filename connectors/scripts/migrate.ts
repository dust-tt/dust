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
      sequelize: connectorsSequelize,
      getDatabaseURI: () => dbConfig.getRequiredDatabaseURI(),
      logger,
      command,
    });
    await connectorsSequelize.close();
  }
);
