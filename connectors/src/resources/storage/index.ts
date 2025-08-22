import assert from "assert";
import { Sequelize } from "sequelize";

import { dbConfig } from "@connectors/resources/storage/config";
import { isDevelopment } from "@connectors/types";
import { getStatsDClient } from "@connectors/types/shared/statsd";

// Directly require 'pg' here to make sure we are using the same version of the
// package as the one used by pg package.
// The doc recommends doing this : https://github.com/brianc/node-pg-types?tab=readme-ov-file#use
// eslint-disable-next-line @typescript-eslint/no-var-requires
const types = require("pg").types;

const acquireAttempts = new WeakMap();

const { DB_LOGGING_ENABLED = false } = process.env;

function sequelizeLogger(message: string) {
  console.log(message.replace("Executing (default): ", ""));
}

// Parse PostgreSQL BIGINT (INT8) values into JavaScript numbers, but only if they
// fall within JavaScript's safe integer range (-(2^53 - 1) to 2^53 - 1). This
// prevents silent precision loss when handling large integers from the database.
// Throws an assertion error if a BIGINT value exceeds JavaScript's safe integer
// limits.
types.setTypeParser(types.builtins.INT8, function (val: unknown) {
  assert(
    Number.isSafeInteger(Number(val)),
    `Found a value stored as a BIGINT that is not a safe integer: ${val}`
  );
  return Number(val);
});

const statsDClient = getStatsDClient();
const CONNECTION_ACQUISITION_THRESHOLD_MS = 100;

export const sequelizeConnection = new Sequelize(
  dbConfig.getRequiredDatabaseURI(),
  {
    pool: {
      // Default is 5.
      max: isDevelopment() ? 5 : 8,
    },
    logging: isDevelopment() && DB_LOGGING_ENABLED ? sequelizeLogger : false,
    hooks: {
      beforePoolAcquire: (options) => {
        acquireAttempts.set(options, Date.now());
      },
      afterPoolAcquire: (connection, options) => {
        const elapsedTime = Date.now() - acquireAttempts.get(options);
        if (elapsedTime > CONNECTION_ACQUISITION_THRESHOLD_MS) {
          statsDClient.distribution(
            "sequelize.connection_acquisition.duration",
            elapsedTime
          );
        }
      },
    },
  }
);
