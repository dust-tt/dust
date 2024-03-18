import { Sequelize } from "sequelize";

import { dbConfig } from "@app/lib/resources/storage/config";
import logger from "@app/logger/logger";

const acquireAttempts = new WeakMap();

export const frontSequelize = new Sequelize(
  dbConfig.getRequiredFrontDatabaseURI(),
  {
    pool: {
      // default is 5
      max: 50,
    },
    logging: false,
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
