import assert from "assert";
import type { Sequelize } from "sequelize";

import { SequelizeWithComments } from "@app/lib/api/database";
import { dbConfig } from "@app/lib/resources/storage/config";
import { getStatsDClient } from "@app/lib/utils/statsd";
import { isDevelopment } from "@app/types";

// Directly require 'pg' here to make sure we are using the same version of the
// package as the one used by pg package.
// The doc recommends doing this : https://github.com/brianc/node-pg-types?tab=readme-ov-file#use
// eslint-disable-next-line @typescript-eslint/no-require-imports
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
function parseBigIntToSafeNumber(val: string): number {
  assert(
    Number.isSafeInteger(Number(val)),
    `Found a value stored as a BIGINT that is not a safe integer: ${val}`
  );
  return Number(val);
}

// Reference: https://github.com/postgres/postgres/blob/master/src/include/catalog/pg_type.dat#L55
const INT8_OID = 20;
const INT8_ARRAY_OID = 1016;

// Override parser for single BIGINT values.
types.setTypeParser(INT8_OID, parseBigIntToSafeNumber);

// Override parser for BIGINT arrays.
// By default, pg-types returns arrays of strings for BIGINT[].
// We get the default array parser, then map each element through our safe number parser to ensure all values are validated and converted to JavaScript numbers.
const parseBigIntegerArray = types.getTypeParser(INT8_ARRAY_OID);
types.setTypeParser(INT8_ARRAY_OID, (val: string) =>
  parseBigIntegerArray(val).map(parseBigIntToSafeNumber)
);

export const statsDClient = getStatsDClient();

export const frontSequelize = new SequelizeWithComments(
  dbConfig.getRequiredFrontDatabaseURI(),
  {
    pool: {
      // Default is 5.
      // TODO(2025-11-29 flav) Revisit all Sequelize pool settings.
      max: 25,
      acquire: 30000,
    },
    logging: isDevelopment() && DB_LOGGING_ENABLED ? sequelizeLogger : false,
    hooks: {
      beforePoolAcquire: (options) => {
        acquireAttempts.set(options, Date.now());
      },
      afterPoolAcquire: (connection, options) => {
        const elapsedTime = Date.now() - acquireAttempts.get(options);

        statsDClient.distribution(
          "sequelize.connection_acquisition.duration",
          elapsedTime
        );
      },
    },
    dialectOptions: {
      appName: "front master",
    },
  }
);

let frontReplicaDbInstance: Sequelize | null = null;

export function getFrontReplicaDbConnection() {
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!frontReplicaDbInstance) {
    frontReplicaDbInstance = new SequelizeWithComments(
      dbConfig.getRequiredFrontReplicaDatabaseURI() as string,
      {
        logging: false,
        dialectOptions: {
          appName: "front replica",
        },
      }
    );
  }

  return frontReplicaDbInstance;
}
