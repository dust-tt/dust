import { Sequelize } from "sequelize";

import { isDevelopment } from "@app/lib/development";
import { dbConfig } from "@app/lib/resources/storage/config";
import logger from "@app/logger/logger";

const acquireAttempts = new WeakMap();

const { DB_LOGGING_ENABLED = false } = process.env;

function sequelizeLogger(message: string) {
  console.log(message.replace("Executing (default): ", ""));
}

export const frontSequelize = new Sequelize(
  dbConfig.getRequiredFrontDatabaseURI(),
  {
    pool: {
      // Default is 5.
      max: isDevelopment() ? 5 : 30,
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

let frontReplicaDbInstance: Sequelize | null = null;

export function getFrontReplicaDbConnection() {
  if (!frontReplicaDbInstance) {
    frontReplicaDbInstance = new Sequelize(
      dbConfig.getRequiredFrontReplicaDatabaseURI() as string,
      {
        logging: false,
      }
    );
  }

  return frontReplicaDbInstance;
}
