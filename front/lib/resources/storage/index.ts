import assert from "assert";
import type { Sequelize } from "sequelize";

import config from "@app/lib/api/config";
import { SequelizeWithComments } from "@app/lib/api/database";
import { dbConfig } from "@app/lib/resources/storage/config";
import { getStatsDClient } from "@app/lib/utils/statsd";
import { isDevelopment } from "@app/types/shared/env";

// Directly require 'pg' here to make sure we are using the same version of the
// package as the one used by pg package.
// The doc recommends doing this : https://github.com/brianc/node-pg-types?tab=readme-ov-file#use
// eslint-disable-next-line @typescript-eslint/no-require-imports
const types = require("pg").types;

const acquireAttempts = new WeakMap<object, number>();

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
// We get the default array parser, then map each element through our safe
// number parser to ensure all values are validated and converted to JavaScript numbers.
const parseBigIntegerArray = types.getTypeParser(INT8_ARRAY_OID);
types.setTypeParser(INT8_ARRAY_OID, (val: string) =>
  parseBigIntegerArray(val).map(parseBigIntToSafeNumber)
);

export const statsDClient = getStatsDClient();

// Web-serving deployments handle concurrent requests where the auth codepath
// acquires multiple connections in parallel (Promise.all). They need a larger
// pool than workers which process jobs sequentially.
const WEB_SERVING_SERVICES = new Set(["front", "front-edge", "front-internal"]);

function getPoolMaxForService(): number {
  const service = config.getServiceName();

  // DO NOT BLINDLY INCREASE THIS NUMBER (see comment below).
  return service && WEB_SERVING_SERVICES.has(service) ? 40 : 25;
}

export const frontSequelize = new SequelizeWithComments(
  dbConfig.getRequiredFrontDatabaseURI(),
  {
    // Pool size is intentionally conservative. Each connection holds a PostgreSQL
    // backend via PgBouncer. Blindly increasing this shifts contention downstream.
    // Prefer reducing per-request connection usage (caching, shared connections)
    // over bumping pool size. See getPoolMax() for per-deployment values.
    pool: {
      max: getPoolMaxForService(),
      acquire: 30000,
    },
    logging: isDevelopment() && DB_LOGGING_ENABLED ? sequelizeLogger : false,
    hooks: {
      beforePoolAcquire: (options) => {
        acquireAttempts.set(options, Date.now());
      },
      afterPoolAcquire: (_connection, options) => {
        const startMs = acquireAttempts.get(options);
        if (startMs === undefined) {
          return;
        }

        statsDClient.distribution(
          "sequelize.connection_acquisition.duration",
          Date.now() - startMs
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
