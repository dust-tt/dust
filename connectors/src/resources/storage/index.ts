import { isDevelopment } from "@dust-tt/types";
import { Sequelize } from "sequelize";

import logger from "@connectors/logger/logger";
import { dbConfig } from "@connectors/resources/storage/config";

const acquireAttempts = new WeakMap();

const { DB_LOGGING_ENABLED = false } = process.env;

function sequelizeLogger(message: string) {
  console.log(message.replace("Executing (default): ", ""));
}

export const sequelizeConnection = new Sequelize(
  dbConfig.getRequiredDatabaseURI(),
  {
    pool: {
      // Default is 5.
      max: isDevelopment() ? 5 : 10,
    },
    logging: isDevelopment() && DB_LOGGING_ENABLED ? sequelizeLogger : false,
    hooks: {
      beforePoolAcquire: (options) => {
        acquireAttempts.set(options, Date.now());
      },
      afterPoolAcquire: (connection, options) => {
        const elapsedTime = Date.now() - acquireAttempts.get(options);
        if (elapsedTime > 100) {
          logger.info(
            {
              elapsedTime,
              callStack: new Error().stack,
            },
            "Long sequelize connection acquisition detected"
          );
        }
      },
    },
  }
);
