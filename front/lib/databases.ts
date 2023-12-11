import { Sequelize } from "sequelize";

import logger from "@app/logger/logger";

const { FRONT_DATABASE_URI, XP1_DATABASE_URI } = process.env;

const acquireAttempts = new WeakMap();

export const front_sequelize = new Sequelize(FRONT_DATABASE_URI as string, {
  pool: {
    // default is 5
    max: 20,
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
          },
          "Long sequelize connection acquisition detected"
        );
      }
    },
  },
});
export const xp1_sequelize = new Sequelize(XP1_DATABASE_URI as string, {
  logging: false,
});
